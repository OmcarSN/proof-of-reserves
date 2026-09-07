import { useState } from 'react';
import { NETWORK_LABEL, CONTRACT_ADDRESS } from '@reserves';
import { useToast } from './hooks/useToast';
import { useWallet } from './hooks/useWallet';
import { ToastContainer } from './components/Toast';
import { TruncatedHash } from './components/TruncatedHash';
import { AttestPanel } from './components/AttestPanel';
import { StatusPanel } from './components/StatusPanel';
import { VerifyPanel } from './components/VerifyPanel';

type Tab = 'status' | 'attest' | 'verify';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('status');
  const { toasts, addToast, removeToast } = useToast();
  const { wallet, connect, disconnect } = useWallet();

  const handleConnect = async () => {
    const info = await connect();
    addToast(`Connected to ${info.walletName}`, 'success');
    return info;
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'status', label: 'Status' },
    { id: 'attest', label: 'Attest' },
    { id: 'verify', label: 'My Proof' },
  ];

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <span className="app-logo">
              <span className="app-logo-mark">◆</span> ProofReserves
            </span>
            <span className="network-badge">{NETWORK_LABEL}</span>
          </div>

          <div className="header-meta">
            <TruncatedHash
              hash={CONTRACT_ADDRESS}
              prefixLen={6}
              suffixLen={4}
              label="contract address"
              className=""
            />

            {wallet ? (
              <button
                type="button"
                className="wallet-pill"
                onClick={disconnect}
                title={`${wallet.walletName} · ${wallet.address}\nClick to disconnect`}
              >
                <span className="wallet-pill-dot" />
                {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">
        <div className="app-content">
          {/* Tabs */}
          <nav className="tabs" role="tablist" aria-label="ProofReserves sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`tab ${activeTab === t.id ? 'tab--active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* Panel */}
          {activeTab === 'status' && <StatusPanel />}
          {activeTab === 'attest' && (
            <AttestPanel
              wallet={wallet}
              onConnect={handleConnect}
              addToast={addToast}
            />
          )}
          {activeTab === 'verify' && <VerifyPanel />}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer">
        Powered by Midnight · Zero-knowledge solvency proof
      </footer>

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
