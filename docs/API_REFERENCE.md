# API Reference

## Overview
This document outlines the public API for the ProofReserves application. All functions should be imported from `src/reserves.ts`.

This module serves as the single safe door to blockchain interaction. All return types are strictly JSON-safe; internal blockchain types like `bigint` or byte arrays are properly converted and do not leak into the UI layer.

## Wallet Functions

### `connectWallet()`
Prompts the user to connect their Lace wallet.
- **Returns**: `Promise<WalletInfo>`

### `disconnectWallet()`
Disconnects the currently connected wallet.
- **Returns**: `void`

### `isWalletAvailable()`
Checks if the Lace wallet extension is installed and available.
- **Returns**: `boolean`

### WalletInfo Interface
```typescript
interface WalletInfo {
  address: string;
  network: string;
  balance: number;
}
```

## Read Functions (No wallet needed)

### `readReserves()`
Reads the current public state of the reserves contract from the blockchain.
- **Returns**: `Promise<ReservesView | null>`. Returns `null` if no attestation has been made yet (epoch 0).

### ReservesView Interface
```typescript
interface ReservesView {
  isSolvent: boolean;
  epoch: number;
  commitmentRootHex: string;
  lastUpdatedTimestamp: number;
}
```

## Write Functions (Requires wallet)

### `callAttest(params: AttestParams)`
Generates a zero-knowledge proof of solvency and submits it to the blockchain. 
**Note**: Proof generation can take 10-60 seconds depending on the system.
- **Returns**: `Promise<AttestResult>`

### AttestParams Interface
```typescript
interface AttestParams {
  // Use custodianSecretHex for the deployed contract
  custodianSecretHex?: string;
  passphrase?: string;
  
  balances: Array<{
    customerId: string;
    amount: number;
  }>;
  totalAssets: number;
}
```

### AttestResult Interface
```typescript
interface AttestResult {
  txId: string;
  epoch: number;
  customerProofs: CustomerProof[];
}
```

## Customer Verification

### `inclusionProofsFor(balances: any[], epoch?: number)`
Generates inclusion proofs for a list of balances based on a specific epoch.
- **Returns**: `CustomerProof[]`

### `verifyInclusion(proof: CustomerProof, rootHex: string)`
Cryptographically verifies an individual customer proof against a public commitment root.
- **Returns**: `boolean` (true if mathematically verified included)

### `recomputeRootHex(proof: CustomerProof)`
Helper function to recompute the expected root hash from a specific customer proof.
- **Returns**: `string`

### CustomerProof Interface
```typescript
interface CustomerProof {
  customerId: string;
  balance: number;
  leafSalt: string;
  merklePath: string[];
  epoch: number;
}
```

## Utilities

- `NETWORK_LABEL`: String constant indicating the current network (e.g., "Midnight Preprod").
- `CONTRACT_ADDRESS`: String constant containing the deployed contract address.
- `PROOF_SERVER_DOCKER_CMD`: String constant providing the exact Docker command to start the local proof server.
- `isProofServerUp(timeoutMs?: number) -> Promise<boolean>`: Checks if the local zero-knowledge proof server is running and accessible.
- `explorerTxUrl(txId: string) -> string | null`: Generates a URL to view a specific transaction on the Midnight explorer.
- `friendlyError(err: any) -> string`: Safely unwraps deeply nested blockchain/wallet errors into a human-readable string.
- `inspectInjection() -> object`: Returns debug information about the injected wallet API.

## Error Handling

Always wrap `callAttest` and other blockchain interactions in `try/catch` blocks. The Midnight network and Lace wallet can throw complex errors. 

Use the `friendlyError()` utility to convert raw exceptions into user-friendly messages suitable for UI display.

### Common Error Scenarios
- **Wallet Not Connected**: Thrown when write functions are called before `connectWallet()`.
- **Proof Server Unreachable**: Thrown during `callAttest` if the Docker proof server is not running or accessible on port 6300.
- **Invalid Custodian Secret**: Thrown if the provided secret does not match the one used to deploy the contract.
- **Insufficient Funds**: Thrown by the wallet if it lacks tDUST to cover transaction fees.
