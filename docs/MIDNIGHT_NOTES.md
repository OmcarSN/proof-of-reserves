# MIDNIGHT_NOTES — Phase 0: Confirmed Primitives

> Date: 2026-08-08 · Toolchain: Compact CLI `0.5.1` (compiler `0.31.1`, language
> `0.23.0`, `@midnight-ntwrk/compact-runtime` `0.16.0`)
> Method: docs research + **compile probes** (every API below was compiled with
> the real compiler before being accepted) + a deployed community reference.

Every item the handoff (§C.2) demanded confirmation for is confirmed below.
Where the handoff's placeholder assumptions differed, the change is marked
**CHANGED**.

---

## 1. Hash primitive — CONFIRMED (linchpin of the Merkle sum tree)

**In-circuit:** `persistentHash<T>(value: T): Bytes<32>` from
`CompactStandardLibrary`. SHA-256-based compression over an arbitrary value;
**guaranteed stable across compiler upgrades**, so stored roots stay valid.

- Sources: Compact stdlib docs, "Compact standard library" reference
  (devrelaicom/midnight-expert, verified against the compiler), PBL lesson
  103.1, and the deployed reference contract
  `Cryptonean/confidential-por-midnight` (Preprod, compiler 0.31.x) which uses
  `persistentHash<Vector<3, Bytes<32>>>` in production circuits.
- **Probe compiled:** `persistentHash<Vector<2, MerkleSumNode>>([na, nb])`
  where `MerkleSumNode { digest: Bytes<32>; sum: Uint<64> }` — i.e. hashing a
  struct containing a `Uint<64>` works in-circuit.

**TypeScript counterpart — identical by construction:**
`persistentHash(rtType, value): Uint8Array` from `@midnight-ntwrk/compact-runtime`
is *the very function the compiled circuit emits* (`__compactRuntime.persistentHash(...)`
in generated `index.js`). It takes a `CompactType<A>` describing the value.

- The compiler builds those descriptors from public runtime classes:
  `CompactTypeBytes(32)`, `CompactTypeUnsignedInteger(max, bytes)`,
  `CompactTypeVector(n, elType)`, and for structs a plain object with
  `alignment() = fields concatenated` and `toValue() = fields concatenated`.
- Therefore `merkleSumTree.ts` can build the *identical* descriptor and get
  **byte-identical roots** (also verified by unit test #1 in Phase 1, which
  compares a TS-computed root against the root disclosed by the circuit).

Also confirmed: `persistentCommit<T>(value: T, rand: Bytes<32>): Bytes<32>` —
hiding commitment (the reference contract commits leaf balances as
`persistentCommit<Uint<64>>(balance, salt)`; commitments are treated as
sufficient protection — no `disclose()` required around them).
`transientHash<T>` exists but is NOT guaranteed stable across upgrades → not
suitable for ledger-stored roots.

## 2. Native Merkle support — EXISTS, but NOT used for the sum tree (CHANGED)

The stdlib provides `MerkleTreeDigest`, `MerkleTreePathEntry`, `MerkleTreePath`
types and `merkleTreePathRoot` / `merkleTreePathRootNoLeafHash` functions, plus
(per verified community references) a `MerkleTree<N, T>` ledger type in recent
compilers. **However:** the native tree hashes values only — it cannot carry a
per-node `sum`, which the Merkle **sum** tree requires. So we **hand-roll the
sum tree off-chain** (TypeScript) and do exactly **one** in-circuit hash
(`persistentHash<Vector<2, MerkleSumNode>>`), exactly as the handoff designed.
Deploying reference proves full in-circuit tree verification (127 hashes) is
also possible, but our one-hash circuit is strictly cheaper.

## 3. Types & overflow — CONFIRMED, with one correction

- Root hash type: **`Bytes<32>`** (output of `persistentHash`). Confirmed.
- Sums: **`Uint<64>`**. Confirmed.
- **Overflow (CHANGED vs. the handoff's worry):** Compact's language reference
  states `Uint` addition/multiplication **cannot overflow silently** — the
  result type *widens* (e.g. `Uint<64> + Uint<64>` yields `Uint<0..2^65-2>`).
  The narrowing cast back — `(ls + rs) as Uint<64>` — is a **checked dynamic
  error** when the value doesn't fit, halting the circuit (i.e. rejecting the
  attestation). This is exactly the "reject on overflow" mitigation from threat
  row 5, enforced by the type system. Probe-compiled.
