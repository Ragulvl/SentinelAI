import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import {
  Scan, Bot, GitPullRequest, Code2, Lock, Zap, ArrowRight,
  Shield, Activity, Globe, Target, Check,
  Cpu, Layers,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Navigation } from "@/components/Navigation";
import { SentinalLogo } from "@/components/Navigation";

// ── Data ─────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Scan,
    title: "Parallel Analysis",
    desc: "Trivy, Semgrep, npm audit, and secret scanning run simultaneously in containerized isolation.",
    tag: "detection",
  },
  {
    icon: Bot,
    title: "AI Remediation",
    desc: "Evaluates vulnerability context, generates secure code patches, and verifies resolution automatically.",
    tag: "ai",
  },
  {
    icon: Code2,
    title: "Code Workspace",
    desc: "Inspect and modify AI-generated fixes in a syntax-highlighted editor before merging.",
    tag: "editor",
  },
  {
    icon: GitPullRequest,
    title: "Auto Pull Requests",
    desc: "Submit security patches directly as reviewable pull requests to your GitHub repositories.",
    tag: "github",
  },
  {
    icon: Lock,
    title: "Isolated Environments",
    desc: "All scans run in temporary, network-blocked, CPU-limited containers — zero data retention.",
    tag: "isolation",
  },
  {
    icon: Globe,
    title: "Endpoint Auditing",
    desc: "Examines web URLs for TLS issues, missing security headers, configuration leaks, and more.",
    tag: "web",
  },
];

const STATS = [
  { value: "50+", label: "Security checks per scan" },
  { value: "<3m", label: "Average scan time" },
  { value: "95%", label: "AI fix success rate" },
  { value: "0 B", label: "Data retained after scan" },
];

const PIPELINE_STEPS = [
  { step: "01", title: "Connect", desc: "Authorize GitHub access or provide a target web URL.", icon: Layers },
  { step: "02", title: "Detect", desc: "Multi-tool parallel scans inside secure sandboxed containers.", icon: Scan },
  { step: "03", title: "Analyze", desc: "AI evaluates severity, exploitability, and business context.", icon: Cpu },
  { step: "04", title: "Patch", desc: "Generates and verifies code fixes or configuration changes.", icon: Bot },
  { step: "05", title: "Deploy", desc: "Review diffs, download archives, or open pull requests instantly.", icon: GitPullRequest },
];

// ── Terminal mockup lines ─────────────────────────────────────────────────
const TERMINAL_LINES = [
  { delay: 0, text: "$ sentinalai scan --repo acme/backend --branch main", color: "#6B6B73" },
  { delay: 0.6, text: "✓ Connecting to GitHub...", color: "#16A34A" },
  { delay: 1.1, text: "✓ Spinning up isolated container...", color: "#16A34A" },
  { delay: 1.6, text: "⠿ Running Trivy, Semgrep, npm audit in parallel...", color: "#F2F2F2" },
  { delay: 2.2, text: "  Found: 3 critical, 7 high, 12 medium", color: "#E5373A" },
  { delay: 2.8, text: "⠿ AI analyzing vulnerability context...", color: "#F2F2F2" },
  { delay: 3.4, text: "✓ Generated 8 verified patches", color: "#16A34A" },
  { delay: 3.9, text: "✓ Opening pull request #247...", color: "#16A34A" },
  { delay: 4.4, text: "─────────────────────────────────────────────", color: "#1E1E21" },
  { delay: 4.8, text: "Scan complete in 2m 41s  ·  Security score: 94/100", color: "#C8FF00" },
];

