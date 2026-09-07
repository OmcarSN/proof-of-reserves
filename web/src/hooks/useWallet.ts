import { useState, useCallback } from 'react';
import {
  connectWallet,
  disconnectWallet,
  friendlyError,
  type WalletInfo,
} from '@reserves';

export function useWallet() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const info = await connectWallet();
      setWallet(info);
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
  }, []);

  return { wallet, connecting, error, connect, disconnect };
}
