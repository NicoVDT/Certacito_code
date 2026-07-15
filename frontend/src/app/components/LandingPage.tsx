import React, { useState, useEffect } from "react";
import logoImg from "../../imports/certacito_logo.png";
import {
  ShieldCheck, Bot, ClipboardList, BarChart2, Users, FileText,
  Activity, FlaskConical, Check, ArrowRight, Menu, X,
} from "lucide-react";

// brand colours - match what App.tsx uses so they don't drift apart
const NAVY = "#1B3A6B";
const TEAL = "#0D7377";
const RED = "#C0392B";
const GREEN = "#27AE60";
const AMBER = "#E67E22";

interface LandingPageProps {
  onLogin: () => void;
  onSignUp: () => void;
}

// ── Navbar ────────────────────────────────────────────────────────────────────
function Navbar({ onLogin }: { onLogin: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // pick up scroll so the navbar gets a bg once we leave the top
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const links = ["Overview", "How it works", "Compliance", "Docs"];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-colors duration-200"
      style={{
        background: scrolled ? "rgba(255,255,255,0.97)" : "transparent",
        borderBottom: scrolled ? "1px solid rgba(27,58,107,0.08)" : "1px solid transparent",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between" style={{ height: 60 }}>
        <div className="flex items-center gap-2.5">
          <div style={{ width: 32, height: 32, background: "#fff", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: 3, flexShrink: 0 }}>
            <img src={logoImg} alt="Certacito.ai" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: scrolled ? NAVY : "#fff" }}>
            certacito<span style={{ color: "#4dd9dc" }}>.ai</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-8">
          {links.map(link => (
            <a key={link} href="#"
              style={{ fontSize: 14, color: scrolled ? "#374151" : "rgba(255,255,255,0.8)", textDecoration: "none", fontWeight: 500 }}>
              {link}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <button onClick={onLogin}
            style={{ fontSize: 14, fontWeight: 600, color: scrolled ? NAVY : "#fff", background: "transparent", padding: "7px 16px", borderRadius: 7, border: `1.5px solid ${scrolled ? "rgba(27,58,107,0.25)" : "rgba(255,255,255,0.35)"}` }}>
            Log in
          </button>
          <button onClick={onLogin}
            style={{ fontSize: 14, fontWeight: 600, color: "#fff", background: TEAL, padding: "7px 16px", borderRadius: 7 }}>
            View live demo
          </button>
        </div>

        <button className="md:hidden" onClick={() => setMobileOpen(o => !o)} style={{ color: scrolled ? NAVY : "#fff" }}>
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white border-t px-6 py-4 space-y-3" style={{ borderColor: "rgba(27,58,107,0.08)" }}>
          {links.map(link => (
            <a key={link} href="#" className="block" style={{ fontSize: 14, color: "#374151", textDecoration: "none", padding: "6px 0" }}>
              {link}
            </a>
          ))}
          <button onClick={onLogin} className="w-full py-2 rounded-lg text-white font-semibold" style={{ fontSize: 14, background: TEAL }}>
            Log in
          </button>
        </div>
      )}
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
// the rows in the little live feed box - just hardcoded for the landing page,
// real feed is on the dashboard
const liveFeedRows = [
  { id: "AGT-claims-014", action: "data_access", outcome: "DENY", color: RED },
  { id: "AGT-support-031", action: "prompt_content", outcome: "DENY", color: RED },
  { id: "AGT-finance-004", action: "tool_invoke", outcome: "PERMIT", color: GREEN },
  { id: "AGT-ops-009", action: "file_write", outcome: "ESCALATE", color: AMBER },
];

function Hero({ onLogin }: { onLogin: () => void }) {
  return (
    <section style={{ background: "#0f2040", paddingTop: 120, paddingBottom: 88 }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-14 items-start">
          <div>
            <h1 style={{ fontWeight: 800, fontSize: "clamp(32px, 4vw, 52px)", color: "#fff", lineHeight: 1.15, marginBottom: 20, letterSpacing: "-0.02em" }}>
              Govern your AI agents<br />before they govern you.
            </h1>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.7)", lineHeight: 1.7, marginBottom: 32, maxWidth: 480 }}>
              Certacito.ai sits between your agents and the systems they act on. Every tool
              call, data read and prompt is checked against your policy ruleset before it
              runs, with a human in the loop for anything high-risk.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <button onClick={onLogin}
                className="flex items-center gap-2"
                style={{ fontSize: 15, fontWeight: 600, color: "#fff", background: TEAL, padding: "12px 24px", borderRadius: 8 }}>
                View live demo <ArrowRight size={15} />
              </button>
              <button onClick={onLogin}
                style={{ fontSize: 15, fontWeight: 600, color: "#fff", background: "transparent", border: "1.5px solid rgba(255,255,255,0.25)", padding: "12px 24px", borderRadius: 8 }}>
                Log in
              </button>
            </div>

            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", maxWidth: 460, lineHeight: 1.6 }}>
              The demo below runs against the live policy engine, not staged screenshots.
            </p>
          </div>

          {/* Live decision panel - real data shape, no chrome, no shadow theatrics */}
          <div style={{ background: "#132a52", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10 }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>Live decision feed</span>
            </div>
            <div>
              {liveFeedRows.map(row => (
                <div key={row.id} className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="flex items-center gap-3">
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: TEAL }}>{row.id}</span>
                    <span style={{ fontFamily: "Courier New, monospace", fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{row.action}</span>
                  </div>
                  <span style={{ color: row.color, fontSize: 11, fontWeight: 700 }}>{row.outcome}</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              Same feed the audit log and approval queue read from.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { value: "SHA-256", label: "Hash-chained audit log", color: NAVY },
    { value: "6", label: "Compliance frameworks in the report engine", color: TEAL },
    { value: "3", label: "Decision outcomes - permit, deny, escalate", color: GREEN },
    { value: "44", label: "Automated tests, incl. RBAC regression", color: AMBER },
  ];
  return (
    <section className="py-16" style={{ background: "#fff", borderBottom: "1px solid rgba(27,58,107,0.08)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: "clamp(22px, 2.5vw, 30px)", fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#6b7a99", lineHeight: 1.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
function Features() {
  const features = [
    {
      icon: <ShieldCheck size={22} />,
      color: TEAL,
      title: "Real-time policy enforcement",
      description: "Agent actions - data reads, tool calls, file writes, prompt input - are evaluated against your rule set before they execute. Every decision comes back PERMIT, DENY, or ESCALATE.",
    },
    {
      icon: <Users size={22} />,
      color: NAVY,
      title: "Human-in-the-loop approvals",
      description: "High and Critical risk actions route to an approval queue with full context and an SLA countdown, instead of running unattended.",
    },
    {
      icon: <FileText size={22} />,
      color: "#7c3aed",
      title: "Tamper-evident audit log",
      description: "Every decision is recorded with a SHA-256 chain hash and a masked payload. Anyone can verify the chain end to end; a broken link is visible immediately.",
    },
    {
      icon: <Bot size={22} />,
      color: GREEN,
      title: "Agent registry & lifecycle",
      description: "Register, monitor, suspend and reactivate agents from one place. Track action counts and blocked-action counts per agent.",
    },
    {
      icon: <BarChart2 size={22} />,
      color: AMBER,
      title: "Compliance reporting",
      description: "Policy rules carry a regulatory tag - Privacy Act 1988, ISO 27001, OWASP LLM Top 10 and others - so reports show which frameworks a decision maps to.",
    },
    {
      icon: <FlaskConical size={22} />,
      color: RED,
      title: "Dry-run mode",
      description: "Test a policy change against real traffic without any side effects, then promote it once you're confident it does what you expect.",
    },
  ];

  return (
    <section className="py-20" style={{ background: "#f4f6f9" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-xl mb-14">
          <h2 style={{ fontWeight: 800, fontSize: "clamp(24px, 3.5vw, 36px)", color: NAVY, lineHeight: 1.2, marginBottom: 14 }}>
            What the policy engine actually does
          </h2>
          <p style={{ fontSize: 16, color: "#6b7a99", lineHeight: 1.7 }}>
            No dashboards for the sake of dashboards. Everything below is wired to the live API.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <div key={f.title} className="bg-white rounded-xl p-6" style={{ border: "1px solid rgba(27,58,107,0.08)" }}>
              <div className="flex items-center justify-center rounded-lg mb-4"
                style={{ width: 42, height: 42, background: `${f.color}12`, color: f.color }}>
                {f.icon}
              </div>
              <h3 style={{ fontWeight: 700, fontSize: 16, color: NAVY, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13.5, color: "#6b7a99", lineHeight: 1.65 }}>{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { title: "Register the agent", desc: "Add it via the API, or point an OpenClaw / agy-driven agent at the governance hook we ship - no model changes required." },
    { title: "Write the policy", desc: "Define rules with an action type, a risk threshold, and a default outcome. Tag each rule with the regulation it enforces." },
    { title: "It runs in the loop", desc: "Every matching action is intercepted and decided in real time. Anything above threshold waits for a human." },
    { title: "Everything is on the record", desc: "Each decision lands in the hash-chained audit log, ready for the compliance report or a regulator's request." },
  ];

  return (
    <section className="py-20" style={{ background: "#fff" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-xl mb-14">
          <h2 style={{ fontWeight: 800, fontSize: "clamp(24px, 3.5vw, 36px)", color: NAVY, lineHeight: 1.2, marginBottom: 14 }}>
            From agent to audit trail
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {steps.map((step, i) => (
            <div key={step.title}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEAL, marginBottom: 10 }}>{`0${i + 1}`}</div>
              <h3 style={{ fontWeight: 700, fontSize: 15, color: NAVY, marginBottom: 8 }}>{step.title}</h3>
              <p style={{ fontSize: 13.5, color: "#6b7a99", lineHeight: 1.65 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Compliance frameworks ─────────────────────────────────────────────────────
function Frameworks() {
  const frameworks = [
    "Privacy Act 1988", "ISO 27001", "SOC 2 Type II", "OWASP LLM Top 10",
    "NIST CSF", "ASD Essential 8",
  ];

  return (
    <section className="py-20" style={{ background: "#f4f6f9" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-xl mb-10">
          <h2 style={{ fontWeight: 800, fontSize: "clamp(22px, 3vw, 32px)", color: NAVY, marginBottom: 12 }}>
            Reports map to real frameworks
          </h2>
          <p style={{ fontSize: 15, color: "#6b7a99", lineHeight: 1.7 }}>
            Policy rules carry a regulatory tag. The report engine rolls those tags up into a
            compliance report per framework - it's a mapping, not a certification claim.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {frameworks.map(f => (
            <span key={f} className="px-4 py-2 rounded-lg"
              style={{ fontSize: 13, fontWeight: 600, color: NAVY, background: "#fff", border: "1px solid rgba(27,58,107,0.12)" }}>
              {f}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCTA({ onLogin }: { onLogin: () => void }) {
  return (
    <section className="py-20" style={{ background: NAVY }}>
      <div className="max-w-6xl mx-auto px-6 text-center">
        <h2 style={{ fontWeight: 800, fontSize: "clamp(24px, 3.5vw, 40px)", color: "#fff", lineHeight: 1.25, marginBottom: 16 }}>
          See it decide something in real time
        </h2>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", maxWidth: 480, margin: "0 auto 32px", lineHeight: 1.7 }}>
          Log in with the demo account and watch the audit log fill in as decisions happen.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={onLogin}
            className="flex items-center gap-2"
            style={{ fontSize: 15, fontWeight: 600, color: "#fff", background: TEAL, padding: "12px 28px", borderRadius: 8 }}>
            View live demo <ArrowRight size={15} />
          </button>
          <button onClick={onLogin}
            style={{ fontSize: 15, fontWeight: 600, color: "#fff", background: "transparent", border: "1.5px solid rgba(255,255,255,0.3)", padding: "12px 28px", borderRadius: 8 }}>
            Log in to your account
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer({ onLogin }: { onLogin: () => void }) {
  return (
    <footer style={{ background: "#0a1628" }}>
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div style={{ width: 30, height: 30, background: "#fff", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", padding: 3, flexShrink: 0 }}>
            <img src={logoImg} alt="Certacito.ai" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>
            certacito<span style={{ color: "#4dd9dc" }}>.ai</span>
          </span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>
            © 2026. Multi-agent governance platform.
          </span>
        </div>
        <button onClick={onLogin}
          className="px-4 py-1.5 rounded-lg font-semibold"
          style={{ background: TEAL, color: "#fff", fontSize: 13 }}>
          Log in
        </button>
      </div>
    </footer>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────
// onSignUp prop is part of the interface but the demo just funnels everything
// to login for now - team can wire a real signup flow later
export function LandingPage({ onLogin }: LandingPageProps) {
  return (
    <div style={{ overflowX: "hidden" }}>
      <Navbar onLogin={onLogin} />
      <Hero onLogin={onLogin} />
      <Stats />
      <Features />
      <HowItWorks />
      <Frameworks />
      <FinalCTA onLogin={onLogin} />
      <Footer onLogin={onLogin} />
    </div>
  );
}
