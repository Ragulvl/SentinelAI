import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Shield, Activity, Globe, Clock, Lock, AlertTriangle,
  CheckCircle, XCircle, Wifi, WifiOff, RefreshCw, Plus,
  TrendingUp, TrendingDown, Minus, Trash2, Settings, X,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { NotificationSettings } from "@/components/NotificationSettings";
import { monitoringService, MonitoredSite as ApiMonitoredSite } from "@/services/monitoring.service";
import { websiteScanService } from "@/services/websiteScan.service";
import { toast } from "@/hooks/use-toast";

interface MonitoredSite {
  id: string;
  url: string;
  name: string;
  status: "up" | "down" | "degraded";
  responseTime: number;
  uptime: number;
  sslValid: boolean;
  sslExpiry: string;
  lastChecked: Date;
  responseHistory: number[];
  statusHistory: ("up" | "down" | "degraded")[];
  checkInterval: number;
}

const STATUS_CONFIG = {
  up: { label: "Operational", color: "text-success", bg: "bg-success", icon: CheckCircle, dot: "up" },
  degraded: { label: "Degraded", color: "text-warning", bg: "bg-warning", icon: AlertTriangle, dot: "degraded" },
  down: { label: "Down", color: "text-destructive", bg: "bg-destructive", icon: XCircle, dot: "down" },
};

// ── Mini sparkline chart ──────────────────────────────────────────────────
const Sparkline = ({ data, status }: { data: number[]; status: string }) => {
  const max = Math.max(...data, 1);
  const color = status === "up" ? "#22C55E" : status === "degraded" ? "#F59E0B" : "#EF4444";
  return (
    <div className="flex items-end gap-px h-7">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-1 rounded-t-sm transition-all"
          style={{
            height: `${Math.max((v / max) * 100, 5)}%`,
            background: v === 0 ? "#EF4444" : color,
            opacity: 0.35 + (i / data.length) * 0.65,
          }}
        />
      ))}
    </div>
  );
};

// ── Uptime bars ───────────────────────────────────────────────────────────
const UptimeBar = ({ history }: { history: ("up" | "down" | "degraded")[] }) => (
  <div className="flex gap-px">
    {history.map((s, i) => (
      <div
        key={i}
        className="uptime-bar-segment h-4"
        style={{
          background:
            s === "up" ? "hsl(142 71% 45% / 0.55)"
            : s === "degraded" ? "hsl(38 92% 50% / 0.55)"
            : "hsl(0 84% 60% / 0.55)",
        }}
      />
    ))}
  </div>
);

