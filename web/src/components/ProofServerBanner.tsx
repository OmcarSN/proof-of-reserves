import { useState, useCallback } from 'react';
import { isProofServerUp, PROOF_SERVER_DOCKER_CMD } from '@reserves';
import { CopyButton } from './CopyButton';

interface ProofServerBannerProps {
  onStatusChange?: (up: boolean) => void;
}

export function ProofServerBanner({ onStatusChange }: ProofServerBannerProps) {
  const [checking, setChecking] = useState(false);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    try {
      const up = await isProofServerUp();
      onStatusChange?.(up);
    } finally {
      setChecking(false);
    }
  }, [onStatusChange]);

  return (
    <div className="proof-server-banner" role="alert">
      <div className="proof-server-banner-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <strong>Proof server not reachable</strong>
      </div>
      <p className="proof-server-banner-body">
        The local ZK proof server must be running to generate attestations.
        Start it with:
      </p>
      <div className="proof-server-banner-cmd">
        <code>{PROOF_SERVER_DOCKER_CMD}</code>
        <CopyButton text={PROOF_SERVER_DOCKER_CMD} label="docker command" />
      </div>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={checkAgain}
        disabled={checking}
      >
        {checking ? 'Checking…' : 'Check again'}
      </button>
    </div>
  );
}
