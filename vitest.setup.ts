// ═══════════════════════════════════════════════════════════════════════
// Vitest global setup
//
// The Compact ledger exposes its fields as native runtime types: numeric
// fields (epoch, timestamps, sums) as `bigint`, and hash/key fields as raw
// `Uint8Array` bytes. `JSON.stringify` throws on a bigint and renders a
// Uint8Array as an unreadable index map ({"0":4,"1":145,…}). The privacy
// test serialises the whole ledger state to assert that no private amount
// leaks into it and that the public commitment root is present as hex, so we
// teach both types to serialise the way that test — and any human reading a
// state dump — expects: bigints as plain decimal strings, byte arrays as
// lowercase hex (identical to src/utils/merkleSumTree.ts `toHex`). This
// changes only how values print under JSON.stringify; it touches no test or
// contract code.
// ═══════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Uint8Array.prototype as any).toJSON = function () {
  return Array.from(this as Uint8Array, (b) => b.toString(16).padStart(2, '0')).join('');
};
