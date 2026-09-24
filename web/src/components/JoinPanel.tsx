import { useState, useEffect } from 'react';
import { NETWORK_LABEL } from '@reserves';
import {
  ShieldCheckIcon,
  WalletIcon,
  UsersIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
  TreeIcon,
} from './Icons';

const GITHUB_URL = 'https://github.com/OmcarSN/proof-of-reserves';
const LACE_URL = 'https://www.lace.io/';
const ONE_AM_URL = 'https://1am.xyz';
const DOCS_URL = 'https://docs.midnight.network';

interface JoinPanelProps {
  wallet: { address: string; walletName: string } | null;
  onConnect: () => Promise<any>;
  onNavigate?: (tab: 'status' | 'attest' | 'verify') => void;
  addToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function JoinPanel({ wallet, onConnect, onNavigate, addToast }: JoinPanelProps) {
  const [connecting, setConnecting] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  // In-app tester feedback state
  const [feedbackCategory, setFeedbackCategory] = useState<'ux' | 'security' | 'functionality' | 'idea'>('ux');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    if (wallet?.address) {
      const saved = localStorage.getItem(`por_tester_feedback_${wallet.address}`);
      setFeedbackSubmitted(!!saved);
    } else {
      const saved = localStorage.getItem('por_tester_feedback');
      setFeedbackSubmitted(!!saved);
    }
  }, [wallet?.address]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect();
    } catch {
      // handled by parent toast
    } finally {
      setConnecting(false);
    }
  };

  const copyAddress = () => {
    if (wallet?.address) {
      navigator.clipboard.writeText(wallet.address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
      addToast?.('Wallet address copied to clipboard', 'info');
    }
  };

  const submitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;

    const payload = {
      address: wallet?.address || 'unconnected',
      walletName: wallet?.walletName || 'none',
      category: feedbackCategory,
      rating: feedbackRating,
      comment: feedbackText.trim(),
      timestamp: new Date().toISOString(),
    };

    if (wallet?.address) {
      localStorage.setItem(`por_tester_feedback_${wallet.address}`, JSON.stringify(payload));
    }
    localStorage.setItem('por_tester_feedback', JSON.stringify(payload));
    setFeedbackSubmitted(true);
    addToast?.('Thank you! Your feedback has been recorded.', 'success');
  };

  return (
    <div className="join-layout">
      {/* Hero section — Matte & Professional */}
      <div className="card join-hero-card">
        <div className="join-hero-content">
          <div className="join-hero-icon">
            <UsersIcon size={32} className="text-teal" />
          </div>
          <h2 className="join-hero-title">Join the Proof Network</h2>
          <p className="join-hero-desc">
            Help validate and improve the ProofReserves zero-knowledge protocol on Midnight Preprod.
            Test confidentiality guarantees, verify solvency commitments, and submit your evaluation.
          </p>
          <div className="join-hero-stats">
            <div className="join-stat">
              <span className="join-stat-label">Network</span>
              <span className="join-stat-value font-mono">{NETWORK_LABEL}</span>
            </div>
            <div className="join-stat">
              <span className="join-stat-label">Protocol Standard</span>
              <span className="join-stat-value">Zero-Knowledge Sum Tree</span>
            </div>
            <div className="join-stat">
              <span className="join-stat-label">Estimated Time</span>
              <span className="join-stat-value">~3 minutes</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="join-columns-grid">
        {/* Left: Professional Step-by-Step Walkthrough */}
        <div className="card join-steps-card">
          <div className="panel-header-row" style={{ marginBottom: 'var(--sp-4)' }}>
            <div>
              <h3 className="panel-title">Protocol Onboarding Guide</h3>
              <p className="panel-subtitle">Follow these five steps to test and verify the ProofReserves network.</p>
            </div>
            {wallet && (
              <span className="join-step-badge-ready">
                <CheckCircleIcon size={13} />
                <span>Tester Active</span>
              </span>
            )}
          </div>

          <div className="join-steps-timeline">
            {/* Step 1: Wallet Setup */}
            <div className={`join-step-row ${wallet ? 'is-completed' : ''}`}>
              <div className="join-step-track">
                <div className="join-step-bullet">{wallet ? '✓' : '1'}</div>
                <div className="join-step-line" />
              </div>
              <div className="join-step-content">
                <div className="join-step-header">
                  <span className="join-step-name">Install a Midnight Browser Wallet</span>
                  {wallet && <span className="join-tag join-tag-success">✓ {wallet.walletName} Detected</span>}
                </div>
                <p className="join-step-description">
                  ProofReserves connects seamlessly with <strong>1AM Wallet</strong> and <strong>Lace Wallet</strong> on Chrome or Brave.
                </p>
                <div className="join-step-actions-group">
                  <a href={ONE_AM_URL} target="_blank" rel="noopener noreferrer" className="btn btn--secondary btn--sm">
                    <span>Get 1AM Wallet</span>
                    <ExternalLinkIcon size={12} />
                  </a>
                  <a href={LACE_URL} target="_blank" rel="noopener noreferrer" className="btn btn--ghost btn--sm">
                    <span>Get Lace Wallet</span>
                    <ExternalLinkIcon size={12} />
                  </a>
                </div>
              </div>
            </div>

            {/* Step 2: Preprod Network */}
            <div className={`join-step-row ${wallet ? 'is-completed' : ''}`}>
              <div className="join-step-track">
                <div className="join-step-bullet">{wallet ? '✓' : '2'}</div>
                <div className="join-step-line" />
              </div>
              <div className="join-step-content">
                <div className="join-step-header">
                  <span className="join-step-name">Switch to Midnight Preprod</span>
                  {wallet && <span className="join-tag join-tag-success">✓ Preprod Active</span>}
                </div>
                <p className="join-step-description">
                  In your wallet extension, ensure your network selector is set to <strong>Preprod</strong>. No live funds are required for verification.
                </p>
              </div>
            </div>

            {/* Step 3: Wallet Connection */}
            <div className={`join-step-row ${wallet ? 'is-completed' : ''}`}>
              <div className="join-step-track">
                <div className="join-step-bullet">{wallet ? '✓' : '3'}</div>
                <div className="join-step-line" />
              </div>
              <div className="join-step-content">
                <div className="join-step-header">
                  <span className="join-step-name">Connect Your Verification Wallet</span>
                  {wallet && <span className="join-tag join-tag-success">✓ Authenticated</span>}
                </div>
                <p className="join-step-description">
                  Connect your wallet to establish your Preprod testing session and register verification activity.
                </p>
                <div className="join-step-actions-group">
                  {wallet ? (
                    <div className="join-connected-pill">
                      <span className="pulse-dot pulse-dot--green" />
                      <span className="font-mono">{wallet.address.slice(0, 12)}…{wallet.address.slice(-6)}</span>
                      <button type="button" onClick={copyAddress} className="join-pill-copy-btn">
                        {copiedAddress ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={handleConnect}
                      disabled={connecting}
                    >
                      <WalletIcon size={14} />
                      <span>{connecting ? 'Connecting…' : 'Connect Wallet'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Step 4: Explore & Validate */}
            <div className="join-step-row">
              <div className="join-step-track">
                <div className="join-step-bullet">4</div>
                <div className="join-step-line" />
              </div>
              <div className="join-step-content">
                <div className="join-step-header">
                  <span className="join-step-name">Explore Protocol Features</span>
                </div>
                <p className="join-step-description">
                  Test the real-world utility of zero-knowledge solvency verification through our dedicated portals:
                </p>
                <div className="join-features-quick-grid">
                  <button
                    type="button"
                    className="join-feature-quick-btn"
                    onClick={() => onNavigate?.('status')}
                  >
                    <div className="join-quick-icon">
                      <ShieldCheckIcon size={15} />
                    </div>
                    <div className="join-quick-text">
                      <strong>Solvency Overview</strong>
                      <span>Check on-chain status & epoch</span>
                    </div>
                    <span className="join-quick-arrow">→</span>
                  </button>

                  <button
                    type="button"
                    className="join-feature-quick-btn"
                    onClick={() => onNavigate?.('verify')}
                  >
                    <div className="join-quick-icon">
                      <TreeIcon size={15} />
                    </div>
                    <div className="join-quick-text">
                      <strong>Verify My Proof</strong>
                      <span>Test customer inclusion proof</span>
                    </div>
                    <span className="join-quick-arrow">→</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Step 5: Tester Feedback */}
            <div className={`join-step-row ${feedbackSubmitted ? 'is-completed' : ''}`}>
              <div className="join-step-track">
                <div className="join-step-bullet">{feedbackSubmitted ? '✓' : '5'}</div>
              </div>
              <div className="join-step-content">
                <div className="join-step-header">
                  <span className="join-step-name">Submit Tester Evaluation</span>
                  {feedbackSubmitted && <span className="join-tag join-tag-success">✓ Feedback Recorded</span>}
                </div>
                <p className="join-step-description">
                  Share your impressions on user experience, cryptographic security, and transaction performance.
                </p>

                {feedbackSubmitted ? (
                  <div className="join-feedback-success-banner">
                    <CheckCircleIcon size={18} className="text-teal" />
                    <div>
                      <strong>Evaluation Submitted Successfully</strong>
                      <p>Your review has been recorded. Thank you for contributing to the Midnight ProofReserves protocol!</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={submitFeedback} className="join-inline-feedback-form">
                    <div className="join-form-row">
                      <label className="join-form-label">Category</label>
                      <div className="join-category-chips">
                        {(['ux', 'security', 'functionality', 'idea'] as const).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            className={`join-category-chip ${feedbackCategory === cat ? 'is-selected' : ''}`}
                            onClick={() => setFeedbackCategory(cat)}
                          >
                            {cat === 'ux' && 'UI / UX'}
                            {cat === 'security' && 'Security'}
                            {cat === 'functionality' && 'Functionality'}
                            {cat === 'idea' && 'Feature Idea'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="join-form-row">
                      <label className="join-form-label">Rating</label>
                      <div className="join-rating-selector">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            className={`join-star-btn ${feedbackRating >= star ? 'is-active' : ''}`}
                            onClick={() => setFeedbackRating(star)}
                          >
                            ★
                          </button>
                        ))}
                        <span className="join-rating-text">
                          {feedbackRating === 5 && 'Excellent (5/5)'}
                          {feedbackRating === 4 && 'Very Good (4/5)'}
                          {feedbackRating === 3 && 'Good (3/5)'}
                          {feedbackRating === 2 && 'Needs Improvement (2/5)'}
                          {feedbackRating === 1 && 'Critical Issues (1/5)'}
                        </span>
                      </div>
                    </div>

                    <div className="join-form-row">
                      <label className="join-form-label">Feedback & Observations</label>
                      <textarea
                        className="join-textarea"
                        rows={3}
                        placeholder="What worked smoothly? What would you improve in the zero-knowledge solvency flow?"
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        required
                      />
                    </div>

                    <div className="join-form-actions">
                      <button type="submit" className="btn btn--primary btn--sm">
                        <span>Submit Evaluation</span>
                        <ArrowUpRightIcon size={14} />
                      </button>
                      <a
                        href={`${GITHUB_URL}/issues`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--ghost btn--sm"
                      >
                        <span>Open GitHub Issue</span>
                        <ExternalLinkIcon size={12} />
                      </a>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Stack: Connection Status + Protocol Guarantees + Resources */}
        <div className="join-right-stack">
          {/* Connection Status Card */}
          <div className="card join-connection-card">
            <div className="join-connection-header">
              <WalletIcon size={18} className="text-teal" />
              <h4>Tester Identity</h4>
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
                    {wallet.walletName}
                  </span>
                </div>
                <div className="join-badge-verified">
                  <CheckCircleIcon size={14} />
                  <span>Verified Preprod Verifier</span>
                </div>
              </div>
            ) : (
              <div className="join-not-connected">
                <p>Connect 1AM or Lace Wallet to link your Preprod tester identity.</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleConnect}
                  disabled={connecting}
                >
                  <WalletIcon size={16} />
                  <span>{connecting ? 'Connecting…' : 'Connect Wallet'}</span>
                  <ArrowUpRightIcon size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Protocol Testing Scope */}
          <div className="card join-test-card">
            <h4 className="join-test-title">
              <ShieldCheckIcon size={18} className="text-teal" />
              What You Are Validating
            </h4>
            <div className="join-test-items">
              <div className="join-test-item">
                <strong>1. Zero-Knowledge Solvency</strong>
                <p>Verifies assets exceed liabilities on-chain without exposing private portfolio balances.</p>
              </div>
              <div className="join-test-item">
                <strong>2. Merkle Sum Tree Inclusion</strong>
                <p>Customers can independently verify their account was included in the solvency total.</p>
              </div>
              <div className="join-test-item">
                <strong>3. Non-Custodial Verification</strong>
                <p>All proofs run locally in client-side WebAssembly and Docker proof server.</p>
              </div>
            </div>
          </div>

          {/* Developer Resources */}
          <div className="card join-links-card">
            <h4>Protocol Resources</h4>
            <div className="join-links">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="join-link">
                <span>GitHub Source Repository</span>
                <ExternalLinkIcon size={12} />
              </a>
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" className="join-link">
                <span>Midnight Developer Docs</span>
                <ExternalLinkIcon size={12} />
              </a>
              <a href={ONE_AM_URL} target="_blank" rel="noopener noreferrer" className="join-link">
                <span>1AM Wallet Gateway</span>
                <ExternalLinkIcon size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
