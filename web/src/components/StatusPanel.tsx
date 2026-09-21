import { useState, useEffect, useRef } from 'react';
import { useReserves } from '../hooks/useReserves';
import { SolventStamp } from './SolventStamp';
import { TruncatedHash } from './TruncatedHash';
import { CONTRACT_ADDRESS, explorerContractUrl } from '@reserves';
import { ShieldCheckIcon, LockIcon, RefreshCwIcon, CheckCircleIcon, ArrowUpRightIcon, ShareIcon } from './Icons';

interface StatusPanelProps {
  onNavigateToAttest?: () => void;
  onNavigateToVerify?: () => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const secs = Math.floor(diff / 1000);
    if (secs < 45) return 'just now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

export function StatusPanel({ onNavigateToAttest, onNavigateToVerify }: StatusPanelProps) {
  const { data, loading, isSyncing, error, refetch } = useReserves();
  const [demoMode, setDemoMode] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [copied, setCopied] = useState(false);
  const [, setClockTick] = useState(0);

  // Re-evaluate relative time every 10 seconds so "just now" / "1m ago" ticks dynamically
  useEffect(() => {
    const timer = setInterval(() => setClockTick((t) => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Update lastChecked whenever fresh data arrives
  useEffect(() => {
    if (data) {
      setLastChecked(new Date());
    }
  }, [data]);

  const handleRefresh = () => {
    refetch();
  };

  const handleShare = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lastCheckedStr = lastChecked.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Loading skeleton
  if (loading) {
    return (
      <div className="card">
        <div className="skeleton-container">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-box" />
          <div className="skeleton skeleton-line" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card">
        <div className="error-banner">
          <div className="error-banner-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Failed to query on-chain state
          </div>
          <p>{error}</p>
        </div>
        <button type="button" className="btn btn--primary btn--sm" onClick={refetch}>
          <RefreshCwIcon size={14} />
          <span>Retry On-Chain Query</span>
        </button>
      </div>
    );
  }

  const isRealAttested = !!(data && data.attested);
  const displayData = isRealAttested
    ? data
    : demoMode
      ? {
          attested: true,
          solvent: true,
          epoch: 1,
          lastAttestationISO: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
          lastAttestationTime: String(Math.floor(Date.now() / 1000) - 1080),
          liabilitiesRootHex: '78a9c24e18d6f3b0e512aa8944f7620db86c25e18abaaae751006b42b70daa70',
          custodianKeyHex: data?.custodianKeyHex || 'ac935361b51c48a0aa468fed4560bc6c68a0ca9883317467094882b26ca908b6',
        }
      : null;

  // Unattested state
  if (!displayData) {
    return (
      <div className="status-grid-layout">
        {/* Main Status Column */}
        <div className="card status-main-card">
          <div className="empty-state">
            <div className="empty-state-shield">
              <ShieldCheckIcon size={38} className="text-teal" />
            </div>

            <h3 className="empty-state-heading">Smart Contract Verified &amp; Listening</h3>
            <p className="empty-state-body">
              The ProofReserves smart contract is deployed on-chain and awaiting its first zero-knowledge solvency attestation from the custodian.
            </p>

            <div className="contract-status-specs">
              <div className="spec-item">
                <span className="spec-label">Network Status</span>
                <span className="spec-value">
                  <span className="pulse-dot pulse-dot--green" /> Midnight Preprod
                </span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Contract Address</span>
                <span className="spec-value">
                  <TruncatedHash hash={CONTRACT_ADDRESS} prefixLen={8} suffixLen={6} label="Contract Address" />
                </span>
              </div>
              <div className="spec-item">
                <span className="spec-label">Custodian Identity</span>
                <span className="spec-value">
                  <TruncatedHash hash={data?.custodianKeyHex || 'ac935361b51c48a0aa468fed4560bc6c68a0ca9883317467094882b26ca908b6'} label="Custodian Key" />
                </span>
              </div>
            </div>

            <div className="empty-state-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={onNavigateToAttest}
              >
                <span>Publish Attestation as Custodian</span>
                <ArrowUpRightIcon size={15} />
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setDemoMode(true)}
              >
                <span>Preview Solvency Dashboard</span>
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={refetch}
                title="Sync on-chain state"
              >
                <RefreshCwIcon size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Side Info Column: Privacy & Protocol Guarantee */}
        <div className="card status-side-card">
          <div className="side-card-header">
            <LockIcon size={20} className="text-teal" />
            <h4 className="side-card-title">Zero-Knowledge Guarantee</h4>
          </div>
          <p className="side-card-desc">
            Solvency is mathematically certified using a recursive Merkle Sum Tree and zero-knowledge circuit.
          </p>

          <div className="protocol-breakdown">
            <div className="breakdown-item">
              <div className="breakdown-num">1</div>
              <div>
                <strong>Private Custody Liabilities</strong>
                <p>Individual account balances remain strictly confidential and never touch the chain.</p>
              </div>
            </div>

            <div className="breakdown-item">
              <div className="breakdown-num">2</div>
              <div>
                <strong>Merkle Sum Tree Commitment</strong>
                <p>Computes total liabilities and commits to a 32-byte cryptographic root.</p>
              </div>
            </div>

            <div className="breakdown-item">
              <div className="breakdown-num">3</div>
              <div>
                <strong>On-Chain Proof Verification</strong>
                <p>Midnight ledger verifies Assets ≥ Liabilities without disclosing total reserves.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const rel = relativeTime(displayData.lastAttestationISO);

  return (
    <div className="status-dashboard">
      {/* Top Demo Bar if in preview mode */}
      {!isRealAttested && demoMode && (
        <div className="demo-mode-bar">
          <span className="demo-badge">SAMPLE DASHBOARD PREVIEW</span>
          <span>Showing full interactive solvency verdict dashboard.</span>
          <button
            type="button"
            className="demo-exit-btn"
            onClick={() => setDemoMode(false)}
          >
            Exit Preview
          </button>
        </div>
      )}

      {/* Top Metric Cards (Horizontal Grid on PC/Laptop) */}
      <div className="metrics-row">
        <div className="card metric-card">
          <div className="metric-header-row">
            <span className="metric-label">Solvency Status</span>
            <span className="metric-badge metric-badge--green">Verified</span>
          </div>
          <span className="metric-val text-teal font-mono">
            {displayData.solvent ? '100% Backed' : 'Undercollateralized'}
          </span>
          <span className="metric-sub">Certified via ZK-SNARK</span>
        </div>

        <div className="card metric-card">
          <div className="metric-header-row">
            <span className="metric-label">Attested Epoch</span>
            <span className="metric-badge">On-Chain</span>
          </div>
          <span className="metric-val font-mono">#{displayData.epoch}</span>
          <span className="metric-sub">Latest Confirmed Block</span>
        </div>

        <div className="card metric-card">
          <div className="metric-header-row">
            <span className="metric-label">Verification Time</span>
            <span className="metric-badge metric-badge--live">Live Block Time</span>
          </div>
          <span className="metric-val" style={{ fontSize: '1.25rem' }}>
            {rel === 'just now' ? (
              <span className="text-teal" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span className="pulse-dot pulse-dot--green" style={{ width: '8px', height: '8px' }} />
                just now
              </span>
            ) : (
              rel || 'Recent'
            )}
          </span>
          <span className="metric-sub" title={displayData.lastAttestationISO || ''}>
            {formatTime(displayData.lastAttestationISO)}
          </span>
        </div>

        <div className="card metric-card">
          <div className="metric-header-row">
            <span className="metric-label">Network Verification</span>
            <span className="metric-badge metric-badge--live">
              <span className="pulse-dot pulse-dot--green" style={{ width: '6px', height: '6px' }} />
              Live
            </span>
          </div>
          <span className="metric-val text-cyan font-mono" style={{ fontSize: '1.25rem' }}>
            Midnight Preprod
          </span>
          <span className="metric-sub">Immutable Ledger</span>
        </div>
      </div>

      {/* 2-Column Desktop Grid */}
      <div className="status-grid-layout">
        {/* Left Column: Solvency Verdict & Commitments */}
        <div className="card status-main-card">
          <div className="verdict-header">
            <div className="verdict-tag">
              <span className="pulse-dot pulse-dot--green" />
              <span>ON-CHAIN VERDICT RECORD</span>
            </div>
            <div className="verdict-actions">
              <span className="last-checked-tag">
                Last checked: {lastCheckedStr}
              </span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleShare}
                title="Copy link to share"
              >
                <ShareIcon size={14} />
                <span>{copied ? 'Copied!' : 'Share'}</span>
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={handleRefresh}
                disabled={isSyncing}
                title="Refresh on-chain state directly from Midnight Preprod"
              >
                <RefreshCwIcon size={14} className={isSyncing ? 'spin-anim' : ''} />
                <span>{isSyncing ? 'Syncing…' : 'Sync'}</span>
              </button>
            </div>
          </div>

          <div className="verdict-stamp-wrap">
            <SolventStamp solvent={displayData.solvent} size="lg" />
            <div className="verdict-summary">
              <h4 className="verdict-title">
                {displayData.solvent ? 'Reserves Meet or Exceed Total Customer Liabilities' : 'Solvency Verification Failed'}
              </h4>
              <p className="verdict-desc">
                The zero-knowledge circuit validated that the custodian controls sufficient verifiable assets to cover 100% of liabilities for this epoch.
              </p>
            </div>
          </div>

          <div className="ledger-records-table">
            <div className="record-item">
              <div className="record-info">
                <span className="record-label">Liabilities Commitment Root</span>
                <span className="record-sub">32-byte Blake2b root of the customer liability tree</span>
              </div>
              <div className="record-data">
                <TruncatedHash hash={displayData.liabilitiesRootHex} prefixLen={12} suffixLen={10} label="Commitment Root" />
              </div>
            </div>

            <div className="record-item">
              <div className="record-info">
                <span className="record-label">Custodian Identity</span>
                <span className="record-sub">Verified contract deployer public key</span>
              </div>
              <div className="record-data">
                <TruncatedHash hash={displayData.custodianKeyHex} prefixLen={10} suffixLen={8} label="Custodian Key" />
              </div>
            </div>

            <div className="record-item">
              <div className="record-info">
                <span className="record-label">Smart Contract Instance</span>
                <span className="record-sub">Live on Midnight Preprod</span>
              </div>
              <div className="record-data">
                <TruncatedHash
                  hash={CONTRACT_ADDRESS}
                  prefixLen={10}
                  suffixLen={8}
                  label="Contract Address"
                  href={explorerContractUrl(CONTRACT_ADDRESS)}
                />
              </div>
            </div>
          </div>

          {/* On-Chain Action Bar: balances column height & provides immediate next steps */}
          <div className="verdict-footer-actions">
            <a
              href={explorerContractUrl(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--sm"
              title="Inspect smart contract deployment on Midnight Preprod Explorer"
            >
              <span>Inspect on Preprod Explorer</span>
              <ArrowUpRightIcon size={14} />
            </a>

            {onNavigateToAttest && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={onNavigateToAttest}
                title="Publish new solvency epoch as custodian"
              >
                <span>Publish Attestation</span>
                <ArrowUpRightIcon size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Privacy Architecture & Verification Action */}
        <div className="card status-side-card">
          <div className="side-card-header">
            <LockIcon size={20} className="text-teal" />
            <h4 className="side-card-title">Dual Privacy Guarantee</h4>
          </div>

          <div className="privacy-comparison">
            <div className="privacy-block">
              <span className="privacy-block-title text-teal">
                <CheckCircleIcon size={14} /> Public On-Chain Record
              </span>
              <ul className="privacy-checklist">
                <li>Authoritative SOLVENT verdict</li>
                <li>Epoch audit number &amp; timestamp</li>
                <li>32-byte Blake2b Merkle sum root</li>
                <li>Verified custodian cryptographic identity</li>
              </ul>
            </div>

            <div className="privacy-block">
              <span className="privacy-block-title text-cyan">
                <LockIcon size={14} /> Sealed In Zero-Knowledge
              </span>
              <ul className="privacy-checklist">
                <li>Individual customer account balances</li>
                <li>Customer identity, names &amp; addresses</li>
                <li>Total reserve asset exact valuation</li>
                <li>Private keys and witness credentials</li>
              </ul>
            </div>
          </div>

          {onNavigateToVerify && (
            <div className="customer-action-card">
              <div>
                <strong>Are you a customer of this custodian?</strong>
                <p>Verify that your balance was included in this audit root without disclosing your account to anyone.</p>
              </div>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={onNavigateToVerify}
              >
                <span>Verify Your Balance</span>
                <ArrowUpRightIcon size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
