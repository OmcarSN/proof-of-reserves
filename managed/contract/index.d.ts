import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type MerkleSumNode = { digest: Uint8Array; sum: bigint };

export type Witnesses<PS> = {
  custodianSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  totalAssets(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  totalLiabilities(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  topLeft(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, MerkleSumNode];
  topRight(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, MerkleSumNode];
}

export type ImpureCircuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, now_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, now_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, now_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly solvent: boolean;
  readonly liabilitiesRoot: Uint8Array;
  readonly attestationEpoch: bigint;
  readonly lastAttestationTime: bigint;
  readonly custodianKey: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
