import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import {
  Scan, Bot, GitPullRequest, Code2, Lock, Zap, ArrowRight,
  Shield, Activity, Globe, Target, ChevronRight, Check,
  Terminal, Cpu, Eye, Layers,
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
    color: "#5B6CFF",
    glow: "hsl(234 100% 68% / 0.12)",
  },
  {
    icon: Bot,
    title: "AI Remediation",
    desc: "Evaluates vulnerability context, generates secure code patches, and verifies resolution automatically.",
    color: "#7F5AF0",
    glow: "hsl(262 82% 70% / 0.12)",
  },
  {
    icon: Code2,
    title: "Code Workspace",
    desc: "Inspect and modify AI-generated fixes in a syntax-highlighted editor before merging.",
    color: "#00D4FF",
    glow: "hsl(192 100% 42% / 0.1)",
  },
  {
    icon: GitPullRequest,
    title: "Auto Pull Requests",
    desc: "Submit security patches directly as reviewable pull requests to your GitHub repositories.",
    color: "#22C55E",
    glow: "hsl(142 71% 45% / 0.1)",
  },
  {
    icon: Lock,
    title: "Isolated Environments",
    desc: "All scans run in temporary, network-blocked, CPU-limited containers — zero data retention.",
    color: "#F59E0B",
    glow: "hsl(38 92% 50% / 0.1)",
  },
  {
    icon: Globe,
    title: "Endpoint Auditing",
    desc: "Examines web URLs for TLS issues, missing security headers, configuration leaks, and more.",
    color: "#00D4FF",
    glow: "hsl(192 100% 42% / 0.1)",
  },
];

const STATS = [
  { value: "50+", label: "Security Checks", suffix: "" },
  { value: "<3", label: "Min Scan Time", suffix: "min" },
  { value: "95", label: "Fix Success Rate", suffix: "%" },
  { value: "0", label: "Data Retained", suffix: "B" },
];

const PIPELINE_STEPS = [
  { step: "01", title: "Connect", desc: "Authorize GitHub access or provide a target web URL.", icon: Layers },
  { step: "02", title: "Detect", desc: "Multi-tool parallel scans inside secure sandboxed containers.", icon: Scan },
  { step: "03", title: "Analyze", desc: "AI evaluates severity, exploitability, and business context.", icon: Cpu },
  { step: "04", title: "Patch", desc: "Generates and verifies code fixes or configuration changes.", icon: Bot },
  { step: "05", title: "Deploy", desc: "Review diffs, download archives, or open pull requests instantly.", icon: GitPullRequest },
];

const TRUST_BADGES = [
  "SOC 2 aligned",
  "Zero data retention",
  "Containerized isolation",
  "End-to-end encrypted",
];

// ── Terminal mockup lines ─────────────────────────────────────────────────
const TERMINAL_LINES = [
  { delay: 0, text: "$ sentinalai scan --repo acme/backend --branch main", color: "#94A3B8" },
  { delay: 0.6, text: "✓ Connecting to GitHub...", color: "#22C55E" },
  { delay: 1.1, text: "✓ Spinning up isolated container...", color: "#22C55E" },
  { delay: 1.6, text: "⠿ Running Trivy, Semgrep, npm audit in parallel...", color: "#5B6CFF" },
  { delay: 2.2, text: "  Found: 3 critical, 7 high, 12 medium", color: "#EF4444" },
  { delay: 2.8, text: "⠿ AI analyzing vulnerability context...", color: "#7F5AF0" },
  { delay: 3.4, text: "✓ Generated 8 verified patches", color: "#22C55E" },
  { delay: 3.9, text: "✓ Opening pull request #247...", color: "#22C55E" },
  { delay: 4.4, text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", color: "#1E293B" },
  { delay: 4.8, text: "Scan complete in 2m 41s  ·  Security score: 94/100", color: "#00D4FF" },
];

// ── Terminal Component ────────────────────────────────────────────────────
const TerminalMockup = () => {
  const [visibleLines, setVisibleLines] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!inView) return;
    let current = 0;
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
    <div ref={ref} className="terminal-bg p-5 relative overflow-hidden" style={{ minHeight: 260 }}>
      {/* Terminal titlebar */}
      <div className="flex items-center gap-1.5 mb-4">
        <div className="w-2.5 h-2.5 rounded-full bg-destructive/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-warning/70" />
        <div className="w-2.5 h-2.5 rounded-full bg-success/70" />
        <span className="ml-2 text-[10px] text-muted-foreground/50 font-mono">sentinalai — bash</span>
      </div>

      <div className="space-y-1">
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="text-[11px] font-mono leading-relaxed"
            style={{ color: line.color }}
          >
            {line.text}
            {i === visibleLines - 1 && visibleLines < TERMINAL_LINES.length && (
              <span className="inline-block w-2 h-3.5 ml-0.5 bg-current animate-cursor opacity-80" />
            )}
          </motion.div>
        ))}
      </div>

      {/* Scan line effect */}
      {inView && visibleLines < TERMINAL_LINES.length && (
        <div
          className="absolute left-0 right-0 h-px pointer-events-none"
          style={{
            top: `${(visibleLines / TERMINAL_LINES.length) * 100}%`,
            background: "linear-gradient(90deg, transparent, hsl(234 100% 68% / 0.3), transparent)",
          }}
        />
      )}
    </div>
  );
};

