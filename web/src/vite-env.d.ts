/// <reference types="vite/client" />

// The @reserves alias is resolved by Vite at build time (see vite.config.ts).
// This ambient declaration satisfies tsc without pulling in the upstream
// source tree (which has Node-only types that conflict with our DOM libs).
declare module '@reserves' {
  // ── Wallet ──
  export interface WalletInfo {
    address: string;
    coinPublicKey: string;
    walletName: string;
    networkLabel: string;
  }
  export function connectWallet(): Promise<WalletInfo>;
  export function disconnectWallet(): void;
  export function isWalletAvailable(): boolean;

  // ── Attest ──
  export interface AttestParams {
    passphrase?: string;
    custodianSecretHex?: string;
    balances: Array<number | bigint | string>;
    totalAssets: number | bigint | string;
    nowSeconds?: number | bigint;
  }
  export interface AttestResult {
    txId: string;
    txUrl: string | null;
    liabilitiesRootHex: string;
    totalLiabilities: string;
    epoch: number;
  }
  export function callAttest(params: AttestParams): Promise<AttestResult>;

  // ── Read ──
  export interface ReservesView {
    attested: boolean;
    solvent: boolean;
    liabilitiesRootHex: string;
    epoch: number;
    lastAttestationTime: string;
    lastAttestationISO: string | null;
    custodianKeyHex: string;
  }
  export function readReserves(): Promise<ReservesView | null>;

  // ── Customer proofs ──
  export interface CustomerProof {
    index: number;
    balance: string;
    idHashHex: string;
    saltHex: string;
    path: Array<{ digestHex: string; sum: string; goesLeft: boolean }>;
    asOfEpoch: number | null;
  }
  export function inclusionProofsFor(
    balances: Array<number | bigint | string>,
    asOfEpoch?: number,
  ): CustomerProof[];
  export function verifyInclusion(proof: CustomerProof, onchainRootHex: string): boolean;
  export function recomputeRootHex(proof: CustomerProof): string;

  // ── Utilities ──
  export function isProofServerUp(timeoutMs?: number): Promise<boolean>;
  export function friendlyError(err: any): string;
  export function explorerTxUrl(txId: string): string | null;
  export function custodianSecretHexFromPassphrase(passphrase: string): Promise<string>;
  export function custodianKeyHexFromPassphrase(passphrase: string): Promise<string>;
  export function inspectInjection(): { hasMidnight: boolean; keys: string[]; chosenKey: string | null };

  export const NETWORK_LABEL: string;
  export const CONTRACT_ADDRESS: string;
  export const PROOF_SERVER_DOCKER_CMD: string;
}
