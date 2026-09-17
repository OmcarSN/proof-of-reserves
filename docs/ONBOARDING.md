# ProofReserves Preprod Onboarding Guide

## What is ProofReserves?
ProofReserves is a zero-knowledge proof-of-reserves protocol built on the Midnight blockchain. It ensures that a custodian's assets are greater than or equal to their liabilities without revealing any individual user balances. Customers can cryptographically verify their inclusion in the reserve using a JSON proof blob, while a public verdict confirms the custodian's solvency.

## Prerequisites
- **Lace Wallet**: The official wallet for the Midnight network.
- **Browser**: Chrome or Brave (required for the Lace extension).

## Step-by-Step Guide

### 1. Install the Lace Wallet
Download and install the Lace Wallet extension for your browser from the official website: [https://www.lace.io/](https://www.lace.io/). Follow the setup instructions to create a new wallet or restore an existing one.

### 2. Switch to Preprod Network
Open your Lace Wallet. Go to **Settings > Network** and select **Preprod**. This ensures you are interacting with the Midnight Preprod testnet.

### 3. Get Test tDUST
To interact with some features, you may need test tokens (tDUST). You can acquire these from the Midnight faucet (if available). Note: tDUST is not required for read-only actions like verifying your proof.

### 4. Visit the Live App
Navigate to the live ProofReserves application: [https://proof-of-reserves-delta.vercel.app](https://proof-of-reserves-delta.vercel.app).

### 5. Connect Your Wallet
Click the **Connect Lace** button in the top right corner of the application. Approve the connection request in your Lace Wallet popup.

### 6. Explore the Dashboard
The app features three main screens:
- **Status**: View the public verdict of the custodian's solvency (assets >= liabilities).
- **Attest**: (For Custodians) Publish the proof of reserves to the network.
- **Verify My Proof**: (For Customers) Upload your JSON proof blob to cryptographically verify that your balance is included in the Merkle Sum Tree committed on-chain.

### 7. Submit Feedback
We value your input! After testing the app, please share your thoughts using our feedback form: [YOUR_GOOGLE_FORM_LINK]

## Troubleshooting FAQ

- **Wallet not connecting?**
  Ensure you are using Chrome or Brave and have the Lace extension enabled. Refresh the page and try clicking "Connect Lace" again.
- **Preprod network not showing?**
  Double-check your Lace Wallet settings under **Settings > Network**. You may need to enable developer mode or testnets depending on the wallet version.
- **Verification failing?**
  Ensure you are uploading the exact, unmodified JSON proof blob provided to you.

## Links
- Live App: [https://proof-of-reserves-delta.vercel.app](https://proof-of-reserves-delta.vercel.app)
- GitHub: [https://github.com/OmcarSN/proof-of-reserves](https://github.com/OmcarSN/proof-of-reserves)
- Lace Wallet: [https://www.lace.io/](https://www.lace.io/)
- Contract Address: `a44f44b9af01020db86c25e18abaaae751006b42b70daa70e990e7a69c94c765`
