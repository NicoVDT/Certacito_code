import { useState, useEffect, useCallback } from "react";
import * as api from "./client";

// generic fetch hook w/ loading + error so we don't write the same boilerplate
// in every screen. the deps array goes straight into the useCallback deps
// (TODO: refactor this pattern later)
export function useApiData<T>(fetcher: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);

  // console.log("useApiData", { loading, error }) // debug
  return { data, loading, error, refetch };
}

// thin wrappers for the common ones, saves importing api everywhere
export function useAuditLog(limit = 50) {
  return useApiData(() => api.getAuditLog(limit), [limit]);
}

export function usePendingApprovals() {
  return useApiData(() => api.getPendingApprovals(), []);
}

export function usePolicies() {
  return useApiData(() => api.getPolicies(), []);
}

export function useHealth() {
  return useApiData(() => api.healthCheck(), []);
}
