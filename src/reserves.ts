// ═══════════════════════════════════════════════════════════════════════
// ProofReserves — the ONE owned logic module (privacy-critical core)
//
// The whole app talks to Midnight ONLY through this file. The UI (built
// separately) imports these functions and never touches @midnight-ntwrk/*,
// the compiled contract, or the Merkle-tree internals directly — so the UI
// can't accidentally leak a private balance or break the ZK flow.
//
// What Proof of Reserves proves (in one sentence): a custodian proves that its
// total assets ≥ the total of every customer balance, revealing ONLY
// SOLVENT/NOT-SOLVENT + a timestamp + an epoch counter + a commitment root —
// never a single balance. Each customer can then privately check that their own
// balance is inside that committed total, in their own browser.
//
// Two roles, two entry points:
//   • Custodian → connectWallet() then callAttest({...})  (writes on-chain)
//   • Anyone    → readReserves()                          (reads the verdict)
//   • Customer  → inclusionProofsFor(...) / verifyInclusion(...)  (self-check)
//
// SECURITY: balances and the custodian secret live ONLY in local variables and
// witness closures. They are inputs to the local ZK proof (Docker proof server,
// :6300) and NEVER travel to the chain. The chain stores only the verdict.
// ═══════════════════════════════════════════════════════════════════════

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import {
  ACTIVE_NETWORK,
  CONTRACT_ADDRESS,
  ENDPOINTS,
  NETWORK_LABEL,
  explorerTxUrl,
} from './config/network';
import {
  connectLace,
  getConnector,
  readWalletState,
  clearConnection,
  isWalletAvailable,
  inspectInjection,
} from './midnight/connector';
import { isProofServerUp, PROOF_SERVER_DOCKER_CMD } from './midnight/proofServer';
import {
  buildSumTree,
  deterministicLeaf,
  rootFromProof,
  leafDigest,
  ownerKey,
  toHex,
  fromHex,
  type InclusionProof,
  type MerkleSumNode,
} from './utils/merkleSumTree';

// Address decoding + provers key off the active network id; set it once here.
setNetworkId(ACTIVE_NETWORK);

const PRIVATE_STATE_ID = 'proofOfReservesPrivateState';

// Where the browser fetches the proving key + compiled circuit from. Copy
// managed/keys and managed/zkir into the app's public/zk (served at /zk).
const ZK_ASSETS_BASE_URL = '/zk';

// The only circuit; its ZK assets live at /zk/keys/attest.* and /zk/zkir/attest.bzkir.
const CIRCUIT_ID = 'attest';

/** Largest value a Compact `Uint<64>` can hold; over this, the circuit aborts. */
const U64_MAX = 18446744073709551615n;

// ── Re-exports so the UI needs to import ONLY this module ─────────────────
export { NETWORK_LABEL, explorerTxUrl, isProofServerUp, PROOF_SERVER_DOCKER_CMD, isWalletAvailable };
export { CONTRACT_ADDRESS };

// ─────────────────────────────────────────────────────────────────────────
// Public types (all JSON-friendly: hex strings + decimal strings, no bigint
// or Uint8Array crosses this boundary, so the UI can freely JSON.stringify).
// ─────────────────────────────────────────────────────────────────────────

/** What connectWallet() hands back for display. */
export interface WalletInfo {
  address: string;
  coinPublicKey: string;
  walletName: string;
  networkLabel: string;
}

/** Inputs for a custodian attestation. */
export interface AttestParams {
  /**
   * The custodian's secret. Provide EITHER a `passphrase` (hashed to the 32-byte
   * secret with SHA-256) OR a raw 64-char hex `custodianSecretHex`. Whichever you
   * use, it must reproduce the secret used at deploy time (see the handoff doc):
   * the circuit checks ownerKey(secret) == the on-chain custodianKey.
   */
  passphrase?: string;
  custodianSecretHex?: string;
  /** Ordered customer balances (any of number | bigint | decimal string). Order defines the tree. */
  balances: Array<number | bigint | string>;
  /** The custodian's total assets/reserves. Must be ≥ the sum of balances. */
  totalAssets: number | bigint | string;
  /** Optional attestation time (seconds since epoch). Defaults to 5 min ago. */
  nowSeconds?: number | bigint;
}

