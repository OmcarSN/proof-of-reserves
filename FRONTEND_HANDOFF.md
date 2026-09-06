# ProofReserves — Frontend Handoff (for Antigravity)

You are building the **frontend** for ProofReserves. All the hard logic
(Midnight blockchain, zero-knowledge proofs, the Lace wallet, the Merkle tree)
is already written and finished in **one file: `src/reserves.ts`**.

**Your job:** build a clean, modern React app that calls the functions in
`src/reserves.ts`. That's it. You never touch the blockchain code.

---

## 0. The one hard rule (please do not break this)

> **Import ONLY from `src/reserves.ts`.**
> Never import from `@midnight-ntwrk/*`, `../managed/*`, `src/utils/*`, or
> `src/midnight/*` directly.

`src/reserves.ts` is the single, safe door to everything. It hides the private
data (customer balances, the custodian secret) so the UI **cannot** leak it by
accident. If you need something that `reserves.ts` doesn't expose, stop and ask
— do not reach around it.

Do **not** edit any of these (they are done and tested):
`src/reserves.ts`, `src/utils/*`, `src/midnight/*`, `src/config/*`,
`contracts/`, `managed/`, `deploy/`, `tests/`, `.env.*`, `deployment.*.json`.

You create everything else: the React app, components, styles, `index.html`,
`vite.config.ts`, and the browser `tsconfig`.

---

## 1. What ProofReserves is (so your copy is accurate)

A crypto custodian (an exchange, a fund) wants to prove to the world:

> **"I hold enough assets to cover every customer's balance."**

Normally they'd have to publish everyone's balances — a privacy disaster.
ProofReserves proves it with **zero-knowledge**: the public sees only a
**SOLVENT / NOT SOLVENT** verdict, a **timestamp**, an **epoch number**
(attestation #1, #2, #3…), and a **commitment root** (one 64-char hash that
"locks in" the whole customer list without revealing it).

Three kinds of people use it:

| Role | What they do | Screen you build |
|------|--------------|------------------|
| **Custodian** | Proves solvency (writes to the chain) | **Attest** |
| **Anyone** | Reads the public verdict | **Status / Verify** |
| **Customer** | Checks their own balance was included | **My Proof** |

The magic: a customer can confirm they were counted **without** seeing anyone
else's balance, and the public can trust the verdict **without** seeing any
balance at all.

---

## 2. The complete API of `src/reserves.ts`

Everything below is already implemented. Types are TypeScript. All values that
cross into your UI are **JSON-safe** (strings, numbers, booleans) — no `bigint`
or byte arrays leak out, so you can freely `JSON.stringify` anything.

### Wallet

```ts
// Connect to the Lace wallet (cached for the session). Throws a friendly
// Error if Lace isn't installed.
connectWallet(): Promise<WalletInfo>
disconnectWallet(): void

interface WalletInfo {
  address: string;        // the wallet address (show a shortened form)
  coinPublicKey: string;
  walletName: string;     // e.g. "Midnight Lace"
  networkLabel: string;   // "Preprod"
}

isWalletAvailable(): boolean          // true if Lace is injected in the browser
```

### Custodian — create an attestation (WRITE)

```ts
callAttest(params: AttestParams): Promise<AttestResult>

interface AttestParams {
  // The custodian's secret. Give ONE of these:
  passphrase?: string;          // easy mode: a secret phrase (recommended for UI)
  custodianSecretHex?: string;  // advanced: the raw 64-hex secret
  // The ordered list of every customer's balance:
  balances: Array<number | bigint | string>;
  // The custodian's total assets (must be >= sum of balances):
  totalAssets: number | bigint | string;
  // Optional attestation time (seconds since epoch). Default = 5 min ago.
  nowSeconds?: number | bigint;
}

interface AttestResult {
  txId: string;              // transaction id (or "submitted" if the wallet didn't return one)
  txUrl: string | null;      // explorer link, or null -> show a "copy" button instead
  liabilitiesRootHex: string; // the commitment published on-chain (customers verify against this)
  totalLiabilities: string;  // custodian-only: the total that was committed (decimal string)
  epoch: number;             // the attestation number this should become (previous + 1)
}
```

**What happens when you call it:** it builds the private Merkle tree from the
balances, checks solvency locally, asks Lace to unlock, generates a
zero-knowledge proof on the local proof server, and submits the transaction.
Balances and the secret **never** leave the browser. This call can take
**10–60 seconds** (proof generation) — show a clear "Generating proof…" state.

