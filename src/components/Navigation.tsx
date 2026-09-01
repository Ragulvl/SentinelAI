import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Home, GitBranch, Activity, Globe, Target, Zap, Box,
  Shield, History, User, Command, Menu, X,
  LogOut, ChevronDown, Cpu,
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
    ],
  },
  {
    label: "Security",
    items: [
      { label: "Penetration Test", path: "/pentest", icon: Target, badge: "adaptive", description: "Active testing" },
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

// ── SentinalAI Logo — redrawn: no gradient, flat lime accent ──────────────
export const SentinalLogo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Shield body — flat near-white fill, not a gradient */}
    <path
      d="M16 2L4 7v9c0 6.075 5.075 10.5 12 13 6.925-2.5 12-6.925 12-13V7L16 2Z"
      fill="#F2F2F2"
      opacity="0.92"
    />
    {/* Inner shield — slightly darker */}
    <path
      d="M16 5.5L6.5 9.5V16c0 4.6 3.8 7.9 9.5 9.8 5.7-1.9 9.5-5.2 9.5-9.8V9.5L16 5.5Z"
      fill="#141416"
      opacity="0.85"
    />
    {/* Center crosshair — acid lime, the accent */}
    <circle cx="16" cy="16" r="2.4" fill="#C8FF00" />
    <line x1="16" y1="10.5" x2="16" y2="13.6" stroke="#C8FF00" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="16" y1="18.4" x2="16" y2="21.5" stroke="#C8FF00" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="10.5" y1="16" x2="13.6" y2="16" stroke="#C8FF00" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="18.4" y1="16" x2="21.5" y2="16" stroke="#C8FF00" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

// ── User Avatar — square (not circle), monospace initials ─────────────────
const UserAvatar = ({ name, src, size = 26 }: { name?: string; src?: string; size?: number }) => {
  if (src) {
    return (
      <img src={src} alt={name || "User"}
        className="object-cover"
        style={{
          width: size,
          height: size,
          borderRadius: 3,
          border: "1px solid hsl(var(--border-active))",
        }} />
    );
  }
  const initials = name
    ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "U";
  return (
    <div
      className="flex items-center justify-center shrink-0 font-display"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        borderRadius: 3,
        background: "hsl(var(--muted))",
        border: "1px solid hsl(var(--border-active))",
        color: "hsl(var(--foreground))",
        letterSpacing: "-0.02em",
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

  const isActive = (path: string) => {
    // /repos and /code-scan are part of the same Code Scan flow
    if (path === "/repos") {
      return location.pathname === "/repos" || location.pathname === "/code-scan";
    }
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

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
            background: "hsl(var(--background))",
            borderBottom: "none",
            boxShadow: "0 1px 0 0 hsl(var(--border) / 0.6)",
          }}
        >
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <SentinalLogo size={22} />
            <span
              className="text-sm tracking-tight"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "hsl(var(--foreground))" }}
            >
              Sentinal<span style={{ color: "#C8FF00" }}>AI</span>
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
            <button onClick={() => navigate("/login")} className="btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>
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
      <div
        className="flex items-center gap-2.5 px-4 h-14 shrink-0"
        style={{ borderBottom: "none", boxShadow: "0 1px 0 0 hsl(var(--sidebar-border) / 0.6)" }}
      >
        <SentinalLogo size={22} />
        <span
          className="text-sm tracking-tight"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "hsl(var(--foreground))" }}
        >
          Sentinal<span style={{ color: "#C8FF00" }}>AI</span>
        </span>
      </div>

      {/* Search / Command */}
      <div className="px-3 pt-3 pb-1 shrink-0">
        <button
          onClick={() => setCmdOpen(true)}
          className="w-full flex items-center gap-2 text-xs text-muted-foreground transition-all"
          style={{
            padding: "6px 10px",
            borderRadius: "var(--radius-md)",
            background: "hsl(var(--sidebar-accent))",
            border: "1px solid hsl(var(--sidebar-border))",
          }}
        >
          <Command className="w-3 h-3 shrink-0" strokeWidth={1.5} />
          <span className="flex-1 text-left">Search...</span>
          <kbd
            className="hidden sm:flex items-center gap-0.5 font-display text-[10px] px-1.5 py-0.5"
            style={{
              borderRadius: "2px",
              background: "hsl(var(--border))",
              color: "hsl(var(--muted-foreground))",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 px-2 py-2 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="sidebar-section-label pb-1.5">{group.label}</div>
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
                    <Icon
                      className="w-3.5 h-3.5 nav-icon shrink-0"
                      strokeWidth={active ? 2 : 1.5}
                    />
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.badge && (
                      <span className="badge badge-accent text-[9px]">{item.badge}</span>
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
        <div
          className="flex items-center gap-2 px-2 py-1.5"
          style={{ borderRadius: "var(--radius-md)" }}
        >
          {/* Square status indicator — technical, not rounded/friendly */}
          <span className="status-square up animate-status-blink" />
          <span className="text-xs flex-1" style={{ color: "hsl(var(--muted-foreground))", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
            All systems operational
          </span>
        </div>
      </div>

      {/* User Profile */}
      <div className="px-2 pb-3 shrink-0">
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-full flex items-center gap-2.5 hover:bg-sidebar-accent transition-colors"
            style={{ padding: "6px 8px", borderRadius: "var(--radius-md)" }}
          >
            <UserAvatar
              name={user?.name || user?.username}
              src={user?.avatarUrl}
              size={26}
            />
            <div className="flex-1 min-w-0 text-left">
              <div
                className="text-xs font-medium truncate"
                style={{ color: "hsl(var(--foreground))", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
              >
                {user?.name || user?.username || "User"}
              </div>
              <div className="text-[10px] truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
                {user?.email ? user.email.split("@")[0] + "@…" : "sentinalsec.vercel.app"}
              </div>
            </div>
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${userMenuOpen ? "rotate-180" : ""}`}
              strokeWidth={1.5}
              style={{ color: "hsl(var(--muted-foreground))" }}
            />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                className="absolute bottom-full mb-1.5 left-0 right-0 overflow-hidden z-50"
                style={{
                  borderRadius: "var(--radius-lg)",
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border-active))",
                  boxShadow: "var(--shadow-xl)",
                }}
              >
                <div className="p-1">
                  <button
                    onClick={() => { navigate("/profile"); setUserMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <User className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>Profile & Settings</span>
                  </button>
                </div>
                <div className="h-px mx-1" style={{ background: "hsl(var(--border))" }} />
                <div className="p-1">
                  <button
                    onClick={async () => { await logout(); navigate("/"); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors"
                    style={{ color: "hsl(var(--destructive) / 0.8)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "hsl(var(--destructive) / 0.06)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}
                  >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
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
      {/* Desktop Sidebar — solid background, no blur */}
      <aside
        className="fixed top-0 left-0 bottom-0 z-40 hidden md:flex flex-col"
        style={{
          width: "var(--sidebar-width, 220px)",
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
          background: "hsl(var(--background))",
          borderBottom: "none",
          boxShadow: "0 1px 0 0 hsl(var(--border) / 0.6)",
        }}
      >
        <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <SentinalLogo size={22} />
          <span
            className="text-sm"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "hsl(var(--foreground))" }}
          >
            Sentinal<span style={{ color: "#C8FF00" }}>AI</span>
          </span>
        </button>
        <button onClick={() => setMobileOpen(true)} className="icon-btn">
          <Menu className="w-4.5 h-4.5" strokeWidth={1.5} />
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
              style={{ background: "hsl(0 0% 0% / 0.7)" }}
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
                <X className="w-4 h-4" strokeWidth={1.5} />
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
