import { useState, useEffect } from "react";
import * as api from "../../api/client";

// simple types matching what the api returns
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

// hook that polls the api every few seconds for live-ish data
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

  return { stats, recentActivity, loading, error };
}

// export the types so App.tsx can use them if needed
export type { DashboardStats, AuditEntry };
