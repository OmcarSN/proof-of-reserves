import { useState, useMemo, useCallback } from 'react';
import {
  callAttest,
  connectWallet,
  isProofServerUp,
  inclusionProofsFor,
  friendlyError,
  type AttestResult,
  type WalletInfo,
} from '@reserves';
import { ProofServerBanner } from './ProofServerBanner';
import { SolventStamp } from './SolventStamp';
import { SealedRow } from './SealedRow';
import { TruncatedHash } from './TruncatedHash';
import { CopyButton } from './CopyButton';

type Phase = 'idle' | 'preflight' | 'connecting' | 'proving' | 'success' | 'error';

interface AttestPanelProps {
  wallet: WalletInfo | null;
  onConnect: () => Promise<WalletInfo>;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function AttestPanel({ wallet, onConnect, addToast }: AttestPanelProps) {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [custodianSecretHex, setCustodianSecretHex] = useState('');
  const [showSecretHex, setShowSecretHex] = useState(false);
  const [showAdvancedSecret, setShowAdvancedSecret] = useState(false);
  const [totalAssets, setTotalAssets] = useState('');
  const [balanceInputs, setBalanceInputs] = useState<string[]>(['']);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const [phase, setPhase] = useState<Phase>('idle');
  const [proofServerUp, setProofServerUp] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<AttestResult | null>(null);

  // Parse balances
  const balances = useMemo(() => {
    if (pasteMode) {
      return pasteText
        .split(/[\n,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s));
    }
    return balanceInputs.filter((s) => /^\d+$/.test(s.trim()));
  }, [pasteMode, pasteText, balanceInputs]);

  const totalLiabilities = useMemo(
    () => balances.reduce((sum, b) => sum + BigInt(b), 0n),
    [balances],
  );

  const totalAssetsNum = useMemo(() => {
    const s = totalAssets.trim();
    return /^\d+$/.test(s) ? BigInt(s) : null;
  }, [totalAssets]);

  const isSolvent =
    totalAssetsNum !== null && balances.length > 0 && totalAssetsNum >= totalLiabilities;

  const cleanHex = custodianSecretHex.trim();
  const hasSecretHex = cleanHex.length > 0;
  const isHexValid = /^[0-9a-fA-F]{64}$/.test(cleanHex);
  const hasAuth = hasSecretHex ? isHexValid : passphrase.length > 0;

  const canSubmit =
    hasAuth &&
    totalAssetsNum !== null &&
    balances.length > 0 &&
    isSolvent &&
    phase === 'idle';

  // Balance row management
  const addRow = () => setBalanceInputs((prev) => [...prev, '']);
  const removeRow = (i: number) =>
    setBalanceInputs((prev) => prev.filter((_, idx) => idx !== i));
  const updateRow = (i: number, val: string) =>
    setBalanceInputs((prev) => prev.map((v, idx) => (idx === i ? val : v)));

  const handleSubmit = useCallback(async () => {
    setErrorMsg('');

    // Preflight: proof server check
    setPhase('preflight');
    let up = false;
    try {
      up = await isProofServerUp();
    } catch {
      up = false;
    }
    setProofServerUp(up);
    if (!up) {
      setPhase('idle');
      return;
    }

    // Connect wallet if needed. Surface any failure (locked wallet, closed
    // popup, rejected request) instead of silently resetting the button.
    setPhase('connecting');
    try {
      if (!wallet) {
        await onConnect();
      }
    } catch (err) {
      setErrorMsg(friendlyError(err));
      setPhase('error');
      return;
    }

    // Prove
    setPhase('proving');
    try {
      const attestParams = hasSecretHex
        ? {
            custodianSecretHex: cleanHex,
            balances,
            totalAssets: totalAssets.trim(),
          }
        : {
            passphrase,
            balances,
            totalAssets: totalAssets.trim(),
          };

      const res = await callAttest(attestParams);
      setResult(res);
      setPhase('success');
      addToast('Attestation submitted successfully', 'success');
    } catch (err) {
      setErrorMsg(friendlyError(err));
      setPhase('error');
    }
  }, [hasSecretHex, cleanHex, passphrase, balances, totalAssets, wallet, onConnect, addToast]);

  const downloadProofs = useCallback(() => {
    if (!result) return;
    try {
      const proofs = inclusionProofsFor(
        balances.map((b) => b),
        result.epoch,
      );
      const blob = new Blob([JSON.stringify(proofs, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customer-proofs-epoch-${result.epoch}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('Customer proofs downloaded', 'success');
    } catch (err) {
      addToast(friendlyError(err), 'error');
    }
  }, [result, balances, addToast]);

  const reset = () => {
    setPhase('idle');
    setResult(null);
    setErrorMsg('');
  };

  // ── Proving overlay ──
  if (phase === 'proving') {
    return (
      <div className="card">
        <div className="proving-overlay">
          <div className="proving-spinner" />
          <h2 className="proving-title">Generating zero-knowledge proof…</h2>
          <p className="proving-subtitle">
            This can take up to a minute. The proof is generated locally on
            your machine — your balances never leave this browser.
          </p>
          <div className="proving-reassurance">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Balances are private — sealed in the ZK circuit
          </div>
        </div>
      </div>
    );
  }

  // ── Success panel ──
  if (phase === 'success' && result) {
    return (
      <div className="card success-panel">
        <SolventStamp solvent size="lg" />

        <div className="success-details card" style={{ marginTop: '24px' }}>
          <h3 className="section-title">Attestation details</h3>
          <div className="data-row">
            <span className="data-label">Epoch</span>
            <span className="data-value"><code className="mono">{result.epoch}</code></span>
          </div>
          <div className="data-row">
            <span className="data-label">Transaction</span>
            <span className="data-value">
              <TruncatedHash
                hash={result.txId}
                href={result.txUrl}
                label="transaction ID"
              />
            </span>
          </div>
          <div className="data-row">
            <span className="data-label">Commitment root</span>
            <span className="data-value">
              <TruncatedHash hash={result.liabilitiesRootHex} label="root" />
            </span>
          </div>
        </div>

        <div className="sealed-section">
          <div className="sealed-section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{balances.length} customer balances — sealed</span>
          </div>
          {balances.slice(0, 8).map((_, i) => (
            <SealedRow key={i} index={i} />
          ))}
          {balances.length > 8 && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 'var(--sp-2)', textAlign: 'center' }}>
              + {balances.length - 8} more
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-6)', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--primary" onClick={downloadProofs}>
            Download customer proofs
          </button>
          <button type="button" className="btn btn--ghost" onClick={reset}>
            New attestation
          </button>
        </div>
      </div>
    );
  }

  // ── Error state ──
  // (falls through to form, with error banner shown above)

  return (
    <div>
      {/* Proof server banner */}
      {proofServerUp === false && (
        <ProofServerBanner
          onStatusChange={(up) => {
            setProofServerUp(up);
            if (up) addToast('Proof server is reachable', 'success');
          }}
        />
      )}

      {/* Error banner */}
      {phase === 'error' && errorMsg && (
        <div className="error-banner">
          <div className="error-banner-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Attestation failed
          </div>
          <p>{errorMsg}</p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 'var(--sp-3)' }}
            onClick={reset}
          >
            Try again
          </button>
        </div>
      )}

      <div className="card">
        {/* Passphrase */}
        <div className="field">
          <label className="field-label" htmlFor="passphrase">
            Custodian passphrase
          </label>
          <div className="input-row">
            <input
              id="passphrase"
              className="input"
              type={showPassphrase ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter your secret passphrase"
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowPassphrase(!showPassphrase)}
              aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
            >
              {showPassphrase ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="field-hint">
            The passphrase that was used when the contract was deployed. It never leaves your browser.
          </p>

          {/* Advanced toggle */}
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              style={{
                fontSize: 'var(--text-xs)',
                padding: 'var(--sp-1) var(--sp-2)',
                minHeight: '28px',
                border: 'none',
                color: 'var(--color-accent)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--sp-1)',
              }}
              onClick={() => setShowAdvancedSecret((prev) => !prev)}
              aria-expanded={showAdvancedSecret}
            >
              <span style={{ fontSize: '10px' }}>{showAdvancedSecret ? '▼' : '▶'}</span>
              <span>Advanced: paste 64-hex secret</span>
            </button>
          </div>

          {/* Advanced 64-hex secret input */}
          {showAdvancedSecret && (
            <div
              style={{
                marginTop: 'var(--sp-3)',
                padding: 'var(--sp-3)',
                background: 'var(--color-surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <label
                className="field-label"
                htmlFor="custodian-secret-hex"
                style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--sp-1)' }}
              >
                Raw custodian secret (64 hex characters)
              </label>
              <div className="input-row">
                <input
                  id="custodian-secret-hex"
                  className="input input--mono"
                  type={showSecretHex ? 'text' : 'password'}
                  value={custodianSecretHex}
                  onChange={(e) => setCustodianSecretHex(e.target.value.trim())}
                  placeholder="e.g. 0123456789abcdef... (64 hex chars)"
                  autoComplete="off"
                  spellCheck={false}
                  style={{ fontSize: 'var(--text-xs)' }}
                />
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setShowSecretHex((prev) => !prev)}
                  aria-label={showSecretHex ? 'Hide secret' : 'Show secret'}
                  style={{ minHeight: '38px' }}
                >
                  {showSecretHex ? 'Hide' : 'Show'}
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 'var(--sp-1)',
                  fontSize: 'var(--text-xs)',
                  flexWrap: 'wrap',
                  gap: 'var(--sp-1)',
                }}
              >
                <span className="field-hint" style={{ margin: 0 }}>
                  Used for deployed contracts with random secrets. When set, this overrides the passphrase.
                </span>
                {custodianSecretHex.length > 0 && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: isHexValid
                        ? 'var(--color-accent)'
                        : 'var(--color-warning)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {custodianSecretHex.length}/64 hex {isHexValid ? '✓' : ''}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Total assets */}
        <div className="field">
          <label className="field-label" htmlFor="total-assets">
            Total assets (reserves)
          </label>
          <input
            id="total-assets"
            className="input input--mono"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={totalAssets}
            onChange={(e) => setTotalAssets(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 10000"
          />
          <p className="field-hint">
            Your total on-hand assets. Must be ≥ the sum of all customer balances.
          </p>
        </div>

        {/* Customer balances */}
        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-2)' }}>
            <label className="field-label" style={{ marginBottom: 0 }}>
              Customer balances
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setPasteMode(!pasteMode);
                if (!pasteMode && balanceInputs.length > 0) {
                  setPasteText(balanceInputs.filter((s) => s.trim()).join('\n'));
                }
              }}
            >
              {pasteMode ? 'Row editor' : 'Paste list'}
            </button>
          </div>

          {pasteMode ? (
            <>
              <textarea
                className="input input--mono"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"100\n200\n300\n400"}
                rows={6}
              />
              <p className="field-hint">
                One balance per line (or comma / space separated).
              </p>
            </>
          ) : (
            <>
              <div className="balances-list">
                {balanceInputs.map((val, i) => (
                  <div key={i} className="balance-entry">
                    <span className="balance-index">#{i + 1}</span>
                    <input
                      className="input input--mono"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={val}
                      onChange={(e) =>
                        updateRow(i, e.target.value.replace(/[^0-9]/g, ''))
                      }
                      placeholder="Balance"
                      aria-label={`Customer ${i + 1} balance`}
                    />
                    {balanceInputs.length > 1 && (
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => removeRow(i)}
                        aria-label={`Remove customer ${i + 1}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ marginTop: 'var(--sp-3)' }}
                onClick={addRow}
              >
                + Add customer
              </button>
            </>
          )}
        </div>

        {/* Summary bar */}
        {balances.length > 0 && (
          <div className="summary-bar">
            <div className="summary-item">
              <span className="summary-label">Customers</span>
              <span className="summary-value">{balances.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total liabilities</span>
              <span className="summary-value">{totalLiabilities.toString()}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Status</span>
              <span
                className={`summary-value ${
                  totalAssetsNum === null
                    ? ''
                    : isSolvent
                      ? 'summary-value--ok'
                      : 'summary-value--err'
                }`}
              >
                {totalAssetsNum === null
                  ? '—'
                  : isSolvent
                    ? '✓ Solvent'
                    : '✗ Insolvent'}
              </span>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          type="button"
          className="btn btn--primary"
          style={{ marginTop: 'var(--sp-6)', width: '100%' }}
          onClick={handleSubmit}
          disabled={!canSubmit}
          title={
            !hasAuth
              ? hasSecretHex && !isHexValid
                ? 'Custodian secret must be exactly 64 hex characters'
                : 'Enter the custodian passphrase or 64-hex secret'
              : totalAssetsNum === null
                ? 'Enter your total assets'
                : balances.length === 0
                  ? 'Add at least one customer balance'
                  : !isSolvent
                    ? 'Total assets must be ≥ total liabilities'
                    : undefined
          }
        >
          {phase === 'preflight'
            ? 'Checking proof server…'
            : phase === 'connecting'
              ? 'Connecting wallet — approve in Lace…'
              : 'Publish attestation'}
        </button>

        {!canSubmit && phase === 'idle' && (
          <p className="field-hint" style={{ textAlign: 'center', marginTop: 'var(--sp-2)' }}>
            {!hasAuth
              ? hasSecretHex && !isHexValid
                ? 'Custodian secret must be exactly 64 hexadecimal characters'
                : 'Enter the custodian passphrase or 64-hex secret to continue'
              : totalAssetsNum === null
                ? 'Enter your total assets amount'
                : balances.length === 0
                  ? 'Add at least one customer balance'
                  : !isSolvent
                    ? 'Total assets must be ≥ total liabilities to attest solvency'
                    : ''}
          </p>
        )}
      </div>
    </div>
  );
}
