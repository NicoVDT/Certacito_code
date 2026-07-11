import { Toggle } from "./SettingsUtils";
import React, { useState, useEffect, useRef } from "react";
// import { debounce } from "lodash"; // TODO: use this for the search bar later
import {
  Building2, Users, Bell, Key, Zap, Copy, RefreshCw, Plus,
  Check, X, Globe, Trash2, Shield, ChevronRight,
} from "lucide-react";
import * as api from "../../api/client";

// brand colours (duped again - TODO share these across screens)
const NAVY = "#1B3A6B";
const TEAL = "#0D7377";
const RED = "#C0392B";
const GREEN = "#27AE60";
const AMBER = "#E67E22";

type TabKey = "organization" | "team" | "notifications" | "apikeys" | "integrations";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "Domain Administrator" | "Security Reviewer" | "Compliance Officer" | "Policy Manager" | "Read-Only Analyst";
  lastLogin: string;
  status: "Active" | "Inactive";
  avatar: string;
}

interface ApiKey {
  id: string;
  label: string;
  masked: string;
  environment: "Production" | "Staging";
  created: string;
  last_used: string;
  created_by: string;
  revoked: boolean;
}

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  status: "Connected" | "Not connected" | "Configured";
  detail: string;
  logo: string;
}


// none of these are actually wired up yet - keep the status honest instead of
// claiming a live connection nobody built. better to show "not built" than
// have a Connect button that does nothing
const integrations: Integration[] = [
  { id: "INT-001", name: "Splunk SIEM", category: "Security", description: "Stream all policy decisions and audit events to Splunk for centralised security monitoring.", status: "Not connected", detail: "Not built for this release", logo: "SP" },
  { id: "INT-002", name: "Slack", category: "Notifications", description: "Send real-time alerts for escalated and critical-risk events to a Slack channel.", status: "Not connected", detail: "Not built for this release", logo: "SL" },
  { id: "INT-003", name: "PagerDuty", category: "Incident Response", description: "Trigger PagerDuty incidents for Critical-risk escalations that exceed SLA thresholds.", status: "Not connected", detail: "Not built for this release", logo: "PD" },
  { id: "INT-004", name: "Microsoft Sentinel", category: "Security", description: "Ingest Certacito.ai events into Microsoft Sentinel for SIEM analytics and threat detection.", status: "Not connected", detail: "Not built for this release", logo: "MS" },
  { id: "INT-005", name: "Datadog", category: "Observability", description: "Export metrics and traces for AI agent performance and policy enforcement monitoring.", status: "Not connected", detail: "Not built for this release", logo: "DD" },
  { id: "INT-006", name: "Email / SMTP", category: "Notifications", description: "Send compliance report exports and system alerts by email.", status: "Not connected", detail: "Not built for this release", logo: "EM" },
];

const roleColors: Record<string, { bg: string; text: string }> = {
  "Domain Administrator": { bg: `${NAVY}12`, text: NAVY },
  "Security Reviewer": { bg: `${TEAL}12`, text: TEAL },
  "Compliance Officer": { bg: "#f3e8ff", text: "#7c3aed" },
  "Policy Manager": { bg: "#fff7ed", text: AMBER },
  "Read-Only Analyst": { bg: "#f1f5f9", text: "#6b7a99" },
};