/** Result of a successful attestation. */
export interface AttestResult {
  txId: string;
  /** Explorer link for txId, or null if not linkable (copy it instead). */
  txUrl: string | null;
  /** The commitment published on-chain (customers verify against this). */
  liabilitiesRootHex: string;
  /** Custodian-only view (never on-chain): the total that was committed. */
  totalLiabilities: string;
  /** The epoch this attestation should land at (previous + 1). */
  epoch: number;
}

/** The public verdict read back from the chain. `null` = nothing published yet. */
export interface ReservesView {
  /** true once a solvent attestation has been recorded. */
  attested: boolean;
  solvent: boolean;
  liabilitiesRootHex: string;
  epoch: number;
  /** Attestation time, seconds since epoch (0 until first attestation). */
  lastAttestationTime: string;
  /** Convenience ISO timestamp, or null before the first attestation. */
  lastAttestationISO: string | null;
  /** The custodian's public identity (hash of its secret). */
  custodianKeyHex: string;
}

/** A single customer's private inclusion proof (safe to hand to that customer). */
export interface CustomerProof {
  index: number;
  balance: string;
  idHashHex: string;
  saltHex: string;
  path: Array<{ digestHex: string; sum: string; goesLeft: boolean }>;
  asOfEpoch: number | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────

function toBig(v: number | bigint | string): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Math.trunc(v) !== v) {
      throw new Error(`Amount must be a whole number, got ${v}.`);
    }
    return BigInt(v);
  }
  const s = String(v).trim();
  if (!/^\d+$/.test(s)) throw new Error(`Amount must be a non-negative whole number, got "${v}".`);
  return BigInt(s);
}

function assertU64(name: string, v: bigint): void {
  if (v < 0n) throw new Error(`${name} cannot be negative.`);
  if (v > U64_MAX) throw new Error(`${name} is too large (max ${U64_MAX}).`);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

/** Resolve the 32-byte custodian secret from a passphrase or a raw hex string. */
async function resolveCustodianSecret(params: AttestParams): Promise<Uint8Array> {
  if (params.custodianSecretHex && params.custodianSecretHex.trim()) {
    const hex = params.custodianSecretHex.trim();
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error('custodianSecretHex must be exactly 64 hex characters.');
    }
    return fromHex(hex);
  }
  if (params.passphrase && params.passphrase.length > 0) {
    return sha256(new TextEncoder().encode(params.passphrase));
  }
  throw new Error('Provide the custodian passphrase (or custodianSecretHex) to authorize the attestation.');
}

/**
 * The exact 64-hex value to put in .env.<network> as
 * PROOF_OF_RESERVES_CUSTODIAN_SECRET for a chosen passphrase, so the browser
 * custodian (using the same passphrase) reproduces the deployed identity.
 * Handy for a one-time setup screen.
 */
export async function custodianSecretHexFromPassphrase(passphrase: string): Promise<string> {
  return toHex(await sha256(new TextEncoder().encode(passphrase)));
}

/** The public custodian identity (hash of the secret) for a passphrase — for display / cross-check. */
export async function custodianKeyHexFromPassphrase(passphrase: string): Promise<string> {
  const secret = await sha256(new TextEncoder().encode(passphrase));
  return toHex(ownerKey(secret));
}

// ─────────────────────────────────────────────────────────────────────────
// Wallet
// ─────────────────────────────────────────────────────────────────────────

/** Connect to Lace (cached for the session). Throws a friendly error if unavailable. */
export async function connectWallet(): Promise<WalletInfo> {
  if (!isWalletAvailable()) {
    throw new Error('Lace wallet not detected. Install it from lace.io, then reload this page.');
  }
  const conn = await connectLace();
  return {
    address: conn.state.address,
    coinPublicKey: conn.state.coinPublicKey,
    walletName: conn.walletName,
    networkLabel: NETWORK_LABEL,
  };
}

/** Forget the cached wallet connection (UI "disconnect"). */
export function disconnectWallet(): void {
  clearConnection();
}

// ─────────────────────────────────────────────────────────────────────────
// Diagnostics (ported from the proven ProofAudit submit path) — turn opaque,
// empty-message SDK/wallet errors into something actionable in the banner.
// ─────────────────────────────────────────────────────────────────────────

