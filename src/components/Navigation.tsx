import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, GitBranch, Activity, Globe, Target, Zap, Box,
  Shield, History, User, Command, Menu, X,
  LogOut, ChevronDown, Circle, Cpu, Lock,
} from "lucide-react";
import { CommandPalette } from "./CommandPalette";

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  badge?: string;
  description?: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Platform",
    items: [
      { label: "Code Scan", path: "/repos", icon: GitBranch, description: "Scan repositories" },
      { label: "Monitoring", path: "/monitoring", icon: Activity, description: "Uptime & health" },
      { label: "Website Scan", path: "/website-scan", icon: Globe, description: "Endpoint auditing" },
    ],
  },
  {
    label: "Security",
    items: [
      { label: "Penetration Test", path: "/pentest", icon: Target, description: "Active testing" },
      { label: "Load Test", path: "/loadtest", icon: Zap, description: "Performance analysis" },
      { label: "Sandbox", path: "/sandbox", icon: Box, description: "Isolated scanning" },
      { label: "Domain Verify", path: "/domain-verification", icon: Shield, description: "Domain validation" },
    ],
  },
  {
    label: "Data",
    items: [
      { label: "History", path: "/scan-history", icon: History, description: "All past scans" },
    ],
  },
];

// ── SentinalAI SVG Logo ──────────────────────────────────────────────────
export const SentinalLogo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sg-shield" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5B6CFF" />
        <stop offset="1" stopColor="#7F5AF0" />
      </linearGradient>
      <linearGradient id="sg-inner" x1="8" y1="6" x2="24" y2="26" gradientUnits="userSpaceOnUse">
        <stop stopColor="#00D4FF" stopOpacity="0.95" />
        <stop offset="1" stopColor="#5B6CFF" stopOpacity="0.5" />
      </linearGradient>
      <filter id="sg-glow">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
    {/* Shield body */}
    <path d="M16 2L4 7v9c0 6.075 5.075 10.5 12 13 6.925-2.5 12-6.925 12-13V7L16 2Z"
      fill="url(#sg-shield)" />
    {/* Inner glow layer */}
    <path d="M16 5.5L6.5 9.5V16c0 4.6 3.8 7.9 9.5 9.8 5.7-1.9 9.5-5.2 9.5-9.8V9.5L16 5.5Z"
      fill="url(#sg-inner)" opacity="0.22" />
    {/* Circuit mark */}
    <circle cx="16" cy="16" r="2.8" fill="white" opacity="0.96" filter="url(#sg-glow)" />
    <line x1="16" y1="10.5" x2="16" y2="13.2" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
    <line x1="16" y1="18.8" x2="16" y2="21.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
    <line x1="10.5" y1="16" x2="13.2" y2="16" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
    <line x1="18.8" y1="16" x2="21.5" y2="16" stroke="white" strokeWidth="1.4" strokeLinecap="round" opacity="0.75" />
    {/* Corner nodes */}
    <circle cx="13.2" cy="13.2" r="0.9" fill="white" opacity="0.35" />
    <circle cx="18.8" cy="13.2" r="0.9" fill="white" opacity="0.35" />
    <circle cx="13.2" cy="18.8" r="0.9" fill="white" opacity="0.35" />
    <circle cx="18.8" cy="18.8" r="0.9" fill="white" opacity="0.35" />
  </svg>
);

// ── User Avatar ──────────────────────────────────────────────────────────
const UserAvatar = ({ name, src, size = 28 }: { name?: string; src?: string; size?: number }) => {
  if (src) {
    return (
      <img src={src} alt={name || "User"}
        className="rounded-full object-cover ring-1 ring-border"
        style={{ width: size, height: size }} />
    );
  }
  const initials = name
    ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{
        width: size, height: size,
        fontSize: size * 0.37,
        background: "linear-gradient(135deg, hsl(234 100% 68%), hsl(262 82% 70%))",
      }}
    >
      {initials}
    </div>
  );
};

interface NavigationProps {
  minimal?: boolean;
}

