import { motion } from "framer-motion";
import { Github, Shield, Zap, Lock, Check } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useEffect, useState } from "react";
import { SentinalLogo } from "@/components/Navigation";

const SECURITY_FEATURES = [
  { icon: Shield, text: "Enterprise-grade scanning" },
  { icon: Lock, text: "Zero data retention" },
  { icon: Zap, text: "AI-verified patches" },
  { icon: Check, text: "SOC 2 aligned practices" },
];

// Floating particle
const Particle = ({ x, y, delay }: { x: number; y: number; delay: number }) => (
  <motion.div
    className="absolute rounded-full pointer-events-none"
    style={{
      left: `${x}%`,
      top: `${y}%`,
      width: Math.random() * 2 + 1,
      height: Math.random() * 2 + 1,
      background: "hsl(240 5% 45% / 0.3)",
    }}
    animate={{
      opacity: [0, 0.8, 0],
      scale: [0.5, 1.5, 0.5],
      y: [0, -20, 0],
    }}
    transition={{ duration: 4 + Math.random() * 2, delay, repeat: Infinity, ease: "easeInOut" }}
  />
);

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate("/repos");
    const errorParam = searchParams.get("error");
    if (errorParam) setError(decodeURIComponent(errorParam));
  }, [isAuthenticated, navigate, searchParams]);

  const handleGitHubLogin = async () => {
    try {
      setLoading(true);
      setError(null);
      await login();
    } catch {
      setError("Failed to initiate GitHub login. Please try again.");
      setLoading(false);
    }
  };

  // Particles data (stable between renders)
  const particles = Array.from({ length: 18 }, (_, i) => ({
    x: (i * 37 + 11) % 100,
    y: (i * 53 + 7) % 100,
    delay: i * 0.3,
  }));

  return (
    <div className="min-h-screen flex" style={{ background: "hsl(var(--background))" }}>
      {/* ── Left panel — branding ─────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center"
        style={{ background: "hsl(var(--background))" }}
      >
        {/* Background mesh */}
        <div className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(ellipse 60% 50% at 50% 35%, hsl(240 10% 18% / 0.25) 0%, transparent 70%)",
            }}
          />
          <div className="absolute inset-0 line-grid opacity-[0.04]" />
          {particles.map((p, i) => (
            <Particle key={i} {...p} />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 text-center px-12 max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="flex justify-center mb-8"
          >
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "hsl(240 5% 30% / 0.15)",
                  filter: "blur(24px)",
                  transform: "scale(1.6)",
                }}
              />
              <SentinalLogo size={64} />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-3xl font-black text-foreground mb-3"
            style={{ letterSpacing: "-0.03em" }}
          >
            Sentinal<span className="text-primary">AI</span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-3 text-left"
          >
            {SECURITY_FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.08 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: "hsl(var(--muted))",
                      border: "1px solid hsl(var(--border-active))",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">{f.text}</span>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Bottom badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs text-muted-foreground"
            style={{
              background: "hsl(var(--muted) / 0.5)",
              border: "1px solid hsl(var(--border))",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            All systems operational
          </div>
        </motion.div>
      </div>

      {/* ── Right panel — login form ──────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center px-6 py-12 relative"
        style={{ background: "hsl(var(--background))" }}
      >
        {/* Subtle noise background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 50% 40% at 60% 40%, hsl(240 4% 11% / 0.4) 0%, transparent 70%)",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative w-full max-w-sm"
        >
          {/* Mobile logo */}
          <div className="flex lg:hidden justify-center mb-8">
            <SentinalLogo size={40} />
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2
              className="text-2xl font-bold text-foreground mb-2"
              style={{ letterSpacing: "-0.025em" }}
            >
              Welcome back
            </h2>
            <p className="text-sm text-muted-foreground">
              Sign in to your SentinalAI account to continue.
            </p>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 p-3.5 rounded-xl text-sm flex items-start gap-2.5"
              style={{
                background: "hsl(var(--destructive) / 0.08)",
                border: "1px solid hsl(var(--destructive) / 0.25)",
                color: "hsl(var(--destructive))",
              }}
            >
              <div className="w-4 h-4 rounded-full border border-current flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">!</div>
              {error}
            </motion.div>
          )}

          {/* Auth buttons */}
          <div className="space-y-3">
            {/* GitHub */}
            <button
              onClick={handleGitHubLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl text-sm font-semibold transition-all relative overflow-hidden"
              style={{
                background: "hsl(var(--foreground))",
                color: "hsl(var(--background))",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.92")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Connecting to GitHub...
                </>
              ) : (
                <>
                  <Github className="w-4 h-4" />
                  Continue with GitHub
                </>
              )}
            </button>

          </div>

          {/* Back to home */}
          <button
            onClick={() => navigate("/")}
            className="w-full btn-ghost py-2.5 text-sm rounded-xl justify-center"
            style={{ border: "1px solid hsl(var(--border))" }}
          >
            Back to home
          </button>

          {/* Terms */}
          <p className="text-[11px] text-muted-foreground/60 text-center mt-6 leading-relaxed">
            By signing in, you agree to our{" "}
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Terms</a>
            {" & "}
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
