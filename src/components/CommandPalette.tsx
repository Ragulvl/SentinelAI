import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Shield, Globe, Activity, Target, Zap, History,
  User, Home, Command, ArrowRight, GitBranch, Box, BarChart3,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  path: string;
  shortcut?: string;
  group: string;
}

const COMMANDS: CommandItem[] = [
  { id: "home", label: "Home", description: "Go to landing page", icon: Home, path: "/", group: "Navigation" },
  { id: "repos", label: "Code Scan", description: "Select a repository to scan", icon: GitBranch, path: "/repos", group: "Navigation" },
  { id: "monitoring", label: "Monitoring", description: "Website uptime monitoring", icon: Activity, path: "/monitoring", group: "Navigation" },
  { id: "pentest", label: "Penetration Test", description: "Active security testing", icon: Target, path: "/pentest", group: "Navigation" },
  { id: "loadtest", label: "Load Test", description: "Performance & load testing", icon: Zap, path: "/loadtest", group: "Navigation" },
  { id: "sandbox", label: "Sandbox Scan", description: "Isolated environment testing", icon: Box, path: "/sandbox", group: "Navigation" },
  { id: "domain-verification", label: "Domain Verification", description: "Verify domain ownership", icon: Shield, path: "/domain-verification", group: "Navigation" },
  { id: "scan-history", label: "Scan History", description: "View all previous scans", icon: History, path: "/scan-history", group: "Navigation" },
  { id: "profile", label: "Profile", description: "Manage your account", icon: User, path: "/profile", group: "Account" },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export const CommandPalette = ({ open, onClose }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.description?.toLowerCase().includes(query.toLowerCase()) ||
      c.group.toLowerCase().includes(query.toLowerCase())
  );

  const groups = Array.from(new Set(filtered.map((c) => c.group)));

  const execute = useCallback(
    (item: CommandItem) => {
      navigate(item.path);
      onClose();
      setQuery("");
    },
    [navigate, onClose]
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selected]) execute(filtered[selected]);
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selected, execute, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
          onClick={onClose}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="relative w-full max-w-xl mx-4 rounded-xl overflow-hidden"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border-active))",
              boxShadow: "0 25px 80px rgb(0 0 0 / 0.7), 0 0 0 1px hsl(var(--primary) / 0.08)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search commands, pages..."
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <kbd className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-[340px] overflow-y-auto py-2">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Command className="w-8 h-8 mb-3 opacity-30" />
                  <p className="text-sm">No results for "{query}"</p>
                </div>
              ) : (
                groups.map((group) => {
                  const groupItems = filtered.filter((c) => c.group === group);
                  return (
                    <div key={group}>
                      <div className="px-4 pt-2 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                          {group}
                        </span>
                      </div>
                      {groupItems.map((item) => {
                        const globalIdx = filtered.indexOf(item);
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => execute(item)}
                            onMouseEnter={() => setSelected(globalIdx)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                              selected === globalIdx
                                ? "bg-primary/10 text-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                          >
                            <div
                              className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
                                selected === globalIdx
                                  ? "bg-primary/20 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className={`font-medium text-xs ${selected === globalIdx ? "text-foreground" : "text-foreground/80"}`}>
                                {item.label}
                              </div>
                              {item.description && (
                                <div className="text-[11px] text-muted-foreground">{item.description}</div>
                              )}
                            </div>
                            {selected === globalIdx && (
                              <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <kbd className="border border-border rounded px-1 py-0.5 font-mono">↑↓</kbd> Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="border border-border rounded px-1 py-0.5 font-mono">↵</kbd> Open
                </span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <BarChart3 className="w-3 h-3" />
                <span>SentinalAI</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