export function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("organization");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  // const [debugUsers, setDebugUsers] = useState(null); // why was this crashing the render??
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // fetch real users from the api when team tab is shown - no fake roster,
  // this is exactly who's actually registered
  useEffect(() => {
    if (activeTab !== "team") return;
    const load = async () => {
      try {
        const users = await api.getUsers();
        setMembers((users || []).map((u: any) => ({
          id: u.id,
          name: u.email.split("@")[0],
          email: u.email,
          // backend roles map onto our display roles - names don't line up 1:1
          role: u.role === "Administrator" ? "Domain Administrator" : u.role === "Analyst" ? "Security Reviewer" : "Read-Only Analyst",
          lastLogin: u.created_at?.split("T")[0] || "—",
          status: u.is_active ? "Active" as const : "Inactive" as const,
          avatar: u.email.slice(0, 2).toUpperCase(),
        })));
      } catch {
        setMembers([]);
      } finally {
        setMembersLoaded(true);
      }
    };
    load();
  }, [activeTab]);

  // api keys - real ones, issued from this screen
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [newKeyEnv, setNewKeyEnv] = useState<"Production" | "Staging">("Production");
  const [revealedKey, setRevealedKey] = useState<{ label: string; key: string } | null>(null);

  const loadKeys = async () => {
    try {
      const data = await api.getApiKeys();
      setKeys(data || []);
    } catch {
      setKeys([]);
    } finally {
      setKeysLoaded(true);
    }
  };

  useEffect(() => {
    if (activeTab !== "apikeys") return;
    loadKeys();
  }, [activeTab]);

  const handleCreateKey = async () => {
    if (!newKeyLabel.trim()) return;
    const created = await api.createApiKey(newKeyLabel.trim(), newKeyEnv);
    setRevealedKey({ label: created.label, key: created.key });
    setNewKeyLabel("");
    setShowCreateKey(false);
    loadKeys();
  };

  // const testKeyRender = () => { console.log("rendering key", keys) }

  const handleRotateKey = async (key: ApiKey) => {
    const rotated = await api.rotateApiKey(key.id);
    setRevealedKey({ label: rotated.label, key: rotated.key });
    loadKeys();
  };

  const handleRevokeKey = async (id: string) => {
    await api.revokeApiKey(id);
    loadKeys();
  };

  const [orgForm, setOrgForm] = useState({
    name: "Certacito Financial Services",
    domain: "certacito.ai",
    timezone: "Australia/Sydney",
    contact: "admin@certacito.ai",
    maxAgents: "180",
    retentionDays: "90",
  });
  const [notifSettings, setNotifSettings] = useState({
    criticalEmail: true,
    criticalSlack: true,
    escalationEmail: true,
    escalationSlack: false,
    dailyDigest: true,
    weeklyReport: true,
    policyChanges: true,
    agentSuspended: true,
    slaBreachEmail: true,
    slaBreachSlack: true,
    loginAlerts: false,
  });
  const [savedOrg, setSavedOrg] = useState(false);

  const handleCopyKey = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const toggleMemberStatus = (id: string) => {
    setMembers(prev => prev.map(m => m.id === id ? { ...m, status: m.status === "Active" ? "Inactive" : "Active" } : m));
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: "organization", label: "Organisation", icon: <Building2 size={14} /> },
    { key: "team", label: "Team Members", icon: <Users size={14} /> },
    { key: "notifications", label: "Notifications", icon: <Bell size={14} /> },
    { key: "apikeys", label: "API Keys", icon: <Key size={14} /> },
    { key: "integrations", label: "Integrations", icon: <Zap size={14} /> },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div className="mb-5">
        <div style={{ color: "#9ca3af", fontSize: 11 }}>CERTACITO.AI / SETTINGS</div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 700 }}>Settings</h1>
            <p style={{ color: "#6b7a99", fontSize: 12, marginTop: 2 }}>
              Organisation configuration, team management, and platform integrations
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-5">
        {/* Sidebar tabs */}
        <div className="flex-shrink-0" style={{ width: 200 }}>
          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            {tabs.map(tab => (
              <button key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-left border-b transition-colors"
                style={{
                  borderColor: "rgba(27,58,107,0.06)",
                  background: activeTab === tab.key ? `${TEAL}08` : "transparent",
                  color: activeTab === tab.key ? TEAL : "#374151",
                  fontFamily: "Arial, sans-serif",
                  fontSize: 13,
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  borderLeft: activeTab === tab.key ? `3px solid ${TEAL}` : "3px solid transparent",
                }}>
                <span style={{ color: activeTab === tab.key ? TEAL : "#9ca3af" }}>{tab.icon}</span>
                {tab.label}
                <ChevronRight size={12} style={{ marginLeft: "auto", color: "#9ca3af", opacity: activeTab === tab.key ? 1 : 0 }} />
              </button>
            ))}
          </div>

          {/* Registered agent limit - mirrors the Governance Limits field, not a billing plan */}
          <div className="mt-3 bg-white rounded-lg border p-4" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 6 }}>AGENT LIMIT</div>
            <div style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>{orgForm.maxAgents} max</div>
            <div style={{ color: "#6b7a99", fontSize: 11, marginTop: 2 }}>Set below under Governance Limits</div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">

          {/* ── Organisation ─────────────────────────────────────────────────── */}
          {activeTab === "organization" && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border p-5" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                <h3 style={{ color: NAVY, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Organisation Profile</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Organisation Name", key: "name" as const },
                    { label: "Primary Domain", key: "domain" as const },
                    { label: "Contact Email", key: "contact" as const },
                    { label: "Timezone", key: "timezone" as const },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                        className="block mb-1.5">{label}</label>
                      <input value={orgForm[key]}
                        onChange={e => setOrgForm(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded border outline-none"
                        style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-lg border p-5" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                <h3 style={{ color: NAVY, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Governance Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Maximum Registered Agents", key: "maxAgents" as const, suffix: "agents" },
                    { label: "Audit Log Retention", key: "retentionDays" as const, suffix: "days" },
                  ].map(({ label, key, suffix }) => (
                    <div key={key}>
                      <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }}
                        className="block mb-1.5">{label}</label>
                      <div className="flex items-center gap-2">
                        <input value={orgForm[key]}
                          onChange={e => setOrgForm(prev => ({ ...prev, [key]: e.target.value }))}
                          className="flex-1 px-3 py-2 rounded border outline-none"
                          style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }} />
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>{suffix}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3">
                {/* TODO: these don't actually persist anywhere yet, just visual */}
                <button onClick={() => setSavedOrg(false)}
                  className="px-4 py-2 rounded border font-semibold"
                  style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Discard changes
                </button>
                <button onClick={() => { setSavedOrg(true); setTimeout(() => setSavedOrg(false), 2000); }}
                  className="flex items-center gap-1.5 px-5 py-2 rounded text-white font-semibold"
                  style={{ background: savedOrg ? GREEN : TEAL, fontFamily: "Arial, sans-serif", fontSize: 13, transition: "background 0.3s" }}>
                  {savedOrg ? <><Check size={14} /> Saved</> : "Save changes"}
                </button>
              </div>
            </div>
          )}

          {/* ── Team Members ─────────────────────────────────────────────────── */}
          {activeTab === "team" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded text-white font-semibold"
                  style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  <Plus size={14} /> Invite member
                </button>
              </div>
              <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(27,58,107,0.08)", background: "#f8fafc" }}>
                      {["MEMBER", "ROLE", "LAST LOGIN", "STATUS", "ACTIONS"].map(h => (
                        <th key={h} className="px-5 py-3 text-left"
                          style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {membersLoaded && members.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center" style={{ color: "#9ca3af", fontSize: 12 }}>
                          No team members registered yet.
                        </td>
                      </tr>
                    )}
                    {members.map(m => {
                      const rc = roleColors[m.role] ?? { bg: "#f1f5f9", text: "#6b7a99" };
                      return (
                        <tr key={m.id} className="border-b hover:bg-gray-50 transition-colors"
                          style={{ borderColor: "rgba(27,58,107,0.06)" }}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center rounded-full flex-shrink-0"
                                style={{ width: 32, height: 32, background: `${NAVY}15`, color: NAVY, fontSize: 11, fontWeight: 700 }}>
                                {m.avatar}
                              </div>
                              <div>
                                <div style={{ color: "#374151", fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                                <div style={{ fontFamily: "Courier New, monospace", fontSize: 10, color: "#9ca3af" }}>{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span style={{ background: rc.bg, color: rc.text, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4 }}>
                              {m.role}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151" }}>{m.lastLogin}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span style={{
                              background: m.status === "Active" ? "#f0fdf4" : "#f9fafb",
                              color: m.status === "Active" ? GREEN : "#9ca3af",
                              fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            }}>
                              {m.status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-1.5">
                              <button className="px-2.5 py-1 rounded border text-xs"
                                style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                                Edit role
                              </button>
                              <button onClick={() => toggleMemberStatus(m.id)}
                                className="px-2.5 py-1 rounded border text-xs"
                                style={{ borderColor: m.status === "Active" ? "rgba(192,57,43,0.3)" : "rgba(39,174,96,0.3)", color: m.status === "Active" ? RED : GREEN, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                                {m.status === "Active" ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Role legend */}
              <div className="bg-white rounded-lg border p-4" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 8 }}>ROLE PERMISSIONS</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { role: "Domain Administrator", perms: "Full access - manage all settings, agents, rules, and users" },
                    { role: "Security Reviewer", perms: "Approve/deny queue items, view audit logs, read policies" },
                    { role: "Compliance Officer", perms: "Generate reports, view all screens, edit regulatory tags" },
                    { role: "Policy Manager", perms: "Create and edit policy rules, manage version history" },
                    { role: "Read-Only Analyst", perms: "View-only access to all screens - no edit permissions" },
                  ].map(({ role, perms }) => {
                    const rc = roleColors[role] ?? { bg: "#f1f5f9", text: "#6b7a99" };
                    return (
                      <div key={role} className="flex items-start gap-2">
                        <span style={{ background: rc.bg, color: rc.text, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, flexShrink: 0, marginTop: 1 }}>
                          {role}
                        </span>
                        <span style={{ color: "#6b7a99", fontSize: 11, lineHeight: 1.5 }}>{perms}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Notifications ────────────────────────────────────────────────── */}
          {activeTab === "notifications" && (
            <div className="space-y-4">
              {[
                {
                  section: "Critical & Escalation Alerts",
                  items: [
                    { key: "criticalEmail" as const, label: "Critical-risk events", channel: "Email", desc: "Immediate email when a Critical-risk policy violation occurs" },
                    { key: "criticalSlack" as const, label: "Critical-risk events", channel: "Slack", desc: "Real-time Slack notification to #ai-governance" },
                    { key: "escalationEmail" as const, label: "New escalations", channel: "Email", desc: "Email when an item is escalated to the approval queue" },
                    { key: "escalationSlack" as const, label: "New escalations", channel: "Slack", desc: "Slack notification for new escalation queue items" },
                    { key: "slaBreachEmail" as const, label: "SLA breach warnings", channel: "Email", desc: "Email when a queue item is within 10 minutes of SLA breach" },
                    { key: "slaBreachSlack" as const, label: "SLA breach warnings", channel: "Slack", desc: "Slack notification for approaching SLA deadlines" },
                  ],
                },
                {
                  section: "Reports & Digests",
                  items: [
                    { key: "dailyDigest" as const, label: "Daily incident digest", channel: "Email", desc: "Summary of all policy decisions from the past 24 hours" },
                    { key: "weeklyReport" as const, label: "Weekly compliance report", channel: "Email", desc: "Compliance score, rule effectiveness, and trend analysis" },
                  ],
                },
                {
                  section: "System Events",
                  items: [
                    { key: "policyChanges" as const, label: "Policy rule changes", channel: "Email", desc: "Notifications when any policy rule is created, edited, or toggled" },
                    { key: "agentSuspended" as const, label: "Agent suspended/activated", channel: "Email", desc: "Email when an agent's status changes" },
                    { key: "loginAlerts" as const, label: "Admin login alerts", channel: "Email", desc: "Notify on new logins from unrecognised locations" },
                  ],
                },
              ].map(group => (
                <div key={group.section} className="bg-white rounded-lg border overflow-hidden"
                  style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                  <div className="px-5 py-3.5 border-b" style={{ borderColor: "rgba(27,58,107,0.08)", background: "#f8fafc" }}>
                    <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>{group.section}</h3>
                  </div>
                  <div className="divide-y" style={{ borderColor: "rgba(27,58,107,0.06)" }}>
                    {group.items.map(item => (
                      <div key={item.key} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
                        <div>
                          <div className="flex items-center gap-2">
                            <span style={{ color: "#374151", fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                            <span style={{
                              background: item.channel === "Email" ? `${NAVY}0f` : `${GREEN}15`,
                              color: item.channel === "Email" ? NAVY : GREEN,
                              fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 3,
                            }}>
                              {item.channel}
                            </span>
                          </div>
                          <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 1 }}>{item.desc}</div>
                        </div>
                        <Toggle
                          checked={notifSettings[item.key]}
                          onChange={() => setNotifSettings(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── API Keys ─────────────────────────────────────────────────────── */}
          {activeTab === "apikeys" && (
            <div className="space-y-4">
              {/* Warning banner */}
              <div className="flex items-start gap-2 rounded-lg px-4 py-3 border"
                style={{ borderColor: `${AMBER}40`, background: "#fffbeb" }}>
                <Shield size={14} style={{ color: AMBER, flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 12, color: "#374151", fontFamily: "Arial, sans-serif", lineHeight: 1.6 }}>
                  API keys grant programmatic access to the Certacito.ai governance API.
                  Never commit keys to version control or share them in logs.
                  Rotate keys immediately if you suspect a compromise.
                </p>
              </div>

              {/* One-time reveal - the raw key is never shown again after this */}
              {revealedKey && (
                <div className="rounded-lg border p-4" style={{ borderColor: `${GREEN}40`, background: "#f0fdf4" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ color: "#166534", fontSize: 12, fontWeight: 700 }}>
                      {revealedKey.label} - copy this now, it will not be shown again
                    </span>
                    <button onClick={() => setRevealedKey(null)} style={{ color: "#166534" }}><X size={14} /></button>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded" style={{ background: "#0f172a" }}>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: "#e2e8f0", flex: 1, wordBreak: "break-all" }}>
                      {revealedKey.key}
                    </span>
                    <button onClick={() => handleCopyKey("revealed", revealedKey.key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs flex-shrink-0"
                      style={{ background: copiedKey === "revealed" ? `${GREEN}30` : "#1e293b", color: copiedKey === "revealed" ? GREEN : "#94a3b8", fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                      {copiedKey === "revealed" ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                    </button>
                  </div>
                </div>
              )}

              {keysLoaded && keys.length === 0 && (
                <div className="bg-white rounded-lg border p-8 text-center" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                  <Key size={24} style={{ color: "#9ca3af", margin: "0 auto 8px" }} />
                  <div style={{ color: NAVY, fontWeight: 700, fontSize: 13 }}>No API keys yet</div>
                  <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }}>Agents authenticate with a key generated here.</div>
                </div>
              )}

              {keys.map(key => (
                <div key={key.id} className="bg-white rounded-lg border p-5"
                  style={{ borderColor: "rgba(27,58,107,0.08)", opacity: key.revoked ? 0.6 : 1 }}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>{key.label}</h3>
                        <span style={{
                          background: key.environment === "Production" ? `${TEAL}12` : "#fff7ed",
                          color: key.environment === "Production" ? TEAL : AMBER,
                          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 3,
                        }}>
                          {key.environment}
                        </span>
                        {key.revoked && (
                          <span style={{ background: "#fef2f2", color: RED, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 3 }}>
                            Revoked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-4 p-3 rounded"
                    style={{ background: "#0f172a" }}>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 12, color: "#94a3b8", flex: 1 }}>
                      {key.masked}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      ["Created", key.created],
                      ["Last used", key.last_used],
                      ["Created by", key.created_by],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {!key.revoked && (
                    <div className="flex gap-2 mt-4 pt-4 border-t" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                      <button onClick={() => handleRotateKey(key)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs"
                        style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                        <RefreshCw size={11} /> Rotate key
                      </button>
                      <button onClick={() => handleRevokeKey(key.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs"
                        style={{ borderColor: "rgba(192,57,43,0.3)", color: RED, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                        <Trash2 size={11} /> Revoke
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {showCreateKey ? (
                <div className="bg-white rounded-lg border p-4 flex items-end gap-3" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                  <div className="flex-1">
                    <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }} className="block mb-1.5">Label</label>
                    <input value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} placeholder="e.g. Production agent key"
                      className="w-full px-3 py-2 rounded border outline-none"
                      style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }} className="block mb-1.5">Environment</label>
                    <select value={newKeyEnv} onChange={e => setNewKeyEnv(e.target.value as "Production" | "Staging")}
                      className="px-3 py-2 rounded border outline-none"
                      style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }}>
                      <option>Production</option>
                      <option>Staging</option>
                    </select>
                  </div>
                  <button onClick={handleCreateKey} className="px-4 py-2 rounded text-white font-semibold"
                    style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                    Generate
                  </button>
                  <button onClick={() => setShowCreateKey(false)} className="px-4 py-2 rounded border font-semibold"
                    style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowCreateKey(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border font-semibold"
                  style={{ borderColor: "rgba(27,58,107,0.15)", borderStyle: "dashed", color: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  <Plus size={14} /> Generate new API key
                </button>
              )}
            </div>
          )}

          {/* ── Integrations ─────────────────────────────────────────────────── */}
          {activeTab === "integrations" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {integrations.map(intg => {
                  const statusMap = {
                    Connected: { color: GREEN, bg: "#f0fdf4", border: "#bbf7d0" },
                    Configured: { color: AMBER, bg: "#fff7ed", border: "#fed7aa" },
                    "Not connected": { color: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb" },
                  };
                  const s = statusMap[intg.status];
                  return (
                    <div key={intg.id} className="bg-white rounded-lg border p-5"
                      style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center rounded-lg flex-shrink-0"
                            style={{ width: 36, height: 36, background: `${NAVY}0f`, color: NAVY, fontFamily: "Courier New, monospace", fontSize: 12, fontWeight: 700 }}>
                            {intg.logo}
                          </div>
                          <div>
                            <div style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>{intg.name}</div>
                            <div style={{ color: "#9ca3af", fontSize: 10 }}>{intg.category}</div>
                          </div>
                        </div>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>
                          {intg.status}
                        </span>
                      </div>
                      <p style={{ color: "#6b7a99", fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>{intg.description}</p>
                      <div style={{ color: "#9ca3af", fontSize: 11, fontFamily: "Courier New, monospace", marginBottom: 12 }}>{intg.detail}</div>
                      <div className="flex gap-2 pt-3 border-t" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
                        {intg.status === "Connected" || intg.status === "Configured" ? (
                          <>
                            <button className="px-3 py-1.5 rounded border text-xs font-semibold"
                              style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                              Configure
                            </button>
                            <button className="px-3 py-1.5 rounded border text-xs font-semibold"
                              style={{ borderColor: "rgba(192,57,43,0.3)", color: RED, fontFamily: "Arial, sans-serif", fontSize: 11 }}>
                              Disconnect
                            </button>
                          </>
                        ) : (
                          <button className="flex-1 py-1.5 rounded text-white text-xs font-semibold"
                            style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 12 }}>
                            Connect
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 style={{ color: NAVY, fontWeight: 700, fontSize: 16, fontFamily: "Arial, sans-serif" }}>Invite team member</h3>
                <button onClick={() => setShowInviteModal(false)} style={{ color: "#9ca3af" }}><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }} className="block mb-1.5">
                    Email address *
                  </label>
                  <input placeholder="colleague@certacito.ai"
                    className="w-full px-3 py-2.5 rounded border outline-none"
                    style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }} />
                </div>
                <div>
                  <label style={{ fontFamily: "Arial, sans-serif", fontSize: 12, fontWeight: 600, color: NAVY }} className="block mb-1.5">
                    Role *
                  </label>
                  <select className="w-full px-3 py-2.5 rounded border outline-none"
                    style={{ fontFamily: "Arial, sans-serif", fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }}>
                    {Object.keys(roleColors).map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2.5 rounded border font-semibold"
                  style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Cancel
                </button>
                <button onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2.5 rounded text-white font-semibold"
                  style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
                  Send invitation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
