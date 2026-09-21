import { useState, useEffect } from 'react';
import { useToast } from './hooks/useToast';
import { useWallet } from './hooks/useWallet';
import { ToastContainer } from './components/Toast';
import { AttestPanel } from './components/AttestPanel';
import { StatusPanel } from './components/StatusPanel';
import { VerifyPanel } from './components/VerifyPanel';
import { JoinPanel } from './components/JoinPanel';
import { ParticleBackground } from './components/ParticleBackground';
import {
  ProofLogo,
  ShieldCheckIcon,
  SparklesIcon,
  TreeIcon,
  WalletIcon,
  UsersIcon,
  ArrowUpRightIcon,
} from './components/Icons';

type Tab = 'status' | 'attest' | 'verify' | 'join';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const { toasts, addToast, removeToast } = useToast();
  const { wallet, connect, disconnect, connecting } = useWallet();

  // Listen for active account switches from 1AM / Lace
  useEffect(() => {
    const handleWalletChanged = (e: any) => {
      const newWallet = e.detail;
      if (newWallet?.address) {
        const short =
          newWallet.address.length >= 10
            ? `${newWallet.address.slice(0, 6)}…${newWallet.address.slice(-4)}`
            : newWallet.address;
        addToast(`Switched account to ${short} (${newWallet.walletName || '1AM'})`, 'info');
      }
    };
    window.addEventListener('proofreserves:walletChanged', handleWalletChanged);
    return () => window.removeEventListener('proofreserves:walletChanged', handleWalletChanged);
  }, [addToast]);

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
      icon: <ShieldCheckIcon size={15} />,
    },
    {
      id: 'attest',
      label: 'Custodian Attest',
      icon: <SparklesIcon size={15} />,
    },
    {
      id: 'verify',
      label: 'Verify My Proof',
      icon: <TreeIcon size={15} />,
    },
    {
      id: 'join',
      label: 'Join Network',
      icon: <UsersIcon size={15} />,
    },
  ];

  return (
    <div className="app">
      {/* ── Subtle Interactive Particle Canvas Background ── */}
      <ParticleBackground />

      {/* ── Professional Navigation Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          {/* Left: Brand & Protocol Mark */}
          <div className="app-header-left">
            <div
              className="app-brand"
              onClick={() => setActiveTab('status')}
              role="button"
              tabIndex={0}
              title="ProofReserves Solvency Protocol"
            >
              <div className="app-logo-mark">
                <ProofLogo size={22} color="#0F2C23" />
              </div>
              <div className="app-brand-titles">
                <span className="app-logo">ProofReserves</span>
                <span className="app-tagline">Zero-Knowledge Solvency Protocol</span>
              </div>
            </div>
          </div>

          {/* Center: Desktop Navbar Tabs (Capsule Bar) */}
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
                <span className="nav-tab-label">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Right: Wallet Actions */}
          <div className="app-header-right">
            {wallet ? (
              <button
                type="button"
                className="wallet-pill wallet-pill--connected"
                onClick={disconnect}
                title={`${wallet.walletName} · ${wallet.address}\nClick to disconnect`}
              >
                <span className="wallet-live-badge" aria-hidden="true">
                  <span className="wallet-live-dot" />
                  <span className="wallet-live-ping" />
                </span>
                <span className="wallet-provider-tag">{wallet.walletName || '1AM'}</span>
                <span className="wallet-address-text font-mono">
                  {wallet.address && wallet.address.length >= 10
                    ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                    : wallet.address || 'Connected'}
                </span>
                <span className="wallet-disconnect-hint" title="Disconnect">✕</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--pill header-connect-btn"
                onClick={handleConnect}
                disabled={connecting}
              >
                <WalletIcon size={14} />
                <span>{connecting ? 'Connecting…' : 'Connect Wallet'}</span>
                <ArrowUpRightIcon size={13} className="btn-arrow" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Application Workspace ── */}
      <main className="app-main">
        <div className="app-content">
          {/* Loops House Style Hero Banner — prominent on Solvency Overview */}
          {activeTab === 'status' && (
            <div className="hero-banner">
              <h1 className="hero-headline">THE ZERO-KNOWLEDGE PROTOCOL FOR VERIFIABLE SOLVENCY</h1>
              <p className="hero-subtext">
                Cryptographically prove 100% reserve backing while keeping every customer balance completely confidential.
              </p>
            </div>
          )}

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

          {activeTab === 'join' && (
            <JoinPanel
              wallet={wallet}
              onConnect={handleConnect}
              onNavigate={(tab) => setActiveTab(tab)}
              addToast={addToast}
            />
          )}
        </div>
      </main>

      {/* ── Global Footer ── */}
      <footer className="app-footer">
        <div className="footer-inner">
          <div className="footer-left">
            <ProofLogo size={18} color="#0F2C23" />
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
