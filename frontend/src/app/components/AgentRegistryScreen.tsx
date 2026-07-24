import React, { useState, useEffect } from "react";
import {
  Bot, Search, X, Power, Eye, AlertTriangle, Activity,
  Globe, Shield, ChevronDown, ChevronUp, Plus, RefreshCw,
} from "lucide-react";
import * as api from "../../api/client";

const NAVY = "#1B3A6B";
const TEAL = "#0D7377";
const RED = "#C0392B";
const GREEN = "#27AE60";
const AMBER = "#E67E22";

type RiskLevel = "Low" | "Medium" | "High" | "Critical";

interface Agent {
  id: string;
  name: string;
  type: string;
  status: "Active" | "Suspended" | "Offline";
  riskTier: RiskLevel;
  decisionsToday: number;
  violationsToday: number;
  lastActivity: string;
  environment: "Production" | "Staging";
  model: string;
  owner: string;
  activeSince: string;
  assignedRules: string[];
  complianceScore: number;
}

function riskColor(risk: RiskLevel) {
  if (risk === "Critical") return { bg: "#fef2f2", text: RED, border: "#fecaca" };
  if (risk === "High") return { bg: "#fff7ed", text: AMBER, border: "#fed7aa" };
  if (risk === "Medium") return { bg: "#fefce8", text: "#b45309", border: "#fef08a" };
  return { bg: "#f0fdf4", text: GREEN, border: "#bbf7d0" };
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

function StatusBadge({ status }: { status: Agent["status"] }) {
  const map = {
    Active: { bg: "#f0fdf4", text: GREEN, dot: GREEN },
    Suspended: { bg: "#fff7ed", text: AMBER, dot: AMBER },
    Offline: { bg: "#f9fafb", text: "#6b7a99", dot: "#d1d5db" },
  };
  const c = map[status];
  return (
    <span style={{ background: c.bg, color: c.text }}
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {status}
    </span>
  );
}

function ComplianceBar({ score }: { score: number }) {
  const color = score >= 90 ? GREEN : score >= 75 ? AMBER : RED;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: "#e5e7eb" }}>
        <div style={{ width: `${score}%`, background: color, height: "100%", borderRadius: 9999 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 30 }}>{score}%</span>
    </div>
  );
}

