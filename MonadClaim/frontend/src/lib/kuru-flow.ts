const KURU_FLOW_API = "https://ws.kuru.io";

export interface QuoteResponse {
  type: string;
  status: "success" | "error";
  output: string;
  minOut: string;
  transaction: {
    to: string;
    calldata: string;
    value: string;
  };
  gasPrices: Record<string, string>;
  message?: string;
}

export async function generateToken(userAddress: string): Promise<{ token: string }> {
  const response = await fetch(`${KURU_FLOW_API}/api/generate-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_address: userAddress }),
  });
  if (!response.ok) throw new Error(`Failed to generate token: ${response.status}`);
  return response.json();
}

/**
 * @param swapExecutorAddress Address Kuru should build `transaction` for — use the **UniversalClaimLinks** contract when the swap is executed inside `executeClaimAndSwap` (same `msg.sender` as on-chain). Use the connected wallet only for direct swaps.
 */
export async function getQuoteWithReferral(
  swapExecutorAddress: string,
  tokenIn: string,
  tokenOut: string,
  amount: string,
  token: string
): Promise<QuoteResponse> {
  const referrerAddress = import.meta.env.VITE_KURU_REFERRER_ADDRESS?.trim();
  const referrerFeeBps = Number(import.meta.env.VITE_KURU_REFERRER_FEE_BPS || "0");

  const body: Record<string, unknown> = {
    userAddress: swapExecutorAddress,
    tokenIn,
    tokenOut,
    amount,
    autoSlippage: true,
  };
  if (referrerAddress) {
    body.referrerAddress = referrerAddress;
    body.referrerFeeBps = referrerFeeBps;
  }

  const response = await fetch(`${KURU_FLOW_API}/api/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
  return response.json();
}

