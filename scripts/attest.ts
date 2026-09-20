import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { Contract } from '../managed/contract/index.js';
import { buildSumTree, deterministicLeaf, fromHex, toHex } from '../src/utils/merkleSumTree.js';
import { configForNetwork } from '../deploy/config.js';
import { buildWalletAndWaitForFunds, configureProviders } from '../deploy/wallet.js';
import { CONTRACT_ADDRESS } from '../src/config/network.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const network = 'preprod';
  loadEnv({ path: path.resolve(currentDir, '..', `.env.${network}`) });

  const seed = process.env.PROOF_OF_RESERVES_SEED;
  const secretHex = process.env.PROOF_OF_RESERVES_CUSTODIAN_SECRET;
  if (!seed || !secretHex) {
    throw new Error('Missing SEED or CUSTODIAN_SECRET in .env.preprod');
  }

  const custodianSecret = fromHex(secretHex.trim());
  const balances = [1250n, 2400n, 1850n, 3100n];
  const totalAssets = 10000n;
  const totalLiabilities = balances.reduce((a, b) => a + b, 0n);

  const leaves = balances.map((b, i) => deterministicLeaf(i, b));
  const tree = buildSumTree(leaves);

  console.log('Building wallet and syncing on Preprod...');
  const config = configForNetwork(network);
  const ctx = await buildWalletAndWaitForFunds(config, seed.trim());
  const providers = await configureProviders(ctx, config);

  console.log('Configuring contract witnesses...');
  const emptyPS = {};
  const witnesses = {
    custodianSecret: (c: any) => [c.privateState, custodianSecret],
    totalAssets: (c: any) => [c.privateState, totalAssets],
    totalLiabilities: (c: any) => [c.privateState, totalLiabilities],
    topLeft: (c: any) => [c.privateState, tree.topChildren.left],
    topRight: (c: any) => [c.privateState, tree.topChildren.right],
  };

  const compiled = CompiledContract.make('proof-of-reserves', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
  );

  console.log(`Connecting to deployed contract: ${CONTRACT_ADDRESS}...`);
  const deployed = await findDeployedContract(providers, {
    contractAddress: CONTRACT_ADDRESS,
    compiledContract: compiled,
    privateStateId: 'proofOfReservesPrivateState',
    initialPrivateState: emptyPS,
  });

  const nowSeconds = BigInt(Math.floor(Date.now() / 1000) - 300);
  console.log(`Calling attest(${nowSeconds}) via proof-server and submitting...`);
  const tx = await (deployed as any).callTx.attest(nowSeconds);
  console.log('✓ ATTESTATION SUCCESSFUL ON MIDNIGHT PREPROD!');
  console.log('Tx details:', tx);
}

main().catch((err) => {
  console.error('Attestation failed:', err);
  process.exit(1);
});
