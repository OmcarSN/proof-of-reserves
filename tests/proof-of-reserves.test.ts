// ═══════════════════════════════════════════════════════════════════════
// Proof of Reserves — contract tests
// ═══════════════════════════════════════════════════════════════════════
//
// Core tests (competition L1):
//   1. attest succeeds when assets >= liabilities; the published root equals
//      hash(children) — and, critically, equals the root the OFF-CHAIN
//      TypeScript Merkle sum tree computes (hash-equivalence, Phase 0 §5).
//   2. State: solvent -> true, epoch increments; a 2nd attestation increments
//      again.
//   3. Privacy: assets/liabilities never appear in any public output.
//   4. Negative: attest FAILS when assets < liabilities.
//
// Hardening tests:
//   5. Only the custodian (holder of the registered secret) can attest.
//   6. An attestation claiming a future time is rejected (freshness bound).
//   7. A liability total that does not match the tree total is rejected.
//   8. A subtree sum exceeding Uint<64> is rejected (overflow guard).
//
// Advanced feature tests:
//   9. Custodian key rotation succeeds and old key is rejected.
//  10. Attestation revocation sets solvent to false.
//  11. Cannot revoke when no active attestation exists.
//  12. Emergency freeze blocks attestations; unfreeze restores.
//  13. Audit trail: previousRoot tracks the prior commitment.
//  14. Attest clears a previous revocation flag.
//  15. Double freeze / double unfreeze is rejected.
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
const NEW_CUSTODIAN_SECRET = Uint8Array.from({ length: 32 }, (_, i) => (i + 42) % 251);
const SALT = (n: number) => Uint8Array.from({ length: 32 }, (_, i) => (i + n * 7 + 13) % 256);

// ─── Configurable witnesses ─────────────────────────────────────────────
let witnessSecret: Uint8Array = CUSTODIAN_SECRET;
let witnessNewSecret: Uint8Array = NEW_CUSTODIAN_SECRET;
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
  newCustodianSecret: (_ctx: any): [any, Uint8Array] => [_ctx.privateState, witnessNewSecret],
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
// CORE TESTS — attest()
// ═══════════════════════════════════════════════════════════════════════
describe('Proof of Reserves — attest()', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessNewSecret = NEW_CUSTODIAN_SECRET;
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

    // New fields: revocation is cleared and previousRoot is zero (first attestation)
    expect(state.attestationRevoked).toBe(false);
    expect(state.frozen).toBe(false);
    expect(state.previousRoot).toEqual(new Uint8Array(32));
  });

  it('TEST 1b — attests successfully when there is only 1 customer in the tree', async () => {
    const leaves = [{ idHash: await hashCustomerId('solo'), salt: SALT(1), balance: 500n }];
    const tree = buildSumTree(leaves);
    expect(tree.root.sum).toBe(500n);
    expect(tree.topChildren.left.sum + tree.topChildren.right.sum).toBe(500n);
    setSolventWitnesses(tree, 500n);

    const { contract, context } = setupContract();
    const res = contract.impureCircuits.attest(context, NOW);
    const state = readState(res.context);

    expect(state.solvent).toBe(true);
    expect(state.attestationEpoch).toBe(1n);
    expect(state.liabilitiesRoot).toEqual(tree.root.digest);
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

    // The ledger exposes exactly the nine documented public fields.
    expect(Object.keys(state).sort()).toEqual(
      [
        'solvent', 'liabilitiesRoot', 'attestationEpoch', 'lastAttestationTime',
        'custodianKey', 'previousRoot', 'attestationRevoked', 'custodianRotationCount',
        'frozen',
      ].sort(),
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

// ═══════════════════════════════════════════════════════════════════════
// HARDENING TESTS
// ═══════════════════════════════════════════════════════════════════════
describe('Proof of Reserves — hardening', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessNewSecret = NEW_CUSTODIAN_SECRET;
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

// ═══════════════════════════════════════════════════════════════════════
// ADVANCED FEATURE TESTS — rotation, revocation, freeze
// ═══════════════════════════════════════════════════════════════════════
describe('Proof of Reserves — key rotation', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessNewSecret = NEW_CUSTODIAN_SECRET;
    witnessAssets = 0n;
    witnessLiabilities = 0n;
    witnessTopLeft = { digest: new Uint8Array(32), sum: 0n };
    witnessTopRight = { digest: new Uint8Array(32), sum: 0n };
  });

  it('TEST 9 — custodian rotation succeeds and old key is rejected', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // Initial state: rotation count is 0
    expect(readState(context).custodianRotationCount).toBe(0n);

    // Rotate the custodian key
    const rotRes = contract.impureCircuits.rotateCustodian(context);
    expect(readState(rotRes.context).custodianRotationCount).toBe(1n);

    // OLD secret can no longer attest
    expect(() => contract.impureCircuits.attest(rotRes.context, NOW)).toThrow(
      'Not authorized: caller is not the custodian',
    );

    // NEW secret CAN attest
    witnessSecret = NEW_CUSTODIAN_SECRET;
    const attRes = contract.impureCircuits.attest(rotRes.context, NOW);
    expect(readState(attRes.context).solvent).toBe(true);
    expect(readState(attRes.context).attestationEpoch).toBe(1n);
  });

  it('TEST 10 — unauthorized caller cannot rotate keys', async () => {
    const { contract, context } = setupContract();

    // Use a wrong secret
    witnessSecret = Uint8Array.from({ length: 32 }, (_, i) => (i + 99) % 251);
    expect(() => contract.impureCircuits.rotateCustodian(context)).toThrow(
      'Not authorized',
    );
  });
});