// ── Animated Counter ──────────────────────────────────────────────────────
const StatCounter = ({ value, label, suffix }: { value: string; label: string; suffix: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5 }}
      className="text-center"
    >
      <div className="text-2xl md:text-3xl font-black gradient-text-primary metric-number mb-1 tabular-nums">
        {value}{suffix}
      </div>
      <div className="text-xs text-muted-foreground font-medium tracking-wide">{label}</div>
    </motion.div>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────
const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const handleCTA = () => navigate(isAuthenticated ? "/repos" : "/login");

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <Navigation minimal />

      {/* ───── HERO ───────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 pb-16">
        {/* Background layers */}
        <div className="absolute inset-0 pointer-events-none select-none">
          {/* Primary glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px]"
            style={{
              background: "radial-gradient(ellipse at center, hsl(234 100% 68% / 0.12) 0%, hsl(262 82% 70% / 0.05) 50%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          {/* Secondary glow */}
          <div
            className="absolute bottom-0 right-0 w-[600px] h-[400px]"
            style={{
              background: "radial-gradient(ellipse at center, hsl(192 100% 42% / 0.06) 0%, transparent 70%)",
              filter: "blur(80px)",
            }}
          />
          {/* Dot grid */}
          <div className="absolute inset-0 dot-grid opacity-[0.035]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-8 text-xs font-medium"
            style={{
              background: "hsl(234 100% 68% / 0.08)",
              border: "1px solid hsl(234 100% 68% / 0.25)",
              color: "hsl(234 100% 75%)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span>AI-Powered Security Platform</span>
            <span className="opacity-40">·</span>
            <span className="opacity-75">Enterprise Ready</span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="text-5xl md:text-7xl font-black text-foreground mb-6 leading-[1.07]"
            style={{ letterSpacing: "-0.035em" }}
          >
            Secure your code{" "}
            <span className="gradient-text">before hackers do</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            SentinalAI audits repositories and endpoints, identifies vulnerabilities
            across packages and configurations, and produces AI-verified fixes — automatically.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.28 }}
            className="flex items-center justify-center gap-3 flex-wrap mb-10"
          >
            <button
              onClick={handleCTA}
              className="btn-primary px-6 py-3 text-sm rounded-lg"
              style={{ boxShadow: "0 4px 28px hsl(234 100% 68% / 0.4)" }}
            >
              {isAuthenticated ? "Go to Dashboard" : "Start for Free"}
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#pipeline"
              className="btn-secondary px-6 py-3 text-sm rounded-lg"
            >
              See how it works
              <ChevronRight className="w-4 h-4" />
            </a>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="flex items-center justify-center gap-5 flex-wrap"
          >
            {TRUST_BADGES.map(t => (
              <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="w-3.5 h-3.5 text-success shrink-0" />
                {t}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Terminal mockup below hero text */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="relative z-10 w-full max-w-2xl mx-auto px-6 mt-14"
        >
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              boxShadow: "0 0 0 1px hsl(var(--border)), 0 30px 80px hsl(0 0% 0% / 0.6), 0 0 60px hsl(234 100% 68% / 0.06)",
            }}
          >
            <TerminalMockup />
          </div>

          {/* Floating glow beneath terminal */}
          <div
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse, hsl(234 100% 68% / 0.12) 0%, transparent 70%)",
              filter: "blur(20px)",
            }}
          />
        </motion.div>
      </section>

      {/* ───── STATS ─────────────────────────────────────────────────── */}
      <section style={{ borderTop: "1px solid hsl(var(--border))", borderBottom: "1px solid hsl(var(--border))" }}>
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map(s => (
              <StatCounter key={s.label} value={s.value} label={s.label} suffix={s.suffix} />
            ))}
          </div>
        </div>
      </section>

      {/* ───── FEATURES ──────────────────────────────────────────────── */}
      <section id="features" className="max-w-5xl mx-auto px-6 py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
            style={{
              background: "hsl(var(--muted))",
              border: "1px solid hsl(var(--border))",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            <Shield className="w-3.5 h-3.5" />
            Capabilities
          </div>
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-3"
            style={{ letterSpacing: "-0.028em" }}
          >
            Everything you need to ship secure code
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
            A complete security workflow from detection to deployment, automated end-to-end.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="card-interactive p-5 group"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                  style={{
                    background: f.glow,
                    border: `1px solid ${f.color}22`,
                  }}
                >
                  <Icon style={{ width: 18, height: 18, color: f.color }} />
                </div>
                <h3 className="font-semibold text-foreground text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ───── PIPELINE ──────────────────────────────────────────────── */}
      <section id="pipeline" style={{ background: "hsl(var(--surface))", borderTop: "1px solid hsl(var(--border))" }}>
        <div className="max-w-3xl mx-auto px-6 py-24">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{
                background: "hsl(var(--muted))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              <Activity className="w-3.5 h-3.5" />
              How It Works
            </div>
            <h2
              className="text-3xl md:text-4xl font-bold text-foreground mb-3"
              style={{ letterSpacing: "-0.028em" }}
            >
              Five-step audit pipeline
            </h2>
            <p className="text-muted-foreground text-sm">
              Fully automated — from connection to deployment in minutes.
            </p>
          </motion.div>

          <div className="space-y-3">
            {PIPELINE_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.step}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.09 }}
                  className="card-interactive flex items-center gap-4 p-4 group"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors"
                    style={{
                      background: "hsl(234 100% 68% / 0.08)",
                      border: "1px solid hsl(234 100% 68% / 0.18)",
                    }}>
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground text-sm mb-0.5">{s.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">{s.step}</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───── CTA ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 80% 60% at 50% 50%, hsl(234 100% 68% / 0.07) 0%, transparent 70%)",
          }}
        />
        <div className="relative max-w-2xl mx-auto px-6 py-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "hsl(234 100% 68% / 0.2)",
                    filter: "blur(20px)",
                    transform: "scale(1.5)",
                  }}
                />
                <SentinalLogo size={52} />
              </div>
            </div>
            <h2
              className="text-3xl md:text-4xl font-bold text-foreground mb-4"
              style={{ letterSpacing: "-0.028em" }}
            >
              Start securing your code today
            </h2>
            <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
              Connect your GitHub repository and get your first security report in under 3 minutes. No credit card required.
            </p>
            <button
              onClick={handleCTA}
              className="btn-primary px-8 py-3.5 text-sm rounded-lg"
              style={{ boxShadow: "0 4px 28px hsl(234 100% 68% / 0.4)" }}
            >
              {isAuthenticated ? "Go to Dashboard" : "Get Started for Free"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* ───── FOOTER ────────────────────────────────────────────────── */}
      <footer style={{ borderTop: "1px solid hsl(var(--border))" }}>
        <div className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <SentinalLogo size={20} />
              <span className="font-bold text-sm text-foreground">
                Sentinal<span className="text-primary">AI</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} SentinalAI. Built for developers who ship secure code.
            </p>
            <div className="flex items-center gap-5 text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Docs</a>
              <a href="#" className="hover:text-foreground transition-colors">Status</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
