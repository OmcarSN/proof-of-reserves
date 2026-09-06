#!/bin/bash
# Proof of Reserves — compile + test (run inside WSL)
export PATH="/home/omcar/.local/bin:$PATH"

cd /mnt/c/Users/Devyani/proof-of-reserves

# Compile the contract (managed/ is gitignored output)
compact compile contracts/proof-of-reserves.compact managed

# Run tests
npx vitest run 2>&1