describe('Proof of Reserves — attestation revocation', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessNewSecret = NEW_CUSTODIAN_SECRET;
    witnessAssets = 0n;
    witnessLiabilities = 0n;
    witnessTopLeft = { digest: new Uint8Array(32), sum: 0n };
    witnessTopRight = { digest: new Uint8Array(32), sum: 0n };
  });

  it('TEST 11 — revocation sets solvent to false and marks as revoked', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // First attest to make it solvent
    const attRes = contract.impureCircuits.attest(context, NOW);
    expect(readState(attRes.context).solvent).toBe(true);
    expect(readState(attRes.context).attestationRevoked).toBe(false);

    // Revoke the attestation
    const revRes = contract.impureCircuits.revokeAttestation(attRes.context);
    expect(readState(revRes.context).solvent).toBe(false);
    expect(readState(revRes.context).attestationRevoked).toBe(true);
    // Epoch and root are preserved for audit trail
    expect(readState(revRes.context).attestationEpoch).toBe(1n);
  });

  it('TEST 12 — cannot revoke when no active attestation exists', async () => {
    const { contract, context } = setupContract();

    // Initial state: not solvent, so nothing to revoke
    expect(() => contract.impureCircuits.revokeAttestation(context)).toThrow(
      'No active solvent attestation to revoke',
    );
  });

  it('TEST 13 — cannot revoke an already revoked attestation', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // Attest, then revoke
    const attRes = contract.impureCircuits.attest(context, NOW);
    const revRes = contract.impureCircuits.revokeAttestation(attRes.context);

    // Try to revoke again — should fail
    expect(() => contract.impureCircuits.revokeAttestation(revRes.context)).toThrow(
      'No active solvent attestation to revoke',
    );
  });

  it('TEST 14 — a new attestation clears the revocation flag', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // Attest → revoke → attest again
    const att1 = contract.impureCircuits.attest(context, NOW);
    const rev = contract.impureCircuits.revokeAttestation(att1.context);
    expect(readState(rev.context).attestationRevoked).toBe(true);

    const att2 = contract.impureCircuits.attest(rev.context, NOW);
    expect(readState(att2.context).solvent).toBe(true);
    expect(readState(att2.context).attestationRevoked).toBe(false);
    expect(readState(att2.context).attestationEpoch).toBe(2n);
  });
});

