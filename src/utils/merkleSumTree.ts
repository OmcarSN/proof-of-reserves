// ═══════════════════════════════════════════════════════════════════════
// Merkle sum tree — off-chain liability tree for Proof of Reserves
// ═══════════════════════════════════════════════════════════════════════
//
// Each node carries { digest: Bytes<32>, sum: Uint<64> }:
//   leaf:      digest = persistentHash([pad32("por:leaf:"), idHash, salt])
//              sum    = the customer's balance
//   internal:  digest = persistentHash([left, right])   (both as MerkleSumNode)
//              sum    = left.sum + right.sum
//   root.sum  = total liabilities
//
// The digest construction here is BYTE-IDENTICAL to the circuit's:
//   liabilitiesRoot = persistentHash<Vector<2, MerkleSumNode>>([topLeft, topRight])
// Both sides call the same `persistentHash` from @midnight-ntwrk/compact-runtime
// with the same CompactType descriptors (the compiler builds its descriptors
// from the very same runtime classes). Unit test #1 in tests/ asserts the
// equivalence empirically against the on-chain root.
//
// Privacy: the tree itself never leaves the custodian. Each customer receives
// only their own leaf + sibling nodes along their path (their inclusion proof),
// and verifies the recomputed root against the on-chain liabilitiesRoot in
// their own browser. Balances never leave the browser.
// ═══════════════════════════════════════════════════════════════════════

import {
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  persistentHash,
  type CompactType,
} from '@midnight-ntwrk/compact-runtime';

/** One node of the Merkle sum tree (mirrors `MerkleSumNode` in the contract). */
export interface MerkleSumNode {
  digest: Uint8Array;
  sum: bigint;
}

/** A customer leaf: hashed id + random salt commit to the id; `sum` holds the balance. */
export interface MerkleSumLeaf {
  idHash: Uint8Array;
  salt: Uint8Array;
  balance: bigint;
}

/** Inclusion proof for one customer: their leaf + the sibling nodes along the path. */
export interface InclusionProof {
  leaf: MerkleSumNode;
  siblings: MerkleSumNode[];
  /** true when the sibling is to the LEFT of the current node at that level. */
  leftSiblings: boolean[];
}

// ─── Compact type descriptors (identical to the compiler's generated ones) ──
const bytes32 = new CompactTypeBytes(32);
const uint64 = new CompactTypeUnsignedInteger(18446744073709551615n, 8);

const merkleSumNodeType: CompactType<MerkleSumNode> = {
  alignment(): ReturnType<CompactType<unknown>['alignment']> {
    return bytes32.alignment().concat(uint64.alignment());
  },
  toValue(node: MerkleSumNode) {
    return bytes32.toValue(node.digest).concat(uint64.toValue(node.sum));
  },
  fromValue(value: Parameters<CompactType<unknown>['fromValue']>[0]): MerkleSumNode {
    return {
      digest: bytes32.fromValue(value),
      sum: uint64.fromValue(value),
    };
  },
};

const merkleSumNodePairType = new CompactTypeVector(2, merkleSumNodeType);
const leafValueType = new CompactTypeVector(3, bytes32);

// ─── Domain separators (must match the contract's `pad(32, ...)` labels) ────
const LEAF_PREFIX = 'por:leaf:';
const ZERO_PREFIX = 'por:zero:';
const OWNER_PREFIX = 'por:owner:';
const CID_PREFIX = 'por:cid:';
const SALT_PREFIX = 'por:slt:';

/** UTF-8 bytes of `s` padded with zero bytes to exactly 32 — mirrors `pad(32, s)`. */
export function pad32(s: string): Uint8Array {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s), 0);
  return out;
}

/** Hash of two child nodes — the circuit's `persistentHash<Vector<2, MerkleSumNode>>`. */
export function hashPair(left: MerkleSumNode, right: MerkleSumNode): Uint8Array {
  return persistentHash(merkleSumNodePairType, [left, right]);
}

/** Leaf commitment digest — binds the customer id (via hash) and a random salt. */
export function leafDigest(idHash: Uint8Array, salt: Uint8Array): Uint8Array {
  return persistentHash(leafValueType, [pad32(LEAF_PREFIX), idHash, salt]);
}

/**
 * A deterministic leaf derived purely from its position in the list.
 *
 * The custodian's on-chain tree (built in callAttest) and each customer's
 * inclusion proof (built later in inclusionProofsFor) must reproduce the SAME
 * root. hashCustomerId is async, but proof building has to be synchronous — so
 * for the demo we derive a stable idHash + salt from the row index with
 * persistentHash. Given the same ordered balance list, both sides build a
 * byte-identical tree, so a customer's recomputed root matches the on-chain
 * liabilitiesRoot. (A production custodian would instead persist each
 * customer's real idHash + random salt and hand them their own leaf.)
 */
