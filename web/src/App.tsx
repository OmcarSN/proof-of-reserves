import { useState } from 'react';
import { NETWORK_LABEL, CONTRACT_ADDRESS } from '@reserves';
import { useToast } from './hooks/useToast';
import { useWallet } from './hooks/useWallet';
import { ToastContainer } from './components/Toast';
import { TruncatedHash } from './components/TruncatedHash';
import { AttestPanel } from './components/AttestPanel';
import { StatusPanel } from './components/StatusPanel';
import { VerifyPanel } from './components/VerifyPanel';
import { ParticleBackground } from './components/ParticleBackground';
import { ShieldCheckIcon, SparklesIcon, TreeIcon, WalletIcon } from './components/Icons';

type Tab = 'status' | 'attest' | 'verify';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const { toasts, addToast, removeToast } = useToast();
  const { wallet, connect, disconnect, connecting } = useWallet();

  const handleConnect = async () => {
    try {
      const info = await connect();
      addToast(`Connected to ${info.walletName}`, 'success');
      return info;
    } catch (err: any) {
      addToast(err?.message || 'Failed to connect wallet', 'error');
      throw err;
    }
  };

  const navItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'status',
      label: 'Solvency Overview',
      icon: <ShieldCheckIcon size={16} />,
    },
    {
      id: 'attest',
      label: 'Custodian Attest',
      icon: <SparklesIcon size={16} />,
    },
    {
      id: 'verify',
      label: 'Verify My Proof',
      icon: <TreeIcon size={16} />,
    },
  ];

  return (
    <div className="app">
      {/* ── Subtle Interactive Particle Canvas Background ── */}
      <ParticleBackground />

      {/* ── Professional Navigation Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-header-left">
            <div className="app-brand" onClick={() => setActiveTab('status')} style={{ cursor: 'pointer' }}>
              <div className="app-logo-mark">
                <ShieldCheckIcon size={20} className="text-teal" />
              </div>
              <div className="app-brand-titles">
                <span className="app-logo">ProofReserves</span>
                <span className="app-tagline">Zero-Knowledge Solvency Protocol</span>
              </div>
            </div>

            {/* Desktop Navbar Tabs */}
            <nav className="header-nav" role="tablist" aria-label="Main Navigation">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === item.id}
                  className={`nav-tab ${activeTab === item.id ? 'nav-tab--active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                >
                  <span className="nav-tab-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="app-header-right">
            <span className="network-pill">
              <span className="pulse-dot pulse-dot--green" />
              {NETWORK_LABEL}
            </span>

            <div className="contract-meta-pill">
              <span className="meta-label">Contract</span>
              <TruncatedHash
                hash={CONTRACT_ADDRESS}
                prefixLen={6}
                suffixLen={4}
                label="Contract Address"
              />
            </div>

            {wallet ? (
              <button
                type="button"
                className="wallet-pill wallet-pill--connected"
                onClick={disconnect}
                title={`${wallet.walletName} · ${wallet.address}\nClick to disconnect`}
              >
                <WalletIcon size={14} />
                <span className="font-mono">
                  {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
                </span>
                <span className="wallet-dot" />
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--pill"
                onClick={handleConnect}
                disabled={connecting}
              >
                <span>{connecting ? 'Connecting…' : 'Connect Lace'}</span>
                <span className="btn-arrow">↗</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Application Workspace ── */}
      <main className="app-main">
        <div className="app-content">
          {/* Loops House Style Hero Banner */}
          <div className="hero-banner">
            <h1 className="hero-headline">THE ZERO-KNOWLEDGE PROTOCOL FOR VERIFIABLE SOLVENCY</h1>
            <p className="hero-subtext">
              Cryptographically prove 100% reserve backing while keeping every customer balance completely confidential.
            </p>
          </div>

          {activeTab === 'status' && (
            <StatusPanel
              onNavigateToAttest={() => setActiveTab('attest')}
              onNavigateToVerify={() => setActiveTab('verify')}
            />
          )}

          {activeTab === 'attest' && (
            <AttestPanel
              wallet={wallet}
              onConnect={handleConnect}
              addToast={addToast}
              onNavigateToStatus={() => setActiveTab('status')}
            />
          )}

          {activeTab === 'verify' && <VerifyPanel />}
        </div>
      </main>

      {/* ── Global Footer ── */}
      <footer className="app-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <span className="footer-brand">ProofReserves</span>
            <span className="footer-sep">·</span>
            <span>Zero-Knowledge Cryptographic Solvency</span>
          </div>
          <div className="footer-right">
            <span>Verified on Midnight Preprod</span>
            <span className="footer-sep">·</span>
            <span className="text-teal font-mono">100% Client-Side Privacy Guarantee</span>
          </div>
        </div>
      </footer>

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
