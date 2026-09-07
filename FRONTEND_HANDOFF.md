# ProofReserves — Frontend Handoff (for Antigravity)

You are building the **frontend** for ProofReserves. All the hard logic
(Midnight blockchain, zero-knowledge proofs, the Lace wallet, the Merkle tree)
is already written and finished in **one file: `src/reserves.ts`**.

**Your job:** build a **professional, polished, production-grade** React app that
calls the functions in `src/reserves.ts`. That's it. You never touch the
blockchain code.

> ✅ **The contract is LIVE.** It is already deployed and verified on Midnight
> **Preprod** at address
> `a44f44b9af01020db86c25e18abaaae751006b42b70daa70e990e7a69c94c765`.
> This address is already wired into `src/config/network.ts`, so **you do not
> need to set any address or env var** — `readReserves()` returns real on-chain
> data today, and `callAttest()` works end-to-end (with the Lace wallet + the
> local proof server running). Build against a live contract, not a mock.

This is a submission for the Midnight "New Moon to Full" builder challenge, so
the bar is a real product a judge can use, not a demo. Sweat the details:
loading states, empty states, error states, copy, spacing, and mobile.

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
CONTRACT_ADDRESS: string                 // the live Preprod address (already set)
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
- **IMPORTANT — add an "Advanced: paste 64-hex secret" toggle** under the
  passphrase field. When open, it shows a monospace input for the raw 64-hex
  custodian secret, and you call `callAttest({ custodianSecretHex, … })` instead
  of `{ passphrase, … }`. **This is required for the live deployment**, because
  the deployed custodian secret is a random 64-hex value (from the owner's
  `.env.preprod`), not derived from a passphrase — so on the live contract the
  passphrase field alone will fail the on-chain owner check. Pass whichever the
  user filled in (hex wins if both are present). `callAttest` already accepts
  either, so this is pure UI.
- Before submitting, call `isProofServerUp()`. If false, show a friendly banner
  with `PROOF_SERVER_DOCKER_CMD` (a copy button is nice).
- On submit: `connectWallet()` (if not already), then `callAttest({ ... })` with
  either `custodianSecretHex` (advanced) or `passphrase`, plus `balances` and
  `totalAssets`. Show a long-running "Generating zero-knowledge proof…" state.
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

### First: make sure the base install is healthy
The blockchain dependencies are already installed and the contract deploys
cleanly from this tree. If `node_modules` ever looks broken, do a clean reinstall
(this is the known-good fix):

```bash
npm cache clean --force && rm -rf node_modules && npm install
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

### The contract address — already set, nothing to do
The contract is **already deployed** to Preprod and its address is baked into
`src/config/network.ts`:
```
a44f44b9af01020db86c25e18abaaae751006b42b70daa70e990e7a69c94c765
```
So **you do not set any env var.** `readReserves()` talks to the live chain now.
(There is an optional `VITE_POR_CONTRACT_ADDRESS` override if you ever point at a
different deployment, but you won't need it.)

Note: right after a fresh deploy, before anyone has attested, `readReserves()`
returns `null` — that's the normal "no attestation published yet" state, not an
error. Handle it gracefully on the Status screen.

---

## 5. Design direction — make it look professional

The old UI was rejected for looking generic and unfinished. This time the goal is
a UI that looks like a **real financial-infrastructure product** — the kind of
tool an exchange's compliance team would actually open. You own the visual
design; below is the bar to clear.

### The concept: "proof without disclosure"
The whole point of this product is that you can **prove** solvency while
**hiding** every balance. Make that idea visible in the design:
- The custodian's customer list renders as **sealed / redacted rows** (blacked-out
  values, a small lock) — you can see there is data, but not the data.
- The public result lands as a single pressed **SOLVENT** stamp — authoritative,
  like a seal on an audited document.
- On the Status screen, explicitly point out that **no balances appear** — the
  absence *is* the feature.

### Visual identity (specific, not generic)
- Aim for a **"cryptographic audit document"** feel: precise, calm, trustworthy,
  data-dense but not cluttered. Think Stripe/Linear-grade polish, not a landing
  page.
- **Reserve exactly one accent color** for the verdict/primary action; everything
  else is neutral so the accent means something.
- Pick a deliberate type pairing (a characterful display face used sparingly for
  headings + a clean body face + a **monospace** for hashes, tx ids, and epoch
  numbers). Never show a 64-char hash in a proportional font.
- **Please avoid the three AI-default looks:** (1) cream background + big serif +
  terracotta accent; (2) near-black + one acid-green accent; (3) hairline-rule
  newspaper columns.

### Polish checklist (this is what "professional" means here)
- **Layout & rhythm:** a consistent spacing scale, aligned grids, generous
  whitespace, a max content width so it doesn't sprawl on desktop.
- **Every async call has three states:** loading, success, and a friendly error
  (use `friendlyError(err)`). Never leave the user staring at a frozen button.
- **The slow "generating proof" state is the most important screen in the app.**
  `callAttest` takes 10–60s. Show real progress feeling: a clear "Generating
  zero-knowledge proof… this can take up to a minute" with an animated indicator,
  disable the form, and reassure that balances never leave the browser. Do not
  let it look hung.
- **Copy matters.** Write plain, confident microcopy. Buttons say what they do
  ("Publish attestation", "Verify my balance"). Empty states invite action.
  Errors explain the fix. No lorem ipsum, no jargon dumped on the user.
- **Hashes & ids:** monospace, truncated with a copy button (and a tooltip/title
  with the full value). Link tx ids via `explorerTxUrl` when non-null.
- **Trust cues:** show the network ("Preprod"), the contract address (truncated +
  copy), and the wallet address (truncated) in a calm header/footer.
- **Feedback:** toasts or inline confirmations on copy, connect, and submit.
- **Responsive:** fully usable down to a 360px-wide phone. No horizontal scroll,
  tap targets ≥ 44px.
- **Accessibility floor (non-negotiable):** visible keyboard focus rings, labels
  tied to inputs, sufficient color contrast, `prefers-reduced-motion` respected,
  semantic headings.
- **No dead ends:** disabled states explain *why* (e.g. "Start the proof server to
  attest"), and the not-yet-attested Status screen looks intentional, not broken.

Judge test: a reviewer should land on this and immediately understand what it
proves, trust that it's real (live on-chain data, real tx links), and be able to
run through Attest → Status → My Proof without ever reading these docs.

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

// Public reads the verdict (live on-chain now):
const view = await readReserves();   // null only until the first attestation

// Customer verifies:
const ok = view && verifyInclusion(myProofJson, view.liabilitiesRootHex);
```

That's the whole integration surface. Build a great UI on top of these calls and
you're done.
