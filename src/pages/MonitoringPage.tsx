import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Clock, Lock, AlertTriangle, CheckCircle, XCircle,
  Wifi, WifiOff, RefreshCw, Plus, Trash2, Settings,
  ChevronDown, ExternalLink, Search, Eye, Cpu, ZapOff,
  BadgeCheck, TriangleAlert, ServerCrash, Timer, Signal, Activity,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { NotificationSettings } from "@/components/NotificationSettings";
import { monitoringService, MonitoredSite as ApiSite } from "@/services/monitoring.service";
import { toast } from "@/hooks/use-toast";

type SiteStatus  = "up" | "down" | "degraded";
type MonitorType = "http" | "keyword" | "port";

interface Incident {
  startedAt: string; resolvedAt: string | null; duration: number | null;
  type: "down" | "degraded"; error?: string;
}
interface Site {
  id: string; url: string; name: string; monitorType: MonitorType;
  keyword?: string; keywordPresent?: boolean; expectedStatus: number; port?: number;
  status: SiteStatus; statusCode: number | null; responseTime: number; uptime: number;
  sslValid: boolean; sslExpiry: string | null; sslDaysLeft: number | null;
  lastChecked: Date; responseHistory: number[]; statusHistory: SiteStatus[];
  incidents: Incident[]; checkInterval: number;
}

const STATUS_CFG = {
  up:       { label: "Operational", icon: CheckCircle,   dot: "#22c55e", badge: "hsl(143 71% 45% / 0.12)", text: "#22c55e" },
  degraded: { label: "Degraded",    icon: TriangleAlert, dot: "#f59e0b", badge: "hsl(38 92% 50% / 0.12)",  text: "#f59e0b" },
  down:     { label: "Down",        icon: ServerCrash,   dot: "#ef4444", badge: "hsl(0 84% 60% / 0.12)",   text: "#ef4444" },
};
const TYPE_CFG: Record<MonitorType, { label: string; icon: any }> = {
  http:    { label: "HTTP",    icon: Globe  },
  keyword: { label: "Keyword", icon: Search },
  port:    { label: "Port",    icon: Cpu    },
};