// ── Pulse dot ─────────────────────────────────────────────────────────────
const PulseDot = ({ status }: { status: "up" | "down" | "degraded" }) => (
  <span className="relative flex h-2.5 w-2.5 shrink-0">
    {status === "up" && (
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
    )}
    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 status-dot ${status}`} />
  </span>
);

const MonitoringPage = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<MonitoredSite[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newCheckInterval, setNewCheckInterval] = useState(60);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editingInterval, setEditingInterval] = useState<string | null>(null);
  const [tempInterval, setTempInterval] = useState(60);
  const [isScanning, setIsScanning] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

  const convertApiSite = (apiSite: ApiMonitoredSite): MonitoredSite => ({
    id: apiSite._id,
    url: apiSite.url,
    name: apiSite.name,
    status: apiSite.status,
    responseTime: apiSite.responseTime,
    uptime: apiSite.uptime,
    sslValid: apiSite.sslValid,
    sslExpiry: apiSite.sslExpiry || "N/A",
    lastChecked: new Date(apiSite.lastChecked),
    responseHistory: apiSite.responseHistory,
    statusHistory: apiSite.statusHistory,
    checkInterval: apiSite.checkInterval || 60,
  });

  useEffect(() => { loadSites(); }, []);

  const loadSites = async () => {
    try {
      setIsLoading(true);
      const apiSites = await monitoringService.getSites();
      setSites(apiSites.map(convertApiSite));
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to load monitored sites", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const apiSites = await monitoringService.refreshAllSites();
      setSites(apiSites.map(convertApiSite));
      setLastRefresh(new Date());
      toast({ title: "Refreshed", description: "All sites have been checked" });
    } catch {
      toast({ title: "Error", description: "Failed to refresh sites", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddSite = async () => {
    if (!newUrl.trim()) return;
    try {
      setIsAdding(true);
      const apiSite = await monitoringService.addSite({ url: newUrl, name: newName || undefined, checkInterval: newCheckInterval });
      setSites(prev => [...prev, convertApiSite(apiSite)]);
      setNewUrl(""); setNewName(""); setNewCheckInterval(60); setShowAddModal(false);
      toast({ title: "Site Added", description: `${apiSite.name} is now being monitored` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add site", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveSite = async (id: string) => {
    try {
      await monitoringService.removeSite(id);
      setSites(prev => prev.filter(s => s.id !== id));
      if (selectedSite === id) setSelectedSite(null);
      toast({ title: "Site Removed" });
    } catch {
      toast({ title: "Error", description: "Failed to remove site", variant: "destructive" });
    }
  };

  const handleUpdateInterval = async (siteId: string, interval: number) => {
    try {
      const updatedSite = await monitoringService.updateCheckInterval(siteId, interval);
      setSites(prev => prev.map(s => s.id === siteId ? convertApiSite(updatedSite) : s));
      setEditingInterval(null);
      toast({ title: "Interval Updated", description: `Check interval set to ${interval}s` });
    } catch {
      toast({ title: "Error", description: "Failed to update interval", variant: "destructive" });
    }
  };

  const handleScanWebsite = async (url: string) => {
    try {
      setIsScanning(true);
      toast({ title: "Scanning...", description: "Analyzing website for vulnerabilities" });
      const scanResult = await websiteScanService.scanWebsite(url);
      navigate(`/website-scan/${scanResult._id}`);
    } catch (error: any) {
      toast({ title: "Scan Failed", description: error.message || "Failed to scan website", variant: "destructive" });
    } finally {
      setIsScanning(false);
    }
  };

  const overallUp = sites.filter(s => s.status === "up").length;
  const overallDegraded = sites.filter(s => s.status === "degraded").length;
  const overallDown = sites.filter(s => s.status === "down").length;
  const avgResponse = Math.round(
    sites.filter(s => s.responseTime > 0).reduce((a, b) => a + b.responseTime, 0) /
    Math.max(sites.filter(s => s.responseTime > 0).length, 1)
  );
  const selected = sites.find(s => s.id === selectedSite);

  const overallHealth = sites.length === 0 ? 100
    : Math.round((overallUp / sites.length) * 100);

  return (
    <PageLayout>
      <PageHeader
        title="Monitoring"
        description="Real-time uptime and performance monitoring for your web endpoints."
        breadcrumbs={[{ label: "Platform" }, { label: "Monitoring" }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNotificationSettings(v => !v)}
              className="btn-ghost-border gap-2 text-xs"
            >
              <Settings className="w-3.5 h-3.5" />
              Alerts
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="btn-ghost-border gap-2 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs gap-2 py-2">
              <Plus className="w-3.5 h-3.5" />
              Add Site
            </button>
          </div>
        }
      />

      {/* Notification Settings Panel */}
      <AnimatePresence>
        {showNotificationSettings && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6"
          >
            <NotificationSettings />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        /* Skeleton */
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card-base p-4 space-y-2">
                <div className="skeleton h-3 w-1/2 rounded" />
                <div className="skeleton h-8 w-16 rounded" />
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card-base p-4 space-y-3">
                  <div className="skeleton h-4 w-1/3 rounded" />
                  <div className="skeleton h-3 w-2/3 rounded" />
                  <div className="skeleton h-7 w-full rounded" />
                </div>
              ))}
            </div>
            <div className="card-base p-4 h-64" />
          </div>
        </div>
      ) : sites.length === 0 ? (
        /* Empty state */
        <div className="text-center py-24">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
            <Globe className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-foreground mb-2 text-lg">No sites being monitored</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Add your first website to start tracking uptime, response times, and SSL health.
          </p>
          <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm gap-2">
            <Plus className="w-4 h-4" />
            Add First Site
          </button>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Operational", value: overallUp, icon: Wifi, color: "text-success" },
              { label: "Degraded", value: overallDegraded, icon: AlertTriangle, color: "text-warning" },
              { label: "Down", value: overallDown, icon: WifiOff, color: "text-destructive" },
              { label: "Avg Response", value: `${avgResponse}ms`, icon: Clock, color: "text-primary" },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card-elevated p-4"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Icon className="w-3.5 h-3.5" />
                    {stat.label}
                  </div>
                  <div className={`text-2xl font-bold metric-number ${stat.color}`}>
                    {stat.value}
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {/* Sites list */}
            <div className="md:col-span-2 space-y-3">
              <AnimatePresence mode="popLayout">
                {sites.map(site => {
                  const cfg = STATUS_CONFIG[site.status];
                  const Icon = cfg.icon;
                  const trend = site.responseHistory.length >= 12
                    ? site.responseHistory[11] - site.responseHistory[8]
                    : 0;

                  return (
                    <motion.div
                      key={site.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      onClick={() => setSelectedSite(site.id === selectedSite ? null : site.id)}
                      className={`card-interactive p-4 ${selectedSite === site.id ? "selected" : ""}`}
                    >
                      {/* Top row */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <PulseDot status={site.status} />
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground text-sm">{site.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{site.url}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); handleRemoveSite(site.id); }}
                            className="icon-btn w-7 h-7 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Metrics row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5 text-xs">
                          <div>
                            <div className="text-muted-foreground mb-0.5">Response</div>
                            <div className="font-mono text-foreground flex items-center gap-1">
                              {site.responseTime > 0 ? `${site.responseTime}ms` : "—"}
                              {trend > 20 && <TrendingUp className="w-3 h-3 text-destructive" />}
                              {trend < -20 && <TrendingDown className="w-3 h-3 text-success" />}
                              {Math.abs(trend) <= 20 && site.responseTime > 0 && <Minus className="w-3 h-3 text-muted-foreground" />}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-0.5">Uptime</div>
                            <div className={`font-mono ${site.uptime >= 99.9 ? "text-success" : site.uptime >= 99 ? "text-warning" : "text-destructive"}`}>
                              {site.uptime}%
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-0.5">SSL</div>
                            <div className={`font-mono flex items-center gap-1 ${site.sslValid ? "text-success" : "text-destructive"}`}>
                              <Lock className="w-3 h-3" />
                              {site.sslValid ? "Valid" : "Expired"}
                            </div>
                          </div>
                        </div>
                        <Sparkline data={site.responseHistory} status={site.status} />
                      </div>

                      {/* Uptime bar */}
                      <div className="mt-3 pt-2.5 flex items-center justify-between"
                        style={{ borderTop: "1px solid hsl(var(--border))" }}>
                        <UptimeBar history={site.statusHistory} />
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {site.lastChecked.toLocaleTimeString()}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Right panel */}
            <div className="space-y-4">
              {/* Detail card */}
              <AnimatePresence mode="wait">
                {selected ? (
                  <motion.div
                    key={selected.id}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    className="card-elevated p-5 space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <PulseDot status={selected.status} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground text-sm">{selected.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono truncate">{selected.url}</div>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-sm">
                      {[
                        { label: "Status", value: STATUS_CONFIG[selected.status].label, color: STATUS_CONFIG[selected.status].color },
                        { label: "Response", value: selected.responseTime > 0 ? `${selected.responseTime}ms` : "Timeout", color: "text-foreground" },
                        { label: "Uptime (30d)", value: `${selected.uptime}%`, color: "text-foreground" },
                        { label: "SSL", value: selected.sslValid ? "Valid" : "Expired!", color: selected.sslValid ? "text-success" : "text-destructive" },
                        { label: "SSL Expiry", value: selected.sslExpiry, color: "text-foreground" },
                      ].map(row => (
                        <div key={row.label} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{row.label}</span>
                          <span className={`font-mono font-medium ${row.color}`}>{row.value}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Check Interval</span>
                        {editingInterval === selected.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min="30" max="3600"
                              value={tempInterval}
                              onChange={e => setTempInterval(Number(e.target.value))}
                              className="w-16 px-2 py-0.5 rounded text-xs font-mono input-base"
                            />
                            <button onClick={() => handleUpdateInterval(selected.id, tempInterval)} className="text-xs text-primary hover:underline">Save</button>
                            <button onClick={() => setEditingInterval(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-foreground">{selected.checkInterval}s</span>
                            <button onClick={() => { setEditingInterval(selected.id); setTempInterval(selected.checkInterval); }}
                              className="text-xs text-primary hover:underline">Edit</button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">Response History</div>
                      <div className="rounded-lg p-2.5" style={{ background: "hsl(var(--muted) / 0.5)" }}>
                        <Sparkline data={selected.responseHistory} status={selected.status} />
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">Status Timeline</div>
                      <UptimeBar history={selected.statusHistory} />
                    </div>

                    <button
                      onClick={() => handleScanWebsite(selected.url)}
                      disabled={isScanning}
                      className="btn-primary w-full justify-center text-xs gap-2"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      {isScanning ? "Scanning..." : "Run Vulnerability Scan"}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="card-base p-8 text-center"
                  >
                    <Globe className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Select a site to view details</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Live activity feed */}
              <div className="card-elevated p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  Live Activity
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto">
                  {sites
                    .sort((a, b) => b.lastChecked.getTime() - a.lastChecked.getTime())
                    .slice(0, 6)
                    .map(site => (
                      <div key={site.id + "-log"} className="flex items-center gap-2 text-xs">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_CONFIG[site.status].bg}`} />
                        <span className="text-muted-foreground font-mono shrink-0">
                          {site.lastChecked.toLocaleTimeString()}
                        </span>
                        <span className="text-foreground truncate">{site.name}</span>
                        <span className={`ml-auto font-mono shrink-0 ${STATUS_CONFIG[site.status].color}`}>
                          {site.responseTime > 0 ? `${site.responseTime}ms` : "DOWN"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Last refresh */}
              <p className="text-center text-[10px] text-muted-foreground/50">
                Last refreshed {lastRefresh.toLocaleTimeString()}
              </p>
            </div>
          </div>
        </>
      )}

      {/* ── Add Site Modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "hsl(var(--background) / 0.75)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl p-6 space-y-5"
              style={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border-active))",
                boxShadow: "var(--shadow-2xl)",
              }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Add Website to Monitor</h3>
                <button onClick={() => setShowAddModal(false)} className="icon-btn">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">URL *</label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      value={newUrl}
                      onChange={e => setNewUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="input-base pl-9 font-mono text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Display Name</label>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="My Website"
                    className="input-base text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">
                    Check Interval — {newCheckInterval}s
                  </label>
                  <input
                    type="range" min="30" max="3600" step="30"
                    value={newCheckInterval}
                    onChange={e => setNewCheckInterval(Number(e.target.value))}
                    className="w-full accent-primary"
                    style={{ accentColor: "hsl(var(--primary))" }}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>30s (fast)</span>
                    <span>1 hour</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowAddModal(false)} className="btn-secondary flex-1 justify-center text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleAddSite}
                  disabled={!newUrl.trim() || isAdding}
                  className="btn-primary flex-1 justify-center text-sm"
                >
                  {isAdding ? "Adding..." : "Add & Monitor"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageLayout>
  );
};

export default MonitoringPage;
