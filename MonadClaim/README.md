## MonadClaim (Foundry + frontend)

This repo is the single home for **Universal Claim Links on Monad**: escrow + **atomic claim-and-swap** via Kuru Flow (`executeClaimAndSwap`).

- **Contracts (Foundry)**: `src/UniversalClaimLinks.sol`, tests in `test/UniversalClaimLinks.t.sol`
- **App (Vite + React + Para)**: `frontend/` — install with **pnpm** only

> [!NOTE]
> Default chain in `foundry.toml` is Monad testnet (`10143`). The Vite app reads `VITE_CHAIN_ID` (see `frontend/.env.example`).

<h4 align="center">
  <a href="https://docs.monad.xyz">Monad Documentation</a> | <a href="https://book.getfoundry.sh/">Foundry Documentation</a> |
   <a href="https://github.com/monad-developers/foundry-monad/issues">Report Issue</a>
</h4>


**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat, and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions, and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose Solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Frontend

```shell
cd frontend
pnpm install
cp ../.env.example .env
# or: cp .env.example .env — set VITE_PARA_API_KEY (must use the VITE_ prefix) and your contract address
pnpm dev
```

Para keys must be named `VITE_PARA_API_KEY` so Vite exposes them; restart the dev server after editing `.env`.

Production build (Vite needs extra heap for this bundle):

```shell
cd frontend
pnpm build
```

### Contracts (`pnpm` / `npm` from repo root)

RPC defaults to `eth-rpc-url` in `foundry.toml` (Monad testnet unless you change it). Override any script with Forge flags after `--`.

```shell
pnpm install   # optional: only needed once if you use the root package.json scripts
pnpm run compile      # forge build + sync ABI JSON to frontend/
pnpm run compile:clean # clean build + sync ABI
pnpm run sync:abi     # forge build then copy ABI (after contract edits)
pnpm run test         # forge test
pnpm run test:vv      # forge test -vv
pnpm run deploy:dry   # simulate deploy (no on-chain tx)
pnpm run deploy:env   # broadcast using PRIVATE_KEY from repo-root `.env` (recommended)
pnpm run deploy -- --private-key 0x… # or pass a keystore name: -- --account monad-deployer (no extra `--` before these flags)
pnpm run deploy:anvil # local anvil on :8545
```

Same with npm: `npm run compile`, etc.

Deploy Solidity entrypoint: `script/DeployUniversalClaimLinks.s.sol` (`DeployUniversalClaimLinks`).

### “Is the contract running?”

- **Locally**, it always “runs” if `pnpm run test` passes (same EVM as Monad).
- **On-chain**, you must **deploy** and put that address in **`VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS`** (see `.env.example`). The app does not deploy for you.

Quick check (compile + test + optional bytecode at your env address):

```shell
pnpm run doctor
```

If step 3 says **no bytecode**, the address is wrong, the RPC/network doesn’t match **`VITE_CHAIN_ID`**, or you haven’t deployed yet. Read-only sanity:

```shell
cast code YOUR_DEPLOYED_ADDRESS --rpc-url https://testnet-rpc.monad.xyz
# should NOT be empty or only "0x"
```

### Build (contracts) — raw Forge

```shell
forge build
```

### Test

```shell
forge test
```

### Format

```shell
forge fmt
```

### Gas Snapshots

```shell
forge snapshot
```

### Anvil

```shell
anvil
```

### Deploy to Monad Testnet

First, you need to create a keystore file. Do not forget to remember the password! You will need it to deploy your contract.

```shell
cast wallet import monad-deployer --private-key $(cast wallet new | grep 'Private key:' | awk '{print $3}')
```

After creating the keystore, you can read its address using:

```shell
cast wallet address --account monad-deployer
```

The command above will create a keystore file named `monad-deployer` in the `~/.foundry/keystores` directory.

Deploy `UniversalClaimLinks` (no constructor args), **recommended** (script logs the address):

**Private key in `.env`:** add `PRIVATE_KEY=0x…` to `MonadClaim/.env`, then:

```shell
pnpm run deploy:env
```

**Keystore:** do not type `--` before `--account` (that forwards args into Solidity `run()` and triggers `encode length mismatch`). Append Forge flags after the npm divider:

```shell
pnpm run deploy -- --account monad-deployer
```

**Raw hex key (no keystore):**

```shell
pnpm run deploy -- --private-key 0xYOUR_64_CHAR_HEX
```

One-liner alternative:

```shell
forge create src/UniversalClaimLinks.sol:UniversalClaimLinks --account monad-deployer --broadcast
```

Put the deployed address in `frontend/.env` as `VITE_UNIVERSAL_CLAIM_LINKS_ADDRESS` (or repo-root `.env` merged by Vite).

### Verify Contract

```shell
forge verify-contract \
  <contract_address> \
  src/UniversalClaimLinks.sol:UniversalClaimLinks \
  --chain 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org
```

### Cast
[Cast reference](https://book.getfoundry.sh/cast/)
```shell
cast <subcommand>
```

### Help

```shell
forge --help
anvil --help
cast --help
```


## FAQ

### Error: `Error: server returned an error response: error code -32603: Signer had insufficient balance`

This error happens when you don't have enough balance to deploy your contract. You can check your balance with the following command:

```shell
cast wallet address --account monad-deployer
```

### I have constructor arguments, how do I deploy my contract?

`UniversalClaimLinks` has no constructor arguments. For other contracts, use `--constructor-args` as needed.

### I have constructor arguments, how do I verify my contract?

```shell
forge verify-contract \
  <contract_address> \
  src/UniversalClaimLinks.sol:UniversalClaimLinks \
  --chain 10143 \
  --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org
```

Please refer to the [Foundry Book](https://book.getfoundry.sh/) for more information.