describe('Proof of Reserves — emergency freeze', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessNewSecret = NEW_CUSTODIAN_SECRET;
    witnessAssets = 0n;
    witnessLiabilities = 0n;
    witnessTopLeft = { digest: new Uint8Array(32), sum: 0n };
    witnessTopRight = { digest: new Uint8Array(32), sum: 0n };
  });

  it('TEST 15 — emergency freeze blocks attestations', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // Freeze the contract
    const freezeRes = contract.impureCircuits.emergencyFreeze(context);
    expect(readState(freezeRes.context).frozen).toBe(true);
    expect(readState(freezeRes.context).solvent).toBe(false);

    // Attest should fail while frozen
    expect(() => contract.impureCircuits.attest(freezeRes.context, NOW)).toThrow(
      'Contract is frozen — attestations are paused until unfrozen',
    );
  });

  it('TEST 16 — unfreeze restores the ability to attest', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // Freeze → unfreeze → attest
    const freezeRes = contract.impureCircuits.emergencyFreeze(context);
    const unfreezeRes = contract.impureCircuits.unfreeze(freezeRes.context);
    expect(readState(unfreezeRes.context).frozen).toBe(false);

    const attRes = contract.impureCircuits.attest(unfreezeRes.context, NOW);
    expect(readState(attRes.context).solvent).toBe(true);
    expect(readState(attRes.context).attestationEpoch).toBe(1n);
  });

  it('TEST 17 — double freeze is rejected', async () => {
    const { contract, context } = setupContract();

    const freezeRes = contract.impureCircuits.emergencyFreeze(context);
    expect(() => contract.impureCircuits.emergencyFreeze(freezeRes.context)).toThrow(
      'Contract is already frozen',
    );
  });

  it('TEST 18 — double unfreeze is rejected', async () => {
    const { contract, context } = setupContract();

    // Not frozen initially, so unfreeze should fail
    expect(() => contract.impureCircuits.unfreeze(context)).toThrow(
      'Contract is not frozen',
    );
  });
});

describe('Proof of Reserves — audit trail', () => {
  beforeEach(() => {
    witnessSecret = CUSTODIAN_SECRET;
    witnessNewSecret = NEW_CUSTODIAN_SECRET;
    witnessAssets = 0n;
    witnessLiabilities = 0n;
    witnessTopLeft = { digest: new Uint8Array(32), sum: 0n };
    witnessTopRight = { digest: new Uint8Array(32), sum: 0n };
  });

  it('TEST 19 — previousRoot tracks the prior commitment after re-attestation', async () => {
    const tree = await buildSampleTree();
    setSolventWitnesses(tree, 1000n);
    const { contract, context } = setupContract();

    // First attestation: previousRoot is zero (no prior)
    const att1 = contract.impureCircuits.attest(context, NOW);
    const state1 = readState(att1.context);
    expect(state1.previousRoot).toEqual(new Uint8Array(32)); // zero hash
    const firstRoot = state1.liabilitiesRoot;

    // Build a different tree for second attestation
    const leaves2 = [
      { idHash: await hashCustomerId('eve'), salt: SALT(5), balance: 500n },
      { idHash: await hashCustomerId('frank'), salt: SALT(6), balance: 600n },
    ];
    const tree2 = buildSumTree(leaves2);
    setSolventWitnesses(tree2, 1100n);

    // Second attestation: previousRoot should be the first root
    const att2 = contract.impureCircuits.attest(att1.context, NOW);
    const state2 = readState(att2.context);
    expect(state2.previousRoot).toEqual(firstRoot);
    expect(state2.liabilitiesRoot).toEqual(tree2.root.digest);
    expect(state2.attestationEpoch).toBe(2n);
  });
});
