// ═══════════════════════════════════════════════════════════════════════
// Proof of Reserves — contract tests
// ═══════════════════════════════════════════════════════════════════════
//
// The four required tests (competition L1):
//   1. attest succeeds when assets >= liabilities; the published root equals
//      hash(children) — and, critically, equals the root the OFF-CHAIN
//      TypeScript Merkle sum tree computes (hash-equivalence, Phase 0 §5).
//   2. State: solvent -> true, epoch increments; a 2nd attestation increments
//      again.
//   3. Privacy: assets/liabilities never appear in any public output.
//   4. Negative: attest FAILS when assets < liabilities.
//
// Bonus hardening tests:
//   5. Only the custodian (holder of the registered secret) can attest.
//   6. An attestation claiming a future time is rejected (freshness bound).
//   7. A liability total that does not match the tree total is rejected.
//   8. A subtree sum exceeding Uint<64> is rejected (overflow guard).
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest';
import { Contract, ledger } from '../managed/contract/index.js';
import { emptyZswapLocalState, createCircuitContext } from '@midnight-ntwrk/compact-runtime';
import { signatureVerifyingKey, sampleSigningKey, dummyContractAddress } from '@midnight-ntwrk/onchain-runtime-v3';
import {
  buildSumTree,
  hashCustomerId,
  hashPair,
  verifyInclusion,
  toHex,
} from '../src/utils/merkleSumTree.js';

const TEST_COIN_PUBLIC_KEY = signatureVerifyingKey(sampleSigningKey());

// Fixed "block time" (seconds since epoch) for the simulator.
const BLOCK_TIME = 1_750_000_000n;
const NOW = BLOCK_TIME; // an attestation timestamp equal to block time is "now or past"

const CUSTODIAN_SECRET = Uint8Array.from({ length: 32 }, (_, i) => (i + 1) % 251);
const SALT = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i + n * 7 + 13) % 256);

// ─── Configurable witnesses ─────────────────────────────────────────────
let witnessSecret: Uint8Array = CUSTODIAN_SECRET;
let witnessAssets = 0n;
let witnessLiabilities = 0n;
let witnessTopLeft = { digest: new Uint8Array(32), sum: 0n };
let witnessTopRight = { digest: new Uint8Array(32), sum: 0n };

const witnesses = {
  custodianSecret: (_ctx: any): [any, Uint8Array] => [_ctx.privateState, witnessSecret],
  totalAssets: (_ctx: any): [any, bigint] => [_ctx.privateState, witnessAssets],
  totalLiabilities: (_ctx: any): [any, bigint] => [_ctx.privateState, witnessLiabilities],
  topLeft: (_ctx: any): [any, { digest: Uint8Array; sum: bigint }] => [_ctx.privateState, witnessTopLeft],
  topRight: (_ctx: any): [any, { digest: Uint8Array; sum: bigint }] => [_ctx.privateState, witnessTopRight],
};

// ─── Helpers ─────────────────────────────────────────────────────────────
function setupContract() {
  const contract = new Contract(witnesses);
  const constructorResult = contract.initialState({
    initialPrivateState: {},
    initialZswapLocalState: emptyZswapLocalState(TEST_COIN_PUBLIC_KEY),
  });
  const context = createCircuitContext(
    dummyContractAddress(),
    constructorResult.currentZswapLocalState.coinPublicKey,
    constructorResult.currentContractState,
    constructorResult.currentPrivateState,
    undefined,
    undefined,
    Number(BLOCK_TIME),
  );
  return { contract, context };
}

function readState(ctx: any) {
  return ledger(ctx.currentQueryContext.state);
}

/** Build a 4-customer tree: alice 100, bob 200, carol 300, dave 400 -> total 1000. */
async function buildSampleTree() {
  const leaves = [
    { idHash: await hashCustomerId('alice'), salt: SALT(1), balance: 100n },
    { idHash: await hashCustomerId('bob'), salt: SALT(2), balance: 200n },
    { idHash: await hashCustomerId('carol'), salt: SALT(3), balance: 300n },
    { idHash: await hashCustomerId('dave'), salt: SALT(4), balance: 400n },
  ];
  return buildSumTree(leaves);
}

/** Point the witnesses at a solvent attestation (assets == tree total). */
function setSolventWitnesses(tree: Awaited<ReturnType<typeof buildSampleTree>>, assets: bigint) {
  witnessAssets = assets;
  witnessLiabilities = tree.root.sum;
  witnessTopLeft = tree.topChildren.left;
  witnessTopRight = tree.topChildren.right;
}

