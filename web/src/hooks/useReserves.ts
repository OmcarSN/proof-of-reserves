import { useState, useEffect, useCallback } from 'react';
import { readReserves, friendlyError, type ReservesView } from '@reserves';

export function useReserves() {
  const [data, setData] = useState<ReservesView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const view = await readReserves();
      setData(view);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_ };
}
