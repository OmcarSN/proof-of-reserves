import { useReserves } from '../hooks/useReserves';
import { SolventStamp } from './SolventStamp';
import { TruncatedHash } from './TruncatedHash';
import { CONTRACT_ADDRESS } from '@reserves';

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
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

export function StatusPanel() {
  const { data, loading, error, refetch } = useReserves();

  // Loading skeleton
  if (loading) {
    return (
      <div className="card">
        <div style={{ padding: 'var(--sp-8) 0', textAlign: 'center' }}>
          <div className="skeleton skeleton-line" style={{ width: '180px', height: '48px', margin: '0 auto var(--sp-6)' }} />
          <div className="skeleton skeleton-line skeleton-line--short" style={{ margin: '0 auto var(--sp-3)' }} />
          <div className="skeleton skeleton-line skeleton-line--long" style={{ margin: '0 auto var(--sp-3)' }} />
          <div className="skeleton skeleton-line skeleton-line--short" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="card">
        <div className="error-banner">
          <div className="error-banner-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            Failed to read on-chain state
          </div>
          <p>{error}</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={refetch}>
          Retry
        </button>
      </div>
    );
  }

  // No attestation yet
  if (!data || !data.attested) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">◇</div>
          <h3>No attestation published yet</h3>
          <p>
            Once the custodian publishes a solvency proof, the public verdict
            will appear here. No wallet or account needed to view it.
          </p>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 'var(--sp-4)' }}
            onClick={refetch}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  // Attested — show the verdict
  const rel = relativeTime(data.lastAttestationISO);

  return (
    <div>
      <div className="card">
        {/* Verdict */}
        <div className="status-verdict">
          <SolventStamp solvent={data.solvent} size="lg" />
          <p className="status-time">
            {formatTime(data.lastAttestationISO)}
            {rel && <span style={{ marginLeft: 'var(--sp-2)', opacity: 0.7 }}>({rel})</span>}
          </p>
        </div>

        {/* On-chain data */}
        <h3 className="section-title">On-chain record</h3>

        <div className="data-row">
          <span className="data-label">Epoch</span>
          <span className="data-value"><code className="mono">{data.epoch}</code></span>
        </div>

        <div className="data-row">
          <span className="data-label">Commitment root</span>
          <span className="data-value">
            <TruncatedHash hash={data.liabilitiesRootHex} label="commitment root" />
          </span>
        </div>

        <div className="data-row">
          <span className="data-label">Custodian identity</span>
          <span className="data-value">
            <TruncatedHash hash={data.custodianKeyHex} label="custodian key" />
          </span>
        </div>

        <div className="data-row">
          <span className="data-label">Contract</span>
          <span className="data-value">
            <TruncatedHash hash={CONTRACT_ADDRESS} label="contract address" />
          </span>
        </div>

        <button
          type="button"
          className="btn btn--ghost btn--sm"
          style={{ marginTop: 'var(--sp-4)' }}
          onClick={refetch}
        >
          Refresh
        </button>
      </div>

      {/* Privacy callout */}
      <div className="privacy-callout" style={{ marginTop: 'var(--sp-4)' }}>
        <div className="privacy-callout-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Privacy guarantee
        </div>
        <p>
          No customer balances appear here — that is the privacy guarantee made
          visible. The custodian proved that total assets ≥ total liabilities
          using a zero-knowledge proof. The chain stores only the verdict and
          a cryptographic commitment — never a single balance.
        </p>
      </div>
    </div>
  );
}