**Solvency guard:** if `totalAssets < sum(balances)`, it throws immediately with
a plain-English message (before doing any slow work). Show that message.

### Anyone — read the public verdict (READ, no wallet needed)

```ts
readReserves(): Promise<ReservesView | null>   // null = nothing published yet

interface ReservesView {
  attested: boolean;             // false before the first attestation
  solvent: boolean;              // the public verdict
  liabilitiesRootHex: string;    // the commitment root (customers need this)
  epoch: number;                 // 1, 2, 3, … (which attestation this is)
  lastAttestationTime: string;   // seconds since epoch, as a string
  lastAttestationISO: string | null; // convenience timestamp, or null
  custodianKeyHex: string;       // the custodian's public identity
}
```

This needs no wallet and no proof server — it just reads the chain. Safe to call
on page load and to poll every few seconds after an attestation (the indexer
takes a little time to catch up).

### Customer — inclusion proofs (self-check)

```ts
// Custodian side: rebuild the tree and get one proof per customer (by list
// position). Give each customer only THEIR entry (as JSON).
inclusionProofsFor(
  balances: Array<number | bigint | string>,
  asOfEpoch?: number
): CustomerProof[]

// Customer side: verify their proof against the on-chain root. Pure + instant.
verifyInclusion(proof: CustomerProof, onchainRootHex: string): boolean

// The root a proof recomputes to (to show side-by-side with the on-chain one).
recomputeRootHex(proof: CustomerProof): string

interface CustomerProof {   // fully JSON-serializable
  index: number;
  balance: string;
  idHashHex: string;
  saltHex: string;
  path: Array<{ digestHex: string; sum: string; goesLeft: boolean }>;
  asOfEpoch: number | null;
}
```

**Flow:** the custodian generates proofs with `inclusionProofsFor(sameBalances)`
and hands each customer their JSON blob. The customer pastes it into the "My
Proof" screen, which calls `readReserves()` to get `liabilitiesRootHex`, then
`verifyInclusion(proof, liabilitiesRootHex)`. `true` = "your balance is provably
part of the attested total."

### Setup helpers (for a custodian settings screen — optional)

```ts
// The exact value to put in .env.<network> for a chosen passphrase.
custodianSecretHexFromPassphrase(passphrase: string): Promise<string>
// The public identity for a passphrase (matches ReservesView.custodianKeyHex).
custodianKeyHexFromPassphrase(passphrase: string): Promise<string>
```

### Utilities

```ts
NETWORK_LABEL: string                    // "Preprod" — show it in the header
CONTRACT_ADDRESS: string                 // "" until deployed (see §4)
PROOF_SERVER_DOCKER_CMD: string          // the exact `docker run …` command
isProofServerUp(timeoutMs?): Promise<boolean>  // preflight before an attest
explorerTxUrl(txId: string): string | null
friendlyError(err: any): string          // turn ANY thrown error into plain English
inspectInjection(): { hasMidnight: boolean; keys: string[]; chosenKey: string | null }
```

**Always wrap `callAttest` in try/catch and show `friendlyError(err)`** — it maps
locked-wallet, rejected-popup, no-funds, and proof-server-down into clear
guidance.

---

## 3. The three screens to build

### A) Attest (custodian)
- Inputs: a **passphrase** field, a **total assets** field, and an editable
  **list of customer balances** (add/remove rows, or paste a list).
- Before submitting, call `isProofServerUp()`. If false, show a friendly banner
  with `PROOF_SERVER_DOCKER_CMD` (a copy button is nice).
- On submit: `connectWallet()` (if not already), then `callAttest({ passphrase,
  balances, totalAssets })`. Show a long-running "Generating zero-knowledge
  proof…" state.
- On success: show **SOLVENT**, the `epoch`, the `liabilitiesRootHex`, and the
  `txId` (link via `txUrl`, else a copy button). Then offer a **"Download
  customer proofs"** action using `inclusionProofsFor(balances, result.epoch)`
  (one JSON file, or one per customer).
- On error: `friendlyError(err)`.

### B) Status / Verify (public — this is the trust screen)
- On load, call `readReserves()`.
  - `null` or `attested === false` → "No attestation published yet."
  - else → big **SOLVENT / NOT SOLVENT** verdict, the timestamp
    (`lastAttestationISO`), the epoch, the commitment root, and the custodian
    identity. **Point out that no balances appear here — that's the privacy
    guarantee, made visible.**