function describeShape(o: any, depth = 0): string {
  if (o === null || o === undefined) return String(o);
  if (typeof o === 'string') return `str(${o.length})`;
  if (typeof o !== 'object') return typeof o;
  if (depth > 1) return Array.isArray(o) ? 'array' : 'object';
  const entries = Object.keys(o).slice(0, 24).map((k) => `${k}:${describeShape(o[k], depth + 1)}`);
  return `{${entries.join(', ')}}`;
}

function fnNames(o: any): string {
  try {
    return Object.keys(o).filter((k) => typeof o[k] === 'function').join(',');
  } catch {
    return '?';
  }
}

function protoNames(o: any): string {
  try {
    const proto = Object.getPrototypeOf(o);
    if (!proto) return '';
    return Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor').slice(0, 30).join(',');
  } catch {
    return '?';
  }
}

function unwrapEffectCause(cause: any, seen: Set<any>, depth: number): string {
  if (cause == null || typeof cause !== 'object' || depth > 6 || seen.has(cause)) return '';
  seen.add(cause);
  const tag = cause._tag;
  if (tag === 'Fail' && cause.error != null) return describeErr(cause.error, depth + 1);
  if (tag === 'Die' && cause.defect != null) return describeErr(cause.defect, depth + 1);
  if (tag === 'Interrupt') return 'fiber interrupted';
  for (const k of ['error', 'defect', 'cause', 'left', 'right', 'value', 'current']) {
    const s = unwrapEffectCause(cause[k], seen, depth + 1);
    if (s) return s;
  }
  return '';
}

function describeErr(e: any, depth = 0): string {
  if (e == null) return String(e);
  if (typeof e === 'string') return e;
  if (depth > 6) return e.name || 'Error';
  const name = e.name || e.constructor?.name || 'Error';
  let msg = e.message ? String(e.message) : '';
  if (!msg) {
    try {
      const seen = new Set<any>();
      for (const sym of Object.getOwnPropertySymbols(e)) {
        const found = unwrapEffectCause((e as any)[sym], seen, 0);
        if (found) { msg = found; break; }
      }
    } catch { /* symbol access can throw on exotic objects */ }
  }
  let frame = '';
  if (typeof e.stack === 'string') {
    const lines = e.stack.split('\n').map((l: string) => l.trim());
    frame = lines.find((l: string, i: number) => i > 0 && l.startsWith('at')) ?? '';
  }
  let props = '';
  try {
    const skip = new Set(['message', 'stack', 'cause']);
    const own = Object.getOwnPropertyNames(e).filter((k) => !skip.has(k));
    if (own.length) {
      const obj = Object.fromEntries(own.map((k) => [k, (e as any)[k]]));
      props = ' ' + JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 240);
    }
  } catch { /* some fields aren't serializable */ }
  let causeStr = '';
  const cause = (e as any).cause;
  if (cause != null && cause !== e && depth < 4) {
    const c = describeErr(cause, depth + 1);
    if (c && !msg.includes(c)) causeStr = ` ← ${c}`;
  }
  return `${name}: ${msg || '(empty message)'}${frame ? ` @ ${frame}` : ''}${props}${causeStr}`;
}

/**
 * Map raw failures to plain-English guidance the UI can show as-is. Falls back
 * to the de-wrapped technical string (prefixed) so nothing is ever a blank "Error".
 */
export function friendlyError(err: any): string {
  const raw = describeErr(err);
  const low = raw.toLowerCase();
  if (low.includes('reject') || low.includes('denied') || (err && err.code === 4001)) {
    return 'You dismissed the Lace popup. Click attest again and approve the request in the wallet.';
  }
  if (low.includes('lock')) {
    return 'Your Lace wallet is locked. Open the Lace extension, enter your password, then try again.';
  }
  if (low.includes('insufficient') || low.includes('dust') || low.includes('balance')) {
    return 'Not enough tNIGHT / DUST to pay the fee. Fund this wallet on Preprod, register NIGHT for DUST, then retry.';
  }
  if (low.includes('proof') && (low.includes('server') || low.includes('6300') || low.includes('fetch'))) {
    return `The local proof server isn't reachable. Start it, then retry:\n${PROOF_SERVER_DOCKER_CMD}`;
  }
  if (low.includes('failed to fetch') || low.includes('networkerror') || low.includes('econnrefused')) {
    return 'Network error reaching Midnight or the proof server. Check your connection and that the proof server is running.';
  }
  return raw;
}

