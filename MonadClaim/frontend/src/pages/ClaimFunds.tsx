import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { readContract, writeContract, waitForTransactionReceipt } from "viem/actions";
import { formatUnits, isAddress, isHex, toHex } from "viem";
import { toast } from "sonner";
import { universalClaimLinksAbi } from "@/lib/contracts/universalClaimLinksAbi";
import { getClaimLinksEnv } from "@/lib/contracts/contractConfig";
import { erc20Abi } from "@/lib/contracts/erc20Abi";
import { getAppChain, getPublicClient } from "@/lib/viem/appChain";
import { useParaViem } from "@/hooks/useParaViem";
import { generateToken, getQuoteWithReferral, type QuoteResponse } from "@/lib/kuru-flow";

type ClaimFundsProps = {
  claimIdOverride?: string;
  embedded?: boolean;
};

type ClaimFromContract = {
  amountIn: bigint;
  expiry: bigint;
  status: bigint;
  sender: `0x${string}`;
  receiver: `0x${string}`;
  tokenIn: `0x${string}`;
  secretHash: `0x${string}`;
};

const STATUS_OPEN = 0;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** `bytes` arg for `executeClaimAndSwap` — prefer hex (same bytes as at claim creation). */
function encodeSecretForContract(secret: string): `0x${string}` {
  const s = secret.trim();
  if (!s) return "0x";
  if (isHex(s)) return s as `0x${string}`;
  return toHex(new TextEncoder().encode(s));
}

const ClaimFunds = ({ claimIdOverride }: ClaimFundsProps) => {
  const { id: routeId } = useParams<{ id: string }>();
  const id = claimIdOverride ?? routeId;
  const env = getClaimLinksEnv();
  const { address, viemClient, ready } = useParaViem();
  const [tokenOut, setTokenOut] = useState("");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [status, setStatus] = useState("");
  const [jwt, setJwt] = useState<string | null>(null);
  const [tokenOutDecimals, setTokenOutDecimals] = useState(18);

  const claimId = useMemo(() => {
    if (!id) return null;
    try {
      return BigInt(id);
    } catch {
      return null;
    }
  }, [id]);

  const { data: claim, refetch } = useQuery<ClaimFromContract>({
    queryKey: ["claim", env?.claimLinks, claimId?.toString()],
    enabled: !!env && claimId != null,
    queryFn: async () => {
      const pc = getPublicClient();
      return (await readContract(pc as never, {
        address: env!.claimLinks,
        abi: universalClaimLinksAbi,
        functionName: "getClaim",
        args: [claimId!],
      } as never)) as ClaimFromContract;
    },
  });

  const { data: tokenInDecimals } = useQuery({
    queryKey: ["tokenInDecimals", env?.claimLinks, claim?.tokenIn],
    enabled: !!env && !!claim && claim.tokenIn.toLowerCase() !== ZERO_ADDRESS.toLowerCase(),
    queryFn: async () => {
      const pc = getPublicClient();
      return Number(
        await readContract(pc as never, {
          address: claim!.tokenIn as `0x${string}`,
          abi: erc20Abi,
          functionName: "decimals",
        } as never),
      );
    },
  });

  const onQuote = async () => {
    if (!env || !address || !claim || !isAddress(tokenOut)) return;
    setStatus("Fetching quote...");
    try {
      const tokenResp = jwt ? { token: jwt } : await generateToken(address);
      setJwt(tokenResp.token);
      if (tokenOut.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
        const pc = getPublicClient();
        const decimals = await readContract(pc as never, {
          address: tokenOut as `0x${string}`,
          abi: erc20Abi,
          functionName: "decimals",
        } as never);
        setTokenOutDecimals(Number(decimals));
      } else {
        setTokenOutDecimals(18);
      }
      const q = await getQuoteWithReferral(
        env.claimLinks,
        claim.tokenIn,
        tokenOut,
        claim.amountIn.toString(),
        tokenResp.token
      );
      setQuote(q);
      setStatus("Quote ready");
    } catch (e) {
      setQuote(null);
      setStatus(e instanceof Error ? e.message : "Quote failed");
    }
  };

  const onClaimAndSwap = async () => {
    if (!env || !claim || claimId == null || !viemClient || !address || !quote || !ready) return;
    if (Number(claim.status) !== STATUS_OPEN) {
      toast.error("Claim is not open");
      return;
    }
    const isOpen = claim.receiver === ZERO_ADDRESS && claim.secretHash !== ZERO_HASH;
    const secret = window.location.hash.replace(/^#/, "");
    if (isOpen && !secret) {
      toast.error("Missing secret in URL fragment");
      return;
    }
    const calldata = quote.transaction.calldata.startsWith("0x")
      ? quote.transaction.calldata
      : `0x${quote.transaction.calldata}`;
    setStatus("Submitting transaction...");
    try {
      const hash = await writeContract(viemClient as never, {
        chain: getAppChain(),
        address: env.claimLinks,
        abi: universalClaimLinksAbi,
        functionName: "executeClaimAndSwap",
        args: isOpen
          ? [
              claimId,
              tokenOut as `0x${string}`,
              encodeSecretForContract(secret),
              quote.transaction.to as `0x${string}`,
              calldata as `0x${string}`,
              BigInt(quote.transaction.value || "0"),
              address,
            ]
          : [
              claimId,
              tokenOut as `0x${string}`,
              quote.transaction.to as `0x${string}`,
              calldata as `0x${string}`,
              BigInt(quote.transaction.value || "0"),
              address,
            ],
        account: address,
      } as never);
      const receipt = await waitForTransactionReceipt(viemClient as never, { hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      await refetch();
      setStatus("Claim + swap successful");
      toast.success("Claim + swap successful");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Claim failed");
    }
  };

  if (!env) return <div className="text-sm text-muted-foreground">Set `VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS`.</div>;
  if (!claimId) return <div className="text-sm text-muted-foreground">Invalid claim id.</div>;
  if (!claim) return <div className="text-sm text-muted-foreground">Loading claim...</div>;

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4 text-sm">
        <div>From: {claim.sender}</div>
        <div>Token In: {claim.tokenIn}</div>
        <div>
          Amount In:{" "}
          {formatUnits(
            claim.amountIn,
            claim.tokenIn.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? 18 : (tokenInDecimals ?? 18),
          )}
        </div>
        <div>Status: {Number(claim.status) === 0 ? "Open" : Number(claim.status) === 1 ? "Executed" : "Cancelled"}</div>
      </div>

      <input
        type="text"
        value={tokenOut}
        onChange={(e) => setTokenOut(e.target.value)}
        placeholder="Token out address (or 0x000... for MON)"
        className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3.5 text-sm"
      />

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void onQuote()}
          className="w-full py-3 rounded-xl border border-border hover:border-primary/30"
        >
          Get Kuru Quote
        </button>
        <button
          type="button"
          onClick={() => void onClaimAndSwap()}
          disabled={!quote}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
        >
          Claim + Swap
        </button>
      </div>

      {quote && (
        <div className="glass rounded-xl p-4 text-sm">
          Estimated Out: {formatUnits(BigInt(quote.output), tokenOutDecimals)}
        </div>
      )}
      {status && <div className="text-xs text-muted-foreground">{status}</div>}
    </div>
  );
};

export default ClaimFunds;