export const Navigation = ({ minimal = false }: NavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // ── MINIMAL TOP BAR (landing / login) ─────────────────────────────────
  if (minimal || !isAuthenticated) {
    return (
      <>
        <header
          className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6"
          style={{
            background: "hsl(var(--background) / 0.82)",
            backdropFilter: "blur(24px) saturate(1.5)",
            borderBottom: "1px solid hsl(var(--border))",
          }}
        >
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity group"
          >
            <SentinalLogo size={26} />
            <span className="font-bold text-sm tracking-tight text-foreground">
              Sentinal<span className="text-primary">AI</span>
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            <a href="#features" className="btn-ghost text-xs">Features</a>
            <a href="#pipeline" className="btn-ghost text-xs">How it works</a>
          </nav>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/login")} className="btn-ghost text-sm">
              Sign in
            </button>
            <button onClick={() => navigate("/login")} className="btn-primary text-xs py-2 px-3">
              Get started
            </button>
          </div>
        </header>
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      </>
    );
  }

  // ── SIDEBAR CONTENT ───────────────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 shrink-0" style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}>
        <SentinalLogo size={24} />
        <span className="font-bold text-sm tracking-tight text-foreground">
          Sentinal<span className="text-primary">AI</span>
        </span>
      </div>

      {/* Search / Command */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <button
          onClick={() => setCmdOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-muted-foreground transition-all group"
          style={{
            background: "hsl(var(--sidebar-accent))",
            border: "1px solid hsl(var(--sidebar-border))",
          }}
        >
          <Command className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="hidden sm:flex items-center gap-0.5 font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 px-2 py-2 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="sidebar-section-label pb-1">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`sidebar-nav-item w-full group ${active ? "active" : ""}`}
                  >
                    <Icon className="w-4 h-4 nav-icon shrink-0 transition-transform group-hover:scale-105" />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge && (
                      <span className="badge badge-primary text-[10px] px-1.5 py-0.5">{item.badge}</span>
                    )}
                    {active && (
                      <motion.span
                        layoutId="active-indicator"
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: "hsl(var(--primary))" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* System Status */}
      <div className="px-3 py-2 shrink-0" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
          style={{ background: "hsl(var(--success) / 0.06)" }}>
          <span className="status-dot up animate-status-blink" />
          <span className="text-xs text-muted-foreground flex-1">All Systems Operational</span>
          <Cpu className="w-3 h-3 text-muted-foreground/40" />
        </div>
      </div>

      {/* User Profile */}
      <div className="px-2 pb-3 shrink-0">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-sidebar-accent transition-colors group"
          >
            <UserAvatar
              name={user?.name || user?.username}
              src={user?.avatarUrl}
              size={28}
            />
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-semibold text-foreground truncate">
                {user?.name || user?.username || "User"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                Free plan
              </div>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="absolute bottom-full mb-1.5 left-0 right-0 rounded-xl overflow-hidden z-50"
                style={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border-active))",
                  boxShadow: "var(--shadow-xl)",
                }}
              >
                <div className="p-1">
                  <button
                    onClick={() => { navigate("/profile"); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Profile & Settings</span>
                  </button>
                </div>
                <div className="h-px mx-1" style={{ background: "hsl(var(--border))" }} />
                <div className="p-1">
                  <button
                    onClick={async () => { await logout(); navigate("/"); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
                    style={{ color: "hsl(var(--destructive) / 0.8)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "hsl(var(--destructive) / 0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign out</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className="fixed top-0 left-0 bottom-0 z-40 hidden md:flex flex-col"
        style={{
          width: "var(--sidebar-width, 224px)",
          background: "hsl(var(--sidebar-background))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Top Bar */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4"
        style={{
          background: "hsl(var(--background) / 0.9)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid hsl(var(--border))",
        }}
      >
        <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <SentinalLogo size={24} />
          <span className="font-bold text-sm text-foreground">
            Sentinal<span className="text-primary">AI</span>
          </span>
        </button>
        <button onClick={() => setMobileOpen(true)} className="icon-btn">
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 md:hidden"
              style={{ background: "hsl(var(--background) / 0.6)", backdropFilter: "blur(4px)" }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 36 }}
              className="fixed top-0 left-0 bottom-0 z-50 w-72 md:hidden"
              style={{
                background: "hsl(var(--sidebar-background))",
                borderRight: "1px solid hsl(var(--sidebar-border))",
              }}
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="icon-btn absolute top-3.5 right-3"
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
};

export { SentinalLogo as default };
