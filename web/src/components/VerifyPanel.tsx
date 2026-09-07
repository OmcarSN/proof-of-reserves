import { useState, useCallback } from 'react';
import {
  readReserves,
  verifyInclusion,
  recomputeRootHex,
  friendlyError,
  type CustomerProof,
} from '@reserves';

type VerifyState =
  | { phase: 'idle' }
  | { phase: 'verifying' }
  | {
      phase: 'done';
      valid: boolean;
      proof: CustomerProof;
      onchainRoot: string;
      computedRoot: string;
      noAttestation: boolean;
    }
  | { phase: 'error'; message: string };

export function VerifyPanel() {
  const [jsonText, setJsonText] = useState('');
  const [state, setState] = useState<VerifyState>({ phase: 'idle' });

  const handleVerify = useCallback(async () => {
    // Parse the JSON
    let proof: CustomerProof;
    try {
      const parsed = JSON.parse(jsonText.trim());
      // Support both a single proof and an array (take first)
      proof = Array.isArray(parsed) ? parsed[0] : parsed;
      if (
        proof.index === undefined ||
        proof.balance === undefined ||
        !proof.idHashHex ||
        !proof.saltHex ||
        !Array.isArray(proof.path)
      ) {
        throw new Error('missing required fields');
      }
    } catch {
      setState({
        phase: 'error',
        message:
          'Invalid JSON format. Paste the CustomerProof JSON your custodian gave you. It should contain fields like "index", "balance", "idHashHex", "saltHex", and "path".',
      });
      return;
    }

    setState({ phase: 'verifying' });

    try {
      const view = await readReserves();
      if (!view || !view.attested) {
        setState({
          phase: 'done',
          valid: false,
          proof,
          onchainRoot: '',
          computedRoot: recomputeRootHex(proof),
          noAttestation: true,
        });
        return;
      }

      const computedRoot = recomputeRootHex(proof);
      const valid = verifyInclusion(proof, view.liabilitiesRootHex);

      setState({
        phase: 'done',
        valid,
        proof,
        onchainRoot: view.liabilitiesRootHex,
        computedRoot,
        noAttestation: false,
      });
    } catch (err) {
      setState({ phase: 'error', message: friendlyError(err) });
    }
  }, [jsonText]);

  const reset = () => {
    setState({ phase: 'idle' });
    setJsonText('');
  };

  return (
    <div>
      <div className="card">
        <h3 className="section-title">Verify your inclusion</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-4)' }}>
          Paste the proof JSON your custodian gave you. This verifies that
          your balance was included in the attested total — entirely in your
          browser, no data sent anywhere.
        </p>

        <div className="field">
          <label className="field-label" htmlFor="proof-json">
            Customer proof (JSON)
          </label>
          <textarea
            id="proof-json"
            className="input input--mono"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={'{\n  "index": 0,\n  "balance": "100",\n  "idHashHex": "...",\n  "saltHex": "...",\n  "path": [...]\n}'}
            rows={8}
            spellCheck={false}
          />
        </div>

        <button
          type="button"
          className="btn btn--primary"
          onClick={handleVerify}
          disabled={!jsonText.trim() || state.phase === 'verifying'}
          style={{ width: '100%' }}
        >
          {state.phase === 'verifying' ? 'Verifying…' : 'Verify my balance'}
        </button>
      </div>

      {/* Error */}
      {state.phase === 'error' && (
        <div className="error-banner" style={{ marginTop: 'var(--sp-4)' }}>
          <div className="error-banner-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Verification error
          </div>
          <p>{state.message}</p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 'var(--sp-3)' }}
            onClick={() => setState({ phase: 'idle' })}
          >
            Try again
          </button>
        </div>
      )}

      {/* Result */}
      {state.phase === 'done' && (
        <div
          className={`verify-result ${state.valid ? 'verify-result--ok' : 'verify-result--fail'}`}
        >
          <div className="verify-result-header">
            <span className="verify-result-icon" aria-hidden="true">
              {state.valid ? '✓' : '✗'}
            </span>
            <div>
              <h3 className="verify-result-title">
                {state.noAttestation
                  ? 'No attestation to verify against'
                  : state.valid
                    ? 'Included — your balance is part of the attested total'
                    : 'Not verified for the current attestation'}
              </h3>
            </div>
          </div>

          {state.noAttestation ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--sp-2)' }}>
              There is no attestation on-chain yet. Ask your custodian to
              publish a solvency proof, then try again.
            </p>
          ) : (
            <>
              {/* Proof details */}
              <div style={{ marginTop: 'var(--sp-3)' }}>
                <div className="data-row">
                  <span className="data-label">Your balance</span>
                  <span className="data-value">
                    <code className="mono">{state.proof.balance}</code>
                  </span>
                </div>
                <div className="data-row">
                  <span className="data-label">Customer index</span>
                  <span className="data-value">
                    <code className="mono">#{state.proof.index}</code>
                  </span>
                </div>
                {state.proof.asOfEpoch !== null && (
                  <div className="data-row">
                    <span className="data-label">Proof epoch</span>
                    <span className="data-value">
                      <code className="mono">{state.proof.asOfEpoch}</code>
                    </span>
                  </div>
                )}
              </div>

              {/* Root comparison */}
              <div className="root-compare">
                <div className="root-compare-row">
                  <span className="root-compare-label">Your proof recomputes to</span>
                  <code
                    className={`root-compare-value ${
                      state.valid ? 'root-compare-match' : 'root-compare-mismatch'
                    }`}
                  >
                    {state.computedRoot}
                  </code>
                </div>
                <div className="root-compare-row">
                  <span className="root-compare-label">On-chain commitment root</span>
                  <code
                    className={`root-compare-value ${
                      state.valid ? 'root-compare-match' : 'root-compare-mismatch'
                    }`}
                  >
                    {state.onchainRoot}
                  </code>
                </div>
              </div>

              {state.valid && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--sp-3)' }}>
                  Both roots match — your balance of <strong>{state.proof.balance}</strong> is
                  cryptographically proven to be part of the custodian's attested
                  liability total.
                </p>
              )}

              {!state.valid && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginTop: 'var(--sp-3)' }}>
                  The roots don't match. This proof may be from a different attestation
                  epoch, or the data may have been modified. Ask your custodian for
                  an updated proof matching the current epoch.
                </p>
              )}
            </>
          )}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 'var(--sp-4)' }}
            onClick={reset}
          >
            Verify another proof
          </button>
        </div>
      )}
    </div>
  );
}