export function AgentRegistryScreen({ initialSelectedAgentId = null }: { initialSelectedAgentId?: string | null }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [riskFilter, setRiskFilter] = useState("All");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialSelectedAgentId);
  const [sortCol, setSortCol] = useState<string>("id");
  const [sortAsc, setSortAsc] = useState(true);

  // merge real agent data from api into the mock data
  useEffect(() => {
    const load = async () => {
      try {
        const liveAgents = await api.getAgents();
        if (!liveAgents || liveAgents.length === 0) return;
        setAgents(prev => {
          const merged = [...prev];
          for (const live of liveAgents) {
            const idx = merged.findIndex(a => a.id === live.id);
            if (idx >= 0) {
              // update existing with live stats
              merged[idx] = {
                ...merged[idx],
                status: live.status === "active" ? "Active" : live.status === "suspended" ? "Suspended" : "Offline",
                model: live.model || merged[idx].model,
                lastActivity: live.last_seen?.replace("T", " ").slice(0, 16) || merged[idx].lastActivity,
                decisionsToday: live.total_actions || merged[idx].decisionsToday,
                violationsToday: live.blocked_actions || merged[idx].violationsToday,
              };
            }
          }
          return merged;
        });
      } catch {}
    };
    load();
  }, []);

  const selectedAgent = selectedAgentId ? agents.find(a => a.id === selectedAgentId) ?? null : null;

  const filtered = agents.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !search || a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.owner.toLowerCase().includes(q) || a.type.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || a.status === statusFilter;
    const matchRisk = riskFilter === "All" || a.riskTier === riskFilter;
    return matchSearch && matchStatus && matchRisk;
  });

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
  };

  const toggleSuspend = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const agent = agents.find(a => a.id === id);
    if (!agent) return;
    // call real api to suspend/activate
    try {
      if (agent.status === "Active") {
        await api.suspendAgent(id);
      } else {
        await api.activateAgent(id);
      }
    } catch {
      // still toggle locally if api fails
    }
    setAgents(prev => prev.map(a => a.id === id ? { ...a, status: a.status === "Active" ? "Suspended" : "Active" } : a));
  };

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.status === "Active").length,
    suspended: agents.filter(a => a.status === "Suspended").length,
    highCritical: agents.filter(a => a.riskTier === "High" || a.riskTier === "Critical").length,
    decisionsToday: agents.reduce((s, a) => s + a.decisionsToday, 0),
  };

  const SortIcon = ({ col }: { col: string }) =>
    sortCol === col
      ? (sortAsc ? <ChevronUp size={10} /> : <ChevronDown size={10} />)
      : <ChevronDown size={10} style={{ opacity: 0.3 }} />;

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div className="mb-5">
        <div style={{ color: "#9ca3af", fontSize: 11 }}>CERTACITO.AI / AGENT REGISTRY</div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 700 }}>Agent Registry</h1>
            <p style={{ color: "#6b7a99", fontSize: 12, marginTop: 2 }}>Manage and monitor all registered AI agents across your organisation</p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 rounded border text-sm"
              style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded text-white font-semibold"
              style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
              <Plus size={14} /> Register agent
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { label: "Total Agents", value: stats.total, color: NAVY, icon: <Bot size={16} /> },
          { label: "Active", value: stats.active, color: GREEN, icon: <Activity size={16} /> },
          { label: "Suspended", value: stats.suspended, color: AMBER, icon: <Power size={16} /> },
          { label: "High / Critical Risk", value: stats.highCritical, color: RED, icon: <AlertTriangle size={16} /> },
          { label: "Decisions Today", value: stats.decisionsToday, color: TEAL, icon: <Shield size={16} /> },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-lg border px-4 py-3"
            style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</span>
              <span className="flex items-center justify-center rounded-md flex-shrink-0"
                style={{ width: 26, height: 26, background: `${kpi.color}14`, color: kpi.color }}>
                {kpi.icon}
              </span>
            </div>
            <div style={{ color: kpi.color, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Table + Detail Panel */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="bg-white rounded border p-3 mb-3 flex gap-3" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div className="flex items-center gap-2 flex-1 bg-gray-50 rounded px-3 py-1.5 border" style={{ borderColor: "rgba(27,58,107,0.1)" }}>
              <Search size={13} style={{ color: "#9ca3af" }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by agent ID, name, type, or team…"
                className="flex-1 bg-transparent outline-none"
                style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#374151" }} />
              {search && <button onClick={() => setSearch("")} style={{ color: "#9ca3af" }}><X size={12} /></button>}
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded border bg-gray-50 outline-none"
              style={{ borderColor: "rgba(27,58,107,0.1)", fontFamily: "Arial, sans-serif", fontSize: 12, color: "#374151" }}>
              <option value="All">All statuses</option>
              <option>Active</option>
              <option>Suspended</option>
              <option>Offline</option>
            </select>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
              className="px-3 py-1.5 rounded border bg-gray-50 outline-none"
              style={{ borderColor: "rgba(27,58,107,0.1)", fontFamily: "Arial, sans-serif", fontSize: 12, color: "#374151" }}>
              <option value="All">All risk tiers</option>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
            <select className="px-3 py-1.5 rounded border bg-gray-50 outline-none"
              style={{ borderColor: "rgba(27,58,107,0.1)", fontFamily: "Arial, sans-serif", fontSize: 12, color: "#374151" }}>
              <option>All environments</option>
              <option>Production</option>
              <option>Staging</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white rounded border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(27,58,107,0.08)", background: "#f8fafc" }}>
                  {[
                    { label: "AGENT ID", col: "id" },
                    { label: "NAME / TYPE", col: "name" },
                    { label: "STATUS", col: "status" },
                    { label: "RISK", col: "riskTier" },
                    { label: "DECISIONS", col: "decisionsToday" },
                    { label: "VIOLATIONS", col: "violationsToday" },
                    { label: "COMPLIANCE", col: "complianceScore" },
                    { label: "LAST ACTIVE", col: "lastActivity" },
                    { label: "ACTIONS", col: "" },
                  ].map(({ label, col }) => (
                    <th key={label}
                      onClick={col ? () => toggleSort(col) : undefined}
                      className="px-4 py-3 text-left"
                      style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", whiteSpace: "nowrap", cursor: col ? "pointer" : "default" }}>
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {col && <SortIcon col={col} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(agent => {
                  const isSelected = selectedAgentId === agent.id;
                  return (
                    <tr key={agent.id}
                      onClick={() => setSelectedAgentId(isSelected ? null : agent.id)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors border-b"
                      style={{ borderColor: "rgba(27,58,107,0.06)", background: isSelected ? `${TEAL}08` : undefined }}>
                      <td className="px-4 py-3">
                        <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL, fontWeight: 700 }}>{agent.id}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div style={{ color: "#374151", fontSize: 12, fontWeight: 600 }}>{agent.name}</div>
                        <div style={{ color: "#9ca3af", fontSize: 11 }}>{agent.type}</div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={agent.status} /></td>
                      <td className="px-4 py-3"><RiskBadge risk={agent.riskTier} /></td>
                      <td className="px-4 py-3">
                        <span style={{ color: "#374151", fontSize: 13, fontWeight: 700 }}>{agent.decisionsToday}</span>
                        <span style={{ color: "#9ca3af", fontSize: 10, marginLeft: 2 }}>today</span>
                      </td>
                      <td className="px-4 py-3">
                        <span style={{ color: agent.violationsToday > 0 ? RED : "#9ca3af", fontSize: 13, fontWeight: 700 }}>
                          {agent.violationsToday}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ minWidth: 100 }}>
                        <ComplianceBar score={agent.complianceScore} />
                      </td>
                      <td className="px-4 py-3">
                        <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151" }}>{agent.lastActivity}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setSelectedAgentId(isSelected ? null : agent.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded border text-xs"
                            style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                            <Eye size={11} /> View
                          </button>
                          {agent.status !== "Offline" && (
                            <button onClick={e => toggleSuspend(agent.id, e)}
                              className="flex items-center gap-1 px-2 py-1 rounded border text-xs"
                              style={{
                                borderColor: agent.status === "Active" ? "rgba(192,57,43,0.3)" : "rgba(39,174,96,0.3)",
                                color: agent.status === "Active" ? RED : GREEN,
                                fontFamily: "Arial, sans-serif", fontSize: 11,
                              }}>
                              <Power size={11} />
                              {agent.status === "Active" ? "Suspend" : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t flex items-center justify-between" style={{ borderColor: "rgba(27,58,107,0.06)", background: "#f8fafc" }}>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>Showing {filtered.length} of {agents.length} agents</span>
              <div className="flex items-center gap-1">
                {["Production", "Staging"].map(env => (
                  <span key={env} style={{ background: env === "Production" ? `${TEAL}15` : `${NAVY}10`, color: env === "Production" ? TEAL : NAVY, fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                    {env}: {agents.filter(a => a.environment === env).length}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Agent Detail Slide-out */}
        {selectedAgent && (
          <div className="w-72 flex-shrink-0 bg-white rounded-lg border overflow-hidden"
            style={{ borderColor: "rgba(27,58,107,0.08)", alignSelf: "flex-start" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "rgba(27,58,107,0.08)", background: "#f8fafc" }}>
              <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>Agent Details</h3>
              <button onClick={() => setSelectedAgentId(null)} style={{ color: "#9ca3af" }}><X size={14} /></button>
            </div>
            <div className="p-4 space-y-4">
              {/* Identity */}
              <div>
                <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: TEAL, fontWeight: 700 }}>{selectedAgent.id}</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 3 }}>{selectedAgent.name}</div>
                <div className="flex items-center gap-2 mt-2">
                  <StatusBadge status={selectedAgent.status} />
                  <RiskBadge risk={selectedAgent.riskTier} />
                </div>
              </div>

              {/* Config */}
              <div>
                <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>CONFIGURATION</div>
                <div className="space-y-2">
                  {[
                    ["Type", selectedAgent.type],
                    ["Owner", selectedAgent.owner],
                    ["Model", selectedAgent.model],
                    ["Environment", selectedAgent.environment],
                    ["Active since", selectedAgent.activeSince],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2">
                      <span style={{ color: "#6b7a99", fontSize: 11, flexShrink: 0 }}>{k}</span>
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151", textAlign: "right", wordBreak: "break-all" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Today's activity */}
              <div>
                <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>TODAY'S ACTIVITY</div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="rounded p-2.5 text-center" style={{ background: "#f0f9ff", border: "1px solid #bae6fd" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: TEAL }}>{selectedAgent.decisionsToday}</div>
                    <div style={{ fontSize: 10, color: "#6b7a99" }}>Decisions</div>
                  </div>
                  <div className="rounded p-2.5 text-center"
                    style={{ background: selectedAgent.violationsToday > 0 ? "#fef2f2" : "#f0fdf4", border: `1px solid ${selectedAgent.violationsToday > 0 ? "#fecaca" : "#bbf7d0"}` }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: selectedAgent.violationsToday > 0 ? RED : GREEN }}>
                      {selectedAgent.violationsToday}
                    </div>
                    <div style={{ fontSize: 10, color: "#6b7a99" }}>Violations</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#6b7a99", marginBottom: 4 }}>Compliance Score</div>
                  <ComplianceBar score={selectedAgent.complianceScore} />
                </div>
              </div>

              {/* Assigned rules */}
              <div>
                <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>ASSIGNED POLICY RULES</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAgent.assignedRules.map(r => (
                    <span key={r} style={{ fontFamily: "Courier New, monospace", fontSize: 10, background: `${NAVY}0f`, color: NAVY, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* Environment */}
              <div className="rounded p-2.5" style={{ background: selectedAgent.environment === "Production" ? `${TEAL}0a` : `${AMBER}0a`, border: `1px solid ${selectedAgent.environment === "Production" ? `${TEAL}30` : `${AMBER}30`}` }}>
                <div className="flex items-center gap-1.5">
                  <Globe size={12} style={{ color: selectedAgent.environment === "Production" ? TEAL : AMBER }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: selectedAgent.environment === "Production" ? TEAL : AMBER }}>
                    {selectedAgent.environment} environment
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-1 flex gap-2">
                <button className="flex-1 py-2 rounded border text-sm font-semibold"
                  style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                  Configure
                </button>
                {selectedAgent.status !== "Offline" && (
                  <button onClick={() => toggleSuspend(selectedAgent.id)}
                    className="flex-1 py-2 rounded text-white text-sm font-semibold"
                    style={{ background: selectedAgent.status === "Active" ? RED : GREEN, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                    {selectedAgent.status === "Active" ? "Suspend" : "Activate"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
