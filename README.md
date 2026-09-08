# ProofReserves

**Zero-knowledge proof of reserves on the [Midnight](https://midnight.network) blockchain.**
A crypto custodian proves it holds enough assets to cover every customer — without revealing a single balance, address, or total.

[![CI](https://github.com/OmcarSN/proof-of-reserves/actions/workflows/ci.yml/badge.svg)](https://github.com/OmcarSN/proof-of-reserves/actions/workflows/ci.yml)
&nbsp;·&nbsp; Network: **Midnight Preprod** &nbsp;·&nbsp; Track: **Confidential DeFi** — "New Moon to Full" Builder Challenge

> **Live on-chain.** The contract is deployed and verified on Midnight Preprod at
> `a44f44b9af01020db86c25e18abaaae751006b42b70daa70e990e7a69c94c765`.
> The frontend reads this live contract — no mock data.

---

## The problem

An exchange or fund wants to prove one thing to the world:

> *"I hold enough assets to cover everything my customers are owed."*

The old way to prove it is to publish everyone's balances — a privacy disaster. The other way is "trust me" — which is how funds collapse. **ProofReserves gives you the proof without the disclosure.**

The public sees only:

- a **SOLVENT / NOT SOLVENT** verdict,
- a **timestamp** and an **epoch** (attestation #1, #2, #3 …), and
- a **commitment root** — one 64-character hash that locks in the entire customer list without revealing any of it.

Every real number — total assets, total liabilities, and each customer's balance — stays on the custodian's machine and never touches the chain.

## How the privacy works

The custodian builds a **Merkle _sum_ tree** off-chain. Each leaf is a commitment to one customer's balance; each internal node binds its children's **hashes and their summed balances**. The zero-knowledge circuit then checks only the very top of that tree, in a single hash:

```
liabilitiesRoot   ==  hash(topLeft, topRight)          // the published commitment
totalLiabilities  ==  topLeft.sum + topRight.sum       // checked, overflow-guarded
totalAssets       >=  totalLiabilities                 // solvency — both sides private
```

Two guarantees fall out of this:

- **Solvency is enforced by the circuit.** The proof cannot be generated unless assets really do cover liabilities.
- **Completeness is enforced by customers.** Each customer verifies their own balance is inside `liabilitiesRoot` from their own browser. A custodian who understates liabilities must either drop a customer (their inclusion proof fails) or lie about a subtree sum (the sums stop adding up to the root). Either way, the lie is detectable and the honest customer catches it.

### What is public vs private

| On-chain (public) | Off-chain (never disclosed) |
|---|---|
| `solvent` — the verdict | Total assets |
| `liabilitiesRoot` — commitment to the customer list | Total liabilities |
| `attestationEpoch` — 1, 2, 3 … | Every individual customer balance |
| `lastAttestationTime` — bound to block time | The custodian secret |
| `custodianKey` — hash of the custodian's secret (their identity) | Customer identities and addresses |

## Three roles, three screens

| Role | What they do | Screen |
|------|--------------|--------|
| **Custodian** | Generates a proof and publishes solvency to the chain | **Attest** |
| **Anyone** | Reads the public verdict and trusts it without seeing balances | **Status** |
| **Customer** | Confirms their own balance was counted, privately | **My Proof** |

---

## Architecture

```
proof-of-reserves/
├── contracts/proof-of-reserves.compact   Compact ZK contract (the circuit + ledger)
├── managed/                              Compiled contract + proving/verifier keys (committed)
├── src/
│   ├── reserves.ts                       The single public API the frontend calls
│   ├── midnight/                         Wallet, providers, proof-server plumbing
│   ├── utils/merkleSumTree.ts            Off-chain Merkle sum tree + inclusion proofs
│   └── config/network.ts                 Preprod endpoints + live contract address
├── web/                                  React + Vite frontend (imports only @reserves)
├── deploy/                               Deploy tooling (owner-run; secrets never committed)
└── tests/proof-of-reserves.test.ts       8 contract tests (solvency, privacy, auth, freshness)
```

**One rule holds the design together:** the frontend imports **only** from `src/reserves.ts`. That module is the single safe door to the blockchain — it hides the private data (balances, the custodian secret) so the UI physically cannot leak it. The `@reserves` path alias enforces this in every component.

The contract exposes one circuit, `attest(now)`, guarded by a hash-based owner check so only the custodian who holds the registered secret can publish. See [docs/MIDNIGHT_NOTES.md](docs/MIDNIGHT_NOTES.md) for the design notes and the Midnight-specific patterns used.

## Run it locally

**Prerequisites**

- Node.js 22+
- Docker (for the local proof server)
- The [Lace wallet](https://www.lace.io/) browser extension, set to **Preprod**, with a funded account (needed only to *publish* an attestation; reads and the customer self-check need neither)

**1 — Start the proof server** (generates the zero-knowledge proof locally):

```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0
```

**2 — Install and test the contract logic:**

```bash
npm install
npm test
```

**3 — Run the frontend:**

```bash
cd web
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). The **Status** screen works immediately against the live contract. To publish an attestation on the **Attest** screen you'll need the custodian secret; balances and that secret never leave your browser.

## Testing

```bash
npm test
```

Eight tests run the Compact circuit in-process (no network, no proof server) and cover the competition requirements plus hardening:

1. A solvent custodian attests; the published root equals both `hash(children)` and the independently-computed off-chain tree root.
2. `solvent` flips to true and `attestationEpoch` increments on each attestation.
3. **Privacy:** the private amounts never appear anywhere in public state.
4. An insolvent custodian (`assets < liabilities`) is rejected.
5. Only the holder of the registered secret can attest.
6. An attestation dated in the future is rejected.
7. A liability total that doesn't match the committed tree is rejected.
8. A subtree sum that overflows `Uint<64>` is rejected.

CI runs this suite and a full frontend typecheck + browser build on every push — see the badge above.

## Tech stack

- **Midnight** Compact language + zero-knowledge proofs, on the **Preprod** testnet
- **TypeScript** for the contract logic, Merkle sum tree, and the `reserves.ts` API
- **React + Vite** frontend, wasm + top-level-await, deployable on Vercel (`vercel.json`)
- **Lace** wallet integration (DUST fee model)
- **Vitest** for the contract test suite; **GitHub Actions** for CI

## Security

- The custodian seed and secret live only in gitignored `.env.<network>` files (see [.env.example](.env.example)) and are **never** committed or printed.
- Only the custodian's public identity — a hash of the secret — is ever stored on-chain.
- The frontend cannot reach the blockchain except through `src/reserves.ts`, which keeps private inputs in the browser.

## Links

- **Project X (Twitter):** _TODO — add link_
- **Live app:** _TODO — add Vercel URL_

## License

MIT
