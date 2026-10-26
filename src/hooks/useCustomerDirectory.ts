import { useCallback, useEffect, useRef, useState } from 'react';
import { Customer } from '../../shared/types';
import { customerApi } from '../api';
import { subscribeCustomerChanges } from '../lib/customerChanges';

/** One server snapshot for both views. Never persist customer data in browser storage. */
export function useCustomerDirectory(scope: string) {
  const generation = useRef(0);
  const inFlight = useRef(0);
  const [snapshot, setSnapshot] = useState<{ scope: string; customers: Customer[]; syncedAt: number }>({ scope: '', customers: [], syncedAt: 0 });
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!scope) return false;
    ++inFlight.current;
    setSyncing(true);
    try {
      const customers = await customerApi.getAll();
      if (request !== generation.current || scopeRef.current !== scope) return false;
      setSnapshot({ scope, customers, syncedAt: Date.now() });
      setError(null);
      return true;
    } catch (err) {
      if (request === generation.current && scopeRef.current === scope) setError(err instanceof Error ? err.message : '客户同步失败');
      return false;
    } finally {
      --inFlight.current;
      if (request === generation.current && scopeRef.current === scope) setSyncing(false);
    }
  }, [scope]);

  const invalidatePending = useCallback(() => { ++generation.current; }, []);
  useEffect(() => {
    setSnapshot({ scope, customers: [], syncedAt: 0 });
    setError(null);
    void refresh();
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
    const unsubscribe = subscribeCustomerChanges(() => { void refresh(); });
    window.addEventListener('focus', visibleRefresh);
    window.addEventListener('online', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    // Do not invalidate a slow request at the same instant as its 15s HTTP timeout.
    const interval = window.setInterval(() => { if (!inFlight.current) visibleRefresh(); }, 15_000);
    return () => {
      invalidatePending();
      unsubscribe();
      window.removeEventListener('focus', visibleRefresh);
      window.removeEventListener('online', visibleRefresh);
      document.removeEventListener('visibilitychange', visibleRefresh);
      window.clearInterval(interval);
    };
  }, [refresh, scope, invalidatePending]);

  const sameScope = snapshot.scope === scope && !!scope;
  return {
    customers: sameScope ? snapshot.customers : [],
    syncedAt: sameScope ? snapshot.syncedAt : 0,
    loading: !sameScope || (!snapshot.syncedAt && !error),
    error, syncing, refresh,
  };
}