- `Field` wraps mod k — never used for amounts.
- **`default` is a keyword expression (CHANGED):** the handoff placeholder
  `default<Bytes<32>>` (with parens) compiled fine in our probe, but the
  verified stdlib reference documents it without parens: `default<Bytes<32>>`.

## 4. Caller auth — CONFIRMED (hash-based DApp-specific key)

- **`ownPublicKey()` is explicitly NOT for caller verification** — the official
  security docs call it a witness function the caller's own frontend can forge
  ("Do not use ownPublicKey() for verification of the caller").
- The documented, secure pattern (used verbatim by the deployed reference):
  ```
  circuit ownerKey(sk: Bytes<32>): Bytes<32> {
    return persistentHash<Vector<2, Bytes<32>>>([pad(32, "por:owner:"), sk]);
  }
  ```
  Constructor stores `custodianKey = disclose(ownerKey(custodianSecret()))`;
  `attest` asserts `ownerKey(custodianSecret()) == custodianKey`. Knowledge of
  the secret (a 32-byte witness, never published) gates the circuit. The public
  hash is the custodian's on-chain identity — the entity binds it via its own
  domain. Probe-compiled.

## 5. Timestamp / "now" — CONFIRMED, with a design note

- Compact **cannot read a raw timestamp**; the stdlib exposes only comparisons:
  `blockTimeLt / blockTimeGte / blockTimeGt / blockTimeLte` against a disclosed
  `Uint<64>`. (Privacy-preserving design: time is only ever compared, never
  revealed.)
- Design: `attest(now: Uint<64>)` — the prover supplies `now`; the circuit
  discloses it as `lastAttestationTime` **and** asserts `blockTimeGte(now)`
  (rejects claiming a time in the future). So freshness is *bound to block
  time* while the exact clock value is prover-attested (honesty rule: label as
  attested). Probe-compiled.

## 6. Proof cost — CONFIRMED CHEAP

- Our circuit is **one** `persistentHash` (of two struct values) + a handful of
  `Uint<64>` comparisons/asserts + one `blockTimeGte`. The deployed reference
  contract runs 127 hashes + full-tree assertions on Preprod with the same
  compiler, so our constant-size circuit is comfortably fast. Tree depth
  therefore does not affect proof cost — only the browser-side tree build and
  inclusion checks scale (both linear, trivial).

---

## Design adjustments locked in (vs. handoff §C.6)

| Handoff placeholder | Final (confirmed) |
|---|---|
| `hash(lh, ls, rh, rs)` | `persistentHash<Vector<2, MerkleSumNode>>([left, right])` with `export struct MerkleSumNode { digest: Bytes<32>; sum: Uint<64>; }` |
| `Bytes<32>` root | ✅ kept (persistentHash output) |
| `default<Bytes<32>>` | `disclose(default<Bytes<32>>)` (no-paren keyword form documented) |
| constructor takes `custodian: Bytes<32>` | constructor derives key from witness secret via `ownerKey()` (documented auth pattern) |
| "restrict to custodian key" | `assert(ownerKey(secret) == custodianKey)` in `attest` |
| `attest(now)` sets time | `assert(blockTimeGte(disclose(now)))` + `lastAttestationTime = disclose(now)` |
| overflow "reject" | automatic: checked narrowing cast `(a + b) as Uint<64>` errors on overflow |

## Sources
- docs.midnight.network — Compact standard library; Smart contract security
  (auth patterns, ownPublicKey warning); Compact reference (Uint widening);
  compact-runtime API (`persistentHash`, `ownPublicKey`).
- Deployed reference: github.com/Cryptonean/confidential-por-midnight (Preprod,
  compiler 0.31.x) — validates `persistentHash`/`persistentCommit` in-circuit,
  owner-key auth, block-time slot freshness.
- devrelaicom/midnight-expert stdlib reference (verified signatures).
- Local compile probes (see `Temp/opencode/porprobe/`): struct hashing,
  `default<Bytes<32>>`, Uint widening casts, `blockTimeGte` — all compile with
  `compact 0.31.1` (CLI 0.5.1, run inside WSL Ubuntu).
