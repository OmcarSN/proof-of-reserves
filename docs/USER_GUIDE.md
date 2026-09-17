# ProofReserves User Guide

## Introduction
ProofReserves is a zero-knowledge proof-of-reserves protocol built on the Midnight blockchain. It allows cryptocurrency exchanges and custodians to cryptographically prove their solvency without revealing sensitive information like total asset amounts, individual customer balances, or the number of users.

Zero-knowledge matters for proof of reserves because it solves the inherent conflict between financial transparency and privacy. Traditional proof of reserves often requires exposing sensitive corporate or user data. With zero-knowledge proofs, solvency is verified mathematically without compromising privacy.

Access the live application at: https://proof-of-reserves-delta.vercel.app

## For the Public — Reading the Solvency Status
The Status screen provides a public, verifiable view of the custodian's solvency status.

### What you see
- **Verdict**: A large indicator showing whether the custodian is SOLVENT. "SOLVENT" means the cryptographically verified proof confirms that total assets are greater than or equal to total liabilities.
- **Epoch**: The current epoch number, indicating how many times the custodian has attested to their reserves.
- **Commitment Root Hash**: A cryptographic commitment (Merkle root) to all customer balances. This hash is stored securely on the Midnight blockchain.

### Why no balances are visible
This is the privacy guarantee of the zero-knowledge circuit. The system mathematically proves that liabilities don't exceed assets without revealing the actual numbers to the public. 

### How to verify this is real
You can verify the state independently by checking the contract address (`a44f44b9af01020db86c25e18abaaae751006b42b70daa70e990e7a69c94c765`) on the Midnight Preprod explorer.

## For Customers — Verifying Your Inclusion
If you hold funds with the custodian, you can cryptographically verify that your specific balance was included in the total liabilities calculation.

### What is an inclusion proof?
An inclusion proof is a small piece of data (in JSON format) that links your individual balance to the public Commitment Root Hash using a Merkle tree structure.

### How to verify
1. **Get your proof**: Obtain your specific proof JSON from your custodian.
2. **Verify**: Navigate to the "Verify My Proof" screen on the app.
3. **Paste**: Paste your JSON proof into the input area.
4. **Click Verify**: The app will compute the root from your proof and compare it to the on-chain root.

### Understanding the result
- **MATHEMATICALLY VERIFIED INCLUDED**: Your balance was undeniably included in the total liabilities used to prove solvency.
- **Verification fails**: If verification fails, it means your balance was omitted or altered, or the proof provided by the custodian is invalid. Contact your custodian immediately.

### Sample proof format
```json
{
  "customerId": "user123",
  "balance": 5000,
  "leafSalt": "a1b2c3d4...",
  "merklePath": [...],
  "epoch": 1
}
```

## For Custodians — Publishing an Attestation
Custodians use the Attest screen to publish zero-knowledge proofs of their reserves to the blockchain.

### Prerequisites
- **Lace wallet**: Configured for Midnight Preprod with some tDUST.
- **Proof Server**: Running locally to generate zero-knowledge proofs.
- **Custodian Secret**: The 64-hex secret key used to deploy the contract.

### Starting the proof server
Run the following Docker command to start the Midnight proof server:
```bash
docker run -d -p 6300:6300 midnightntwrk/proof-server:8.1.0
```

### Step-by-step attestation flow
1. Connect your Lace wallet.
2. Ensure the local proof server is running.
3. Enter your Custodian Secret. **Important**: The deployed contract uses a raw 64-hex secret, not a passphrase.
4. Enter your Total Assets (the on-chain or verifiable assets you hold).
5. Add customer balances. You can enter them manually, paste CSV data, or import a CSV file.
6. Check the **Solvency Ratio Gauge** to ensure assets >= liabilities.
7. Click **Attest**.

### During proof generation
The proof generation process involves complex cryptography and typically takes between 10 to 60 seconds. Do not close the window during this time.

### After attestation
Once the transaction is confirmed on-chain, download the generated customer proofs. You must distribute these specific JSON proofs to your respective customers so they can verify their inclusion.

## FAQ

### Is my data safe?
Yes. All balances and sensitive data remain in your browser. The zero-knowledge proof generated locally is the only thing sent to the blockchain.

### What blockchain is this on?
ProofReserves is deployed on the Midnight Preprod network.

### Do I need cryptocurrency?
- **Public / Customers**: No. Viewing the status or verifying a proof requires no wallet or cryptocurrency.
- **Custodians**: Yes. You need a Lace wallet with tDUST (test token) to pay for transaction fees when publishing an attestation.

### What is tDUST?
tDUST is the testnet token used on the Midnight Preprod network for transaction fees.

### Can the custodian cheat?
The protocol uses a Merkle sum tree. The zero-knowledge circuit mathematically ensures that:
1. No negative balances are included.
2. The sum of all individual balances equals the total liabilities.
3. Total assets are greater than or equal to total liabilities.

If a custodian attempts to omit a customer to reduce liabilities, that customer will be unable to verify their inclusion, exposing the fraud.