### C) My Proof (customer)
- A textarea to paste their `CustomerProof` JSON.
- Call `readReserves()` for the root, then `verifyInclusion(proof, root)`.
- Show a clear ✓ "Included — your balance is part of the attested total" or ✗
  "Not verified for the current attestation." Optionally show
  `recomputeRootHex(proof)` next to the on-chain root so they can see they match.

---

## 4. Project setup you must create

### First: fix the install
The current `node_modules` is **incomplete** (a partial install — e.g.
`@midnight-ntwrk/midnight-js-contracts` is missing its `package.json`, and the
local TypeScript is missing its lib files). Run a clean install before anything:

```bash
npm install
```

### Add frontend dependencies
```bash
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
# Vite plugins the Midnight SDK needs in the browser:
npm install -D vite-plugin-wasm vite-plugin-top-level-await
# Browser polyfills the SDK expects (Buffer / global):
npm install -D vite-plugin-node-polyfills
```

### `vite.config.ts` (the SDK is picky in the browser — include all of this)
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), nodePolyfills({ globals: { Buffer: true, global: true } })],
  server: {
    fs: { allow: ['..'] }, // reserves.ts imports ../managed/contract/index.js
  },
  optimizeDeps: {
    // These wasm/ESM packages must not be pre-bundled the normal way:
    exclude: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/onchain-runtime'],
  },
});
```

### Browser `tsconfig` (separate from the root one, which is for Node)
Create `tsconfig.app.json` (or point Vite at it) with **DOM libs** — the root
`tsconfig.json` is Node-only and will show false errors for browser code:
```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true
  },
  "include": ["src"]
}
```

### Copy the ZK assets into `public/zk` (REQUIRED for attest to work)
The browser fetches the proving key + compiled circuit over HTTP from `/zk`.
Copy them into `public/` so Vite serves them:
```bash
mkdir -p public/zk/keys public/zk/zkir
cp managed/keys/attest.prover   public/zk/keys/
cp managed/keys/attest.verifier public/zk/keys/
cp managed/zkir/attest.bzkir    public/zk/zkir/
```
(Reads and the customer self-check work without this; only `callAttest` needs it.)

### The contract address
`CONTRACT_ADDRESS` is `""` until the contract is deployed to Preprod (the owner
does this). When the app is built, set it via env:
```
VITE_POR_CONTRACT_ADDRESS=<the deployed address>
```
Until then, `readReserves()` returns `null` and `callAttest()` throws a clear
"deploy first" message — so **build the UI to handle the not-deployed-yet state
gracefully** (show "No attestation published yet").

---

## 5. Design direction

The old UI was rejected for looking generic. Please give this a **distinct,
intentional identity** — you own the visual design. A strong concept for this
subject: **"proof without disclosure."** Make the privacy *visible* — e.g. the
customer list renders as sealed/redacted rows, and the public result appears as
a pressed **SOLVENT** stamp. Reserve one authoritative accent color for the
verdict; keep everything else calm and precise.

Please avoid the three AI-default looks: (1) cream background + big serif +
terracotta accent; (2) near-black + one acid-green accent; (3) hairline-rule
newspaper columns. Pick fonts and a palette specific to a
"cryptographic audit document" feel instead.

**Quality floor (non-negotiable):** responsive down to mobile, visible keyboard
focus, `prefers-reduced-motion` respected, and clear empty/loading/error states
(attest is slow — the "generating proof" state matters most).

---

## 6. Minimal end-to-end example

```tsx
import {
  connectWallet, callAttest, readReserves, inclusionProofsFor,
  verifyInclusion, isProofServerUp, friendlyError, NETWORK_LABEL,
} from './reserves';

// Custodian attests:
async function attest() {
  if (!(await isProofServerUp())) { /* show docker banner */ return; }
  await connectWallet();
  try {
    const res = await callAttest({
      passphrase: 'my-custodian-secret',
      balances: [100, 200, 300, 400],   // 4 customers
      totalAssets: 1000,                 // >= 1000 total liabilities
    });
    // res.solvent is implied true; show res.epoch, res.liabilitiesRootHex, res.txId
    const proofs = inclusionProofsFor([100, 200, 300, 400], res.epoch);
    // hand proofs[i] to customer i
  } catch (e) {
    alert(friendlyError(e));
  }
}

// Public reads the verdict:
const view = await readReserves();   // null until deployed + attested

// Customer verifies:
const ok = view && verifyInclusion(myProofJson, view.liabilitiesRootHex);
```

That's the whole integration surface. Build a great UI on top of these calls and
you're done.
