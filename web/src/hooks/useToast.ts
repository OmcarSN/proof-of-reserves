import { useState, useCallback, useRef } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

let nextId = 0;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (message: string, type: Toast['type'] = 'info', durationMs = 3500) => {
      const id = `toast-${++nextId}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = window.setTimeout(() => removeToast(id), durationMs);
      timers.current.set(id, timer);
      return id;
    },
    [removeToast],
  );

  return { toasts, addToast, removeToast };
}