/**
 * Newer (DUST-model) Lace no longer exposes the shielded keys on state(). It
 * does expose shielded ADDRESSES; decode one to recover coin + encryption keys.
 */
async function deriveShieldedKeys(api: any): Promise<{ coinPublicKey: string; encryptionPublicKey: string; debug: string }> {
  const { MidnightBech32m, ShieldedAddress } = (await import('@midnight-ntwrk/wallet-sdk-address-format')) as any;
  let addrs: any;
  if (typeof api.getShieldedAddresses === 'function') addrs = await api.getShieldedAddresses();
  else if (typeof api.getShieldedAddress === 'function') addrs = await api.getShieldedAddress();
  else throw new Error(`no getShieldedAddress(es) method (fns: ${fnNames(api)})`);

  const first = Array.isArray(addrs) ? addrs[0] : addrs;
  const addrStr = typeof first === 'string'
    ? first
    : first?.address ?? first?.value ?? first?.bech32 ?? first?.shieldedAddress ?? '';
  if (!addrStr) throw new Error(`empty shielded address (got ${describeShape(addrs)})`);

  const parsed = MidnightBech32m.parse(addrStr);
  const decoded = parsed.decode(ShieldedAddress, parsed.network);
  return {
    coinPublicKey: decoded.coinPublicKey.toHexString(),
    encryptionPublicKey: decoded.encryptionPublicKey.toHexString(),
    debug: `derived net=${String(parsed.network)}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Custodian write path — attest(now)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Submit a Proof-of-Reserves attestation.
 *
 * Builds the liability sum-tree from `balances`, binds the five private
 * witnesses (custodian secret, total assets, total liabilities, and the two top
 * children), generates the ZK proof locally, and submits through Lace. Only the
 * verdict + commitment root reach the chain — never a balance.
 */
export async function callAttest(params: AttestParams): Promise<AttestResult> {
  if (!CONTRACT_ADDRESS) {
    throw new Error('No contract deployed yet. Deploy to Preprod and set VITE_POR_CONTRACT_ADDRESS first.');
  }

  // ── 1. Validate inputs and build the tree (all local; nothing leaves yet). ──
  const balances = params.balances.map((b) => toBig(b));
  balances.forEach((b, i) => assertU64(`Balance #${i + 1}`, b));
  const totalAssets = toBig(params.totalAssets);
  assertU64('Total assets', totalAssets);

  const leaves = balances.map((b, i) => deterministicLeaf(i, b));
  const tree = buildSumTree(leaves);
  const totalLiabilities = tree.root.sum;
  assertU64('Total liabilities', totalLiabilities);

  // Refuse early if not solvent — the circuit would abort anyway, and this
  // avoids a pointless (slow) proof + a confusing on-chain rejection.
  if (totalAssets < totalLiabilities) {
    throw new Error(
      `Not solvent: total assets (${totalAssets}) are less than total customer liabilities (${totalLiabilities}). ` +
        `An honest attestation cannot be produced.`,
    );
  }

  const custodianSecret = await resolveCustodianSecret(params);

  // Default `now` = 5 minutes ago, in SECONDS. The circuit asserts
  // blockTimeGte(now) ("not in the future"); backdating absorbs clock skew.
  const nowSeconds = params.nowSeconds != null
    ? BigInt(params.nowSeconds)
    : BigInt(Math.floor(Date.now() / 1000) - 300);
  assertU64('Attestation time', nowSeconds);

  // ── 2. Make sure Lace is unlocked & authorized RIGHT NOW. ──
  const conn = await connectLace();
  let walletApiLive: any = conn.api;
  try {
    const connector: any = getConnector();
    if (typeof connector.connect === 'function') walletApiLive = (await connector.connect(ACTIVE_NETWORK)) ?? conn.api;
    else if (typeof connector.enable === 'function') walletApiLive = (await connector.enable(ACTIVE_NETWORK)) ?? conn.api;
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    if (e?.code === 4001 || msg.includes('reject') || msg.includes('denied') || msg.includes('closed')) {
      throw new Error('Unlock Lace and approve the request, then click attest again.');
    }
    // else fall through with the handed api; key resolution below reports precisely.
  }

  // ── 3. Load the heavy SDK only when an attestation actually happens. ──
  const { findDeployedContract } = await import('@midnight-ntwrk/midnight-js-contracts');
  const { CompiledContract } = await import('@midnight-ntwrk/compact-js');
  const { indexerPublicDataProvider } = await import('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
  const { httpClientProofProvider } = await import('@midnight-ntwrk/midnight-js-http-client-proof-provider');
  const { inMemoryPrivateStateProvider } = await import('./midnight/inMemoryPrivateStateProvider');
  const { FetchZkConfigProvider } = await import('./midnight/zkConfigProvider');
  const { Contract } = await import('../managed/contract/index.js');

  // ── 4. Providers: the browser twin of deploy/wallet.ts configureProviders. ──
  const zkConfigProvider = new FetchZkConfigProvider<string>(ZK_ASSETS_BASE_URL);
  const publicDataProvider = indexerPublicDataProvider(ENDPOINTS.indexer, ENDPOINTS.indexerWS);
  const proofProvider = httpClientProofProvider(ENDPOINTS.proofServer, zkConfigProvider);
  const privateStateProvider = inMemoryPrivateStateProvider();

  // ── 5. Resolve the shielded coin + encryption public keys. ──
  const { state: freshState, raw: rawState } = await readWalletState(walletApiLive);
  let coinPublicKey = freshState.coinPublicKey || conn.state.coinPublicKey || '';
  let encryptionPublicKey = freshState.encryptionPublicKey || conn.state.encryptionPublicKey || '';
  let keyDebug = 'from-state';
  if (!coinPublicKey || !encryptionPublicKey) {
    try {
      const derived = await deriveShieldedKeys(walletApiLive);
      coinPublicKey = coinPublicKey || derived.coinPublicKey;
      encryptionPublicKey = encryptionPublicKey || derived.encryptionPublicKey;
      keyDebug = derived.debug;
    } catch (e: any) {
      keyDebug = `derive-failed: ${e?.message ?? String(e)}`;
    }
  }
  if (!coinPublicKey || !encryptionPublicKey) {
    if (keyDebug.toLowerCase().includes('lock')) {
      throw new Error('Your Lace wallet is locked. Unlock it in the extension, then click attest again.');
    }
    throw new Error(`WALLET_DEBUG keys unresolved coin:${coinPublicKey.length} enc:${encryptionPublicKey.length} [${keyDebug}] shape=${describeShape(rawState)}`);
  }

  // ── 6. Adapt the Lace connector to the toolkit's provider interface. ──
  const laceApi = walletApiLive as any;
  let submittedTxId: string | null = null;
  let reached = 'start';
  const laceProvider = {
    getCoinPublicKey() { return coinPublicKey; },
    getEncryptionPublicKey() { return encryptionPublicKey; },
    async balanceTx(tx: any) {
      // Old Lace: one call balances + fee-proves the live tx.
      if (typeof laceApi.balanceAndProveTransaction === 'function') {
        return laceApi.balanceAndProveTransaction(tx);
      }
      // New (DUST) Lace: balance the UNSEALED proven tx. Must pass SERIALIZED
      // bytes across the extension boundary, and call EXACTLY ONCE (each call
      // pops an approval dialog; looping trips "user rejected").
      const method = 'balanceUnsealedTransaction';
      if (typeof laceApi[method] !== 'function') {
        throw new Error(`WALLET_DEBUG wallet has no ${method} (fns: ${fnNames(laceApi)})`);
      }
      if (typeof tx?.serialize !== 'function') {
        throw new Error(`WALLET_DEBUG cannot serialize tx (proto: [${protoNames(tx)}])`);
      }
      const bytes = tx.serialize();
      reached = 'balancing (wallet fee approval)';
      let balanced: any;
      try {
        balanced = await laceApi[method](bytes);
      } catch (e: any) {
        console.error('[ProofReserves] balanceUnsealedTransaction raw error:', e);
        throw new Error(`WALLET_DEBUG balanceUnsealedTransaction failed: ${describeErr(e)}`, { cause: e });
      }
      reached = 'balanced';
      return balanced?.tx ?? balanced;
    },
    async submitTx(tx: any) {
      const submit = typeof laceApi.submitTransaction === 'function'
        ? laceApi.submitTransaction.bind(laceApi)
        : typeof laceApi.submitTx === 'function'
          ? laceApi.submitTx.bind(laceApi)
          : null;
      if (!submit) throw new Error(`WALLET_DEBUG no submit method fns=[${fnNames(laceApi)}]`);
      reached = 'submitting (broadcast to node)';
      let txId: any;
      try {
        txId = await submit(tx);
      } catch (e: any) {
        throw new Error(`WALLET_DEBUG submitTransaction failed: ${describeErr(e)}`, { cause: e });
      }
      submittedTxId = typeof txId === 'string' ? txId : txId?.txId ?? txId?.txHash ?? (txId != null ? String(txId) : null);
      reached = 'broadcast';
      return txId;
    },
  };

  const providers = {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider: laceProvider,
    midnightProvider: laceProvider,
  };

  // ── 7. Bind the five private witnesses on the compiled contract. ──
  // PS = empty private state ({}); each witness returns [privateState, value].
  const emptyPS = {} as Record<string, never>;
  const witnesses = {
    custodianSecret(ctx: any): [typeof emptyPS, Uint8Array] { return [ctx.privateState, custodianSecret]; },
    totalAssets(ctx: any): [typeof emptyPS, bigint] { return [ctx.privateState, totalAssets]; },
    totalLiabilities(ctx: any): [typeof emptyPS, bigint] { return [ctx.privateState, totalLiabilities]; },
    topLeft(ctx: any): [typeof emptyPS, MerkleSumNode] { return [ctx.privateState, tree.topChildren.left]; },
    topRight(ctx: any): [typeof emptyPS, MerkleSumNode] { return [ctx.privateState, tree.topChildren.right]; },
  };

  const compiledContract = CompiledContract.make('proof-of-reserves', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(ZK_ASSETS_BASE_URL),
  );

  const deployed = await findDeployedContract(providers as any, {
    compiledContract,
    contractAddress: CONTRACT_ADDRESS,
    privateStateId: PRIVATE_STATE_ID,
    initialPrivateState: emptyPS,
  } as any);

  // Compute the epoch this attestation should land at (previous + 1), for display.
  let epoch = 1;
  try {
    const before = await readReserves();
    if (before) epoch = before.epoch + 1;
  } catch { /* read is best-effort; default epoch 1 */ }

  // ── 8. Prove locally and submit. Balances flow ONLY through the witnesses. ──
  reached = 'proving (proof server :6300)';
  const liabilitiesRootHex = toHex(tree.root.digest);
  try {
    await (deployed as any).callTx.attest(nowSeconds);
  } catch (err: any) {
    // A CallTxFailedError means the node INCLUDED the tx but the chain rejected
    // it (an assertion failed) — a real failure, never mask it.
    const rejectedOnChain = err?.name === 'CallTxFailedError' || err?.finalizedTxData != null;
    // Otherwise, once submitTx completed the tx WAS broadcast (the DUST wallet
    // resolves submit with no id). Anything thrown after that is the SDK's
    // post-broadcast confirmation watch, which the v3 indexer rejects with an
    // 'offset' error — harmless. Treat a broadcast tx as submitted; Verify reads
    // the authoritative value once the indexer catches up.
    const broadcast = submittedTxId != null || reached === 'broadcast';
    if (broadcast && !rejectedOnChain) {
      console.warn('[ProofReserves] post-broadcast watch failed — treating as submitted:', err);
      const txId = submittedTxId ?? 'submitted';
      return { txId, txUrl: explorerTxUrl(txId), liabilitiesRootHex, totalLiabilities: totalLiabilities.toString(), epoch };
    }
    console.error('[ProofReserves] attest failed:', err, '\n  cause:', err?.cause);
    if (rejectedOnChain) throw err;
    throw new Error(`WALLET_DEBUG attest failed at [${reached}]: ${describeErr(err)}` + (err?.cause ? ` | cause: ${describeErr(err.cause)}` : ''));
  }

  const txId = submittedTxId ?? 'submitted';
  return { txId, txUrl: explorerTxUrl(txId), liabilitiesRootHex, totalLiabilities: totalLiabilities.toString(), epoch };
}

// ─────────────────────────────────────────────────────────────────────────
// Public read path — the verdict (no wallet, no proof server)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Read the public attestation from the ledger. Returns null when nothing has
 * been published yet (or no contract is configured). Reads go through the
 * indexer only — no wallet, no proof server.
 */
export async function readReserves(): Promise<ReservesView | null> {
  if (!CONTRACT_ADDRESS) return null;

  const { indexerPublicDataProvider } = await import('@midnight-ntwrk/midnight-js-indexer-public-data-provider');
  const { ledger } = await import('../managed/contract/index.js');

  const publicDataProvider = indexerPublicDataProvider(ENDPOINTS.indexer, ENDPOINTS.indexerWS);
  const contractState = await publicDataProvider.queryContractState(CONTRACT_ADDRESS);
  if (!contractState) return null;

  const s = ledger(contractState.data);
  const attested = s.attestationEpoch > 0n;
  const lastTime = s.lastAttestationTime;
  return {
    attested,
    solvent: s.solvent,
    liabilitiesRootHex: toHex(s.liabilitiesRoot),
    epoch: Number(s.attestationEpoch),
    lastAttestationTime: lastTime.toString(),
    lastAttestationISO: attested && lastTime > 0n ? new Date(Number(lastTime) * 1000).toISOString() : null,
    custodianKeyHex: toHex(s.custodianKey),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Customer self-check — inclusion proofs
// ─────────────────────────────────────────────────────────────────────────

/**
 * Rebuild the SAME liability tree the custodian attested to (deterministic
 * leaves) and return one private inclusion proof per customer, keyed by list
 * position. Give each customer only THEIR entry; they verify it in their own
 * browser with verifyInclusion() against the on-chain root. The balances stay
 * on the custodian's machine — a proof reveals only that one customer's balance
 * (to that customer) and the sibling digests along their path.
 */
export function inclusionProofsFor(
  balances: Array<number | bigint | string>,
  asOfEpoch?: number,
): CustomerProof[] {
  const bigs = balances.map((b) => toBig(b));
  const leaves = bigs.map((b, i) => deterministicLeaf(i, b));
  const tree = buildSumTree(leaves);

  const out: CustomerProof[] = [];
  for (let i = 0; i < bigs.length; i++) {
    const proof = tree.proofs.get(i);
    const leaf = leaves[i];
    if (!proof) continue;
    out.push({
      index: i,
      balance: bigs[i].toString(),
      idHashHex: toHex(leaf.idHash),
      saltHex: toHex(leaf.salt),
      path: proof.siblings.map((sib, k) => ({
        digestHex: toHex(sib.digest),
        sum: sib.sum.toString(),
        goesLeft: proof.leftSiblings[k],
      })),
      asOfEpoch: asOfEpoch ?? null,
    });
  }
  return out;
}

/** Rebuild the InclusionProof shape our tree math uses from a JSON CustomerProof. */
function toInclusionProof(proof: CustomerProof): InclusionProof {
  const leaf: MerkleSumNode = {
    digest: leafDigest(fromHex(proof.idHashHex), fromHex(proof.saltHex)),
    sum: BigInt(proof.balance),
  };
  return {
    leaf,
    siblings: proof.path.map((p) => ({ digest: fromHex(p.digestHex), sum: BigInt(p.sum) })),
    leftSiblings: proof.path.map((p) => p.goesLeft),
  };
}

/** The root a customer proof recomputes to, as hex — for display / cross-check. */
export function recomputeRootHex(proof: CustomerProof): string {
  return toHex(rootFromProof(toInclusionProof(proof)).digest);
}

/**
 * Verify a customer's inclusion proof against the on-chain commitment root.
 * Returns true when the customer's balance is provably part of the total the
 * custodian attested to. Pure local computation — no network needed.
 */
export function verifyInclusion(proof: CustomerProof, onchainRootHex: string): boolean {
  return recomputeRootHex(proof) === onchainRootHex.trim().toLowerCase().replace(/^0x/, '');
}

// Surface wallet-detection debug for a diagnostics panel, if the UI wants it.
export { inspectInjection };
