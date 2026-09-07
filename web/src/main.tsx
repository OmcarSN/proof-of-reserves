import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

// Render the app. If the @reserves module fails to load (e.g. WASM init error),
// we catch it and show a diagnostic message instead of a blank page.
async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    const { default: App } = await import('./App');
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (err) {
    console.error('[ProofReserves] Failed to boot:', err);
    root.render(
      <div style={{
        fontFamily: 'system-ui, sans-serif',
        color: '#e8ecf4',
        background: '#0a0f1c',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>ProofReserves</h1>
          <p style={{ color: '#8896b3', marginBottom: '1rem' }}>
            Failed to initialize. This usually means a browser extension or
            network issue blocked the Midnight SDK from loading.
          </p>
          <pre style={{
            background: '#111827',
            padding: '1rem',
            borderRadius: 8,
            fontSize: '0.8rem',
            color: '#ef4444',
            textAlign: 'left',
            overflow: 'auto',
            maxHeight: 200,
          }}>
            {err instanceof Error ? err.message + '\n' + err.stack : String(err)}
          </pre>
          <button
            onClick={() => location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              background: '#14b8a6',
              color: '#0a0f1c',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>,
    );
  }
}

boot();
