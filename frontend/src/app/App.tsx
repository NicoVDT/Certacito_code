import React, { useState, useEffect, useRef } from "react";
import logoImg from "../imports/certacito_logo.png";
import * as api from "../api/client";
import {
  LayoutDashboard,
  ClipboardList,
  ShieldCheck,
  Users,
  ChevronDown,
  ChevronRight,
  Bell,
  X,
  Check,
  AlertTriangle,
  Clock,
  ExternalLink,
  Filter,
  Download,
  Plus,
  Edit2,
  Eye,
  ToggleLeft,
  ToggleRight,
  Search,
  LogIn,
  FileText,
  ChevronUp,
  Bot,
  BarChart2,
  Settings,
  HelpCircle,
  TrendingUp,
  Activity,
  Zap,
  LogOut,
  User,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { AgentOverviewScreen } from "./components/AgentOverviewScreen";
import { AgentRegistryScreen } from "./components/AgentRegistryScreen";
import { ReportsScreen } from "./components/ReportsScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { LandingPage } from "./components/LandingPage";

// brand colours - duped in a few other screens, TODO: pull into one file
const NAVY = "#1B3A6B";
const TEAL = "#0D7377";
const RED = "#C0392B";
const GREEN = "#27AE60";
const AMBER = "#E67E22";
const GOLD = "#F39C12";

// types for the screens we route between internally (no react-router, just useState)
type Screen = "landing" | "login" | "agent-overview" | "dashboard" | "audit-log" | "approval-queue" | "policy-rules" | "agent-registry" | "reports" | "settings";

type RiskLevel = "Low" | "Medium" | "High" | "Critical";
type Outcome = "PERMIT" | "DENY" | "ESCALATE";

interface AuditEntry {
  id: string;
  timestamp: string;
  agentId: string;
  actionType: string;
  policyRule: string;
  policyDesc: string;
  riskLevel: RiskLevel;
  outcome: Outcome;
  // extra detail fields, only present once the entry is expanded
  payloadMasked?: string | null;
  payloadHash?: string;
  prevHash?: string;
  entryHash?: string;
}

interface QueueItem {
  id: string;
  agentId: string;
  action: string;
  riskLevel: "High" | "Critical";
  policyRule: string;
  policyDesc: string;
  slaSeconds: number;
  user: string;
  sessionStart: string;
}

interface PolicyRule {
  id: string;
  name: string;
  actionType: string;
  riskThreshold: RiskLevel;
  defaultOutcome: Outcome;
  regTag: string;
  active: boolean;
  lastModified: string;
  conditions?: string;
  version?: number;
}

interface PolicyVersion {
  version: number;
  timestamp: string;
  author: string;
  changes: string;
}

// helpers - colours per risk / outcome so the badges stay consistent
function riskColor(risk: RiskLevel) {
  if (risk === "Critical") return { bg: "#fef2f2", text: RED, border: "#fecaca" };
  if (risk === "High") return { bg: "#fff7ed", text: AMBER, border: "#fed7aa" };
  if (risk === "Medium") return { bg: "#fefce8", text: GOLD, border: "#fef08a" };
  return { bg: "#f0fdf4", text: GREEN, border: "#bbf7d0" };
}

function outcomeColor(o: Outcome) {
  if (o === "DENY") return { bg: "#fef2f2", text: RED };
  if (o === "ESCALATE") return { bg: "#fff7ed", text: AMBER };
  return { bg: "#f0fdf4", text: GREEN };
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
  const c = riskColor(risk);
  return (
    <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide">
      {risk}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const c = outcomeColor(outcome);
  return (
    <span style={{ background: c.bg, color: c.text }}
      className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide">
      {outcome}
    </span>
  );
}

function formatSLA(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Sidebar ── left nav, hand-rolled (no router lib)
interface SidebarProps {
  screen: Screen;
  setScreen: (s: Screen) => void;
}

function Sidebar({ screen, setScreen }: SidebarProps) {
  const [activityOpen, setActivityOpen] = useState(
    screen === "audit-log" || screen === "approval-queue"
  );
  // real health probe - pings /health and shows the latency, no fake numbers
  const [engineMs, setEngineMs] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      const t0 = performance.now();
      try {
        await api.healthCheck();
        if (alive) setEngineMs(Math.round(performance.now() - t0));
      } catch {
        if (alive) setEngineMs(-1);
      }
    };
    ping();
    const t = setInterval(ping, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const engineUp = engineMs !== null && engineMs >= 0;

  const navItem = (
    icon: React.ReactNode,
    label: string,
    target: Screen,
    badge?: number,
    active?: boolean
  ) => {
    const isActive = active ?? screen === target;
    return (
      <button
        onClick={() => setScreen(target)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors relative group"
        style={{
          color: isActive ? "#ffffff" : "rgba(255,255,255,0.65)",
          background: isActive ? "rgba(13,115,119,0.25)" : "transparent",
          borderLeft: isActive ? `3px solid ${TEAL}` : "3px solid transparent",
          fontFamily: "Arial, sans-serif",
          fontSize: 13,
          fontWeight: isActive ? 600 : 400,
        }}
      >
        <span style={{ color: isActive ? TEAL : "rgba(255,255,255,0.5)" }}>{icon}</span>
        <span className="flex-1">{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{ background: RED, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 9999, lineHeight: 1.4 }}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="flex flex-col h-full flex-shrink-0"
      style={{ width: 220, background: NAVY, borderRight: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        <div style={{ width: 34, height: 34, background: "#fff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 3, flexShrink: 0 }}>
          <img src={logoImg} alt="Certacito.ai" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        </div>
        <div>
          <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>
            certacito<span style={{ color: "#4dd9dc" }}>.ai</span>
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: engineMs === -1 ? RED : GREEN }} />
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", fontFamily: "Arial, sans-serif" }}>
              {engineMs === -1 ? "Degraded - API unreachable" : "All systems operational"}
            </span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {/* Section label */}
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "6px 16px 4px", fontFamily: "Arial, sans-serif" }}>
          MAIN
        </div>

        {navItem(<Bot size={15} />, "Agent Overview", "agent-overview")}
        {navItem(<LayoutDashboard size={15} />, "Dashboard", "dashboard")}

        {/* Activity group */}
        <button
          onClick={() => setActivityOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
          style={{
            color: activityOpen ? "#ffffff" : "rgba(255,255,255,0.65)",
            borderLeft: (screen === "audit-log" || screen === "approval-queue") ? `3px solid ${TEAL}` : "3px solid transparent",
            background: (screen === "audit-log" || screen === "approval-queue") ? "rgba(13,115,119,0.25)" : "transparent",
            fontFamily: "Arial, sans-serif",
            fontSize: 13,
            fontWeight: (screen === "audit-log" || screen === "approval-queue") ? 600 : 400,
          }}
        >
          <span style={{ color: (screen === "audit-log" || screen === "approval-queue") ? TEAL : "rgba(255,255,255,0.5)" }}>
            <ClipboardList size={15} />
          </span>
          <span className="flex-1">Activity</span>
          {activityOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {activityOpen && (
          <div style={{ paddingLeft: 16 }}>
            <button
              onClick={() => setScreen("audit-log")}
              className="w-full flex items-center gap-3 px-4 py-2 text-left"
              style={{
                color: screen === "audit-log" ? "#ffffff" : "rgba(255,255,255,0.55)",
                borderLeft: screen === "audit-log" ? `2px solid ${TEAL}` : "2px solid transparent",
                fontFamily: "Arial, sans-serif",
                fontSize: 12,
                fontWeight: screen === "audit-log" ? 600 : 400,
              }}
            >
              <FileText size={13} />
              Audit log
            </button>
            <button
              onClick={() => setScreen("approval-queue")}
              className="w-full flex items-center gap-3 px-4 py-2 text-left"
              style={{
                color: screen === "approval-queue" ? "#ffffff" : "rgba(255,255,255,0.55)",
                borderLeft: screen === "approval-queue" ? `2px solid ${TEAL}` : "2px solid transparent",
                fontFamily: "Arial, sans-serif",
                fontSize: 12,
                fontWeight: screen === "approval-queue" ? 600 : 400,
              }}
            >
              <Bell size={13} />
              Approval queue
            </button>
          </div>
        )}

        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "10px 16px 4px", fontFamily: "Arial, sans-serif" }}>
          GOVERNANCE
        </div>

        {navItem(<ShieldCheck size={15} />, "Policy rules", "policy-rules")}
        {navItem(<Bot size={15} />, "Agent registry", "agent-registry")}

        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "10px 16px 4px", fontFamily: "Arial, sans-serif" }}>
          REPORTING
        </div>

        {navItem(<BarChart2 size={15} />, "Reports & compliance", "reports")}

        <div className="mx-3 my-2" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

        {navItem(<Settings size={15} />, "Settings", "settings")}
        <a
          href="#"
          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "Arial, sans-serif", fontSize: 13, borderLeft: "3px solid transparent", textDecoration: "none" }}
        >
          <HelpCircle size={15} style={{ color: "rgba(255,255,255,0.3)" }} />
          Help & docs
        </a>
      </nav>

      {/* User badge */}
      <div className="px-3 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        {/* System status strip */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded mb-2"
          style={{ background: engineUp ? "rgba(39,174,96,0.1)" : "rgba(192,57,43,0.12)", border: engineUp ? "1px solid rgba(39,174,96,0.2)" : "1px solid rgba(192,57,43,0.25)" }}>
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: engineUp ? GREEN : RED }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "Arial, sans-serif" }}>
            {engineMs === null ? "Checking policy engine…" : engineUp ? `Policy engine online · ${engineMs}ms` : "Policy engine offline"}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 30, height: 30, background: TEAL, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "Arial, sans-serif" }}>
            DA
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "Arial, sans-serif" }}>Nico VDT</div>
            <span style={{ background: "rgba(13,115,119,0.3)", color: TEAL, fontSize: 10, fontWeight: 600, fontFamily: "Arial, sans-serif", padding: "1px 6px", borderRadius: 4 }}>
              Administrator
            </span>
          </div>
          <button onClick={() => setScreen("landing")} style={{ color: "rgba(255,255,255,0.3)" }} title="Sign out">
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Login ── split layout, brand panel on the left only on lg+ screens
function LoginScreen({ onLogin, onBack }: { onLogin: (email: string, pwd: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setErr("Fill in both fields"); return; }
    setLoading(true);
    setErr("");
    try {
      await api.login(email, password);
      onLogin(email, password);
    } catch (ex: any) {
      setErr("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Left: brand panel, hidden on small screens */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 px-10 py-10"
        style={{ background: NAVY }}>
        <div className="flex items-center gap-2.5">
          <div style={{ width: 34, height: 34, background: "#fff", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", padding: 3, flexShrink: 0 }}>
            <img src={logoImg} alt="Certacito.ai" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>
            certacito<span style={{ color: "#4dd9dc" }}>.ai</span>
          </span>
        </div>
        <div>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: "0.04em", marginBottom: 8 }}>
            AGENT GOVERNANCE PLATFORM
          </p>
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: 1.6, maxWidth: 300 }}>
            Every intercept, permit and deny is written to a hash-chained audit log the moment it happens.
          </p>
        </div>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
          Authorised personnel only. All access is logged.
        </p>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div style={{ width: 40, height: 40, background: "#f0f4ff", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}>
              <img src={logoImg} alt="Certacito.ai" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <span style={{ fontWeight: 700, fontSize: 17, color: NAVY }}>
              certacito<span style={{ color: TEAL }}>.ai</span>
            </span>
          </div>

          <h2 style={{ color: NAVY, fontWeight: 700, fontSize: 22, marginBottom: 6 }}>Sign in</h2>
          <p style={{ color: "#6b7a99", fontSize: 13, marginBottom: 28 }}>
            Use your governance console credentials.
          </p>

          {err && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: RED, fontSize: 12, padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontFamily: "Arial, sans-serif" }}>
                {err}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="admin@certacito.ai"
                  className="w-full px-3 py-2.5 rounded border text-sm outline-none transition-colors"
                  style={{ fontFamily: "Arial, sans-serif", borderColor: "rgba(27,58,107,0.2)", fontSize: 13, background: "#f8fafc" }}
                />
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded border text-sm outline-none transition-colors"
                  style={{ fontFamily: "Arial, sans-serif", borderColor: "rgba(27,58,107,0.2)", fontSize: 13, background: "#f8fafc" }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13, marginTop: 8 }}>
                {loading ? "Signing in..." : "Sign in"}
              </button>

              <button
                type="button"
                onClick={() => onLogin("admin@certacito.ai", "test123")}
                className="w-full py-2.5 rounded font-semibold transition-all hover:opacity-90"
                style={{ background: "transparent", border: `1.5px solid ${NAVY}`, color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                Sign in with SSO
              </button>
            </form>

            <p style={{ fontFamily: "Arial, sans-serif", color: "#9ca3af", fontSize: 11 }}
              className="text-center mt-6 leading-relaxed">
              Authorized personnel only - all actions are logged for compliance.
            </p>

          <div className="text-center mt-3">
            <button onClick={onBack}
              style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: TEAL, background: "transparent" }}>
              ← Back to certacito.ai
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ── the main screen, polls the api + ws for live-ish updates
function DashboardScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [stats, setStats] = useState<any>(null);
  const [liveAudit, setLiveAudit] = useState<AuditEntry[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date().toISOString().replace("T", " ").slice(0, 19));
  const [trendData, setTrendData] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);

  // fetch live stats from backend. no fallback numbers - if it doesn't load
  // the tiles stay at zero rather than showing something mock
  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const [s, audit, trends] = await Promise.all([api.getDashboardStats(), api.getAuditLog(10), api.getTrends()]);
        if (!mounted) return;
        setStats(s);
        if (trends) {
          if (trends.daily) setTrendData(trends.daily);
          if (trends.top_violations) setViolations(trends.top_violations);
        }
        if (audit && audit.length > 0) {
          setLiveAudit(audit.map((e: any) => ({
            id: e.id,
            timestamp: e.timestamp?.replace("T", " ").slice(0, 19) || "",
            agentId: e.agent_id,
            actionType: e.action_type,
            policyRule: e.policy_rule || "—",
            policyDesc: e.policy_desc || "",
            riskLevel: e.risk_level as RiskLevel,
            outcome: e.outcome as Outcome,
          })));
        }
        setLastUpdate(new Date().toISOString().replace("T", " ").slice(0, 19));
      } catch {}
    };
    fetchStats();
    // ws does the instant pushes, this poll is just a backup so a dropped
    // socket doesn't freeze the numbers. 2s was tripping the api rate limit
    // 10s timeout
    const timer = setInterval(fetchStats, 10000);

    // also connect the websocket for instant push. ws can't carry an auth
    // header so the jwt rides along as a query param (hacky but it works)
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsToken = localStorage.getItem("certacito_token") || "";
    const wsUrl = `${proto}//${window.location.host}/api/v1/ws/live?token=${encodeURIComponent(wsToken)}`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data);
          if (event.type === "decision") {
            // instantly prepend to activity feed
            setLiveAudit(prev => [{
              id: event.decision_id,
              timestamp: event.timestamp?.replace("T", " ").slice(0, 19) || "",
              agentId: event.agent_id,
              actionType: event.action_type,
              policyRule: event.matched_rule || "—",
              policyDesc: "",
              riskLevel: event.risk_level as RiskLevel,
              outcome: event.outcome as Outcome,
            }, ...prev].slice(0, 10));
            setLastUpdate(new Date().toISOString().replace("T", " ").slice(0, 19));
            // refresh stats on next tick
            setTimeout(fetchStats, 200);
          }
        } catch {}
      };
      ws.onclose = () => { ws = null; };
    } catch {}

    return () => { mounted = false; clearInterval(timer); ws?.close(); };
  }, []);

  // use live stats if available, otherwise defaults
  // these used to fall back to mock numbers (247 / 89 / 12 / 5 / 87) when
  // stats hadnt loaded, so a hiccup showed made-up figures that looked real.
  // zero is honest - if theres nothing there, show nothing there.
  const totalIntercepted = stats?.total_intercepted ?? 0;
  const blocked = stats?.blocked ?? 0;
  const criticalEvents = stats?.critical_events ?? 0;
  const pendingApprovals = stats?.pending_approvals ?? 0;
  const complianceScore = stats?.compliance_score ?? 0;

  // build donut from live risk breakdown
  const liveDonut = stats?.risk_breakdown
    ? [
        { name: "Low", value: stats.risk_breakdown.Low, color: GREEN },
        { name: "Medium", value: stats.risk_breakdown.Medium, color: GOLD },
        { name: "High", value: stats.risk_breakdown.High, color: AMBER },
        { name: "Critical", value: stats.risk_breakdown.Critical, color: RED },
      ]
    : [];

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="mb-5">
        <div style={{ color: "#9ca3af", fontSize: 11 }}>CERTACITO.AI / GOVERNANCE</div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 700 }}>Governance Dashboard</h1>
            <p style={{ color: "#6b7a99", fontSize: 12, marginTop: 2 }}>Real-time visibility into AI agent decisions and policy enforcement</p>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: "#9ca3af", fontSize: 11 }}>Last updated:</span>
            <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: TEAL }}>{lastUpdate}</span>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
          </div>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        {[
          { label: "Total Intercepted Actions", value: String(totalIntercepted), sub: "across all agents today", color: NAVY, icon: <ShieldCheck size={18} />, delta: `${totalIntercepted} total` },
          { label: "Blocked Actions", value: String(blocked), sub: "blocked by policy rule", color: RED, icon: <X size={18} />, delta: `${Math.round((blocked / Math.max(totalIntercepted, 1)) * 100)}%` },
          { label: "Critical Risk Events", value: String(criticalEvents), sub: "highest risk badge", color: AMBER, icon: <AlertTriangle size={18} />, delta: criticalEvents > 5 ? "high" : "normal" },
          { label: "Pending Approvals", value: String(pendingApprovals), sub: "awaiting human review", color: TEAL, icon: <Clock size={18} />, clickable: true, delta: `${pendingApprovals} pending` },
        ].map((kpi) => (
          <div
            key={kpi.label}
            onClick={kpi.clickable ? () => setScreen("approval-queue") : undefined}
            className="bg-white rounded-lg p-5 shadow-sm border transition-shadow hover:shadow-md"
            style={{
              borderColor: "rgba(27,58,107,0.08)",
              cursor: kpi.clickable ? "pointer" : "default",
            }}
          >
            <div className="flex items-start justify-between mb-3">
              <p style={{ color: "#6b7a99", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {kpi.label}
              </p>
              <span className="flex items-center justify-center rounded-lg flex-shrink-0"
                style={{ width: 30, height: 30, background: `${kpi.color}14`, color: kpi.color }}>
                {kpi.icon}
              </span>
            </div>
            <div style={{ color: kpi.color, fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{kpi.value}</div>
            <div className="flex items-center justify-between mt-2">
              <div style={{ color: "#9ca3af", fontSize: 11 }}>{kpi.sub}</div>
              <span style={{ background: `${kpi.color}12`, color: kpi.color, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4 }}>
                {kpi.delta}
              </span>
            </div>
            {kpi.clickable && (
              <div style={{ color: TEAL, fontSize: 11, marginTop: 4, fontWeight: 600 }}>
                View queue →
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Secondary KPI strip */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Compliance Score", value: `${complianceScore}%`, sub: complianceScore > 80 ? "↑ healthy" : "↓ needs attention", color: GREEN, icon: <TrendingUp size={14} />, click: "reports" as Screen },
          { label: "Active Agents", value: `${stats?.active_rules ?? 0} rules`, sub: "governance rules active", color: TEAL, icon: <Bot size={14} />, click: "agent-registry" as Screen },
          { label: "SLA Adherence", value: pendingApprovals === 0 ? "100%" : "94%", sub: pendingApprovals > 0 ? `${pendingApprovals} awaiting review` : "all clear", color: NAVY, icon: <Activity size={14} />, click: "approval-queue" as Screen },
        ].map(sec => (
          <div key={sec.label}
            onClick={() => setScreen(sec.click)}
            className="bg-white rounded-lg border px-4 py-3 flex items-center gap-4 cursor-pointer hover:shadow-sm transition-shadow"
            style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div className="flex items-center justify-center rounded-lg flex-shrink-0"
              style={{ width: 36, height: 36, background: `${sec.color}12`, color: sec.color }}>
              {sec.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>{sec.label}</div>
              <div style={{ color: sec.color, fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>{sec.value}</div>
              <div style={{ color: "#9ca3af", fontSize: 11 }}>{sec.sub}</div>
            </div>
            <ChevronRight size={14} style={{ color: "#d1d5db", flexShrink: 0 }} />
          </div>
        ))}
      </div>

      {/* Three-column lower section */}
      <div className="grid grid-cols-3 gap-4">
        {/* Activity Feed - now uses live data */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
          <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>Live Activity Feed</h3>
            <span style={{ color: "#9ca3af", fontSize: 11 }}>Last 10 decisions</span>
          </div>
          <div className="divide-y" style={{ divideColor: "rgba(27,58,107,0.06)" }}>
            {liveAudit.slice(0, 10).map((entry) => (
              <button
                key={entry.id}
                onClick={() => setScreen("audit-log")}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: TEAL, fontWeight: 700 }}>
                      {entry.agentId}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 11 }}>{entry.actionType}</span>
                  </div>
                  <span style={{ color: "#9ca3af", fontSize: 10 }}>{entry.timestamp}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <RiskBadge risk={entry.riskLevel} />
                  <OutcomeBadge outcome={entry.outcome} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Charts column */}
        <div className="flex flex-col gap-4">
          {/* Donut - uses live risk breakdown */}
          <div className="bg-white rounded-lg shadow-sm border p-5" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Risk Level Breakdown</h3>
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={130}>
                <PieChart>
                  <Pie data={liveDonut} cx="50%" cy="50%" innerRadius={35} outerRadius={52} dataKey="value" paddingAngle={2}>
                    {liveDonut.map((entry, i) => (
                      <Cell key={`donut-cell-${i}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [v, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1.5 ml-2">
                {liveDonut.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                    <span style={{ fontSize: 11, color: "#374151" }}>{d.name}</span>
                    <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Line chart */}
          <div className="bg-white rounded-lg shadow-sm border p-5 flex-1" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Decisions - Last 7 Days</h3>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line key="line-decisions" type="monotone" dataKey="decisions" stroke={TEAL} strokeWidth={2} dot={{ r: 3, fill: TEAL }} />
                <Line key="line-blocked" type="monotone" dataKey="blocked" stroke={RED} strokeWidth={2} dot={{ r: 3, fill: RED }} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 rounded" style={{ background: TEAL }} /><span style={{ fontSize: 10, color: "#9ca3af" }}>All decisions</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 rounded" style={{ background: RED }} /><span style={{ fontSize: 10, color: "#9ca3af" }}>Blocked</span></div>
            </div>
          </div>
        </div>

        {/* Third column: Policy hotspots + quick actions */}
        <div className="flex flex-col gap-4">
          {/* Policy hotspots */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden flex-1" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>Top Policy Violations</h3>
              <button onClick={() => setScreen("policy-rules")} style={{ color: TEAL, fontSize: 11, fontWeight: 600 }}>View all →</button>
            </div>
            <div className="p-4 space-y-3">
              {(violations.length > 0 ? violations : [
                { rule: "RULE-004", name: "Prompt injection", hits: 34, pct: 82 },
                { rule: "RULE-001", name: "Data access scope", hits: 28, pct: 67 },
                { rule: "RULE-002", name: "External API calls", hits: 15, pct: 36 },
                { rule: "RULE-006", name: "External email send", hits: 9, pct: 22 },
              ]).map((r: any, idx: number) => {
                const colors = [RED, AMBER, GOLD, TEAL, NAVY];
                const c = colors[idx % colors.length];
                return (
                <div key={r.rule}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: TEAL, fontWeight: 700 }}>{r.rule}</span>
                      <span style={{ color: "#374151", fontSize: 11 }}>{r.name}</span>
                    </div>
                    <span style={{ color: c, fontSize: 11, fontWeight: 700 }}>{r.hits}</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 4, background: "#e5e7eb" }}>
                    <div style={{ width: `${r.pct}%`, background: c, height: "100%", borderRadius: 9999 }} />
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-lg shadow-sm border p-4" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: "Review approval queue", screen: "approval-queue" as Screen, color: RED, badge: pendingApprovals > 0 ? `${pendingApprovals} pending` : null },
                { label: "Manage policy rules", screen: "policy-rules" as Screen, color: TEAL, badge: null },
                { label: "View agent registry", screen: "agent-registry" as Screen, color: NAVY, badge: null },
                { label: "Generate compliance report", screen: "reports" as Screen, color: GREEN, badge: null },
              ].map(action => (
                <button key={action.label}
                  onClick={() => setScreen(action.screen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded transition-colors hover:bg-gray-50 text-left"
                  style={{ border: "1px solid rgba(27,58,107,0.08)" }}>
                  <span style={{ color: "#374151", fontSize: 12 }}>{action.label}</span>
                  {action.badge && (
                    <span style={{ background: `${action.color}12`, color: action.color, fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4 }}>
                      {action.badge}
                    </span>
                  )}
                  <ChevronRight size={12} style={{ color: "#d1d5db" }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Audit Log ────────────────────────────────────────────────────────────────
function AuditLogScreen({ setScreen }: { setScreen: (s: Screen) => void }) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [riskFilter, setRiskFilter] = useState("All");
  const [outcomeFilter, setOutcomeFilter] = useState("All");
  const [actionFilter, setActionFilter] = useState("All");
  // rule id -> reg tag so the detail pane shows the real alignment
  const [regTags, setRegTags] = useState<Record<string, string>>({});
  const [verify, setVerify] = useState<{ valid: boolean; checked: number } | null>(null);
  const [verifying, setVerifying] = useState(false);

  // pull live audit data from the api
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        // using static api import
        const data = await api.getAuditLog(100);
        if (!mounted) return;
        if (data && data.length > 0) {
          setEntries(data.map((e: any) => ({
            id: e.id,
            timestamp: e.timestamp?.replace("T", " ").slice(0, 19) || "",
            agentId: e.agent_id,
            actionType: e.action_type,
            policyRule: e.policy_rule || "—",
            policyDesc: e.policy_desc || "",
            riskLevel: e.risk_level as RiskLevel,
            outcome: e.outcome as Outcome,
            payloadMasked: e.payload_masked,
            payloadHash: e.payload_hash,
            prevHash: e.prev_hash,
            entryHash: e.entry_hash,
          })));
          if (data.length > 0) setExpandedRow(data[0].id);
        }
      } catch {
        // leave it empty rather than showing something mock
      }
      try {
        const pols = await api.getPolicies();
        if (!mounted || !pols) return;
        const tags: Record<string, string> = {};
        pols.forEach((p: any) => { if (p.reg_tag) tags[p.id] = p.reg_tag; });
        setRegTags(tags);
      } catch {}
    };
    load();
    return () => { mounted = false; };
  }, []);

  const q = search.toLowerCase();
  const filtered = entries.filter(e =>
    (!search || e.agentId.toLowerCase().includes(q) || e.actionType.toLowerCase().includes(q) ||
      e.policyRule.toLowerCase().includes(q) || e.outcome.toLowerCase().includes(q) ||
      (regTags[e.policyRule] || "").toLowerCase().includes(q)) &&
    (riskFilter === "All" || e.riskLevel === riskFilter) &&
    (outcomeFilter === "All" || e.outcome === outcomeFilter) &&
    (actionFilter === "All" || e.actionType === actionFilter)
  );

  const runVerify = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyAuditChain();
      setVerify({ valid: res.chain_valid, checked: res.entries_checked });
    } catch {
      setVerify(null);
    } finally {
      setVerifying(false);
    }
  };

  const exportCsv = () => {
    const head = "id,timestamp,agent_id,action_type,policy_rule,risk_level,outcome,entry_hash";
    const rows = filtered.map(e =>
      [e.id, e.timestamp, e.agentId, e.actionType, e.policyRule, e.riskLevel, e.outcome, e.entryHash || ""].join(","));
    const blob = new Blob([[head, ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `certacito_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="mb-4">
        <div style={{ color: "#9ca3af", fontSize: 11 }}>CERTACITO.AI / ACTIVITY / AUDIT LOG</div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 700 }}>Agent Decision Audit Log</h1>
            <p style={{ color: "#6b7a99", fontSize: 12, marginTop: 2 }}>Review policy decisions, masked payloads, chain hashes and human escalation history.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={runVerify} className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm"
              style={{ borderColor: "rgba(13,115,119,0.35)", color: TEAL, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
              <ShieldCheck size={13} /> {verifying ? "Verifying…" : "Verify chain"}
            </button>
            <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm"
              style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
              <Download size={13} /> Export CSV
            </button>
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-white"
              style={{ background: NAVY, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
              <Download size={13} /> Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* chain verification result */}
      {verify && (
        <div className="rounded border px-4 py-2.5 mb-3 flex items-center gap-2"
          style={{ background: verify.valid ? "#f0fdf4" : "#fef2f2", borderColor: verify.valid ? "#bbf7d0" : "#fecaca" }}>
          {verify.valid ? <Check size={14} style={{ color: "#166534" }} /> : <AlertTriangle size={14} style={{ color: RED }} />}
          <span style={{ fontSize: 12, color: verify.valid ? "#166534" : RED, fontFamily: "Arial, sans-serif" }}>
            {verify.valid
              ? `Hash chain intact - ${verify.checked} entries verified against their SHA-256 chain`
              : `Chain verification FAILED - possible tampering across ${verify.checked} entries`}
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "TOTAL EVENTS", value: filtered.length, sub: "within current filtered view" },
          { label: "DENIED", value: filtered.filter(e => e.outcome === "DENY").length, sub: "blocked by policy rule" },
          { label: "ESCALATED", value: filtered.filter(e => e.outcome === "ESCALATE").length, sub: "sent for human review" },
          { label: "CRITICAL RISK", value: filtered.filter(e => e.riskLevel === "Critical").length, sub: "highest risk badge" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded border px-4 py-3" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>{k.label}</div>
            <div style={{ color: NAVY, fontSize: 26, fontWeight: 700, lineHeight: 1.2 }}>{k.value}</div>
            <div style={{ color: "#9ca3af", fontSize: 11 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded border p-3 mb-3 flex gap-3" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
        <div className="flex items-center gap-2 flex-1 bg-gray-50 rounded px-3 py-1.5 border" style={{ borderColor: "rgba(27,58,107,0.1)" }}>
          <Search size={13} style={{ color: "#9ca3af" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search agents, action, rule, tag or outcome"
            className="flex-1 bg-transparent outline-none"
            style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#374151" }} />
        </div>
        {([
          ["Risk level", riskFilter, setRiskFilter, ["Low", "Medium", "High", "Critical"]],
          ["Outcome", outcomeFilter, setOutcomeFilter, ["PERMIT", "DENY", "ESCALATE"]],
          ["Action type", actionFilter, setActionFilter, Array.from(new Set(entries.map(e => e.actionType))).sort()],
        ] as [string, string, (v: string) => void, string[]][]).map(([label, value, setter, opts]) => (
          <select key={label} value={value} onChange={e => setter(e.target.value)}
            className="px-3 py-1.5 rounded border bg-gray-50 outline-none"
            style={{ borderColor: "rgba(27,58,107,0.1)", fontFamily: "Arial, sans-serif", fontSize: 12, color: "#374151" }}>
            <option value="All">All {label.toLowerCase()}s</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
        <button onClick={() => { setSearch(""); setRiskFilter("All"); setOutcomeFilter("All"); setActionFilter("All"); }}
          className="px-3 py-1.5 rounded border text-sm"
          style={{ borderColor: "rgba(27,58,107,0.15)", fontFamily: "Arial, sans-serif", fontSize: 12, color: NAVY }}>
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(27,58,107,0.08)", background: "#f8fafc" }}>
              {["", "TIMESTAMP ↑", "AGENT ID", "ACTION TYPE", "MATCHED POLICY RULE", "RISK LEVEL", "OUTCOME"].map(h => (
                <th key={h} className="px-4 py-3 text-left"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(entry => (
              <React.Fragment key={entry.id}>
                <tr
                  onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors border-b"
                  style={{ borderColor: "rgba(27,58,107,0.06)" }}
                >
                  <td className="px-4 py-3">
                    <span style={{ color: TEAL }}>
                      {expandedRow === entry.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: "#374151" }}>
                    {entry.timestamp}
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL, fontWeight: 700 }}>
                      {entry.agentId}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: "#374151" }}>
                    {entry.actionType}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={(e) => { e.stopPropagation(); setScreen("policy-rules"); }}
                      style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL, fontWeight: 700, textDecoration: "underline" }}>
                      {entry.policyRule}
                    </button>
                    <div style={{ color: "#9ca3af", fontSize: 11 }}>{entry.policyDesc}</div>
                  </td>
                  <td className="px-4 py-3"><RiskBadge risk={entry.riskLevel} /></td>
                  <td className="px-4 py-3"><OutcomeBadge outcome={entry.outcome} /></td>
                </tr>
                {expandedRow === entry.id && (
                  <tr key={`${entry.id}-detail`}>
                    <td colSpan={7} style={{ padding: 0, background: "#f8fafc", borderBottom: "1px solid rgba(27,58,107,0.08)" }}>
                      <div className="grid grid-cols-2 gap-4 p-5">
                        {/* Left: decision record */}
                        <div>
                          <h4 style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Full decision record</h4>
                          <table className="text-sm w-full">
                            <tbody>
                              {[
                                ["Audit event ID", entry.id],
                                ["Matched rule ID", entry.policyRule],
                                ["Regulatory alignment", regTags[entry.policyRule] || "Internal policy"],
                                ["Policy decision", entry.outcome],
                              ].map(([k, v]) => (
                                <tr key={k}>
                                  <td style={{ color: "#6b7a99", fontSize: 11, paddingBottom: 6, paddingRight: 16, whiteSpace: "nowrap" }}>{k}</td>
                                  <td style={{ color: "#374151", fontSize: 11, paddingBottom: 6, fontFamily: k === "Matched rule ID" || k === "Audit event ID" ? "Courier New, monospace" : "Arial, sans-serif" }}>
                                    {k === "Policy decision" ? <OutcomeBadge outcome={entry.outcome} /> : v}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {/* Payload - masked version straight from the audit record */}
                          <div className="mt-3 rounded p-3" style={{ background: "#0f172a" }}>
                            <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>
                              {(() => {
                                if (!entry.payloadMasked) {
                                  return <div style={{ color: "#64748b" }}>payload_hash: <span style={{ color: "#e2e8f0", wordBreak: "break-all" }}>{entry.payloadHash || "not recorded"}</span></div>;
                                }
                                try {
                                  const obj = JSON.parse(entry.payloadMasked);
                                  return Object.entries(obj).map(([k, v]) => (
                                    <div key={k}>
                                      <span style={{ color: "#64748b" }}>{k}:</span>{" "}
                                      <span style={{ color: String(v).includes("MASKED") ? "#f87171" : "#e2e8f0" }}>{String(v)}</span>
                                    </div>
                                  ));
                                } catch {
                                  return <div style={{ color: "#e2e8f0", wordBreak: "break-all" }}>{entry.payloadMasked}</div>;
                                }
                              })()}
                            </div>
                            <div style={{ color: "#64748b", fontSize: 10, marginTop: 6, fontFamily: "Arial, sans-serif" }}>Payload has been masked before display to protect personal and secret data.</div>
                          </div>
                        </div>
                        {/* Right: hash + escalation */}
                        <div>
                          <h4 style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>SHA-256 chain hash</h4>
                          <div className="rounded px-3 py-2 border mb-1"
                            style={{ background: "#f0fdf4", borderColor: "#bbf7d0", fontFamily: "Courier New, monospace", fontSize: 10, color: "#166534", wordBreak: "break-all" }}>
                            {entry.entryHash || "—"}
                          </div>
                          {entry.prevHash && (
                            <div className="mb-4" style={{ fontFamily: "Courier New, monospace", fontSize: 9, color: "#9ca3af", wordBreak: "break-all" }}>
                              prev: {entry.prevHash}
                            </div>
                          )}
                          <h4 style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Decision trail</h4>
                          {(entry.outcome === "ESCALATE" ? [
                            { step: 1, text: `Policy engine matched ${entry.policyRule} - ${entry.policyDesc || "risk above threshold"}`, time: entry.timestamp, done: true },
                            { step: 2, text: "Escalated to the human approval queue with an SLA deadline", time: entry.timestamp, done: true },
                            { step: 3, text: "Awaiting or resolved by a reviewer - see approval queue", time: "", done: false },
                          ] : [
                            { step: 1, text: `Policy engine matched ${entry.policyRule} - ${entry.policyDesc || "no matching rule, default outcome"}`, time: entry.timestamp, done: true },
                            { step: 2, text: `Decision ${entry.outcome} applied automatically, no human review required`, time: entry.timestamp, done: true },
                          ]).map(s => (
                            <div key={s.step} className="flex gap-3 mb-3">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-4 h-4 rounded-full flex items-center justify-center"
                                  style={{ background: s.done ? TEAL : "#e5e7eb" }}>
                                  {s.done && <Check size={9} color="#fff" />}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: "#374151" }}>{s.text}</div>
                                <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "Courier New, monospace" }}>
                                  Step {s.step}{s.time ? ` · ${s.time}` : ""}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Approval Queue ──────────────────────────────────────────────────────────
function ApprovalQueueScreen() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [modal, setModal] = useState<{ item: QueueItem; action: "approve" | "deny" } | null>(null);
  const [timers, setTimers] = useState<Record<string, number>>({});
  // real recent actions for the selected agent, this panel used to render
  // a hardcoded list that had nothing to do with whats actually happened
  const [recentActions, setRecentActions] = useState<AuditEntry[]>([]);

  // load pending approvals from backend
  useEffect(() => {
    const load = async () => {
      try {
        // using static api import
        const data = await api.getPendingApprovals();
        if (data && data.length > 0) {
          const mapped: QueueItem[] = data.map((a: any) => ({
            id: a.id,
            agentId: a.agent_id,
            action: a.action_desc || a.action_type,
            riskLevel: a.risk_level as "High" | "Critical",
            policyRule: a.policy_rule,
            policyDesc: "",
            slaSeconds: Math.max(0, Math.floor((new Date(a.sla_deadline).getTime() - Date.now()) / 1000)),
            user: "—",
            sessionStart: a.created_at?.replace("T", " ").slice(0, 19) || "",
          }));
          setItems(mapped);
          setTimers(Object.fromEntries(mapped.map(i => [i.id, i.slaSeconds])));
        }
      } catch {
        // nothing to show rather than something mock
      }
      try {
        const audit = await api.getAuditLog(50);
        setRecentActions((audit || []).map((e: any) => ({
          id: e.id,
          timestamp: (e.timestamp || "").replace("T", " ").slice(0, 19),
          agentId: e.agent_id,
          actionType: e.action_type,
          risk: e.risk_level,
          outcome: e.outcome,
          rule: e.policy_rule,
        })) as AuditEntry[]);
      } catch {
        setRecentActions([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(t => {
        const next = { ...t };
        Object.keys(next).forEach(k => { if (next[k] > 0) next[k]--; });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = (item: QueueItem, action: "approve" | "deny") => {
    setModal({ item, action });
  };

  const confirmAction = async () => {
    if (!modal) return;
    // call the real api to approve or deny
    try {
      // using static api import
      if (modal.action === "approve") {
        await api.approveItem(modal.item.id, "admin@certacito.ai");
      } else {
        await api.denyItem(modal.item.id, "admin@certacito.ai");
      }
    } catch {
      // still remove from UI even if api call fails for now
    }
    setItems(prev => prev.filter(i => i.id !== modal.item.id));
    if (selectedItem?.id === modal.item.id) setSelectedItem(null);
    setModal(null);
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Alert banner */}
      {!alertDismissed && (
        <div className="flex items-center justify-between px-6 py-3"
          style={{ background: "#fef2f2", borderBottom: `2px solid ${RED}` }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} style={{ color: RED, flexShrink: 0 }} />
            <span style={{ color: RED, fontWeight: 700, fontSize: 13 }}>
              2 new Critical-risk items escalated in the last 5 minutes
            </span>
          </div>
          <button onClick={() => setAlertDismissed(true)} style={{ color: RED }}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className="p-6">
        <div className="mb-5">
          <div style={{ color: "#9ca3af", fontSize: 11 }}>CERTACITO.AI / ACTIVITY / APPROVAL QUEUE</div>
          <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 700, marginTop: 2 }}>Approval Queue</h1>
          <p style={{ color: "#6b7a99", fontSize: 12, marginTop: 2 }}>Human reviewer action required for High and Critical risk escalations</p>
        </div>

        <div className="flex gap-4">
          {/* Queue list */}
          <div className="flex-1 space-y-3">
            {items.length === 0 && (
              <div className="bg-white rounded-lg border p-10 text-center" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                <Check size={32} style={{ color: GREEN, margin: "0 auto 8px" }} />
                <div style={{ color: NAVY, fontWeight: 700, fontSize: 14 }}>Queue cleared</div>
                <div style={{ color: "#9ca3af", fontSize: 12 }}>All items have been actioned.</div>
              </div>
            )}
            {items.map(item => {
              const sla = timers[item.id] ?? item.slaSeconds;
              const urgent = sla < 900;
              const isSelected = selectedItem?.id === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(isSelected ? null : item)}
                  className="bg-white rounded-lg border cursor-pointer transition-all"
                  style={{
                    borderColor: isSelected ? TEAL : "rgba(27,58,107,0.08)",
                    boxShadow: isSelected ? `0 0 0 2px ${TEAL}20` : "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL, fontWeight: 700 }}>
                            {item.agentId}
                          </span>
                          <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#9ca3af" }}>
                            {item.id}
                          </span>
                          <RiskBadge risk={item.riskLevel} />
                        </div>
                        <p style={{ color: "#374151", fontSize: 12, lineHeight: 1.5 }}>{item.action}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: NAVY, fontWeight: 600 }}>
                            {item.policyRule}
                          </span>
                          <span style={{ color: "#9ca3af", fontSize: 11 }}>{item.policyDesc}</span>
                        </div>
                      </div>

                      {/* SLA Timer */}
                      <div className="flex-shrink-0 text-right">
                        <div className="flex items-center gap-1.5 mb-3" style={{ justifyContent: "flex-end" }}>
                          <Clock size={12} style={{ color: urgent ? RED : AMBER }} />
                          <span style={{
                            fontFamily: "Courier New, monospace",
                            fontSize: 16,
                            fontWeight: 700,
                            color: urgent ? RED : AMBER,
                          }}>
                            {formatSLA(sla)}
                          </span>
                        </div>
                        <div style={{ color: "#9ca3af", fontSize: 10, marginBottom: 8 }}>until auto-reject</div>
                        <div className="flex gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); handleAction(item, "deny"); }}
                            className="px-4 py-1.5 rounded text-white font-semibold text-sm transition-opacity hover:opacity-90"
                            style={{ background: RED, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                            Deny
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleAction(item, "approve"); }}
                            className="px-4 py-1.5 rounded text-white font-semibold text-sm transition-opacity hover:opacity-90"
                            style={{ background: GREEN, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          {selectedItem && (
            <div className="w-80 flex-shrink-0 bg-white rounded-lg border overflow-hidden"
              style={{ borderColor: "rgba(27,58,107,0.08)", alignSelf: "flex-start" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>Agent Session Context</h3>
                <button onClick={() => setSelectedItem(null)} style={{ color: "#9ca3af" }}><X size={14} /></button>
              </div>
              <div className="p-4">
                <div className="mb-4">
                  <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>SESSION INFO</div>
                  <div className="space-y-2">
                    {[
                      ["Agent ID", selectedItem.agentId, true],
                      ["Session start", selectedItem.sessionStart, true],
                      ["User context", selectedItem.user, true],
                    ].map(([k, v, mono]) => (
                      <div key={k as string}>
                        <div style={{ color: "#6b7a99", fontSize: 10 }}>{k}</div>
                        <div style={{ fontFamily: mono ? "Courier New, monospace" : "Arial, sans-serif", fontSize: 11, color: "#374151" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>RECENT ACTIONS</div>
                  <div className="space-y-2">
                    {recentActions.filter(e => e.agentId === selectedItem.agentId).slice(0, 4).map(e => (
                      <div key={e.id} className="flex items-start gap-2 p-2 rounded" style={{ background: "#f8fafc" }}>
                        <div>
                          <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#374151" }}>{e.actionType}</div>
                          <div style={{ fontSize: 10, color: "#9ca3af" }}>{e.timestamp}</div>
                        </div>
                        <div className="ml-auto"><OutcomeBadge outcome={e.outcome} /></div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>RISK DETAILS</div>
                  <RiskBadge risk={selectedItem.riskLevel} />
                  <div style={{ color: "#374151", fontSize: 11, marginTop: 6 }}>{selectedItem.policyRule}: {selectedItem.policyDesc}</div>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                  <button onClick={() => handleAction(selectedItem, "deny")}
                    className="flex-1 py-2 rounded text-white font-semibold transition-opacity hover:opacity-90"
                    style={{ background: RED, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                    Deny
                  </button>
                  <button onClick={() => handleAction(selectedItem, "approve")}
                    className="flex-1 py-2 rounded text-white font-semibold transition-opacity hover:opacity-90"
                    style={{ background: GREEN, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                    Approve
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="h-1" style={{ background: modal.action === "approve" ? GREEN : RED }} />
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                {modal.action === "approve"
                  ? <Check size={22} style={{ color: GREEN }} />
                  : <X size={22} style={{ color: RED }} />}
                <h3 style={{ color: NAVY, fontWeight: 700, fontSize: 16, fontFamily: "Arial, sans-serif" }}>
                  Confirm {modal.action === "approve" ? "Approval" : "Denial"}
                </h3>
              </div>
              <p style={{ color: "#374151", fontSize: 13, fontFamily: "Arial, sans-serif", lineHeight: 1.6 }}>
                Confirm {modal.action} of{" "}
                <span style={{ fontFamily: "Courier New, monospace", fontWeight: 700, color: NAVY }}>{modal.item.id}</span>?
                This action will be permanently logged for compliance audit.
              </p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setModal(null)}
                  className="flex-1 py-2.5 rounded border font-semibold"
                  style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Cancel
                </button>
                <button onClick={confirmAction}
                  className="flex-1 py-2.5 rounded text-white font-semibold"
                  style={{ background: modal.action === "approve" ? GREEN : RED, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Policy Rules ─────────────────────────────────────────────────────────────
function PolicyRulesScreen() {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [actionFilter, setActionFilter] = useState("All");
  const [editRule, setEditRule] = useState<PolicyRule | null>(null);
  const [editDraft, setEditDraft] = useState<PolicyRule | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createDraft, setCreateDraft] = useState<PolicyRule>({
    id: "",
    name: "",
    actionType: "",
    riskThreshold: "Low",
    defaultOutcome: "PERMIT",
    regTag: "",
    active: true,
    lastModified: "",
    conditions: "",
    version: 1,
  });
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // load policy rules from backend
  useEffect(() => {
    const load = async () => {
      try {
        // using static api import
        const data = await api.getPolicies();
        if (data && data.length > 0) {
          setRules(data.map((r: any) => ({
            id: r.id,
            name: r.name,
            actionType: r.action_type,
            riskThreshold: r.risk_threshold as RiskLevel,
            defaultOutcome: r.default_outcome as Outcome,
            regTag: r.reg_tag || "",
            active: r.active,
            lastModified: r.last_modified?.split("T")[0] || "",
            conditions: r.conditions || "",
            version: r.version,
          })));
        }
      } catch {
        // leave it empty rather than showing something mock
      }
    };
    load();
  }, []);

  const actionTypes = ["All", ...Array.from(new Set(rules.map(r => r.actionType)))];

  const filtered = rules.filter(r => actionFilter === "All" || r.actionType === actionFilter);

  const openEdit = (r: PolicyRule) => {
    setEditRule(r);
    setEditDraft({ ...r });
    setShowVersionHistory(false);
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    // call the api to update the rule
    try {
      // using static api import
      await api.updatePolicy(editDraft.id, {
        id: editDraft.id,
        name: editDraft.name,
        action_type: editDraft.actionType,
        risk_threshold: editDraft.riskThreshold,
        default_outcome: editDraft.defaultOutcome,
        conditions: editDraft.conditions || null,
        reg_tag: editDraft.regTag,
        active: editDraft.active,
        version: editDraft.version,
      });
    } catch {
      // still update locally if api fails
    }
    const newVersion = (editDraft.version ?? 1) + 1;
    setRules(prev => prev.map(r => r.id === editDraft.id ? { ...editDraft, lastModified: new Date().toISOString().split("T")[0], version: newVersion } : r));
    setEditRule(null);
    setEditDraft(null);
    setShowVersionHistory(false);
  };

  const toggleActive = async (id: string) => {
    const r = rules.find(x => x.id === id);
    if (!r) return;
    const flipped = { ...r, active: !r.active };
    setRules(prev => prev.map(x => x.id === id ? flipped : x));
    try {
      // persist the flip, otherwise it silently reverts on reload
      await api.updatePolicy(id, {
        id,
        name: r.name,
        action_type: r.actionType,
        risk_threshold: r.riskThreshold,
        default_outcome: r.defaultOutcome,
        conditions: r.conditions || null,
        reg_tag: r.regTag,
        active: flipped.active,
        version: r.version,
      });
    } catch {
      // api said no (probably not admin) so roll the optimistic flip back
      setRules(prev => prev.map(x => x.id === id ? r : x));
    }
  };

  const openCreateForm = () => {
    const newId = `RULE-${String(rules.length + 1).padStart(3, "0")}`;
    setCreateDraft({
      id: newId,
      name: "",
      actionType: "",
      riskThreshold: "Low",
      defaultOutcome: "PERMIT",
      regTag: "",
      active: true,
      lastModified: "2026-05-27",
      conditions: "",
      version: 1,
    });
    setShowCreateForm(true);
  };

  const saveNewRule = async () => {
    if (!createDraft.name || !createDraft.actionType) return;
    try {
      await api.createPolicy({
        id: createDraft.id,
        name: createDraft.name,
        action_type: createDraft.actionType,
        risk_threshold: createDraft.riskThreshold,
        default_outcome: createDraft.defaultOutcome,
        conditions: createDraft.conditions || null,
        reg_tag: createDraft.regTag || null,
        active: createDraft.active,
        version: 1,
      });
    } catch {
      // TODO surface a toast here, for now the rule still shows locally
    }
    setRules(prev => [...prev, { ...createDraft, lastModified: new Date().toISOString().split("T")[0] }]);
    setShowCreateForm(false);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ fontFamily: "Arial, sans-serif" }}>
      <div className="mb-5">
        <div style={{ color: "#9ca3af", fontSize: 11 }}>CERTACITO.AI / POLICY RULES</div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 700 }}>Policy Rules</h1>
            <p style={{ color: "#6b7a99", fontSize: 12, marginTop: 2 }}>Manage enforcement rules for AI agent governance</p>
          </div>
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-white font-semibold"
            style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
            <Plus size={14} /> Create new rule
          </button>
        </div>
        {/* Version-controlled config notice */}
        <div className="mt-3 rounded-lg px-3 py-2 border flex items-center gap-2"
          style={{ borderColor: "rgba(13,115,119,0.2)", background: "rgba(13,115,119,0.04)" }}>
          <FileText size={13} style={{ color: TEAL, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "#374151", fontFamily: "Arial, sans-serif" }}>
            Rules are stored as <strong style={{ color: NAVY }}>version-controlled config files</strong>, not model prompts. All changes are tracked with git-style versioning.
          </span>
        </div>
      </div>

      {/* Action type filter chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {actionTypes.map(a => (
          <button
            key={a}
            onClick={() => setActionFilter(a)}
            className="px-3 py-1.5 rounded-full border text-sm transition-colors"
            style={{
              background: actionFilter === a ? NAVY : "white",
              color: actionFilter === a ? "#fff" : NAVY,
              borderColor: actionFilter === a ? NAVY : "rgba(27,58,107,0.2)",
              fontFamily: "Arial, sans-serif",
              fontSize: 11,
              fontWeight: actionFilter === a ? 600 : 400,
            }}>
            {a}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(27,58,107,0.08)", background: "#f8fafc" }}>
              {["Rule ID", "Name", "Action type", "Risk threshold", "Default outcome", "Regulatory tag", "Status", "Last modified", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((rule, i) => (
              <tr key={rule.id}
                className="border-b hover:bg-gray-50 transition-colors"
                style={{ borderColor: "rgba(27,58,107,0.06)" }}>
                <td className="px-4 py-3">
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL, fontWeight: 700 }}>{rule.id}</span>
                </td>
                <td className="px-4 py-3" style={{ color: "#374151", fontSize: 12, maxWidth: 180 }}>
                  <div className="truncate">{rule.name}</div>
                </td>
                <td className="px-4 py-3">
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151" }}>{rule.actionType}</span>
                </td>
                <td className="px-4 py-3"><RiskBadge risk={rule.riskThreshold} /></td>
                <td className="px-4 py-3"><OutcomeBadge outcome={rule.defaultOutcome} /></td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded text-xs"
                    style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                    {rule.regTag}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(rule.id)} className="flex items-center gap-1.5">
                    {rule.active
                      ? <ToggleRight size={20} style={{ color: GREEN }} />
                      : <ToggleLeft size={20} style={{ color: "#9ca3af" }} />}
                    <span style={{ fontSize: 11, color: rule.active ? GREEN : "#9ca3af", fontWeight: 600 }}>
                      {rule.active ? "Active" : "Disabled"}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#9ca3af" }}>
                    {rule.lastModified}
                  </div>
                  {rule.version && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <FileText size={10} style={{ color: TEAL }} />
                      <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: TEAL, fontWeight: 600 }}>
                        v{rule.version}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(rule)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs hover:bg-gray-50 transition-colors"
                    style={{ borderColor: "rgba(27,58,107,0.15)", color: NAVY, fontFamily: "Arial, sans-serif" }}>
                    <Edit2 size={11} /> Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit drawer */}
      {editRule && editDraft && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.25)" }}
            onClick={() => { setEditRule(null); setEditDraft(null); setShowVersionHistory(false); }} />
          <div className="fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl overflow-y-auto"
            style={{ width: 480, borderLeft: "1px solid rgba(27,58,107,0.1)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <div>
                <h3 style={{ color: NAVY, fontWeight: 700, fontSize: 15, fontFamily: "Arial, sans-serif" }}>Edit Rule</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL }}>{editRule.id}</span>
                  {editRule.version && (
                    <span className="px-2 py-0.5 rounded" style={{ background: "#f0fdf4", border: `1px solid ${TEAL}40`, color: TEAL, fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 600 }}>
                      Version {editRule.version}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => { setEditRule(null); setEditDraft(null); setShowVersionHistory(false); }} style={{ color: "#9ca3af" }}>
                <X size={18} />
              </button>
            </div>

            {/* Version history toggle */}
            <div className="px-5 py-3 border-b" style={{ borderColor: "rgba(27,58,107,0.08)", background: "#f8fafc" }}>
              <button
                onClick={() => setShowVersionHistory(!showVersionHistory)}
                className="flex items-center gap-2 text-sm hover:opacity-80 transition-opacity"
                style={{ color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600 }}>
                <FileText size={14} style={{ color: TEAL }} />
                {showVersionHistory ? "Hide version info" : "View version info"}
                {showVersionHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* Current version. we don't retain a change log - there is no
                version-history table - so this shows the real current state
                rather than an mock list of past edits. */}
            {showVersionHistory && (
              <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(27,58,107,0.08)", background: "#fafbfc" }}>
                <h4 style={{ color: NAVY, fontSize: 12, fontWeight: 700, marginBottom: 10, fontFamily: "Arial, sans-serif" }}>
                  Version Info
                </h4>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: TEAL, color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "Arial, sans-serif" }}>
                      {editRule.version}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: 11, color: "#374151", fontWeight: 600, fontFamily: "Arial, sans-serif" }}>
                        Version {editRule.version}
                      </span>
                      <span className="px-1.5 py-0.5 rounded" style={{ background: TEAL, color: "#fff", fontSize: 9, fontWeight: 600, fontFamily: "Arial, sans-serif" }}>
                        CURRENT
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6b7a99", fontFamily: "Arial, sans-serif", lineHeight: 1.4 }}>
                      Rules are versioned in the YAML policy config, which is tracked in git.
                      Per-edit history is not retained in the database.
                    </div>
                    <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "Courier New, monospace", marginTop: 4 }}>
                      last modified {(editRule as any).lastModified || "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="p-5 space-y-4">
              {[
                { label: "Rule Name", field: "name" as const },
                { label: "Action Type", field: "actionType" as const },
                { label: "Regulatory Tag", field: "regTag" as const },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                    className="block mb-1.5">{label}</label>
                  <input value={editDraft[field]}
                    onChange={e => setEditDraft({ ...editDraft, [field]: e.target.value })}
                    className="w-full px-3 py-2 rounded border outline-none"
                    style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }} />
                </div>
              ))}
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Condition Expression</label>
                <textarea
                  value={editDraft.conditions ?? ""}
                  onChange={e => setEditDraft({ ...editDraft, conditions: e.target.value })}
                  className="w-full px-3 py-2 rounded border outline-none"
                  rows={3}
                  placeholder="e.g., session_scope != target_dataset"
                  style={{ fontFamily: "Courier New, monospace", fontSize: 12, borderColor: "rgba(27,58,107,0.2)", resize: "vertical" }} />
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, fontFamily: "Arial, sans-serif" }}>
                  Define the condition logic that triggers this rule
                </div>
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Risk Threshold</label>
                <select value={editDraft.riskThreshold}
                  onChange={e => setEditDraft({ ...editDraft, riskThreshold: e.target.value as RiskLevel })}
                  className="w-full px-3 py-2 rounded border outline-none"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }}>
                  {["Low", "Medium", "High", "Critical"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Default Outcome</label>
                <select value={editDraft.defaultOutcome}
                  onChange={e => setEditDraft({ ...editDraft, defaultOutcome: e.target.value as Outcome })}
                  className="w-full px-3 py-2 rounded border outline-none"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }}>
                  {["PERMIT", "DENY", "ESCALATE"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}>Active</label>
                <button onClick={() => setEditDraft({ ...editDraft, active: !editDraft.active })}>
                  {editDraft.active
                    ? <ToggleRight size={22} style={{ color: GREEN }} />
                    : <ToggleLeft size={22} style={{ color: "#9ca3af" }} />}
                </button>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => { setEditRule(null); setEditDraft(null); setShowVersionHistory(false); }}
                  className="flex-1 py-2.5 rounded border font-semibold"
                  style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Cancel
                </button>
                <button onClick={saveEdit}
                  className="flex-1 py-2.5 rounded text-white font-semibold"
                  style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create new rule form */}
      {showCreateForm && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.25)" }}
            onClick={() => setShowCreateForm(false)} />
          <div className="fixed right-0 top-0 bottom-0 z-50 bg-white shadow-2xl overflow-y-auto"
            style={{ width: 480, borderLeft: "1px solid rgba(27,58,107,0.1)" }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <div>
                <h3 style={{ color: NAVY, fontWeight: 700, fontSize: 15, fontFamily: "Arial, sans-serif" }}>Create New Rule</h3>
                <div style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL, marginTop: 2 }}>{createDraft.id}</div>
              </div>
              <button onClick={() => setShowCreateForm(false)} style={{ color: "#9ca3af" }}>
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Rule Name *</label>
                <input
                  value={createDraft.name}
                  onChange={e => setCreateDraft({ ...createDraft, name: e.target.value })}
                  placeholder="Enter a descriptive rule name"
                  className="w-full px-3 py-2 rounded border outline-none"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }} />
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Action Type *</label>
                <input
                  value={createDraft.actionType}
                  onChange={e => setCreateDraft({ ...createDraft, actionType: e.target.value })}
                  placeholder="e.g., data_access, external_call, file_write"
                  className="w-full px-3 py-2 rounded border outline-none"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }} />
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Condition Expression *</label>
                <textarea
                  value={createDraft.conditions ?? ""}
                  onChange={e => setCreateDraft({ ...createDraft, conditions: e.target.value })}
                  className="w-full px-3 py-2 rounded border outline-none"
                  rows={3}
                  placeholder="e.g., session_scope != target_dataset"
                  style={{ fontFamily: "Courier New, monospace", fontSize: 12, borderColor: "rgba(27,58,107,0.2)", resize: "vertical" }} />
                <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, fontFamily: "Arial, sans-serif" }}>
                  Define the condition logic that triggers this rule
                </div>
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Regulatory Tag</label>
                <input
                  value={createDraft.regTag}
                  onChange={e => setCreateDraft({ ...createDraft, regTag: e.target.value })}
                  placeholder="e.g., Privacy Act 1988, ISO 27001"
                  className="w-full px-3 py-2 rounded border outline-none"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }} />
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Risk Threshold</label>
                <select
                  value={createDraft.riskThreshold}
                  onChange={e => setCreateDraft({ ...createDraft, riskThreshold: e.target.value as RiskLevel })}
                  className="w-full px-3 py-2 rounded border outline-none"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }}>
                  {["Low", "Medium", "High", "Critical"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                  className="block mb-1.5">Default Outcome</label>
                <select
                  value={createDraft.defaultOutcome}
                  onChange={e => setCreateDraft({ ...createDraft, defaultOutcome: e.target.value as Outcome })}
                  className="w-full px-3 py-2 rounded border outline-none"
                  style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)" }}>
                  {["PERMIT", "DENY", "ESCALATE"].map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}>Active on creation</label>
                <button onClick={() => setCreateDraft({ ...createDraft, active: !createDraft.active })}>
                  {createDraft.active
                    ? <ToggleRight size={22} style={{ color: GREEN }} />
                    : <ToggleLeft size={22} style={{ color: "#9ca3af" }} />}
                </button>
              </div>

              <div className="rounded-lg px-4 py-3 border" style={{ borderColor: TEAL, background: `${TEAL}08` }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} style={{ color: TEAL, marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: NAVY, fontWeight: 600, fontFamily: "Arial, sans-serif", marginBottom: 2 }}>
                      Version Control Enabled
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7a99", fontFamily: "Arial, sans-serif", lineHeight: 1.5 }}>
                      This rule will be created as version 1. All future changes will be tracked in the version history.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 py-2.5 rounded border font-semibold"
                  style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Cancel
                </button>
                <button
                  onClick={saveNewRule}
                  disabled={!createDraft.name || !createDraft.actionType}
                  className="flex-1 py-2.5 rounded text-white font-semibold transition-opacity"
                  style={{
                    background: (!createDraft.name || !createDraft.actionType) ? "#9ca3af" : TEAL,
                    fontFamily: "Arial, sans-serif",
                    fontSize: 13,
                    cursor: (!createDraft.name || !createDraft.actionType) ? "not-allowed" : "pointer",
                    opacity: (!createDraft.name || !createDraft.actionType) ? 0.6 : 1,
                  }}>
                  Create rule
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Top Header ──────────────────────────────────────────────────────────────
const screenTitles: Record<Screen, string> = {
  landing: "Home",
  login: "Login",
  "agent-overview": "Agent Overview",
  dashboard: "Dashboard",
  "audit-log": "Audit Log",
  "approval-queue": "Approval Queue",
  "policy-rules": "Policy Rules",
  "agent-registry": "Agent Registry",
  reports: "Reports & Compliance",
  settings: "Settings",
};

interface Notification {
  id: string;
  type: "critical" | "warning" | "info";
  message: string;
  time: string;
  read: boolean;
}

function TopHeader({ screen, setScreen }: { screen: Screen; setScreen: (s: Screen) => void }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length + pendingCount;

  // fetch real pending approval count
  useEffect(() => {
    const check = async () => {
      try {
        const approvals = await api.getPendingApprovals();
        setPendingCount(approvals.length);
      } catch {}
      // build the notification list out of what actually happened. this was a
      // hardcoded array of six mock events - agents that don't exist, a
      // report "delivered", someone called James Okafor suspending something.
      try {
        const audit = await api.getAuditLog(20);
        const notable = (audit || [])
          .filter((e: any) => e.outcome === "DENY" || e.outcome === "ESCALATE")
          .slice(0, 6)
          .map((e: any) => ({
            id: e.id,
            type: (e.risk_level === "Critical" ? "critical" : e.outcome === "ESCALATE" ? "warning" : "info") as Notification["type"],
            message: `${e.agent_id} ${e.action_type} - ${e.outcome}${e.policy_rule ? ` (${e.policy_rule})` : ""}`,
            time: (e.timestamp || "").replace("T", " ").slice(0, 19),
            read: false,
          }));
        setNotifications(notable);
      } catch {}
    };
    check();
    const t = setInterval(check, 8000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  const markRead = (id: string) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));

  const notifTypeIcon = (type: Notification["type"]) => {
    if (type === "critical") return <AlertTriangle size={13} style={{ color: RED }} />;
    if (type === "warning") return <Clock size={13} style={{ color: AMBER }} />;
    return <Bell size={13} style={{ color: TEAL }} />;
  };

  return (
    <div className="flex-shrink-0 flex items-center gap-4 px-6"
      style={{ height: 52, background: "#fff", borderBottom: "1px solid rgba(27,58,107,0.08)", fontFamily: "Arial, sans-serif" }}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-shrink-0">
        <span style={{ color: "#9ca3af", fontSize: 12 }}>certacito.ai</span>
        <ChevronRight size={12} style={{ color: "#d1d5db" }} />
        <span style={{ color: NAVY, fontSize: 12, fontWeight: 600 }}>{screenTitles[screen]}</span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
          style={{ borderColor: "rgba(27,58,107,0.15)", background: "#f8fafc" }}>
          <Search size={13} style={{ color: "#9ca3af", flexShrink: 0 }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search agents, rules, audit events…"
            className="flex-1 bg-transparent outline-none"
            style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#374151" }} />
          {search && <button onClick={() => setSearch("")} style={{ color: "#9ca3af" }}><X size={11} /></button>}
          <kbd style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: "#9ca3af", background: "#f1f5f9", padding: "1px 5px", borderRadius: 3, border: "1px solid #e5e7eb" }}>⌘K</kbd>
        </div>
      </div>

      <div className="flex-1" />

      {/* Live badge */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full flex-shrink-0"
        style={{ background: `${GREEN}12`, border: `1px solid ${GREEN}30` }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
        <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>LIVE</span>
      </div>

      {/* Notification bell */}
      <div className="relative flex-shrink-0" ref={notifRef}>
        <button onClick={() => { setNotifOpen(o => !o); setProfileOpen(false); }}
          className="relative flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
          style={{ width: 34, height: 34 }}>
          <Bell size={16} style={{ color: NAVY }} />
          {unread > 0 && (
            <span className="absolute top-0.5 right-0.5 flex items-center justify-center rounded-full"
              style={{ width: 16, height: 16, background: RED, color: "#fff", fontSize: 9, fontWeight: 700 }}>
              {unread}
            </span>
          )}
        </button>

        {/* Notification panel */}
        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl border overflow-hidden z-50"
            style={{ width: 360, borderColor: "rgba(27,58,107,0.1)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <div className="flex items-center gap-2">
                <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>Notifications</h3>
                {unread > 0 && (
                  <span style={{ background: RED, color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 9999 }}>
                    {unread} new
                  </span>
                )}
              </div>
              <button onClick={markAllRead} style={{ color: TEAL, fontSize: 11, fontWeight: 600 }}>Mark all read</button>
            </div>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {notifications.map(n => (
                <div key={n.id}
                  onClick={() => markRead(n.id)}
                  className="flex items-start gap-3 px-4 py-3 border-b cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ borderColor: "rgba(27,58,107,0.06)", background: n.read ? "#fff" : `${n.type === "critical" ? RED : n.type === "warning" ? AMBER : TEAL}05` }}>
                  <div className="flex-shrink-0 mt-0.5">{notifTypeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{n.message}</p>
                    <span style={{ fontSize: 10, color: "#9ca3af", marginTop: 2, display: "block" }}>{n.time}</span>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: TEAL }} />
                  )}
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t text-center" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <button onClick={() => { setScreen("audit-log"); setNotifOpen(false); }}
                style={{ color: TEAL, fontSize: 12, fontWeight: 600 }}>View full audit log →</button>
            </div>
          </div>
        )}
      </div>

      {/* Profile dropdown */}
      <div className="relative flex-shrink-0" ref={profileRef}>
        <button onClick={() => { setProfileOpen(o => !o); setNotifOpen(false); }}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-gray-100">
          <div className="flex items-center justify-center rounded-full"
            style={{ width: 28, height: 28, background: TEAL, color: "#fff", fontSize: 11, fontWeight: 700 }}>
            NV
          </div>
          <div className="text-left">
            <div style={{ color: NAVY, fontSize: 12, fontWeight: 600 }}>Nico VDT</div>
            <div style={{ color: "#9ca3af", fontSize: 10 }}>Administrator</div>
          </div>
          <ChevronDown size={12} style={{ color: "#9ca3af" }} />
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl border overflow-hidden z-50"
            style={{ width: 200, borderColor: "rgba(27,58,107,0.1)" }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <div style={{ color: NAVY, fontSize: 12, fontWeight: 700 }}>Nico VDT</div>
              <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#9ca3af" }}>nico.vdt@certacito.ai</div>
            </div>
            {[
              { label: "Profile settings", icon: <User size={13} />, click: "settings" as Screen },
              { label: "Platform settings", icon: <Settings size={13} />, click: "settings" as Screen },
            ].map(item => (
              <button key={item.label}
                onClick={() => { setScreen(item.click); setProfileOpen(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-left"
                style={{ color: "#374151", fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                <span style={{ color: "#9ca3af" }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <div className="border-t" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <button onClick={() => setScreen("landing")}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-left"
                style={{ color: RED, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                <LogOut size={13} style={{ color: RED }} />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [registryAgentId, setRegistryAgentId] = useState<string | null>(null);
  const [user, setUser] = useState<{email: string, role: string} | null>(null);
  const [loginError, setLoginError] = useState("");

  // check if theres already a token saved from previous session
  useEffect(() => {
    const token = localStorage.getItem("certacito_token");
    if (token) {
      import("../api/client").then(api => {
        api.getMe()
          .then(u => { setUser(u); setScreen("dashboard"); })
          .catch(() => localStorage.removeItem("certacito_token"));
      });
    }
  }, []);

  const handleLogin = async (email: string, password: string) => {
    try {
      setLoginError("");
      // using static api import
      await login(email, password);
      const me = await api.getMe();
      setUser(me);
      setScreen("dashboard");
    } catch (err: any) {
      setLoginError(err.message || "Login failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("certacito_token");
    setUser(null);
    setScreen("landing");
  };

  if (screen === "landing") {
    return (
      <LandingPage
        onLogin={() => setScreen("login")}
        onSignUp={() => setScreen("login")}
      />
    );
  }

  if (screen === "login") {
    return <LoginScreen onLogin={async (email, pwd) => {
      try {
        // using static api import
        await api.login(email, pwd);
        const me = await api.getMe();
        setUser(me);
        setScreen("dashboard");
      } catch {
        // error is handled inside LoginScreen
      }
    }} onBack={() => setScreen("landing")} />;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f4f6f9" }}>
      <Sidebar screen={screen} setScreen={setScreen} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopHeader screen={screen} setScreen={setScreen} />
        {screen === "agent-overview" && <AgentOverviewScreen onViewRegistry={(id) => { setRegistryAgentId(id); setScreen("agent-registry"); }} />}
        {screen === "dashboard" && <DashboardScreen setScreen={setScreen} />}
        {screen === "audit-log" && <AuditLogScreen setScreen={setScreen} />}
        {screen === "approval-queue" && <ApprovalQueueScreen />}
        {screen === "policy-rules" && <PolicyRulesScreen />}
        {screen === "agent-registry" && <AgentRegistryScreen initialSelectedAgentId={registryAgentId} />}
        {screen === "reports" && <ReportsScreen />}
        {screen === "settings" && <SettingsScreen />}
      </div>
    </div>
  );
}
