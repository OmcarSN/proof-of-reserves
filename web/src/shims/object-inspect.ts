// ESM shim for object-inspect needed because @midnight-ntwrk/compact-runtime
// does `import inspect from 'object-inspect'` while object-inspect is CommonJS.
export default function inspect(val: unknown, _opts?: unknown): string {
  if (typeof val === 'bigint') return `${val}n`;
  if (typeof val === 'string') return `"${val}"`;
  if (typeof val === 'symbol') return val.toString();
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  try {
    return JSON.stringify(val, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
  } catch {
    return String(val);
  }
}