const fmt = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
const fmtDur = (sec: number | null) => {
  if (sec === null) return "Ongoing";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec/60)}m`;
  return `${Math.round(sec/3600)}h ${Math.round((sec%3600)/60)}m`;
};
const timeAgo = (d: Date) => {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  return `${Math.floor(s/3600)}h ago`;
};

const PulseDot = ({ status }: { status: SiteStatus }) => {
  const c = STATUS_CFG[status].dot;
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {status === "up" && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: c }} />}
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: c }} />
    </span>
  );
};

const StatusBadge = ({ status }: { status: SiteStatus }) => {
  const cfg = STATUS_CFG[status]; const Icon = cfg.icon;
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
      style={{ background: cfg.badge, color: cfg.text, border: `1px solid ${cfg.text}44` }}>
      <Icon className="w-3 h-3" />{cfg.label}
    </span>
  );
};

const Sparkline = ({ data, status }: { data: number[]; status: SiteStatus }) => {
  const max = Math.max(...data, 1); const color = STATUS_CFG[status].dot;
  return (
    <div className="flex items-end gap-px h-8">
      {data.slice(-30).map((v, i) => (
        <div key={i} className="flex-1 min-w-0 rounded-sm"
          style={{ height: `${Math.max((v/max)*100, v===0?100:4)}%`, background: v===0?"#ef4444":color, opacity: v===0?0.7:0.2+(i/30)*0.8 }} />
      ))}
    </div>
  );
};

const UptimeBar = ({ history }: { history: SiteStatus[] }) => (
  <div className="flex gap-px h-3.5 rounded overflow-hidden">
    {history.map((s, i) => (
      <div key={i} className="flex-1"
        style={{ background: s==="down"?"#ef444455":s==="degraded"?"#f59e0b44":"hsl(var(--border-active)/0.4)" }} />
    ))}
  </div>
);

const SslBadge = ({ valid, daysLeft }: { valid: boolean; daysLeft: number | null }) => {
  if (!valid) return <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color:"#ef4444" }}><ZapOff className="w-3 h-3"/>SSL Invalid</span>;
  if (daysLeft !== null && daysLeft <= 30) return <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color:"#f59e0b" }}><Lock className="w-3 h-3"/>{daysLeft}d left</span>;
  return <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground"><BadgeCheck className="w-3 h-3 text-success"/>SSL OK{daysLeft?` (${daysLeft}d)`:""}</span>;
};

const ResponseChart = ({ data }: { data: number[] }) => {
  const w=400,h=72,p=4;
  if (data.length < 2) return <div className="h-18 flex items-center justify-center text-xs text-muted-foreground">Not enough data yet</div>;
  const max = Math.max(...data,1);
  const pts = data.map((v,i) => `${p+(i/(data.length-1))*(w-p*2)},${h-p-((v/max)*(h-p*2))}`).join(" ");
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
        <span>{data.length} checks</span><span>Latest: {fmt(data[data.length-1])}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{height:72}} preserveAspectRatio="none">
        <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity="0.3"/><stop offset="100%" stopColor="#22c55e" stopOpacity="0"/></linearGradient></defs>
        <polygon fill="url(#cg)" points={`${p},${h} ${pts} ${w-p},${h}`}/>
        <polyline fill="none" stroke="#22c55e" strokeWidth="1.5" points={pts}/>
      </svg>
    </div>
  );
};

// ── Add Monitor Modal ────────────────────────────────────────────────────────
const AddMonitorModal = ({ onClose, onAdd }: { onClose: () => void; onAdd: (s: Site) => void }) => {
  const [url, setUrl]                 = useState("");
  const [name, setName]               = useState("");
  const [monitorType, setType]        = useState<MonitorType>("http");
  const [keyword, setKeyword]         = useState("");
  const [kwPresent, setKwP]           = useState(true);
  const [expStatus, setExpStatus]     = useState(200);
  const [port, setPort]               = useState(443);
  const [interval, setInterval_]      = useState(60);
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState<any>(null);
  const [adding, setAdding]           = useState(false);

  const handleTest = async () => {
    if (!url.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await monitoringService.testUrl({ url, monitorType,
        keyword: monitorType==="keyword"?keyword:undefined, keywordPresent: kwPresent,
        expectedStatus: expStatus, port: monitorType==="port"?port:undefined });
      setTestResult(res);
      if (res.normalizedUrl && !name) {
        try { setName(new URL(res.normalizedUrl).hostname); } catch {}
      }
    } catch (e: any) { setTestResult({ reachable: false, error: e.message }); }
    finally { setTesting(false); }
  };

  const handleAdd = async () => {
    if (!url.trim()) return;
    setAdding(true);
    try {
      const s = await monitoringService.addSite({ url, name: name||undefined, checkInterval: interval,
        monitorType, keyword: monitorType==="keyword"?keyword:undefined, keywordPresent: kwPresent,
        expectedStatus: expStatus, port: monitorType==="port"?port:undefined });
      onAdd(convertApiSite(s)); onClose();
      toast({ title: "Monitor Added", description: `Now tracking ${s.name}` });
    } catch (e: any) { toast({ title: "Failed", description: e.message||"Could not add", variant: "destructive" }); }
    finally { setAdding(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}>
      <motion.div initial={{ opacity:0, scale:0.96, y:12 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.96 }}
        className="card-base w-full max-w-lg max-h-[88vh] overflow-y-auto p-6 space-y-5"
        style={{ border:"1px solid hsl(var(--border))" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Add Monitor</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Track uptime, response time, SSL &amp; keywords</p>
          </div>
          <button onClick={onClose} className="icon-btn w-8 h-8 text-muted-foreground"><XCircle className="w-4 h-4"/></button>
        </div>

        {/* Monitor type selector */}
        <div className="space-y-1.5">
          <label className="section-label">Monitor Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(["http","keyword","port"] as MonitorType[]).map(t => {
              const Icon = TYPE_CFG[t].icon;
              return (
                <button key={t} onClick={() => setType(t)}
                  className="p-2.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1.5 border transition-all"
                  style={{ background: monitorType===t?"hsl(var(--primary)/0.1)":"hsl(var(--surface))",
                    borderColor: monitorType===t?"hsl(var(--primary))":"hsl(var(--border))",
                    color: monitorType===t?"hsl(var(--primary))":"hsl(var(--muted-foreground))" }}>
                  <Icon className="w-4 h-4"/>{TYPE_CFG[t].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* URL field + test button */}
        <div className="space-y-1.5">
          <label className="section-label">URL *</label>
          <div className="flex gap-2">
            <input value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleTest()}
              className="input-base flex-1 font-mono text-sm" placeholder="https://example.com" />
            <button onClick={handleTest} disabled={testing||!url.trim()} className="btn-ghost-border text-xs px-3 shrink-0 gap-1.5">
              {testing?<RefreshCw className="w-3.5 h-3.5 animate-spin"/>:<Signal className="w-3.5 h-3.5"/>}
              {testing?"Testing…":"Test"}
            </button>
          </div>
          <AnimatePresence>
            {testResult && (
              <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }} className="overflow-hidden">
                <div className="p-3 rounded-lg text-xs font-mono space-y-1 mt-1"
                  style={{ background: testResult.reachable?"hsl(143 71% 45%/0.08)":"hsl(0 84% 60%/0.08)",
                    border: `1px solid ${testResult.reachable?"#22c55e33":"#ef444433"}` }}>
                  <div className="flex items-center gap-1.5 font-semibold" style={{ color: testResult.reachable?"#22c55e":"#ef4444" }}>
                    {testResult.reachable?<CheckCircle className="w-3.5 h-3.5"/>:<XCircle className="w-3.5 h-3.5"/>}
                    {testResult.reachable?"Reachable":"Unreachable"}
                  </div>
                  {testResult.statusCode&&<div className="text-muted-foreground">HTTP {testResult.statusCode} · {fmt(testResult.responseTime)}</div>}
                  {testResult.sslDaysLeft!=null&&<div className="text-muted-foreground">SSL: {testResult.sslDaysLeft}d remaining</div>}
                  {testResult.keywordFound!==undefined&&<div className="text-muted-foreground">Keyword: {testResult.keywordFound?"✓ Found":"✗ Not found"}</div>}
                  {testResult.error&&<div style={{color:"#ef4444"}}>{testResult.error}</div>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label className="section-label">Display Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} className="input-base w-full text-sm"
            placeholder="My Website (auto-filled after test)" />
        </div>

        {/* Keyword options */}
        {monitorType==="keyword"&&(
          <div className="space-y-3 p-3 rounded-lg" style={{ background:"hsl(var(--surface))", border:"1px solid hsl(var(--border))" }}>
            <label className="section-label">Keyword Check</label>
            <input value={keyword} onChange={e=>setKeyword(e.target.value)} className="input-base w-full font-mono text-sm"
              placeholder="e.g. healthy, OK, success" />
            <div className="flex gap-2">
              {[{v:true,l:"Must be present"},{v:false,l:"Must be absent"}].map(o=>(
                <button key={String(o.v)} onClick={()=>setKwP(o.v)}
                  className="flex-1 py-1.5 rounded text-xs font-medium border transition-all"
                  style={{ background:kwPresent===o.v?"hsl(var(--primary)/0.1)":"transparent",
                    borderColor:kwPresent===o.v?"hsl(var(--primary))":"hsl(var(--border))",
                    color:kwPresent===o.v?"hsl(var(--primary))":"hsl(var(--muted-foreground))" }}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Port */}
        {monitorType==="port"&&(
          <div className="space-y-1.5">
            <label className="section-label">Port Number</label>
            <input type="number" value={port} onChange={e=>setPort(Number(e.target.value))}
              className="input-base w-full font-mono text-sm" min={1} max={65535} />
          </div>
        )}

        {/* Expected status (http only) */}
        {monitorType==="http"&&(
          <div className="space-y-1.5">
            <label className="section-label">Expected HTTP Status</label>
            <input type="number" value={expStatus} onChange={e=>setExpStatus(Number(e.target.value))}
              className="input-base w-full font-mono text-sm" min={100} max={599}/>
            <p className="text-[10px] text-muted-foreground">Alert if response code differs (default 200)</p>
          </div>
        )}

        {/* Check interval */}
        <div className="space-y-1.5">
          <label className="section-label">Check Interval</label>
          <div className="grid grid-cols-4 gap-2">
            {[{v:60,l:"1 min"},{v:300,l:"5 min"},{v:600,l:"10 min"},{v:1800,l:"30 min"}].map(o=>(
              <button key={o.v} onClick={()=>setInterval_(o.v)}
                className="py-1.5 rounded text-xs font-medium border transition-all"
                style={{ background:interval===o.v?"hsl(var(--primary)/0.1)":"transparent",
                  borderColor:interval===o.v?"hsl(var(--primary))":"hsl(var(--border))",
                  color:interval===o.v?"hsl(var(--primary))":"hsl(var(--muted-foreground))" }}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost-border flex-1 text-sm">Cancel</button>
          <button onClick={handleAdd} disabled={adding||!url.trim()} className="btn-primary flex-1 text-sm gap-2">
            {adding?<RefreshCw className="w-3.5 h-3.5 animate-spin"/>:<Plus className="w-3.5 h-3.5"/>}
            {adding?"Adding…":"Add Monitor"}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Converter ────────────────────────────────────────────────────────────────
function convertApiSite(s: ApiSite): Site {
  return {
    id: s._id, url: s.url, name: s.name,
    monitorType:    (s as any).monitorType || "http",
    keyword:        (s as any).keyword,
    keywordPresent: (s as any).keywordPresent ?? true,
    expectedStatus: (s as any).expectedStatus ?? 200,
    port:           (s as any).port,
    status:         s.status,
    statusCode:     (s as any).statusCode ?? null,
    responseTime:   s.responseTime, uptime: s.uptime,
    sslValid:       s.sslValid, sslExpiry: s.sslExpiry || null,
    sslDaysLeft:    (s as any).sslDaysLeft ?? null,
    lastChecked:    new Date(s.lastChecked),
    responseHistory: s.responseHistory, statusHistory: s.statusHistory,
    incidents:      (s as any).incidents || [],
    checkInterval:  s.checkInterval || 60,
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────
const MonitoringPage = () => {
  const [sites, setSites]               = useState<Site[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh]   = useState(new Date());
  const [showAdd, setShowAdd]           = useState(false);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState<"overview"|"incidents">("overview");
  const [showNotifs, setShowNotifs]     = useState(false);

  useEffect(() => { loadSites(); }, []);
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) handleRefresh(); }, 60000);
    return () => clearInterval(id);
  }, []);

  const loadSites = async () => {
    try { setIsLoading(true); const d = await monitoringService.getSites(); setSites(d.map(convertApiSite)); }
    catch { toast({ title:"Error", description:"Failed to load monitors", variant:"destructive" }); }
    finally { setIsLoading(false); }
  };

  const handleRefresh = async () => {
    try { setIsRefreshing(true); const d = await monitoringService.refreshAllSites(); setSites(d.map(convertApiSite)); setLastRefresh(new Date()); }
    catch { toast({ title:"Error", description:"Refresh failed", variant:"destructive" }); }
    finally { setIsRefreshing(false); }
  };

  const handleRemove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await monitoringService.removeSite(id);
    setSites(p => p.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast({ title:"Monitor Removed" });
  };

  const upCnt       = sites.filter(s=>s.status==="up").length;
  const downCnt     = sites.filter(s=>s.status==="down").length;
  const degCnt      = sites.filter(s=>s.status==="degraded").length;
  const avgResp     = sites.length ? Math.round(sites.reduce((a,s)=>a+s.responseTime,0)/sites.length) : 0;
  const avgUptime   = sites.length ? parseFloat((sites.reduce((a,s)=>a+s.uptime,0)/sites.length).toFixed(1)) : 100;
  const sslWarn     = sites.filter(s=>!s.sslValid||(s.sslDaysLeft!==null&&s.sslDaysLeft<=30)).length;
  const selected    = sites.find(s=>s.id===selectedId);
  const allIncidents = sites.flatMap(s=>s.incidents.map(i=>({...i,siteName:s.name,siteUrl:s.url})))
    .sort((a,b)=>new Date(b.startedAt).getTime()-new Date(a.startedAt).getTime());

  return (
    <PageLayout>
      <PageHeader title="Monitoring" description="Real-time uptime, SSL &amp; performance monitoring."
        breadcrumbs={[{label:"Platform"},{label:"Monitoring"}]}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowNotifs(v=>!v)} className="btn-ghost-border gap-1.5 text-xs">
              <Settings className="w-3.5 h-3.5"/>Alerts
            </button>
            <button onClick={handleRefresh} disabled={isRefreshing} className="btn-ghost-border gap-1.5 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing?"animate-spin":""}`}/>Refresh
            </button>
            <button onClick={()=>setShowAdd(true)} className="btn-primary text-xs gap-1.5 py-2">
              <Plus className="w-3.5 h-3.5"/>Add Monitor
            </button>
          </div>
        }
      />

      <AnimatePresence>
        {showNotifs&&(
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} className="mb-6">
            <NotificationSettings/>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px" style={{background:"hsl(var(--border))",border:"1px solid hsl(var(--border))",borderRadius:"var(--radius-lg)",overflow:"hidden"}}>
            {Array.from({length:5}).map((_,i)=>(
              <div key={i} className="p-4 space-y-2" style={{background:"hsl(var(--surface))"}}>
                <div className="skeleton h-3 w-16 rounded"/><div className="skeleton h-7 w-12 rounded"/>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-3">
              {Array.from({length:3}).map((_,i)=><div key={i} className="card-base p-4 h-28 skeleton"/>)}
            </div>
            <div className="card-base p-4 h-64 skeleton"/>
          </div>
        </div>
      ) : sites.length===0 ? (
        <div className="text-center py-24 space-y-5">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
            style={{background:"hsl(var(--muted))",border:"1px solid hsl(var(--border))"}}>
            <Globe className="w-8 h-8 text-muted-foreground"/>
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-2">No monitors yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              Add your first URL to track uptime, response time, SSL health and get instant alerts.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button onClick={()=>setShowAdd(true)} className="btn-primary gap-2">
              <Plus className="w-4 h-4"/>Add First Monitor
            </button>
            <p className="text-xs text-muted-foreground">HTTP · Keyword · Port monitoring</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px"
            style={{background:"hsl(var(--border))",border:"1px solid hsl(var(--border))",borderRadius:"var(--radius-lg)",overflow:"hidden"}}>
            {[
              {label:"Operational",  value:upCnt,        icon:Wifi,         color:upCnt>0&&downCnt===0?"#22c55e":undefined},
              {label:"Down",         value:downCnt,       icon:WifiOff,      color:downCnt>0?"#ef4444":undefined},
              {label:"Degraded",     value:degCnt,        icon:AlertTriangle,color:degCnt>0?"#f59e0b":undefined},
              {label:"Avg Uptime",   value:`${avgUptime}%`,icon:Activity,    color:avgUptime<99?"#f59e0b":undefined},
              {label:"Avg Response", value:fmt(avgResp),  icon:Timer,        color:avgResp>2000?"#f59e0b":undefined},
            ].map(({label,value,icon:Icon,color})=>(
              <div key={label} className="p-4" style={{background:"hsl(var(--surface))"}}>
                <div className="section-label mb-2 flex items-center gap-1.5">
                  <Icon className="w-3 h-3" strokeWidth={1.5}/>{label}
                </div>
                <div className="metric-number" style={{fontSize:22,fontWeight:700,color:color||"hsl(var(--foreground))"}}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          {/* SSL warning banner */}
          {sslWarn>0&&(
            <motion.div initial={{opacity:0}} animate={{opacity:1}}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
              style={{background:"hsl(38 92% 50%/0.1)",border:"1px solid hsl(38 92% 50%/0.3)",color:"#f59e0b"}}>
              <Lock className="w-4 h-4 shrink-0"/>
              <span><strong>{sslWarn}</strong> site{sslWarn>1?"s have":" has"} SSL certificate issues — check the details below.</span>
            </motion.div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-lg w-fit" style={{background:"hsl(var(--muted))"}}>
            {(["overview","incidents"] as const).map(tab=>(
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className="px-4 py-1.5 rounded-md text-xs font-medium transition-all capitalize"
                style={{
                  background:activeTab===tab?"hsl(var(--surface))":"transparent",
                  color:activeTab===tab?"hsl(var(--foreground))":"hsl(var(--muted-foreground))",
                  boxShadow:activeTab===tab?"0 1px 3px rgba(0,0,0,0.15)":"none",
                }}>
                {tab}{tab==="incidents"&&allIncidents.length>0?` (${allIncidents.length})`:""}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab==="overview"?(
              <motion.div key="overview" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
                className="grid md:grid-cols-3 gap-6">
                {/* Sites list */}
                <div className="md:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="section-label">Monitors ({sites.length})</span>
                    <span className="text-[10px] text-muted-foreground font-mono">Last refresh: {timeAgo(lastRefresh)}</span>
                  </div>
                  <AnimatePresence mode="popLayout">
                    {sites.map(site=>{
                      const isSel = selectedId===site.id;
                      const TypeIcon = TYPE_CFG[site.monitorType].icon;
                      return (
                        <motion.div key={site.id} layout
                          initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,x:-20}}
                          onClick={()=>setSelectedId(isSel?null:site.id)}
                          className={`card-interactive p-4 cursor-pointer ${isSel?"selected":""}`}
                          style={{borderLeft:`3px solid ${STATUS_CFG[site.status].dot}`}}>
                          {/* Top row */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PulseDot status={site.status}/>
                              <div className="min-w-0">
                                <div className="font-semibold text-sm truncate">{site.name}</div>
                                <div className="text-[10px] font-mono text-muted-foreground truncate flex items-center gap-1">
                                  <TypeIcon className="w-3 h-3 shrink-0"/>{site.url}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <StatusBadge status={site.status}/>
                              {site.statusCode&&(
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                                  style={{background:"hsl(var(--muted))",color:"hsl(var(--muted-foreground))"}}>
                                  {site.statusCode}
                                </span>
                              )}
                              <button onClick={e=>handleRemove(site.id,e)}
                                className="icon-btn w-6 h-6 text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-3 h-3"/>
                              </button>
                            </div>
                          </div>
                          {/* Metrics */}
                          <div className="grid grid-cols-4 gap-3 mb-3 text-[10px] font-mono">
                            {[
                              {l:"Response",v:fmt(site.responseTime),c:site.responseTime>2000?"#f59e0b":undefined},
                              {l:"Uptime",v:`${site.uptime.toFixed(1)}%`,c:site.uptime<99?"#f59e0b":undefined},
                              {l:"Interval",v:site.checkInterval<60?`${site.checkInterval}s`:`${site.checkInterval/60}m`,c:undefined},
                              {l:"Checked",v:timeAgo(site.lastChecked),c:undefined},
                            ].map(m=>(
                              <div key={m.l}>
                                <div className="text-muted-foreground mb-0.5">{m.l}</div>
                                <div className="font-semibold" style={{color:m.c}}>{m.v}</div>
                              </div>
                            ))}
                          </div>
                          {site.responseHistory.length>1&&<Sparkline data={site.responseHistory} status={site.status}/>}
                          {site.statusHistory.length>1&&(
                            <div className="mt-2">
                              <UptimeBar history={site.statusHistory}/>
                              <div className="flex justify-between text-[9px] text-muted-foreground font-mono mt-0.5">
                                <span>{site.statusHistory.length} checks ago</span><span>Now</span>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2 pt-2" style={{borderTop:"1px solid hsl(var(--border))"}}>
                            <SslBadge valid={site.sslValid} daysLeft={site.sslDaysLeft}/>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              {isSel?"Hide details":"View details"}
                              <ChevronDown className={`w-3 h-3 transition-transform ${isSel?"rotate-180":""}`}/>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                {/* Detail panel */}
                <div>
                  {selected ? (
                    <AnimatePresence mode="wait">
                      <motion.div key={selected.id} initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} exit={{opacity:0}}
                        className="card-base p-5 space-y-5 sticky top-20">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <PulseDot status={selected.status}/>
                            <span className="font-semibold text-sm">{selected.name}</span>
                          </div>
                          <a href={selected.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()}
                            className="text-[10px] font-mono text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
                            <ExternalLink className="w-3 h-3"/>{selected.url}
                          </a>
                        </div>
                        <div>
                          <div className="section-label mb-2">Response Time</div>
                          <ResponseChart data={selected.responseHistory}/>
                        </div>
                        <div>
                          <div className="section-label mb-2">SSL Certificate</div>
                          <div className="space-y-1 text-xs font-mono">
                            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><SslBadge valid={selected.sslValid} daysLeft={selected.sslDaysLeft}/></div>
                            {selected.sslExpiry&&<div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span>{new Date(selected.sslExpiry).toLocaleDateString()}</span></div>}
                          </div>
                        </div>
                        <div>
                          <div className="section-label mb-2">Configuration</div>
                          <div className="space-y-1 text-xs font-mono">
                            {[
                              {k:"Type",v:selected.monitorType},
                              {k:"Expected",v:`HTTP ${selected.expectedStatus}`},
                              {k:"Interval",v:selected.checkInterval<60?`${selected.checkInterval}s`:`${selected.checkInterval/60}m`},
                              ...(selected.keyword?[{k:"Keyword",v:`"${selected.keyword}" must ${selected.keywordPresent?"exist":"not exist"}`}]:[]),
                            ].map(({k,v})=>(
                              <div key={k} className="flex justify-between">
                                <span className="text-muted-foreground">{k}</span>
                                <span className="capitalize">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {selected.incidents.length>0&&(
                          <div>
                            <div className="section-label mb-2">Recent Incidents</div>
                            <div className="space-y-2">
                              {selected.incidents.slice(-5).reverse().map((inc,i)=>(
                                <div key={i} className="p-2.5 rounded-lg text-[10px] font-mono"
                                  style={{background:"hsl(var(--surface))",border:"1px solid hsl(var(--border))"}}>
                                  <div className="flex justify-between mb-0.5">
                                    <span style={{color:inc.type==="down"?"#ef4444":"#f59e0b"}} className="font-semibold capitalize">{inc.type}</span>
                                    <span className="text-muted-foreground">{new Date(inc.startedAt).toLocaleDateString()}</span>
                                  </div>
                                  <div className="text-muted-foreground">Duration: {fmtDur(inc.duration)}</div>
                                  {inc.resolvedAt?<div className="text-success">Resolved</div>:<div style={{color:"#ef4444"}}>Ongoing</div>}
                                  {inc.error&&<div className="text-muted-foreground truncate mt-0.5">{inc.error}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  ):(
                    <div className="card-base p-6 text-center sticky top-20">
                      <Eye className="w-8 h-8 text-muted-foreground mx-auto mb-3"/>
                      <p className="text-sm font-semibold mb-1">Select a monitor</p>
                      <p className="text-xs text-muted-foreground">Click a card to view response chart, SSL details and incidents.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ):(
              // Incidents tab
              <motion.div key="incidents" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="space-y-3">
                <span className="section-label">All Incidents ({allIncidents.length})</span>
                {allIncidents.length===0?(
                  <div className="card-base p-10 text-center">
                    <CheckCircle className="w-8 h-8 text-success mx-auto mb-3"/>
                    <p className="text-sm font-semibold">No incidents recorded</p>
                    <p className="text-xs text-muted-foreground mt-1">All monitors are healthy</p>
                  </div>
                ):(
                  <div className="card-base overflow-hidden">
                    <div className="divide-y" style={{borderColor:"hsl(var(--border))"}}>
                      {allIncidents.map((inc,i)=>(
                        <div key={i} className="p-4 flex items-start gap-3">
                          <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{background:inc.type==="down"?"#ef4444":"#f59e0b"}}/>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-sm font-semibold">{(inc as any).siteName}</span>
                              <span className="text-xs font-mono text-muted-foreground">{new Date(inc.startedAt).toLocaleString()}</span>
                            </div>
                            <div className="text-xs text-muted-foreground font-mono truncate">{(inc as any).siteUrl}</div>
                            <div className="flex items-center gap-4 mt-1.5 text-xs font-mono">
                              <span style={{color:inc.type==="down"?"#ef4444":"#f59e0b"}} className="capitalize font-semibold">{inc.type}</span>
                              <span className="text-muted-foreground">Duration: {fmtDur(inc.duration)}</span>
                              {inc.resolvedAt?<span className="text-success">Resolved</span>:<span style={{color:"#ef4444"}}>Ongoing</span>}
                            </div>
                            {inc.error&&<div className="text-xs text-muted-foreground mt-1 truncate">{inc.error}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showAdd&&<AddMonitorModal onClose={()=>setShowAdd(false)} onAdd={s=>setSites(p=>[...p,s])}/>}
      </AnimatePresence>
    </PageLayout>
  );
};

export default MonitoringPage;


