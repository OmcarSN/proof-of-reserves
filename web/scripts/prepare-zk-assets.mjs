// ═══════════════════════════════════════════════════════════════════════
// Copy compiled ZK assets into web/public so the browser prover can fetch them.
//
// The circuit-call path uses FetchZkConfigProvider, which loads:
//   <base>/keys/<circuit>.prover
//   <base>/keys/<circuit>.verifier
//   <base>/zkir/<circuit>.bzkir
// over HTTP. In dev/build, Vite serves web/public at the site root, so we
// place the assets under web/public/zk to match ZK_CONFIG_BASE ('/zk') in
// src/midnight/circuits.ts.
//
// Run:  npm run prep:zk   (from web/, in a native WSL shell)
// ═══════════════════════════════════════════════════════════════════════
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const managed = path.resolve(webRoot, '..', 'managed');
const dest = path.resolve(webRoot, 'public', 'zk');

const src = {
  keys: path.join(managed, 'keys'),
  zkir: path.join(managed, 'zkir'),
};

if (!existsSync(src.keys) || !existsSync(src.zkir)) {
  console.error(
    `✗ Compiled ZK assets not found under ${managed}.\n` +
      `  Compile the contract first (npm run compile in the repo root).`,
  );
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src.keys, path.join(dest, 'keys'), { recursive: true });
cpSync(src.zkir, path.join(dest, 'zkir'), { recursive: true });

console.log(`✓ Copied ZK keys + zkir → ${path.relative(webRoot, dest)}/`);
console.log('  Served at /zk (matches ZK_CONFIG_BASE in src/midnight/circuits.ts).');
