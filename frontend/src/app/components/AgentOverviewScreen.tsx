import React, { useState, useEffect } from "react";
import { Bot, Activity, PauseCircle, WifiOff } from "lucide-react";
import * as api from "../../api/client";

const NAVY = "#1B3A6B";
const TEAL = "#0D7377";
const RED = "#C0392B";
const GREEN = "#27AE60";
const AMBER = "#E67E22";

type Status = "Active" | "Suspended" | "Offline";
type Risk = "Low" | "Medium" | "High" | "Critical";

interface Agent {
  id: string;
  name: string;
  status: Status;
  risk: Risk;
  compliance: number;
}


const statusConfig: Record<Status, { label: string; color: string; bg: string; dot: string }> = {
  Active:    { label: "Active",    color: GREEN,   bg: "#f0fdf4", dot: GREEN },
  Suspended: { label: "Suspended", color: AMBER,   bg: "#fff7ed", dot: AMBER },
  Offline:   { label: "Offline",   color: "#6b7a99", bg: "#f3f4f6", dot: "#9ca3af" },
};

const riskConfig: Record<Risk, { color: string; bg: string }> = {
  Critical: { color: RED,     bg: "#fef2f2" },
  High:     { color: AMBER,   bg: "#fff7ed" },
  Medium:   { color: "#CA8A04", bg: "#fefce8" },
  Low:      { color: GREEN,   bg: "#f0fdf4" },
};

function complianceColor(score: number) {
  if (score >= 90) return GREEN;
  if (score >= 75) return AMBER;
  return RED;
}

function StatusBadge({ status }: { status: Status }) {
  const cfg = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 600, color: cfg.color }}>
        {cfg.label}
      </span>
    </span>
  );
}

function RiskBadge({ risk }: { risk: Risk }) {
  const cfg = riskConfig[risk];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
      <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: cfg.color }}>
        {risk}
      </span>
    </span>
  );
}

function ComplianceBar({ score }: { score: number }) {
  const color = complianceColor(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 10, color: "#6b7a99" }}>Compliance</span>
        <span style={{ fontFamily: "Arial, sans-serif", fontSize: 11, fontWeight: 700, color }}>{score}%</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 5, background: "#e5e7eb" }}>
        <div className="rounded-full origin-left" style={{ width: "100%", height: 5, background: color, transform: `scaleX(${score / 100})`, transition: "transform 0.4s" }} />
      </div>
    </div>
  );
}

function AgentCard({ agent, onViewRegistry }: { agent: Agent; onViewRegistry: (id: string) => void }) {
  return (
    <div className="bg-white rounded-lg p-4 flex flex-col gap-3"
      style={{ border: "1px solid rgba(27,58,107,0.08)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      {/* ID */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-md flex-shrink-0"
          style={{ width: 28, height: 28, background: agent.status === "Active" ? `${TEAL}12` : "#f3f4f6" }}>
          <Bot size={14} style={{ color: agent.status === "Active" ? TEAL : "#9ca3af" }} />
        </div>
        <span style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#9ca3af", fontWeight: 600 }}>
          {agent.id}
        </span>
      </div>

      {/* Name */}
      <div style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>
        {agent.name}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusBadge status={agent.status} />
        <RiskBadge risk={agent.risk} />
      </div>

      {/* Compliance bar */}
      <ComplianceBar score={agent.compliance} />

      {/* View in Registry link */}
      <div className="border-t pt-2.5" style={{ borderColor: "rgba(27,58,107,0.07)", marginTop: 2 }}>
        <button onClick={() => onViewRegistry(agent.id)}
          style={{ fontFamily: "Arial, sans-serif", fontSize: 11, fontWeight: 600, color: TEAL, background: "transparent", padding: 0 }}
          className="hover:underline">
          View in Registry →
        </button>
      </div>
    </div>
  );
}

// helpers for mapping api response to our display format
function guessRisk(agent: any): Risk {
  // base risk on blocked ratio
  if (agent.total_actions === 0) return "Low";
  const ratio = agent.blocked_actions / agent.total_actions;
  if (ratio > 0.5) return "Critical";
  if (ratio > 0.3) return "High";
  if (ratio > 0.1) return "Medium";
  return "Low";
}

function calcCompliance(agent: any): number {
  if (agent.total_actions === 0) return 100;
  // compliance = percentage of actions that werent blocked
  return Math.round(((agent.total_actions - agent.blocked_actions) / agent.total_actions) * 100);
}

export function AgentOverviewScreen({ onViewRegistry }: { onViewRegistry: (id: string) => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);

  // fetch real agents from the api
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getAgents();
        if (data && data.length > 0) {
          setAgents(data.map((a: any) => ({
            id: a.id,
            name: a.name,
            status: (a.status === "active" ? "Active" : a.status === "suspended" ? "Suspended" : "Offline") as Status,
            risk: guessRisk(a),
            compliance: calcCompliance(a),
          })));
        }
      } catch {
        // leave it empty rather than inventing agents
      }
    };
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  const active    = agents.filter(a => a.status === "Active").length;
  const suspended = agents.filter(a => a.status === "Suspended").length;
  const offline   = agents.filter(a => a.status === "Offline").length;

  const stats = [
    { label: "Total Agents", value: agents.length, color: NAVY,      bg: `${NAVY}08`, icon: <Bot size={16} style={{ color: NAVY }} /> },
    { label: "Active",       value: active,        color: GREEN,     bg: "#f0fdf4",   icon: <Activity size={16} style={{ color: GREEN }} /> },
    { label: "Suspended",    value: suspended,     color: AMBER,     bg: "#fff7ed",   icon: <PauseCircle size={16} style={{ color: AMBER }} /> },
    { label: "Offline",      value: offline,       color: "#9ca3af", bg: "#f3f4f6",   icon: <WifiOff size={16} style={{ color: "#9ca3af" }} /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ background: "#f4f6f9" }}>
      {/* Breadcrumb */}
      <div style={{ color: "#9ca3af", fontSize: 11, fontFamily: "Arial, sans-serif", fontWeight: 600, letterSpacing: "0.05em", marginBottom: 16 }}>
        CERTACITO.AI / AGENT OVERVIEW
      </div>

      {/* Page title */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: 20, color: NAVY, margin: 0 }}>
            Agent Overview
          </h1>
          <p style={{ fontFamily: "Arial, sans-serif", fontSize: 13, color: "#6b7a99", marginTop: 2 }}>
            All registered AI agents and their current governance status.
          </p>
        </div>
        {/* Timestamp + live indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#6b7a99" }}>
              Last updated: <span style={{ fontWeight: 600, color: GREEN }}>just now</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: `${GREEN}15`, border: `1px solid ${GREEN}40` }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
            <span style={{ fontFamily: "Arial, sans-serif", fontSize: 11, fontWeight: 700, color: GREEN }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map(s => (
          <div key={s.label} className="bg-white rounded-lg p-4 flex items-center gap-3"
            style={{ border: "1px solid rgba(27,58,107,0.08)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-center rounded-lg flex-shrink-0"
              style={{ width: 36, height: 36, background: s.bg }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: "Arial, sans-serif", fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Agent grid 5 x 2 */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {agents.map(agent => (
          <AgentCard key={agent.id} agent={agent} onViewRegistry={onViewRegistry} />
        ))}
      </div>
    </div>
  );
}
