// ═══════════════════════════════════════════════════════════════════════
// ProofReserves — Network configuration (leaf module: no project imports)
//
// The Proof-of-Reserves contract runs on Midnight **Preprod** (the network the
// reviewers use). The contract address is filled in AFTER the owner deploys
// (`npm run deploy:preprod` writes deployment.preprod.json). Until then it can
// be supplied at build time via VITE_POR_CONTRACT_ADDRESS so the app builds and
// the Verify screen degrades gracefully to "nothing published yet".
// ═══════════════════════════════════════════════════════════════════════

export type NetworkId = 'preprod' | 'preview';

export interface NetworkEndpoints {
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;
}

export const PREPROD: NetworkEndpoints = {
  indexer: 'https://indexer.preprod.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
};

export const PREVIEW: NetworkEndpoints = {
  indexer: 'https://indexer.preview.midnight.network/api/v3/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v3/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  proofServer: 'http://127.0.0.1:6300',
};

// The contract is deployed on Preprod; the app runs there.
export const ACTIVE_NETWORK: NetworkId = 'preprod';
export const ENDPOINTS: NetworkEndpoints = ACTIVE_NETWORK === 'preprod' ? PREPROD : PREVIEW;

// Human-readable label for UI copy.
export const NETWORK_LABEL: string = ACTIVE_NETWORK === 'preprod' ? 'Preprod' : 'Preview';

// Deployed Proof-of-Reserves contract address. The env override wins (set
// VITE_POR_CONTRACT_ADDRESS in the app's .env / build); otherwise fill the
// constant below once `deployment.preprod.json` exists. Empty = not deployed
// yet: readReserves() returns null and callAttest() explains what to do.
const POR_PREPROD_CONTRACT = 'a44f44b9af01020db86c25e18abaaae751006b42b70daa70e990e7a69c94c765';

export const CONTRACT_ADDRESS: string =
  ((import.meta as any)?.env?.VITE_POR_CONTRACT_ADDRESS ?? '').trim() || POR_PREPROD_CONTRACT;

// Optional block-explorer origin. Preprod's explorer URL isn't pinned here, so
// links fall back to copy-to-clipboard (which always works). Set
// VITE_EXPLORER_BASE to enable clickable tx links.
export const EXPLORER_BASE: string =
  ((import.meta as any)?.env?.VITE_EXPLORER_BASE ?? '').trim();

export function explorerTxUrl(txId: string): string | null {
  // 'submitted' is our placeholder for a broadcast tx whose id the DUST-model
  // wallet did not return — never build a (broken) link for it.
  if (!EXPLORER_BASE || !txId || txId === 'submitted') return null;
  return `${EXPLORER_BASE.replace(/\/$/, '')}/tx/${txId}`;
}