export function deterministicLeaf(index: number, balance: bigint): MerkleSumLeaf {
  const pairType = new CompactTypeVector(2, bytes32);
  const idx = pad32(String(index));
  return {
    idHash: persistentHash(pairType, [pad32(CID_PREFIX), idx]),
    salt: persistentHash(pairType, [pad32(SALT_PREFIX), idx]),
    balance,
  };
}

/** The custodian's public key hash — mirrors the contract's `ownerKey` circuit. */
export function ownerKey(secret: Uint8Array): Uint8Array {
  const type = new CompactTypeVector(2, bytes32);
  return persistentHash(type, [pad32(OWNER_PREFIX), secret]);
}

/** Zero-sum padding leaf used to make the tree balanced (never collides with a real leaf). */
export function zeroLeaf(): MerkleSumNode {
  const zero = new Uint8Array(32);
  return {
    digest: leafDigest(pad32(ZERO_PREFIX), zero),
    sum: 0n,
  };
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** SHA-256 of a customer id — the customer and custodian agree on this id. */
export async function hashCustomerId(id: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
  return new Uint8Array(buf);
}

/** Build the Merkle sum tree from a list of customers. Returns the root, its two children, and per-customer proofs. */
export function buildSumTree(leaves: MerkleSumLeaf[]): {
  root: MerkleSumNode;
  topChildren: { left: MerkleSumNode; right: MerkleSumNode };
  proofs: Map<number, InclusionProof>;
} {
  const nodes: MerkleSumNode[] = leaves.map((l) => ({ digest: leafDigest(l.idHash, l.salt), sum: l.balance }));

  const leafCount = nodes.length;
  if (leafCount === 0) {
    const z = zeroLeaf();
    return { root: z, topChildren: { left: z, right: z }, proofs: new Map() };
  }

  // Pad to a power of two with zero leaves so the tree is balanced.
  const target = 1 << Math.ceil(Math.log2(leafCount));
  while (nodes.length < target) nodes.push(zeroLeaf());

  // `proofsByLeafIndex` accumulates sibling nodes; index into the current level.
  const proofs: Map<number, InclusionProof> = new Map();
  const startIndex = new Map<number, number>();
  for (let i = 0; i < leafCount; i++) startIndex.set(i, i);

  let level: MerkleSumNode[] = nodes;
  let levelIndexOffset = 0;
  let topChildren: { left: MerkleSumNode; right: MerkleSumNode } = { left: zeroLeaf(), right: zeroLeaf() };
  while (level.length > 1) {
    const next: MerkleSumNode[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      const digest = hashPair(left, right);
      next.push({ digest, sum: (left.sum + right.sum) as bigint });
      if (level.length === 2) {
        topChildren = { left, right };
      }
      // Record sibling info for any real leaf whose parent is this pair.
      for (const [leafIdx, pathIndex] of [...startIndex]) {
        if (pathIndex === i || pathIndex === i + 1) {
          const proof = proofs.get(leafIdx) ?? { leaf: nodes[leafIdx], siblings: [], leftSiblings: [] };
          proof.siblings.push(pathIndex === i ? right : left);
          proof.leftSiblings.push(pathIndex === i + 1);
          proofs.set(leafIdx, proof);
          startIndex.set(leafIdx, next.length - 1);
        }
      }
    }
    level = next;
  }

  return { root: level[0], topChildren, proofs };
}

/** Recompute the node reached by folding a proof's siblings into its leaf (its root). */
export function rootFromProof(proof: InclusionProof): MerkleSumNode {
  let node = proof.leaf;
  for (let i = 0; i < proof.siblings.length; i++) {
    const sib = proof.siblings[i];
    node = proof.leftSiblings[i]
      ? { digest: hashPair(sib, node), sum: (sib.sum + node.sum) as bigint }
      : { digest: hashPair(node, sib), sum: (node.sum + sib.sum) as bigint };
  }
  return node;
}

/** Recompute the root from a proof and compare to a given root digest. */
export function verifyInclusion(proof: InclusionProof, rootDigest: Uint8Array): boolean {
  return equalBytes(rootFromProof(proof).digest, rootDigest);
}

// ─── Hex helpers (for UI display and proof export/import) ─────────────────
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes32(): Uint8Array {
  const out = new Uint8Array(32);
  crypto.getRandomValues(out);
  return out;
}
