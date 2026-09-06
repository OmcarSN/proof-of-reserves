// ═══════════════════════════════════════════════════════════════════════
// Proof of Reserves — Deploy the compiled Compact contract to Preprod / Preview
//
// Usage:
//   npm run deploy:preprod        (or)   npm run deploy:preview
//
// Reads the wallet seed and custodian secret from .env.<network>, builds and
// funds the wallet, then deploys contracts/proof-of-reserves.compact using the
// compiled artifacts in managed/. Prints and saves the resulting contract
// address + the on-chain custodianKey.
//
// SECRETS: the seed and custodian secret are read from a gitignored .env file.
// Neither value is ever printed or committed.
// ═══════════════════════════════════════════════════════════════════════
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { CompiledContract } from '@midnight-ntwrk/compact-js';

// Compiled Proof of Reserves contract (managed/contract/index.js).
import { Contract } from '../managed/contract/index.js';
import { ownerKey } from '../src/utils/merkleSumTree.js';

import { configForNetwork, contractConfig } from './config.js';
import { addressForSeed, buildWalletAndWaitForFunds, configureProviders } from './wallet.js';
import { describeError } from './errors.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

// ─── Private state + witnesses ─────────────────────────────────────────
// The contract's witnesses are private by design. At deploy time only
// custodianSecret() is consumed (the constructor binds custodianKey to its
// hash); the other four witnesses are required by the runtime to exist but
// are never consulted by the constructor.
const PRIVATE_STATE_ID = 'proofOfReservesPrivateState';

type PorPrivateState = Record<string, never>;

function parseHexSecret(name: string, raw: string | undefined): Uint8Array {
  if (!raw || !/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    throw new Error(
      `Missing or invalid ${name} in .env.<network>. Expected a 64-character hex value. ` +
        `Generate one with: npm run gen:seed`,
    );
  }
  const clean = raw.trim();
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function main(): Promise<void> {
  const network = (process.argv[2] ?? 'preprod').toLowerCase();

  // Load .env.<network> before reading any PROOF_OF_RESERVES_* variables.
  loadEnv({ path: path.resolve(currentDir, '..', `.env.${network}`) });

  const seed = process.env.PROOF_OF_RESERVES_SEED;
  if (!seed || !/^[0-9a-fA-F]{64}$/.test(seed.trim())) {
    throw new Error(
      `Missing or invalid PROOF_OF_RESERVES_SEED in .env.${network}. ` +
        `Expected a 64-character hex seed. Generate one with: npm run gen:seed`,
    );
  }
  const seedHex = seed.trim();

  const custodianSecret = parseHexSecret(
    'PROOF_OF_RESERVES_CUSTODIAN_SECRET',
    process.env.PROOF_OF_RESERVES_CUSTODIAN_SECRET,
  );
  // The on-chain identity: a hash of the secret. Only the hash is public.
  const custodianKeyHex = Array.from(ownerKey(custodianSecret), (b) => b.toString(16).padStart(2, '0')).join('');

  const witnesses = {
    custodianSecret(context: any): [PorPrivateState, Uint8Array] {
      return [context.privateState, custodianSecret];
    },
    totalAssets(context: any): [PorPrivateState, bigint] {
      return [context.privateState, 0n];
    },
    totalLiabilities(context: any): [PorPrivateState, bigint] {
      return [context.privateState, 0n];
    },
    topLeft(context: any): [PorPrivateState, { digest: Uint8Array; sum: bigint }] {
      return [context.privateState, { digest: new Uint8Array(32), sum: 0n }];
    },
    topRight(context: any): [PorPrivateState, { digest: Uint8Array; sum: bigint }] {
      return [context.privateState, { digest: new Uint8Array(32), sum: 0n }];
    },
  };

  const config = configForNetwork(network);

  console.log(`\n▶ Deploying Proof of Reserves to "${network}"`);
  console.log(`  Wallet address (funding): ${addressForSeed(seedHex)}`);
  console.log(`  custodianKey (on-chain identity): 0x${custodianKeyHex}\n`);

  // 1. Build wallet, print funding address, wait for tNight + DUST.
  let walletCtx;
  try {
    walletCtx = await buildWalletAndWaitForFunds(config, seedHex);
  } catch (err) {
    console.error('\n✗ Wallet build/sync failed — full detail:\n');
    console.error(describeError(err));
    throw err;
  }

  // 2. Configure midnight-js providers (proof server, indexer, zk config, private state).
  const providers = await configureProviders(walletCtx, config);

  // 3. Compile-bind the contract: attach witnesses + on-disk ZK assets (managed/).
  const compiled = CompiledContract.make('proof-of-reserves', Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
  );

  // 4. Deploy — the constructor takes no arguments.
  const MAX_DEPLOY_ATTEMPTS = 30;
  const RETRY_WAIT_MS = 2 * 60 * 1000; // 2 minutes between retries

  for (let attempt = 1; attempt <= MAX_DEPLOY_ATTEMPTS; attempt++) {
    try {
      console.log(`\n  [Attempt ${attempt}/${MAX_DEPLOY_ATTEMPTS}] Deploying contract (generating proof)…`);
      const deployed = await deployContract(providers, {
        compiledContract: compiled,
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {} as PorPrivateState,
        args: [],
      });

      const address = deployed.deployTxData.public.contractAddress;

      const DIV = '══════════════════════════════════════════════════════════════';
      console.log(`
${DIV}
  ✅ Contract deployed successfully!
${DIV}
  Network:          ${network}
  Contract address: ${address}
  custodianKey:     0x${custodianKeyHex}
${DIV}
`);

      // 5. Persist the address for the README / badge / later reference.
      const outFile = path.resolve(currentDir, '..', `deployment.${network}.json`);
      writeFileSync(
        outFile,
        JSON.stringify({ network, contractAddress: address, custodianKey: custodianKeyHex }, null, 2) + '\n',
      );
      console.log(`  Saved deployment info to ${path.basename(outFile)}\n`);

      await walletCtx.wallet.close?.();
      process.exit(0);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.includes('InsufficientFunds') || msg.includes('could not balance dust')) {
        console.log(`\n  ⚠ Dust not yet available (wallet still syncing). Waiting 2 min before retry…`);
        if (attempt < MAX_DEPLOY_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
          continue;
        }
      }
      console.error('\n✗ Deploy failed:\n');
      console.error(describeError(err));
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('\n✗ Deploy failed:\n');
  console.error(describeError(err));
  process.exit(1);
});
