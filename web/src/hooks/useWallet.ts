import { useState, useCallback, useEffect, useRef } from 'react';
import {
  connectWallet,
  disconnectWallet,
  checkWalletAccountChange,
  onWalletAccountChange,
  friendlyError,
  type WalletInfo,
  type AccountChangeInfo,
} from '@reserves';

const SESSION_STORAGE_KEY = 'proofreserves_wallet_connected';

export function useWallet() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletRef = useRef<WalletInfo | null>(null);
  walletRef.current = wallet;

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const info = await connectWallet();
      setWallet(info);
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, '1');
      } catch {}
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('proofreserves:walletConnected', { detail: info }),
        );
      }
      return info;
    } catch (err) {
      const msg = friendlyError(err);
      setError(msg);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    disconnectWallet();
    setWallet(null);
    setError(null);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('proofreserves:walletDisconnected'));
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const updated = await checkWalletAccountChange();
      if (updated) {
        const newInfo: WalletInfo = {
          address: updated.address,
          coinPublicKey: updated.coinPublicKey,
          walletName: updated.walletName,
          networkLabel: walletRef.current?.networkLabel || 'Midnight Preprod',
        };
        setWallet(newInfo);
        return newInfo;
      }
    } catch {}
    return walletRef.current;
  }, []);

  // ── 1. Push listener: React the moment the connector pushes an account switch ──
  useEffect(() => {
    const unsub = onWalletAccountChange((info: AccountChangeInfo) => {
      const newInfo: WalletInfo = {
        address: info.address,
        coinPublicKey: info.coinPublicKey,
        walletName: info.walletName,
        networkLabel: walletRef.current?.networkLabel || 'Midnight Preprod',
      };
      setWallet((prev) => {
        if (
          !prev ||
          prev.address.toLowerCase() !== info.address.toLowerCase() ||
          (!prev.coinPublicKey && info.coinPublicKey)
        ) {
          return newInfo;
        }
        return prev;
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('proofreserves:walletChanged', { detail: newInfo }),
        );
      }
    });
    return unsub;
  }, []);

  // ── 2. Silent reconnect on reload if previously connected in session ──
  useEffect(() => {
    const wasConnected =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(SESSION_STORAGE_KEY) === '1';
    if (wasConnected) {
      connectWallet()
        .then((info) => {
          setWallet(info);
        })
        .catch(() => {
          try {
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
          } catch {}
        });
    }
  }, []);

  // ── 3. Active account-change check: on focus, visibility change & interval ──
  useEffect(() => {
    if (!wallet) return;

    const checkChange = async () => {
      try {
        const updated = await checkWalletAccountChange();
        if (
          updated &&
          updated.address &&
          walletRef.current &&
          updated.address.toLowerCase() !== walletRef.current.address.toLowerCase()
        ) {
          const newInfo: WalletInfo = {
            address: updated.address,
            coinPublicKey: updated.coinPublicKey,
            walletName: updated.walletName,
            networkLabel: walletRef.current.networkLabel || 'Midnight Preprod',
          };
          setWallet(newInfo);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('proofreserves:walletChanged', { detail: newInfo }),
            );
          }
        }
      } catch {
        // silent
      }
    };

    // When the user switches accounts in the 1AM extension popup and returns to the tab
    window.addEventListener('focus', checkChange);
    document.addEventListener('visibilitychange', checkChange);
    const interval = setInterval(checkChange, 2500);

    return () => {
      window.removeEventListener('focus', checkChange);
      document.removeEventListener('visibilitychange', checkChange);
      clearInterval(interval);
    };
  }, [wallet?.address]);

  return { wallet, connecting, error, connect, disconnect, refresh };
}
