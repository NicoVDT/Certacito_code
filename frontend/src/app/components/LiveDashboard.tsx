import { useState, useEffect } from "react";
import * as api from "../../api/client";

// types match what the api spits back. snake_case here because the backend
// uses snake_case and we just forward it straight up - didn't want to map every
// field just for the dashboard to map them back lol
interface DashboardStats {
  total_intercepted: number;
  blocked: number;
  critical_events: number;
  pending_approvals: number;
  active_rules: number;
  compliance_score: number;
  outcomes: { PERMIT: number; DENY: number; ESCALATE: number };
  risk_breakdown: { Low: number; Medium: number; High: number; Critical: number };
}

interface AuditEntry {
  id: string;
  timestamp: string;
  agent_id: string;
  action_type: string;
  policy_rule: string | null;
  policy_desc: string | null;
  risk_level: string;
  outcome: string;
}

// polls the api every few seconds for live-ish data. not true realtime (that
// would be the websocket in App.tsx) but good enough as a fallback
export function useLiveDashboard(pollInterval = 5000) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const [s, audit] = await Promise.all([
          api.getDashboardStats(),
          api.getAuditLog(10),
        ]);
        if (!mounted) return;
        setStats(s);
        setRecentActivity(audit);
        setError(null);
      } catch (e: any) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    const timer = setInterval(fetchData, pollInterval);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [pollInterval]);

  // console.log("dash poll", stats) // noisy, keep commented
  return { stats, recentActivity, loading, error };
}

// export the types so App.tsx can use them if needed
export type { DashboardStats, AuditEntry };