// ═══════════════════════════════════════════════════════════════════════
describe('Proof of Reserves — attest()', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessAssets = 0n;
    witnessLiabilities = 0n;
    witnessTopLeft = { digest: new Uint8Array(32), sum: 0n };
    witnessTopRight = { digest: new Uint8Array(32), sum: 0n };
  });

  it('TEST 1 — attests a solvent custodian; published root == hash(children) == off-chain tree root', async () => {
    const tree = await buildSampleTree();
    expect(tree.root.sum).toBe(1000n);
    setSolventWitnesses(tree, 1000n);

    const { contract, context } = setupContract();
    const res = contract.impureCircuits.attest(context, NOW);
    const state = readState(res.context);

    expect(state.solvent).toBe(true);
    expect(state.attestationEpoch).toBe(1n);
    expect(state.lastAttestationTime).toBe(NOW);

    // The on-chain root is exactly the one-hash commitment of the two children…
    expect(state.liabilitiesRoot).toEqual(hashPair(witnessTopLeft, witnessTopRight));
    // …which is byte-identical to the root the TypeScript tree built off-chain.
    expect(state.liabilitiesRoot).toEqual(tree.root.digest);

    // Every customer's inclusion proof verifies against the published root.
    for (const proof of tree.proofs.values()) {
      expect(verifyInclusion(proof, state.liabilitiesRoot)).toBe(true);
    }
  });

  it('TEST 2 — solvent flips true and epoch increments on each attestation', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    expect(readState(context).solvent).toBe(false);
    expect(readState(context).attestationEpoch).toBe(0n);

    const r1 = contract.impureCircuits.attest(context, NOW);
    expect(readState(r1.context).solvent).toBe(true);
    expect(readState(r1.context).attestationEpoch).toBe(1n);

    const r2 = contract.impureCircuits.attest(r1.context, NOW);
    expect(readState(r2.context).solvent).toBe(true);
    expect(readState(r2.context).attestationEpoch).toBe(2n);
    expect(readState(r2.context).liabilitiesRoot).toEqual(tree.root.digest);
  });

  it('TEST 3 — privacy: assets/liabilities never appear in any public output', async () => {
    // Deliberately distinctive amounts that would be obvious if leaked.
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 987654321n);
    witnessAssets = 987654321n;

    const { contract, context } = setupContract();
    const res = contract.impureCircuits.attest(context, NOW);
    const state = readState(res.context);

    // The circuit returns an empty tuple — no amounts in the return value.
    expect(res.result).toEqual([]);

    // The ledger exposes exactly the five documented public fields.
    expect(Object.keys(state).sort()).toEqual(
      ['solvent', 'liabilitiesRoot', 'attestationEpoch', 'lastAttestationTime', 'custodianKey'].sort(),
    );

    // The literal amounts (and the tree total) appear nowhere in the state.
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('987654321');
    expect(serialized).not.toContain('1000');
    expect(serialized).toContain(toHex(tree.root.digest)); // only the commitment root is public
  });

  it('TEST 4 — rejects an attestation when assets < liabilities (insolvent)', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 999n); // liabilities are 1000
    const { contract, context } = setupContract();

    expect(() => contract.impureCircuits.attest(context, NOW)).toThrow(
      'Insolvent — refusing to attest',
    );
    // State unchanged: still never attested, epoch 0.
    expect(readState(context).solvent).toBe(false);
    expect(readState(context).attestationEpoch).toBe(0n);
  });
});

describe('Proof of Reserves — hardening', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessAssets = 0n;
    witnessLiabilities = 0n;
    witnessTopLeft = { digest: new Uint8Array(32), sum: 0n };
    witnessTopRight = { digest: new Uint8Array(32), sum: 0n };
  });

  it('TEST 5 — only the custodian (holder of the registered secret) can attest', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // Impersonate: different secret -> derived key no longer matches custodianKey.
    witnessSecret = Uint8Array.from({ length: 32 }, (_, i) => (i + 9) % 251);
    expect(() => contract.impureCircuits.attest(context, NOW)).toThrow(
      'Not authorized: caller is not the custodian',
    );
  });

  it('TEST 6 — rejects an attestation claiming a future timestamp', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    expect(() => contract.impureCircuits.attest(context, BLOCK_TIME + 3600n)).toThrow(
      'Attestation time is in the future',
    );
  });

  it('TEST 7 — rejects when the liability total does not match the tree total', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    witnessLiabilities = tree.root.sum - 1n; // lie about the total
    const { contract, context } = setupContract();

    expect(() => contract.impureCircuits.attest(context, NOW)).toThrow(
      'Liabilities do not match the committed tree total',
    );
  });

  it('TEST 8 — rejects a subtree sum that overflows Uint<64>', async () => {
    const max = 18446744073709551615n; // 2^64 - 1
    witnessAssets = max;
    witnessLiabilities = max;
    witnessTopLeft = { digest: new Uint8Array(32).fill(1), sum: 9223372036854775808n }; // 2^63
    witnessTopRight = { digest: new Uint8Array(32).fill(2), sum: 9223372036854775808n }; // 2^63
    const { contract, context } = setupContract();

    // (2^63 + 2^63) cannot narrow back to Uint<64>: the checked cast aborts the circuit.
    expect(() => contract.impureCircuits.attest(context, NOW)).toThrow();
  });
});