// ── Terminal Component ────────────────────────────────────────────────────
const TerminalMockup = () => {
  const [visibleLines, setVisibleLines] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  useEffect(() => {
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    TERMINAL_LINES.forEach((line, i) => {
      const t = setTimeout(() => {
        setVisibleLines(i + 1);
      }, line.delay * 1000);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  return (
    <div ref={ref} className="terminal-bg p-5 relative overflow-hidden" style={{ minHeight: 240 }}>
      {/* Terminal titlebar */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#3A3A42" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#3A3A42" }} />
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#3A3A42" }} />
        <span
          className="ml-2"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#3A3A42" }}
        >
          sentinalai — bash
        </span>
      </div>

      <div className="space-y-0.5">
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -3 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              lineHeight: 1.7,
              color: line.color,
            }}
          >
            {line.text}
            {i === visibleLines - 1 && visibleLines < TERMINAL_LINES.length && (
              <span
                className="inline-block ml-0.5 animate-cursor"
                style={{ width: 6, height: 14, background: "#C8FF00", verticalAlign: "middle" }}
              />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// ── Stat Item ─────────────────────────────────────────────────────────────
const StatItem = ({ value, label }: { value: string; label: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4 }}
      className="py-6 px-4"
    >
      <div
        className="metric-number mb-1"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: "#F2F2F2",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{label}</div>
    </motion.div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────
const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const handleCTA = () => navigate(isAuthenticated ? "/repos" : "/login");

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <Navigation minimal />

      {/* ───── HERO ─────────────────────────────────────────────────────── */}
      {/* Left-aligned, no orbs, dot grid barely visible, flat */}
      <section
        className="relative min-h-screen flex flex-col justify-center pt-20 pb-16"
        style={{ overflow: "hidden" }}
      >
        {/* Subtle dot grid — barely there at 2% opacity */}
        <div className="absolute inset-0 dot-grid" style={{ opacity: 0.025, pointerEvents: "none" }} />

        <div className="relative z-10 max-w-5xl mx-auto px-8 md:px-12 w-full">
          {/* Two-column layout: headline left, terminal right */}
          <div className="grid md:grid-cols-2 gap-12 items-center">

            {/* LEFT: Headline block */}
            <div>
              {/* Tag — no pill border-radius, monospace, muted */}
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex items-center gap-2 mb-8"
              >
                <span
                  className="status-square up animate-status-blink"
                  style={{ flexShrink: 0 }}
                />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  Security Platform · Enterprise Ready
                </span>
              </motion.div>

              {/* Headline — Departure Mono (display), left-aligned */}
              {/* SCOPE: Departure Mono used HERE ONLY in the real app */}
              <motion.h1
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.06 }}
                style={{
                  fontFamily: "'Departure Mono', monospace",
                  fontSize: "clamp(34px, 3.5vw, 52px)",
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  fontWeight: 400,
                  marginBottom: "1.5rem",
                }}
              >
                Find threats.
                <br />
                Ship fixes.
                <br />
                <span style={{ color: "#C8FF00" }}>Automatically.</span>
              </motion.h1>

              {/* Subheadline — Inter, readable, not dramatic */}
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.14 }}
                style={{
                  fontSize: 15,
                  lineHeight: 1.65,
                  color: "hsl(var(--muted-foreground))",
                  maxWidth: 420,
                  marginBottom: "2rem",
                }}
              >
                SentinalAI audits repositories and endpoints, identifies vulnerabilities
                across packages and configurations, and produces AI-verified fixes — in under 3 minutes.
              </motion.p>

              {/* CTAs — horizontal, left-aligned */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.22 }}
                className="flex items-center gap-3 flex-wrap mb-10"
              >
                <button onClick={handleCTA} className="btn-primary" style={{ padding: "10px 20px", fontSize: 13 }}>
                  {isAuthenticated ? "Go to Dashboard" : "Start for Free"}
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
                <a href="#pipeline" className="btn-secondary" style={{ fontSize: 13, padding: "10px 20px" }}>
                  See how it works
                </a>
              </motion.div>

              {/* Trust — plain text, no check icons, dot-separated */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                  color: "hsl(var(--muted-foreground) / 0.5)",
                }}
              >
                SOC 2 aligned · Zero data retention · Containerized isolation · E2E encrypted
              </motion.div>
            </div>

            {/* RIGHT: Terminal mockup */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <TerminalMockup />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ───── STATS ──────────────────────────────────────────────────── */}
      <section
        style={{ position: "relative" }}
      >
        {/* Top fading line */}
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: 1,
          background: "linear-gradient(90deg, transparent 0%, hsl(var(--border)) 20%, hsl(var(--border)) 80%, transparent 100%)",
        }} />
        {/* Bottom fading line */}
        <div style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: 1,
          background: "linear-gradient(90deg, transparent 0%, hsl(var(--border)) 20%, hsl(var(--border)) 80%, transparent 100%)",
        }} />
        <div className="max-w-5xl mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: "hsl(var(--border) / 0.4)" }}>
            {STATS.map(s => (
              <StatItem key={s.label} value={s.value} label={s.label} />
            ))}
          </div>
        </div>
      </section>

      {/* ───── FEATURES ───────────────────────────────────────────────── */}
      <section id="features" className="max-w-5xl mx-auto px-8 py-24">
        {/* Section header — left-aligned */}
        <div className="mb-12">
          <div className="section-label mb-4">Capabilities</div>
          <h2 style={{ fontSize: 32, letterSpacing: "-0.03em" }}>
            Everything you need to ship secure code
          </h2>
        </div>

        {/* Intentionally varied grid: 2 large + 4 compact */}
        <div className="space-y-3">
          {/* Top row: 2 featured cards — wider */}
          <div className="grid md:grid-cols-2 gap-3">
            {FEATURES.slice(0, 2).map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="card-interactive p-6 group"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="shrink-0 mt-0.5"
                      style={{
                        width: 32, height: 32,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: "var(--radius-md)",
                        background: "hsl(var(--muted))",
                        border: "1px solid hsl(var(--border-active))",
                      }}
                    >
                      <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: "hsl(var(--foreground))" }} />
                    </div>
                    <div>
                      <div
                        className="mb-2"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600 }}
                      >
                        {f.title}
                      </div>
                      <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>{f.desc}</p>
                    </div>
                  </div>
                  <div
                    className="mt-4 pt-4"
                    style={{ borderTop: "1px solid hsl(var(--border))" }}
                  >
                    <span className="badge badge-muted">{f.tag}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom row: 4 compact cards */}
          <div className="grid md:grid-cols-4 gap-3">
            {FEATURES.slice(2).map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="card-interactive p-4 group"
                >
                  <Icon className="w-3.5 h-3.5 mb-3" strokeWidth={1.5} style={{ color: "hsl(var(--muted-foreground))" }} />
                  <div
                    className="mb-1.5"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600 }}
                  >
                    {f.title}
                  </div>
                  <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───── PIPELINE ───────────────────────────────────────────────── */}
      <section
        id="pipeline"
        style={{
          background: "hsl(var(--surface))",
          borderTop: "1px solid hsl(var(--border))",
        }}
      >
        <div className="max-w-3xl mx-auto px-8 py-24">
          <div className="mb-12">
            <div className="section-label mb-4">How it works</div>
            <h2 style={{ fontSize: 32, letterSpacing: "-0.03em" }}>
              Five-step audit pipeline
            </h2>
            <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 8 }}>
              Fully automated — from connection to deployment in minutes.
            </p>
          </div>

          <div className="space-y-2">
            {PIPELINE_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.step}
                  className="card-interactive flex items-center gap-4 p-4 group"
                >
                  {/* Step number — monospace, muted */}
                  <span
                    className="shrink-0 w-8 text-right"
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "hsl(var(--border-active))",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {s.step}
                  </span>
                  <div
                    className="shrink-0 flex items-center justify-center"
                    style={{
                      width: 28, height: 28,
                      borderRadius: "var(--radius-md)",
                      background: "hsl(var(--muted))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: "hsl(var(--muted-foreground))" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="mb-0.5"
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600 }}
                    >
                      {s.title}
                    </div>
                    <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───── CTA ─────────────────────────────────────────────────────── */}
      {/* Asymmetric — full-bleed section, left-aligned, not centered blob */}
      <section
        style={{
          borderTop: "1px solid hsl(var(--border))",
        }}
      >
        <div className="max-w-5xl mx-auto px-8 py-28">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: text */}
            <div>
              <div className="flex items-center gap-2 mb-6">
                <SentinalLogo size={24} />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "hsl(var(--muted-foreground))",
                  }}
                >
                  SentinalAI
                </span>
              </div>
              <h2 style={{ fontSize: 36, letterSpacing: "-0.035em", marginBottom: 16 }}>
                Start securing your code today
              </h2>
              <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", lineHeight: 1.65, marginBottom: 28 }}>
                Connect your GitHub repository and get your first security report in under 3 minutes.
                No credit card required.
              </p>
              <button
                onClick={handleCTA}
                className="btn-primary"
                style={{ padding: "11px 24px", fontSize: 13 }}
              >
                {isAuthenticated ? "Go to Dashboard" : "Get Started for Free"}
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>

            {/* Right: capability checklist */}
            <div className="card-base p-6">
              <div className="section-label mb-4">What's included</div>
              <div className="space-y-3">
                {[
                  "Parallel Trivy, Semgrep & npm audit scans",
                  "AI-generated, verified code patches",
                  "GitHub pull-request integration",
                  "Website SSL & security-header audit",
                  "Penetration testing (XSS, SQLi, CSRF…)",
                  "Load & resilience testing",
                  "Zero data retained after scan",
                ].map(item => (
                  <div
                    key={item}
                    className="flex items-center gap-2 py-1.5"
                    style={{ borderBottom: "1px solid hsl(var(--border))" }}
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" style={{ color: "#C8FF00" }} />
                    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── FOOTER ──────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <div className="max-w-5xl mx-auto px-8 py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <SentinalLogo size={18} />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "hsl(var(--foreground))",
                }}
              >
                Sentinal<span style={{ color: "#C8FF00" }}>AI</span>
              </span>
            </div>
            <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              © {new Date().getFullYear()} SentinalAI. Built for developers who ship secure code.
            </p>
            <div
              className="flex items-center gap-5"
              style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
            >
              {["Privacy", "Terms", "Docs", "Status"].map(link => (
                <a
                  key={link}
                  href="#"
                  className="hover:text-foreground transition-colors"
                >
                  {link}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
