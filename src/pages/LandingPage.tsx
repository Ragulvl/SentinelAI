import { motion } from "framer-motion";
import { Scan, Bot, GitPullRequest, Code2, Lock, Zap, ArrowRight, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Navigation } from "@/components/Navigation";

const features = [
  {
    icon: Scan,
    title: "Parallel Analysis Modules",
    desc: "Executes Trivy, Semgrep, npm security checks, and secret scans simultaneously in containerized isolation.",
  },
  {
    icon: Bot,
    title: "Automated AI Remediation",
    desc: "Evaluates vulnerability reports, designs secure code adjustments, and verifies the resolution automatically.",
  },
  {
    icon: Code2,
    title: "Integrated Code Workspace",
    desc: "Inspect and modify generated remedies within a syntax-highlighted editor prior to integration.",
  },
  {
    icon: GitPullRequest,
    title: "Direct Pull Requests",
    desc: "Submit security updates directly to target repositories as standardized, reviewable pull requests.",
  },
  {
    icon: Lock,
    title: "Isolated Scan Environments",
    desc: "Performs checks inside temporary, network-blocked, and CPU-limited container structures.",
  },
  {
    icon: Zap,
    title: "External Endpoint Audit",
    desc: "Examines URLs for encryption validation, missing response headers, configuration leaks, and redirects.",
  },
];

const stats = [
  { value: "50+", label: "Security Policies" },
  { value: "<3min", label: "Execution Speed" },
  { value: "95%", label: "Resolution Success" },
  { value: "0", label: "Data Retention" },
];

const LandingPage = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-black overflow-hidden">
      {/* Nav - Show full Navigation if authenticated, otherwise show simple nav */}
      {isAuthenticated ? (
        <Navigation />
      ) : (
        <nav className="border-b border-border/50 px-6 py-4 backdrop-blur-sm bg-black/50 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span
                className="font-medium text-sm"
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  color: '#00ff41',
                  textShadow: '0 0 8px #00ff41, 1px 1px 0px #003300',
                }}
              >
                SentinelAI
              </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/login")}
                className="px-4 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/login")}
                className="px-4 py-1.5 rounded-md bg-primary text-black text-sm hover:opacity-90 transition-opacity"
              >
                Get Started
              </button>
            </div>
          </div>
        </nav>
      )}

      {/* Hero */}
      <section className="relative grid-bg min-h-[calc(100vh-57px)] flex items-center justify-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-6 py-32 text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1
              className="text-4xl md:text-5xl text-foreground leading-tight mb-6"
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              {/* "Find & Fix" — Spider-Verse glitch on mount */}
              <span
                className="spiderverse-glitch block mb-4"
                data-text="Find & Fix"
                style={{
                  color: '#00ff41',
                  textShadow: '0 0 10px #00ff41, 0 0 20px #00ff41, 2px 2px 0px #003300',
                  position: 'relative',
                }}
              >
                Find & Fix
                {/* Yellow ink layer */}
                <span className="sv-yellow" aria-hidden="true">Find & Fix</span>
                {/* Halftone dot overlay */}
                <span className="sv-halftone" aria-hidden="true" />
                {/* Dimensional tear */}
                <span className="sv-tear" aria-hidden="true" />
              </span>

              {/* "Vulnerabilities" — slightly delayed */}
              <span
                className="spiderverse-glitch block mb-4"
                data-text="Vulnerabilities"
                style={{
                  color: '#00ff41',
                  textShadow: '0 0 10px #00ff41, 0 0 20px #00ff41, 2px 2px 0px #003300',
                  position: 'relative',
                  animationDelay: '0.15s',
                }}
              >
                Vulnerabilities
                <span className="sv-yellow" aria-hidden="true" style={{ animationDelay: '0.15s' }}>Vulnerabilities</span>
                <span className="sv-halftone" aria-hidden="true" style={{ animationDelay: '0.15s' }} />
                <span className="sv-tear" aria-hidden="true" style={{ animationDelay: '0.15s' }} />
              </span>

              <span
                className="block text-2xl md:text-3xl"
                style={{
                  color: '#ffffff',
                  textShadow: '0 0 8px rgba(0,255,65,0.4), 2px 2px 0px #003300',
                }}
              >
                Before Hackers Do
              </span>
            </h1>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#00ff41]/40 bg-[#00ff41]/5 text-[#00ff41] text-xs mb-8"
              style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '9px' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] animate-pulse" />
              Security Scan
            </div>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 font-light">
              SentinelAI audits source files and endpoints, identifying vulnerabilities across packages and deployment configurations to produce verified fixes.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate(isAuthenticated ? "/repos" : "/login")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-black text-sm hover:opacity-90 transition-opacity"
              >
                {isAuthenticated ? "Start Scanning" : "Start Scanning Free"}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#features"
                className="flex items-center gap-2 px-5 py-2.5 rounded-md border border-border text-foreground text-sm hover:bg-card transition-colors"
              >
                Learn More
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border/50 bg-black">
        <div className="max-w-4xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="text-center"
            >
              <div className="text-3xl font-medium font-mono text-primary">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1.5">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-4xl mx-auto px-6 py-24">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-medium text-foreground mb-3">Auditing Process</h2>
          <p className="text-muted-foreground max-w-xl mx-auto font-light">
            An automated assessment flow translating detected issues into actionable patches.
          </p>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="bg-card border border-border rounded-lg p-6 hover:border-primary/30 transition-colors"
            >
              <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-medium text-foreground mb-2 text-sm">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-light">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-t border-border/50 bg-black">
        <div className="max-w-3xl mx-auto px-6 py-24">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-medium text-foreground mb-3">Execution Pipeline</h2>
            <p className="text-muted-foreground font-light">The five sequential phases of the security audit</p>
          </motion.div>
          <div className="space-y-3">
            {[
              { step: "01", title: "Authorization", desc: "Authorize repository access or supply a target web URL." },
              { step: "02", title: "Detection", desc: "Run multi-tool checks inside secure, sandboxed execution scopes." },
              { step: "03", title: "Evaluation", desc: "Evaluate vulnerability severity, context, and practical exploitability." },
              { step: "04", title: "Resolution", desc: "Formulate code adjustments and verify correct behavior." },
              { step: "05", title: "Deployment", desc: "Inspect side-by-side diffs, download archive zip files, or open pull requests." },
            ].map((s, i) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card hover:border-primary/20 transition-colors"
              >
                <span className="text-xl font-mono text-muted-foreground/40 font-light">{s.step}</span>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground text-sm">{s.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5 font-light">{s.desc}</p>
                </div>
                <CheckCircle className="w-4 h-4 text-primary/30 shrink-0 mt-0.5" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-medium text-foreground mb-4">
            Secure Your Code in Minutes
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto font-light">
            Connect your GitHub, run a scan, and get auto-patched code — all for free.
          </p>
          <button
            onClick={() => navigate(isAuthenticated ? "/repos" : "/login")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-black text-sm hover:opacity-90 transition-opacity"
          >
            {isAuthenticated ? "Start Scanning" : "Get Started Now"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-6 text-center">
        <p className="text-xs text-muted-foreground font-light">
          © 2026 SentinelAI. Built for developers who ship secure code.
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
