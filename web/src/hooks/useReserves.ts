import { useState, useEffect, useCallback } from 'react';
import { readReserves, friendlyError, type ReservesView } from '@reserves';

// ── Shared module-level cache so state persists across tab switches ─────────
let cachedReserves: ReservesView | null = null;
const listeners = new Set<(val: ReservesView | null) => void>();

export function updateReservesCache(patch: Partial<ReservesView>) {
  if (!cachedReserves && patch.epoch == null) return;
  cachedReserves = {
    attested: true,
    solvent: true,
    liabilitiesRootHex: '',
    epoch: 1,
    lastAttestationTime: String(Math.floor(Date.now() / 1000)),
    lastAttestationISO: new Date().toISOString(),
    custodianKeyHex: '',
    ...cachedReserves,
    ...patch,
  };
  listeners.forEach((fn) => fn(cachedReserves));
}

// Global broadcast listener for instant zero-latency attestation updates
if (typeof window !== 'undefined') {
  window.addEventListener('proofreserves:attested', (e: any) => {
    const detail = e.detail;
    if (detail) {
      updateReservesCache({
        attested: true,
        solvent: true,
        epoch: Number(detail.epoch) || (cachedReserves?.epoch ? cachedReserves.epoch + 1 : 1),
        liabilitiesRootHex: detail.liabilitiesRootHex || cachedReserves?.liabilitiesRootHex || '',
        lastAttestationISO: detail.lastAttestationISO || new Date().toISOString(),
        lastAttestationTime: detail.lastAttestationTime || String(Math.floor(Date.now() / 1000)),
      });

      // Rapid polling burst (every 2.5s for 20s) until on-chain indexer confirms new block
      let attempts = 0;
      const burstInterval = setInterval(async () => {
        attempts++;
        try {
          const fresh = await readReserves();
          if (fresh && fresh.epoch >= (detail.epoch || 0)) {
            cachedReserves = fresh;
            listeners.forEach((fn) => fn(fresh));
            clearInterval(burstInterval);
            return;
          }
        } catch {
          // ignore transient indexer latency
        }
        if (attempts >= 8) {
          clearInterval(burstInterval);
        }
      }, 2500);
    }
  });

  // Re-query reserves automatically whenever the user switches active wallet
  window.addEventListener('proofreserves:walletChanged', () => {
    readReserves()
      .then((fresh) => {
        if (fresh) {
          cachedReserves = fresh;
          listeners.forEach((fn) => fn(fresh));
        }
      })
      .catch(() => {});
  });
}

export function useReserves() {
  const [data, setData] = useState<ReservesView | null>(cachedReserves);
  const [loading, setLoading] = useState(!cachedReserves);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async (showFullLoading = false) => {
    if (showFullLoading && !cachedReserves) {
      setLoading(true);
    } else {
      setIsSyncing(true);
    }
    setError(null);
    try {
      const view = await readReserves();
      if (view) {
        cachedReserves = view;
        setData(view);
        listeners.forEach((fn) => fn(view));
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // Subscribe to module-level cache updates
  useEffect(() => {
    const onUpdate = (val: ReservesView | null) => setData(val);
    listeners.add(onUpdate);
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetch_(true);
  }, [fetch_]);

  // Fast background auto-refresh every 10 seconds & on window focus
  useEffect(() => {
    const interval = setInterval(() => {
      fetch_(false);
    }, 10000);

    const onFocus = () => fetch_(false);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetch_]);

  return {
    data,
    loading,
    isSyncing,
    error,
    refetch: () => fetch_(false),
  };
}
