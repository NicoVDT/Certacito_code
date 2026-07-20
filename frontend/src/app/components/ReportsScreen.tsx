import React, { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Cell,
} from "recharts";
import {
  FileText, Download, Clock, RefreshCw, CheckCircle,
  TrendingUp, Plus, X, Play, Pause, Trash2,
} from "lucide-react";
import * as api from "../../api/client";

const NAVY = "#1B3A6B";
const TEAL = "#0D7377";
const RED = "#C0392B";
const GREEN = "#27AE60";
const AMBER = "#E67E22";
const GOLD = "#F39C12";

function ComplianceGauge({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 90 ? GREEN : score >= 75 ? GOLD : RED;
  return (
    <svg width={130} height={130} viewBox="0 0 130 130">
      <circle cx={65} cy={65} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      <circle cx={65} cy={65} r={r} fill="none" stroke={color}
        strokeWidth={10} strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round" transform="rotate(-90 65 65)" />
      <text x={65} y={60} textAnchor="middle"
        style={{ fontSize: 26, fontWeight: 700, fill: NAVY, fontFamily: "Arial" }}>
        {score}
      </text>
      <text x={65} y={76} textAnchor="middle"
        style={{ fontSize: 11, fill: "#6b7a99", fontFamily: "Arial" }}>
        /100
      </text>
      <text x={65} y={90} textAnchor="middle"
        style={{ fontSize: 9, fill: color, fontFamily: "Arial", fontWeight: 700 }}>
        {score >= 90 ? "EXCELLENT" : score >= 75 ? "GOOD" : "NEEDS ATTENTION"}
      </text>
    </svg>
  );
}

function frameworkStatusStyle(status: string) {
  if (status === "compliant") return { bg: "#f0fdf4", color: GREEN, label: "Compliant" };
  if (status === "monitoring") return { bg: "#fff7ed", color: AMBER, label: "Monitoring" };
  if (status === "action_required") return { bg: "#fef2f2", color: RED, label: "Action required" };
  return { bg: "#f3f4f6", color: "#9ca3af", label: "No activity" };
}

export function ReportsScreen() {
  const [activeTab, setActiveTab] = useState<"overview" | "templates" | "scheduled" | "exports">("overview");
  const [report, setReport] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [generatingFormat, setGeneratingFormat] = useState<string | null>(null);

  const [exports, setExports] = useState<any[]>([]);
  const [exportsLoaded, setExportsLoaded] = useState(false);

  const [schedules, setSchedules] = useState<any[]>([]);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [newFrequency, setNewFrequency] = useState("weekly");
  const [newRecipient, setNewRecipient] = useState("");

  useEffect(() => {
    api.getComplianceReport(30).then(setReport).catch(() => setReport(null));
    api.getWeeklyTrend(6).then(setTrend).catch(() => setTrend([]));
  }, []);

  const loadExports = () => {
    api.getExports().then(data => { setExports(data || []); setExportsLoaded(true); })
      .catch(() => setExportsLoaded(true));
  };
  const loadSchedules = () => {
    api.getSchedules().then(data => { setSchedules(data || []); setSchedulesLoaded(true); })
      .catch(() => setSchedulesLoaded(true));
  };

  useEffect(() => {
    if (activeTab === "exports") loadExports();
    if (activeTab === "scheduled") loadSchedules();
  }, [activeTab]);

  const handleGenerate = async (format: "PDF" | "CSV") => {
    setGeneratingFormat(format);
    try {
      const created = await api.createExport(format, 30);
      // open the real download immediately, and refresh the list underneath it
      window.open(api.exportDownloadUrl(created.id), "_blank");
      loadExports();
    } finally {
      setGeneratingFormat(null);
    }
  };

  const handleCreateSchedule = async () => {
    if (!newRecipient.trim()) return;
    await api.createSchedule(newFrequency, newRecipient.trim());
    setNewRecipient("");
    setShowScheduleForm(false);
    loadSchedules();
  };

  const handlePause = async (id: string) => { await api.pauseSchedule(id); loadSchedules(); };
  const handleResume = async (id: string) => { await api.resumeSchedule(id); loadSchedules(); };
  const handleDeleteSchedule = async (id: string) => { await api.deleteSchedule(id); loadSchedules(); };

  const overallScore = report?.summary?.compliance_score ?? 0;
  const frameworks = report?.frameworks_assessed ?? [];

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: "overview", label: "Compliance Overview" },
    { key: "templates", label: "Generate Report" },
    { key: "scheduled", label: "Scheduled Reports" },
    { key: "exports", label: "Recent Exports" },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div className="mb-5">
        <div style={{ color: "#9ca3af", fontSize: 11 }}>CERTACITO.AI / REPORTS & COMPLIANCE</div>
        <div className="flex items-center justify-between mt-1">
          <div>
            <h1 style={{ color: NAVY, fontSize: 22, fontWeight: 700 }}>Reports & Compliance</h1>
            <p style={{ color: "#6b7a99", fontSize: 12, marginTop: 2 }}>
              Compliance scoring, regulatory reports, and scheduled audit exports
            </p>
          </div>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-0 mb-5 border-b" style={{ borderColor: "rgba(27,58,107,0.1)" }}>
        {tabs.map(tab => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2.5 relative"
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 700 : 400,
              color: activeTab === tab.key ? NAVY : "#6b7a99",
              borderBottom: activeTab === tab.key ? `2px solid ${TEAL}` : "2px solid transparent",
              marginBottom: -1,
              background: "transparent",
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border p-5 flex items-center gap-5"
              style={{ borderColor: "rgba(27,58,107,0.08)", gridColumn: "span 1" }}>
              <ComplianceGauge score={overallScore} />
              <div>
                <div style={{ color: "#9ca3af", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 4 }}>
                  OVERALL COMPLIANCE
                </div>
                <div style={{ color: NAVY, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{overallScore}</div>
                <div style={{ color: "#6b7a99", fontSize: 12, marginTop: 4 }}>
                  {frameworks.length > 0 ? `across ${frameworks.length} framework${frameworks.length === 1 ? "" : "s"}` : "no rules tagged to a framework yet"}
                </div>
                <div className="mt-3 flex items-center gap-1.5" style={{ color: "#9ca3af" }}>
                  <TrendingUp size={13} />
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{report?.summary?.total_events ?? 0} decisions in the last 30 days</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border p-5 col-span-2"
              style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                Compliance Trend - Last {trend.length || 6} Weeks
              </h3>
              {trend.every((w: any) => w.score === null) ? (
                <div className="flex items-center justify-center" style={{ height: 100, color: "#9ca3af", fontSize: 12 }}>
                  Not enough audit history yet to show a trend
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={trend.map((w: any) => ({ week: w.week_start, score: w.score ?? 0 }))} barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => [`${v}/100`, "Compliance"]} contentStyle={{ fontFamily: "Arial, sans-serif", fontSize: 11 }} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {trend.map((_: any, i: number) => (
                        <Cell key={`trend-cell-${i}`} fill={i === trend.length - 1 ? TEAL : `${TEAL}70`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Framework breakdown - computed from the policy rules actually configured */}
          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b"
              style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>Compliance by Framework</h3>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>Last 30 days</span>
            </div>
            {frameworks.length === 0 ? (
              <div className="p-8 text-center" style={{ color: "#9ca3af", fontSize: 12 }}>
                No policy rules are tagged to a regulatory framework yet - tag a rule's "Regulatory tag" field on the Policy Rules screen.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(27,58,107,0.08)", background: "#f8fafc" }}>
                    {["FRAMEWORK", "COVERAGE", "MATCHED EVENTS", "RULES CONFIGURED", "STATUS"].map(h => (
                      <th key={h} className="px-5 py-3 text-left"
                        style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {frameworks.map((fw: any) => {
                    const s = frameworkStatusStyle(fw.status);
                    return (
                      <tr key={fw.name} className="border-b hover:bg-gray-50" style={{ borderColor: "rgba(27,58,107,0.06)" }}>
                        <td className="px-5 py-3.5">
                          <span style={{ color: "#374151", fontSize: 13, fontWeight: 600 }}>{fw.name}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          {fw.coverage_pct === null ? (
                            <span style={{ color: "#9ca3af", fontSize: 12 }}>no activity</span>
                          ) : (
                            <div className="flex items-center gap-3" style={{ minWidth: 140 }}>
                              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "#e5e7eb" }}>
                                <div className="origin-left" style={{ width: "100%", background: s.color, height: "100%", borderRadius: 9999, transform: `scaleX(${fw.coverage_pct / 100})` }} />
                              </div>
                              <span style={{ fontSize: 13, fontWeight: 700, color: s.color, minWidth: 34 }}>{fw.coverage_pct}%</span>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span style={{ color: "#374151", fontSize: 13 }}>{fw.matched_events}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span style={{ color: "#374151", fontSize: 13 }}>{fw.rules_count}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Generate Report tab ──────────────────────────────────────────────── */}
      {activeTab === "templates" && (
        <div className="max-w-lg">
          <div className="bg-white rounded-lg border p-5" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: `${TEAL}15`, color: TEAL }}>
                <CheckCircle size={18} />
              </div>
              <h3 style={{ color: NAVY, fontSize: 14, fontWeight: 700 }}>Regulatory Compliance Summary</h3>
            </div>
            <p style={{ color: "#6b7a99", fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>
              Framework coverage, decision outcomes and risk breakdown for the last 30 days,
              built from the same live data as the Overview tab.
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleGenerate("PDF")} disabled={generatingFormat !== null}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-white font-semibold transition-opacity hover:opacity-90"
                style={{ background: NAVY, fontFamily: "Arial, sans-serif", fontSize: 12, opacity: generatingFormat ? 0.6 : 1 }}>
                {generatingFormat === "PDF" ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                {generatingFormat === "PDF" ? "Generating..." : "Download PDF"}
              </button>
              <button onClick={() => handleGenerate("CSV")} disabled={generatingFormat !== null}
                className="flex items-center gap-1.5 px-4 py-2 rounded text-white font-semibold transition-opacity hover:opacity-90"
                style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 12, opacity: generatingFormat ? 0.6 : 1 }}>
                {generatingFormat === "CSV" ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                {generatingFormat === "CSV" ? "Generating..." : "Download CSV"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scheduled tab ────────────────────────────────────────────────────── */}
      {activeTab === "scheduled" && (
        <div className="space-y-3">
          <div className="flex justify-end mb-1">
            <button onClick={() => setShowScheduleForm(o => !o)}
              className="flex items-center gap-1.5 px-4 py-2 rounded text-white font-semibold"
              style={{ background: TEAL, fontFamily: "Arial, sans-serif", fontSize: 13 }}>
              <Plus size={14} /> Schedule report
            </button>
          </div>

          {showScheduleForm && (
            <div className="bg-white rounded-lg border p-4 flex items-end gap-3" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: NAVY }} className="block mb-1.5">Frequency</label>
                <select value={newFrequency} onChange={e => setNewFrequency(e.target.value)}
                  className="px-3 py-2 rounded border outline-none" style={{ fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="flex-1">
                <label style={{ fontSize: 12, fontWeight: 600, color: NAVY }} className="block mb-1.5">Recipient email</label>
                <input value={newRecipient} onChange={e => setNewRecipient(e.target.value)} placeholder="you@certacito.ai"
                  className="w-full px-3 py-2 rounded border outline-none" style={{ fontSize: 13, borderColor: "rgba(27,58,107,0.2)", background: "#f8fafc" }} />
              </div>
              <button onClick={handleCreateSchedule} className="px-4 py-2 rounded text-white font-semibold" style={{ background: TEAL, fontSize: 13 }}>
                Create
              </button>
              <button onClick={() => setShowScheduleForm(false)} style={{ color: "#9ca3af" }}><X size={18} /></button>
            </div>
          )}

          <div className="rounded-lg px-4 py-2.5 border flex items-start gap-2" style={{ borderColor: `${TEAL}30`, background: `${TEAL}06` }}>
            <FileText size={13} style={{ color: TEAL, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
              Every schedule generates and stores a real PDF on its due date.
              Email delivery needs an SMTP account configured on the server - until then, generated reports
              land in Recent Exports and can be downloaded from there.
            </p>
          </div>

          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(27,58,107,0.08)", background: "#f8fafc" }}>
                  {["FREQUENCY", "RECIPIENT", "NEXT RUN", "LAST SENT", "STATUS", "ACTIONS"].map(h => (
                    <th key={h} className="px-4 py-3 text-left"
                      style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedulesLoaded && schedules.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "#9ca3af", fontSize: 12 }}>No scheduled reports yet.</td></tr>
                )}
                {schedules.map((s: any) => (
                  <tr key={s.id} className="border-b hover:bg-gray-50 transition-colors" style={{ borderColor: "rgba(27,58,107,0.06)" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock size={11} style={{ color: "#9ca3af" }} />
                        <span style={{ color: "#374151", fontSize: 12, textTransform: "capitalize" }}>{s.frequency}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151" }}>{s.recipient}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151" }}>{s.next_run?.slice(0, 16).replace("T", " ")}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#9ca3af" }}>{s.last_sent ? s.last_sent.slice(0, 16).replace("T", " ") : "Never"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span style={{
                        background: s.status === "Active" ? "#f0fdf4" : "#f9fafb",
                        color: s.status === "Active" ? GREEN : "#9ca3af",
                        fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                      }}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {s.status === "Active" ? (
                          <button onClick={() => handlePause(s.id)} className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs"
                            style={{ borderColor: "rgba(230,126,34,0.3)", color: AMBER, fontSize: 11 }}>
                            <Pause size={11} /> Pause
                          </button>
                        ) : (
                          <button onClick={() => handleResume(s.id)} className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs"
                            style={{ borderColor: "rgba(39,174,96,0.3)", color: GREEN, fontSize: 11 }}>
                            <Play size={11} /> Resume
                          </button>
                        )}
                        <button onClick={() => handleDeleteSchedule(s.id)} className="flex items-center gap-1 px-2.5 py-1 rounded border text-xs"
                          style={{ borderColor: "rgba(192,57,43,0.3)", color: RED, fontSize: 11 }}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Exports tab ──────────────────────────────────────────────────────── */}
      {activeTab === "exports" && (
        <div className="space-y-3">
          <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
              <h3 style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>Recent Exports</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(27,58,107,0.08)", background: "#f8fafc" }}>
                  {["REPORT NAME", "GENERATED BY", "TIMESTAMP", "FORMAT", "SIZE", ""].map(h => (
                    <th key={h} className="px-5 py-3 text-left"
                      style={{ fontFamily: "Arial, sans-serif", fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {exportsLoaded && exports.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center" style={{ color: "#9ca3af", fontSize: 12 }}>No exports yet - generate one from the Generate Report tab.</td></tr>
                )}
                {exports.map((exp: any) => (
                  <tr key={exp.id} className="border-b hover:bg-gray-50 transition-colors" style={{ borderColor: "rgba(27,58,107,0.06)" }}>
                    <td className="px-5 py-3.5">
                      <span style={{ color: "#374151", fontSize: 12, fontWeight: 600 }}>{exp.name}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span style={{ color: "#374151", fontSize: 12 }}>{exp.generated_by}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "#374151" }}>{exp.timestamp?.slice(0, 16).replace("T", " ")}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span style={{
                        background: exp.format === "PDF" ? `${NAVY}0f` : `${TEAL}12`,
                        color: exp.format === "PDF" ? NAVY : TEAL,
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                      }}>
                        {exp.format}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>{exp.size}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <a href={api.exportDownloadUrl(exp.id)} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1 rounded border text-xs w-fit"
                        style={{ borderColor: "rgba(27,58,107,0.2)", color: NAVY, fontSize: 11, textDecoration: "none" }}>
                        <Download size={11} /> Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg px-4 py-3 border flex items-start gap-2" style={{ borderColor: `${TEAL}30`, background: `${TEAL}06` }}>
            <FileText size={13} style={{ color: TEAL, flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11, color: "#374151", lineHeight: 1.6 }}>
              Exports are stored alongside your audit data and available for download at any time.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
