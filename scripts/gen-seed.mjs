// Generates a fresh 64-character hex secret (wallet seed or custodian secret).
import { randomBytes } from 'node:crypto';
console.log(randomBytes(32).toString('hex'));
