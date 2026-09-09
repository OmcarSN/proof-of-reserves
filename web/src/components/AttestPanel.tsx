import { useState, useMemo, useCallback } from 'react';
import {
  callAttest,
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
import { LockIcon, ShieldCheckIcon, DownloadIcon, EyeIcon, EyeOffIcon, ArrowRightIcon } from './Icons';

type Phase = 'idle' | 'preflight' | 'connecting' | 'proving' | 'success' | 'error';

interface AttestPanelProps {
  wallet: WalletInfo | null;
  onConnect: () => Promise<WalletInfo>;
  addToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onNavigateToStatus?: () => void;
}

export function AttestPanel({ wallet, onConnect, addToast, onNavigateToStatus }: AttestPanelProps) {
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [custodianSecretHex, setCustodianSecretHex] = useState('');
  const [showSecretHex, setShowSecretHex] = useState(false);
  const [showAdvancedSecret, setShowAdvancedSecret] = useState(false);
  const [totalAssets, setTotalAssets] = useState('');
  const [balanceInputs, setBalanceInputs] = useState<string[]>(['1250', '2400', '1850', '3100']);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showSealedPreview, setShowSealedPreview] = useState(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [proofServerUp, setProofServerUp] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<AttestResult | null>(null);
  const [provingStep, setProvingStep] = useState(1);

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

  const solvencyRatio = useMemo(() => {
    if (totalAssetsNum === null || totalLiabilities === 0n) return null;
    const ratio = (Number(totalAssetsNum) / Number(totalLiabilities)) * 100;
    return Math.round(ratio * 10) / 10;
  }, [totalAssetsNum, totalLiabilities]);

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

  // Preset loader for testing
  const handleLoadDemoPreset = () => {
    setCustodianSecretHex('64ffa62c870fcf6c98cfcf1ecc024747de2c7721aca89861111af6aa042183ad');
    setShowAdvancedSecret(true);
    setTotalAssets('10000');
    setBalanceInputs(['1250', '2400', '1850', '3100']);
    setPasteMode(false);
    addToast('Sample portfolio loaded (Assets = 10,000, Liabilities = 8,600)', 'info');
  };

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

    // Connect wallet if needed
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
    setProvingStep(1);

    const stepTimer1 = setTimeout(() => setProvingStep(2), 2500);
    const stepTimer2 = setTimeout(() => setProvingStep(3), 6000);

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
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setProvingStep(4);
      setResult(res);
      setPhase('success');
      addToast('Attestation published successfully to the Midnight ledger!', 'success');
    } catch (err) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
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
      addToast('Customer inclusion proofs exported', 'success');
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
      <div className="card proving-card">
        <div className="proving-overlay">
          <div className="proving-spinner-container">
            <div className="proving-spinner" />
            <div className="proving-spinner-center">
              <ShieldCheckIcon size={24} className="text-teal" />
            </div>
          </div>

          <h2 className="proving-title">Generating Zero-Knowledge Solvency Proof</h2>
          <p className="proving-subtitle">
            The ZK circuit is certifying that custody assets exceed total liabilities locally on your machine.
          </p>

          <div className="proving-stepper">
            <div className={`proving-stepper-item ${provingStep >= 1 ? 'is-active' : ''}`}>
              <span className="stepper-bullet">{provingStep > 1 ? '✓' : '1'}</span>
              <span className="stepper-text">Constructing Merkle Sum Tree</span>
            </div>
            <div className={`proving-stepper-item ${provingStep >= 2 ? 'is-active' : ''}`}>
              <span className="stepper-bullet">{provingStep > 2 ? '✓' : '2'}</span>
              <span className="stepper-text">Assembling Private Witness Credentials</span>
            </div>
            <div className={`proving-stepper-item ${provingStep >= 3 ? 'is-active' : ''}`}>
              <span className="stepper-bullet">{provingStep > 3 ? '✓' : '3'}</span>
              <span className="stepper-text">Executing ZK-SNARK Prover Circuit (:6300)</span>
            </div>
            <div className={`proving-stepper-item ${provingStep >= 4 ? 'is-active' : ''}`}>
              <span className="stepper-bullet">4</span>
              <span className="stepper-text">Broadcasting to Midnight Preprod Ledger</span>
            </div>
          </div>

          <div className="proving-reassurance">
            <LockIcon size={14} />
            <span>100% Client-Side Privacy — Raw customer balances never leave this browser</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Success panel ──
  if (phase === 'success' && result) {
    return (
      <div className="card success-panel">
        <div className="success-header-row">
          <div>
            <h3 className="success-heading">Attestation Published on Midnight Preprod</h3>
            <p className="success-sub">The on-chain proof has been verified and permanently committed to the ledger.</p>
          </div>
          <SolventStamp solvent size="lg" />
        </div>

        <div className="success-grid">
          <div className="success-details-card">
            <h4 className="card-section-title">On-Chain Attestation Details</h4>
            <div className="data-row">
              <span className="data-label">Attested Epoch</span>
              <span className="data-value font-mono text-teal">#{result.epoch}</span>
            </div>
            <div className="data-row">
              <span className="data-label">Transaction Hash</span>
              <span className="data-value">
                <TruncatedHash hash={result.txId} href={result.txUrl} label="transaction ID" />
              </span>
            </div>
            <div className="data-row">
              <span className="data-label">Commitment Root Hash</span>
              <span className="data-value">
                <TruncatedHash hash={result.liabilitiesRootHex} prefixLen={12} suffixLen={10} label="commitment root" />
              </span>
            </div>
          </div>

          <div className="sealed-section">
            <div className="sealed-section-header">
              <div className="sealed-header-left">
                <LockIcon size={16} className="text-teal" />
                <span>{balances.length} Customer Accounts Sealed Cryptographically</span>
              </div>
              <span className="sealed-badge">Confidential</span>
            </div>

            <div className="sealed-rows-container">
              {balances.slice(0, 5).map((_, i) => (
                <SealedRow key={i} index={i} />
              ))}
              {balances.length > 5 && (
                <div className="sealed-more-tag">
                  + {balances.length - 5} additional customer liabilities sealed in tree
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="success-actions-row">
          <button type="button" className="btn btn--primary" onClick={downloadProofs}>
            <DownloadIcon size={16} />
            <span>Download Customer Proofs (JSON)</span>
          </button>
          {onNavigateToStatus && (
            <button type="button" className="btn btn--ghost" onClick={onNavigateToStatus}>
              <span>View On-Chain Ledger ➔</span>
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={reset}>
            New Attestation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="attest-layout">
      {/* Proof server warning banner if down */}
      {proofServerUp === false && (
        <ProofServerBanner
          onStatusChange={(up) => {
            setProofServerUp(up);
            if (up) addToast('Proof server is now online!', 'success');
          }}
        />
      )}

      {/* Error banner */}
      {phase === 'error' && errorMsg && (
        <div className="error-banner">
          <div className="error-banner-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Attestation Failed
          </div>
          <p>{errorMsg}</p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 'var(--sp-3)' }}
            onClick={reset}
          >
            Try Again
          </button>
        </div>
      )}

      {/* 2-Column Desktop Grid for Custodian Controls */}
      <div className="attest-columns-grid">
        {/* Left Column: Custodian Authentication & Vault Assets */}
        <div className="card attest-left-card">
          <div className="panel-header-row">
            <div>
              <h3 className="panel-title">Custodian Parameters</h3>
              <p className="panel-subtitle">Authorize reserve attestation with your deployment credentials.</p>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={handleLoadDemoPreset}
              title="Pre-populate sample balances and deployed secret"
            >
              Fill Sample Portfolio
            </button>
          </div>

          {/* Passphrase Input */}
          <div className="field">
            <label className="field-label" htmlFor="passphrase">
              Custodian Passphrase
            </label>
            <div className="input-row">
              <input
                id="passphrase"
                className="input"
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter secret passphrase"
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShowPassphrase(!showPassphrase)}
                aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPassphrase ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>

            {/* Advanced toggle */}
            <div style={{ marginTop: 'var(--sp-2)' }}>
              <button
                type="button"
                className="advanced-toggle-btn"
                onClick={() => setShowAdvancedSecret((prev) => !prev)}
                aria-expanded={showAdvancedSecret}
              >
                <span className="toggle-arrow">{showAdvancedSecret ? '▼' : '▶'}</span>
                <span>Advanced: Paste 64-hex custodian secret</span>
              </button>
            </div>

            {/* Advanced 64-hex secret input */}
            {showAdvancedSecret && (
              <div className="advanced-box">
                <div className="field-label-row">
                  <label className="field-label" htmlFor="custodian-secret-hex" style={{ fontSize: 'var(--text-xs)' }}>
                    Raw 64-Hex Secret (Overrides Passphrase)
                  </label>
                  <span className="field-tag font-mono">{custodianSecretHex.length}/64 hex</span>
                </div>
                <div className="input-row">
                  <input
                    id="custodian-secret-hex"
                    className="input input--mono"
                    type={showSecretHex ? 'text' : 'password'}
                    value={custodianSecretHex}
                    onChange={(e) => setCustodianSecretHex(e.target.value.trim())}
                    placeholder="64-character hexadecimal key"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ fontSize: 'var(--text-xs)' }}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setShowSecretHex((prev) => !prev)}
                    aria-label={showSecretHex ? 'Hide secret' : 'Show secret'}
                  >
                    {showSecretHex ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
                {custodianSecretHex.length > 0 && (
                  <span className={`hex-status ${isHexValid ? 'hex-status--valid' : 'hex-status--invalid'}`} style={{ marginTop: 4, display: 'block' }}>
                    {isHexValid ? '✓ Valid 64-hex secret' : `Need 64 hex (${custodianSecretHex.length}/64)`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Total Assets Input */}
          <div className="field">
            <label className="field-label" htmlFor="total-assets">
              Total Custody Reserves (On-Hand Assets)
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
              Total verifiable assets in custody. Must be &ge; the sum of all customer liabilities.
            </p>
          </div>

          {/* Live Solvency Ratio Gauge */}
          {balances.length > 0 && (
            <div className="solvency-gauge-card">
              <div className="gauge-metrics-row">
                <div className="gauge-item">
                  <span className="gauge-label">Total Assets</span>
                  <span className="gauge-val font-mono">{totalAssetsNum !== null ? totalAssetsNum.toString() : '—'}</span>
                </div>
                <div className="gauge-item">
                  <span className="gauge-label">Total Liabilities</span>
                  <span className="gauge-val font-mono">{totalLiabilities.toString()}</span>
                </div>
                <div className="gauge-item">
                  <span className="gauge-label">Solvency Ratio</span>
                  <span className={`gauge-val font-mono ${isSolvent ? 'text-teal' : 'text-error'}`}>
                    {solvencyRatio !== null ? `${solvencyRatio}%` : '—'}
                  </span>
                </div>
                <div className="gauge-item">
                  <span className="gauge-label">Verdict</span>
                  <span className={`verdict-pill ${isSolvent ? 'verdict-pill--ok' : 'verdict-pill--err'}`}>
                    {totalAssetsNum === null ? 'Enter Assets' : isSolvent ? '✓ SOLVENT' : '✗ INSOLVENT'}
                  </span>
                </div>
              </div>

              {totalAssetsNum !== null && (
                <div className="solvency-bar-container">
                  <div
                    className={`solvency-bar-fill ${isSolvent ? 'solvency-bar-fill--solvent' : 'solvency-bar-fill--insolvent'}`}
                    style={{
                      width: `${Math.min(100, (Number(totalLiabilities) / Math.max(1, Number(totalAssetsNum))) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Publish Attestation Button */}
          <button
            type="button"
            className="btn btn--primary submit-attest-btn"
            onClick={handleSubmit}
            disabled={!canSubmit}
            title={
              !hasAuth
                ? hasSecretHex && !isHexValid
                  ? 'Custodian secret must be exactly 64 hex characters'
                  : 'Enter custodian credentials'
                : totalAssetsNum === null
                  ? 'Enter total assets'
                  : balances.length === 0
                    ? 'Add at least one customer balance'
                    : !isSolvent
                      ? 'Assets must be >= liabilities'
                      : undefined
            }
          >
            <ShieldCheckIcon size={18} />
            <span>
              {phase === 'preflight'
                ? 'Checking Proof Server…'
                : phase === 'connecting'
                  ? 'Authorizing Wallet…'
                  : 'Publish Solvency Attestation'}
            </span>
          </button>

          {!canSubmit && phase === 'idle' && (
            <p className="field-hint submit-hint">
              {!hasAuth
                ? hasSecretHex && !isHexValid
                  ? 'Custodian secret must be exactly 64 hexadecimal characters'
                  : 'Enter the custodian passphrase or 64-hex secret to continue'
                : totalAssetsNum === null
                  ? 'Enter your total assets amount'
                  : balances.length === 0
                    ? 'Add customer account liabilities on the right'
                    : !isSolvent
                      ? 'Total assets must be ≥ total liabilities to attest solvency'
                      : ''}
            </p>
          )}
        </div>

        {/* Right Column: Customer Account Liabilities Editor */}
        <div className="card attest-right-card">
          <div className="balances-header-row">
            <div>
              <h3 className="panel-title">Customer Liabilities</h3>
              <p className="panel-subtitle">Committed to the Merkle Sum Tree ({balances.length} accounts)</p>
            </div>

            <div className="balances-toggle-group">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShowSealedPreview(!showSealedPreview)}
                title="Toggle privacy preview of rows"
              >
                {showSealedPreview ? <EyeIcon size={14} /> : <LockIcon size={14} />}
                <span>{showSealedPreview ? 'Show Values' : 'Privacy View'}</span>
              </button>
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
                {pasteMode ? 'Row Editor' : 'Paste CSV'}
              </button>
            </div>
          </div>

          {pasteMode ? (
            <div style={{ marginTop: 'var(--sp-2)' }}>
              <textarea
                className="input input--mono"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"1250\n2400\n1850\n3100"}
                rows={10}
              />
              <p className="field-hint">
                Enter one balance per line (or comma/space separated values).
              </p>
            </div>
          ) : (
            <div className="balances-editor-wrap">
              {showSealedPreview ? (
                <div className="sealed-preview-box">
                  <div className="sealed-preview-notice">
                    <LockIcon size={14} className="text-teal" />
                    <span>How customer balances appear once committed to the tree:</span>
                  </div>
                  {balances.slice(0, 8).map((_, i) => (
                    <SealedRow key={i} index={i} />
                  ))}
                  {balances.length > 8 && (
                    <span className="sealed-more-tag">+ {balances.length - 8} more accounts</span>
                  )}
                </div>
              ) : (
                <>
                  <div className="balances-list-scrollable">
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
                          placeholder="Account balance"
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
                    className="btn btn--ghost btn--sm add-row-btn"
                    onClick={addRow}
                  >
                    + Add Customer Account
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
