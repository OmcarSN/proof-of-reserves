import { useState } from 'react';
import { NETWORK_LABEL, CONTRACT_ADDRESS } from '@reserves';
import { useWallet } from '../hooks/useWallet';
import { TruncatedHash } from './TruncatedHash';
import {
  ShieldCheckIcon,
  WalletIcon,
  UsersIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
} from './Icons';

const FEEDBACK_FORM_URL = 'YOUR_GOOGLE_FORM_LINK'; // Replace with actual Google Form URL
const GITHUB_URL = 'https://github.com/OmcarSN/proof-of-reserves';
const LACE_URL = 'https://www.lace.io/';
const APP_URL = 'https://proof-of-reserves-delta.vercel.app';

interface JoinPanelProps {
  wallet: { address: string; walletName: string } | null;
  onConnect: () => Promise<any>;
}

export function JoinPanel({ wallet, onConnect }: JoinPanelProps) {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect();
      setConnected(true);
    } catch {
      // handled by parent
    } finally {
      setConnecting(false);
    }
  };

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const steps = [
    {
      num: 1,
      title: 'Install the Lace Wallet',
      desc: 'Download the Lace browser extension for Chrome or Brave.',
      action: (
        <a href={LACE_URL} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
          <span>Get Lace</span>
          <ExternalLinkIcon size={12} />
        </a>
      ),
    },
    {
      num: 2,
      title: 'Switch to Preprod Network',
      desc: 'Open Lace → Settings → Network → select Preprod.',
      action: null,
    },
    {
      num: 3,
      title: 'Connect Your Wallet',
      desc: 'Click the button below to connect your Lace wallet to ProofReserves.',
      action: wallet ? (
        <span className="join-connected-badge">
          <CheckCircleIcon size={14} />
          <span>Connected</span>
        </span>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={handleConnect}
          disabled={connecting}
        >
          <WalletIcon size={14} />
          <span>{connecting ? 'Connecting…' : 'Connect Lace'}</span>
        </button>
      ),
    },
    {
      num: 4,
      title: 'Explore the Dashboard',
      desc: 'Check the Solvency Overview, try Verify My Proof with sample data.',
      action: null,
    },
    {
      num: 5,
      title: 'Submit Feedback',
      desc: 'Fill our quick feedback form to help improve ProofReserves.',
      action: (
        <a href={FEEDBACK_FORM_URL} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
          <span>Open Form</span>
          <ExternalLinkIcon size={12} />
        </a>
      ),
    },
  ];

  return (
    <div className="join-layout">
      {/* Hero section */}
      <div className="card join-hero-card">
        <div className="join-hero-content">
          <div className="join-hero-icon">
            <UsersIcon size={32} className="text-teal" />
          </div>
          <h2 className="join-hero-title">Join the Proof Network</h2>
          <p className="join-hero-desc">
            Help us reach <strong>50 Preprod testers</strong> to validate and improve the 
            ProofReserves zero-knowledge solvency protocol. Connect your Lace wallet, 
            explore the dashboard, and share your feedback.
          </p>
          <div className="join-hero-stats">
            <div className="join-stat">
              <span className="join-stat-label">Network</span>
              <span className="join-stat-value font-mono">{NETWORK_LABEL}</span>
            </div>
            <div className="join-stat">
              <span className="join-stat-label">Contract</span>
              <TruncatedHash hash={CONTRACT_ADDRESS} prefixLen={6} suffixLen={4} label="Contract" />
            </div>
            <div className="join-stat">
              <span className="join-stat-label">Time Required</span>
              <span className="join-stat-value">~3 minutes</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="join-columns-grid">
        {/* Left: Steps */}
        <div className="card join-steps-card">
          <h3 className="panel-title">How to Get Started</h3>
          <p className="panel-subtitle">Follow these steps to become a verified Preprod tester.</p>

          <div className="join-steps">
            {steps.map((step) => (
              <div
                key={step.num}
                className={`join-step ${
                  step.num === 3 && wallet ? 'join-step--done' : ''
                }`}
              >
                <div className="join-step-num">
                  {step.num === 3 && wallet ? (
                    <CheckCircleIcon size={18} className="text-teal" />
                  ) : (
                    step.num
                  )}
                </div>
                <div className="join-step-body">
                  <strong>{step.title}</strong>
                  <p>{step.desc}</p>
                  {step.action && <div className="join-step-action">{step.action}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Your Connection + What You'll Test */}
        <div className="join-right-stack">
          {/* Connection Status */}
          <div className="card join-connection-card">
            <div className="join-connection-header">
              <WalletIcon size={20} className="text-teal" />
              <h4>Your Connection</h4>
            </div>

            {wallet ? (
              <div className="join-connection-details">
                <div className="join-address-row">
                  <span className="join-address-label">Wallet Address</span>
                  <code className="join-address-value">{wallet.address}</code>
                </div>
                <div className="join-address-actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={copyAddress}
                  >
                    {copiedAddress ? '✓ Copied' : 'Copy Address'}
                  </button>
                  <span className="join-connection-status">
                    <span className="pulse-dot pulse-dot--green" />
                    Connected via {wallet.walletName}
                  </span>
                </div>
                <p className="field-hint" style={{ marginTop: 'var(--sp-3)' }}>
                  Copy this address and paste it into the feedback form so we can verify your on-chain participation.
                </p>
              </div>
            ) : (
              <div className="join-not-connected">
                <p>Connect your Lace wallet to register as a Preprod tester.</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  <WalletIcon size={16} />
                  <span>{connecting ? 'Connecting…' : 'Connect Lace Wallet'}</span>
                  <ArrowUpRightIcon size={14} />
                </button>
              </div>
            )}
          </div>

          {/* What You'll Test */}
          <div className="card join-test-card">
            <h4 className="join-test-title">
              <ShieldCheckIcon size={18} className="text-teal" />
              What You'll Be Testing
            </h4>
            <div className="join-test-items">
              <div className="join-test-item">
                <strong>Solvency Overview</strong>
                <p>View the live on-chain verdict — is the custodian solvent?</p>
              </div>
              <div className="join-test-item">
                <strong>Verify My Proof</strong>
                <p>Paste a customer proof JSON and verify inclusion in the Merkle tree.</p>
              </div>
              <div className="join-test-item">
                <strong>Custodian Attest</strong>
                <p>If you run a proof server, publish a ZK solvency attestation.</p>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="card join-links-card">
            <h4>Resources</h4>
            <div className="join-links">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="join-link">
                <span>GitHub Repository</span>
                <ExternalLinkIcon size={12} />
              </a>
              <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="join-link">
                <span>Live App (Vercel)</span>
                <ExternalLinkIcon size={12} />
              </a>
              <a href={LACE_URL} target="_blank" rel="noopener noreferrer" className="join-link">
                <span>Lace Wallet</span>
                <ExternalLinkIcon size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
