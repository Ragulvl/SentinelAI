import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Trash2, Globe, Loader2, Lock, Zap, Target,
  RefreshCw, Copy, Check, Network, Terminal, ShieldCheck,
  AlertTriangle, FileCode2, Wifi, HardDrive, X,
  ChevronDown, ChevronUp, ArrowRight,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import {
  websiteScanService,
  VerifiedDomain,
  VerificationInstructions,
} from "@/services/websiteScan.service";
import { useToast } from "@/hooks/use-toast";

/* ── Method config ─────────────────────────────────────────────── */
const METHODS = [
  { key: "file" as const, label: "File Upload", Icon: HardDrive, color: "#3B82F6", tag: "FILE", desc: "Upload a .txt file to your web root. Works with FTP, SSH, or cPanel." },
  { key: "dns"  as const, label: "DNS Record",  Icon: Wifi,      color: "#8B5CF6", tag: "DNS",  desc: "Add a TXT record in Cloudflare, Namecheap, or any DNS panel." },
  { key: "meta" as const, label: "Meta Tag",    Icon: FileCode2, color: "#06B6D4", tag: "META", desc: "Paste one <meta> tag in your homepage <head>. Works with any CMS." },
];
const METHOD_MAP = Object.fromEntries(METHODS.map(m => [m.key, m])) as Record<string, typeof METHODS[0]>;

/* ── Copy button ───────────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold tracking-widest transition-all"
      style={{ background: ok ? "hsl(var(--success)/0.1)" : "hsl(var(--muted))", color: ok ? "hsl(var(--success))" : "hsl(var(--muted-foreground))", border: `1px solid ${ok ? "hsl(var(--success)/0.25)" : "hsl(var(--border))"}` }}
    >
      {ok ? <><Check className="w-3 h-3" />COPIED</> : <><Copy className="w-3 h-3" />COPY</>}
    </button>
  );
}

/* ── Code line ─────────────────────────────────────────────────── */
function CodeLine({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-lg px-3.5 py-2.5" style={{ background: "hsl(220 20% 5%)", border: "1px solid hsl(var(--border))" }}>
        <code className="flex-1 text-xs font-mono break-all" style={{ color: "#CBD5E1" }}>{value}</code>
        {copy && <CopyBtn text={value} />}
      </div>
    </div>
  );
}

/* ── Instructions drawer ───────────────────────────────────────── */
function InstructionsDrawer({ instructions, verifying, onVerify, onClose }: {
  instructions: VerificationInstructions;
  verifying: boolean;
  onVerify: () => void;
  onClose: () => void;
}) {
  const m = METHOD_MAP[instructions.method] ?? METHOD_MAP.file;
  const MIcon = m.Icon;
  const tok = instructions.token;

  const steps: { label: string; value: string; copy?: boolean }[] =
    instructions.method === "file" ? [
      { label: "File name — upload to your web root", value: "sentinel-verify.txt" },
      { label: "Accessible URL (your server must serve this)", value: `https://${instructions.domain}/sentinel-verify.txt`, copy: true },
      { label: "File content — ONLY this token, no extra lines", value: tok, copy: true },
    ] : instructions.method === "dns" ? [
      { label: "Record type", value: "TXT" },
      { label: "Name / Host", value: `_sentinel-verify.${instructions.domain}`, copy: true },
      { label: "Value / Content", value: tok, copy: true },
      { label: "TTL", value: "Auto or 3600" },
    ] : [
      { label: "Open your homepage HTML file", value: "index.html  (or your CMS template)" },
      { label: "Paste this inside the <head> section", value: `<meta name="sentinel-verify" content="${tok}">`, copy: true },
      { label: "Verification token", value: tok, copy: true },
    ];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: "hidden" }}
    >
      <div className="mt-3 rounded-xl overflow-hidden" style={{ border: `1px solid hsl(var(--border))`, borderLeft: `2px solid ${m.color}` }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.2)" }}>
          <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: `${m.color}14`, border: `1px solid ${m.color}28` }}>
            <MIcon className="w-3 h-3" style={{ color: m.color }} />
          </div>
          <p className="text-sm font-semibold text-foreground flex-1">{m.label} — step by step</p>
          <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded" style={{ background: `${m.color}14`, color: m.color, border: `1px solid ${m.color}28` }}>{m.tag}</span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-4 space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                style={{ background: "hsl(var(--primary)/0.1)", border: "1px solid hsl(var(--primary)/0.3)", color: "hsl(var(--primary))" }}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0"><CodeLine label={s.label} value={s.value} copy={s.copy} /></div>
            </div>
          ))}

          {instructions.method === "dns" && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: "hsl(38 92% 50%/0.06)", border: "1px solid hsl(38 92% 50%/0.18)" }}>
              <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-warning/80">DNS propagation can take up to 48 hours. Click Verify again after your TXT record has spread.</p>
            </div>
          )}

          <button onClick={onVerify} disabled={verifying}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold mt-1 transition-all"
            style={{ background: verifying ? "hsl(var(--muted))" : "hsl(var(--primary))", color: verifying ? "hsl(var(--muted-foreground))" : "#fff" }}>
            {verifying ? <><Loader2 className="w-4 h-4 animate-spin" />Checking...</> : <><ShieldCheck className="w-4 h-4" />Verify Ownership</>}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Delete confirmation inline ────────────────────────────────── */
function DeleteConfirm({ domain, onConfirm, onCancel }: { domain: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
      className="flex items-center gap-3 px-4 py-3 rounded-lg" style={{ background: "hsl(var(--destructive)/0.08)", border: "1px solid hsl(var(--destructive)/0.25)" }}>
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
      <p className="text-sm text-foreground flex-1">Remove <span className="font-mono font-semibold">{domain}</span>?</p>
      <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded font-medium transition-all"
        style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>Cancel</button>
      <button onClick={onConfirm} className="text-xs px-3 py-1.5 rounded font-semibold transition-all"
        style={{ background: "hsl(var(--destructive))", color: "#fff" }}>Remove</button>
    </motion.div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function DomainVerificationPage() {
  const [domains, setDomains] = useState<VerifiedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<"file" | "dns" | "meta">("file");
  const [instructions, setInstructions] = useState<VerificationInstructions | null>(null);
  const [activeInstructionDomain, setActiveInstructionDomain] = useState<string | null>(null);
  const [pendingMethods, setPendingMethods] = useState<Record<string, "file" | "dns" | "meta">>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try { setLoading(true); setDomains(await websiteScanService.getVerifiedDomains()); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  /* Add / get steps */
  const handleGetSteps = async () => {
    if (!newDomain.trim()) { toast({ title: "Enter a domain first", variant: "destructive" }); return; }
    try {
      setVerifying(true);
      const result = await websiteScanService.initiateVerification(newDomain.trim(), selectedMethod);
      setInstructions(result);
      setActiveInstructionDomain(null);
      setNewDomain("");
      await load();
      toast({ title: "Domain registered", description: "Follow the steps below to verify ownership." });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setVerifying(false); }
  };

  /* Show steps for existing domain */
  const handleShowSteps = async (domain: VerifiedDomain) => {
    if (activeInstructionDomain === domain.domain) {
      setActiveInstructionDomain(null); setInstructions(null); return;
    }
    const method = pendingMethods[domain.domain] ?? domain.verificationMethod as "file"|"dns"|"meta";
    try {
      setVerifying(true);
      const result = await websiteScanService.initiateVerification(domain.domain, method);
      setInstructions(result);
      setActiveInstructionDomain(domain.domain);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setVerifying(false); }
  };

  /* Switch method for existing domain */
  const handleSwitchMethod = async (domainName: string, method: "file" | "dns" | "meta") => {
    setPendingMethods(p => ({ ...p, [domainName]: method }));
    try {
      setVerifying(true);
      const result = await websiteScanService.initiateVerification(domainName, method);
      setInstructions(result);
      setActiveInstructionDomain(domainName);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setVerifying(false); }
  };

  /* Verify ownership */
  const handleVerify = async (domainName: string) => {
    try {
      setVerifying(true);
      const result = await websiteScanService.verifyDomain(domainName);
      if (result.success) {
        toast({ title: "Domain verified", description: result.message });
        setInstructions(null); setActiveInstructionDomain(null);
        await load();
      } else { toast({ title: "Not verified", description: result.message, variant: "destructive" }); }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setVerifying(false); }
  };

  /* Delete (no confirm() — uses inline UI instead) */
  const handleDelete = async (domainName: string) => {
    try {
      await websiteScanService.deleteDomain(domainName);
      toast({ title: "Domain removed" });
      setConfirmDelete(null);
      if (instructions?.domain === domainName) { setInstructions(null); setActiveInstructionDomain(null); }
      await load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  /* Quick add */
  const handleQuickAdd = async () => {
    if (!newDomain.trim()) { toast({ title: "Enter a domain first", variant: "destructive" }); return; }
    try {
      setVerifying(true);
      const result = await websiteScanService.addOwnedDomain(newDomain.trim());
      toast({ title: result.success ? "Domain added" : "Error", description: result.message, variant: result.success ? "default" : "destructive" });
      if (result.success) { setNewDomain(""); await load(); }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setVerifying(false); }
  };

  /* Self-app verification — for Vercel/Render deployments that can't do DNS/file/meta */
  const handleVerifySelf = async () => {
    const domain = newDomain.trim();
    if (!domain) { toast({ title: "Enter your app's domain first", variant: "destructive" }); return; }
    try {
      setVerifying(true);
      const result = await websiteScanService.verifySelf(domain);
      toast({
        title: result.success ? "✅ App verified!" : "Verification failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
      if (result.success) { setNewDomain(""); await load(); }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setVerifying(false); }
  };

  const instructionTarget = activeInstructionDomain ?? (instructions ? instructions.domain : null);
  const displayDomain = instructionTarget ? domains.find(d => d.domain === instructionTarget) : null;

  return (
    <PageLayout>
      <PageHeader
        title="Domain Verification"
        description="Prove ownership of your domain before running scans, penetration tests, or load tests."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Domains" }]}
        actions={<button onClick={load} className="btn-ghost-border gap-2 text-xs"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>}
      />

      <div className="max-w-2xl mx-auto space-y-5">

        {/* ── Add domain card ────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
          <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.25)" }}>
            <Network className="w-4 h-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Register a Domain</p>
              <p className="text-[11px] text-muted-foreground">Enter a domain you own, then choose how to prove ownership</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Input */}
            <div className="relative">
              <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                className="input-base pl-10 font-mono text-sm w-full"
                placeholder="example.com  or  https://example.com"
                value={newDomain}
                onChange={e => setNewDomain(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleGetSteps()}
                disabled={verifying}
              />
            </div>

            {/* Method picker */}
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => {
                const MIcon = m.Icon;
                const active = selectedMethod === m.key;
                return (
                  <button key={m.key} onClick={() => setSelectedMethod(m.key)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all"
                    style={{ background: active ? `${m.color}0C` : "transparent", border: `1px solid ${active ? m.color + "45" : "hsl(var(--border))"}` }}>
                    <MIcon className="w-3.5 h-3.5 shrink-0" style={{ color: active ? m.color : "hsl(var(--muted-foreground))" }} />
                    <span className="text-xs font-semibold" style={{ color: active ? m.color : "hsl(var(--foreground))" }}>{m.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">{METHODS.find(m => m.key === selectedMethod)?.desc}</p>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleGetSteps} disabled={verifying || !newDomain.trim()} className="btn-primary flex-1 justify-center py-2.5" style={{minWidth:'160px'}}>
                {verifying ? <><Loader2 className="w-4 h-4 animate-spin" />Working...</> : <><Shield className="w-4 h-4" />Get Verification Steps</>}
              </button>
              <button onClick={handleVerifySelf} disabled={verifying || !newDomain.trim()}
                className="btn-secondary text-xs px-4 shrink-0 flex items-center gap-1.5"
                title="Instantly verify if this domain matches your app's FRONTEND_URL or BACKEND_URL config">
                <Zap className="w-3.5 h-3.5" />Verify My App
              </button>
              <button onClick={handleQuickAdd} disabled={verifying || !newDomain.trim()}
                className="btn-ghost-border text-xs px-4 shrink-0" title="Add without verification — dev/localhost only">
                Quick Add
              </button>
            </div>
          </div>
        </div>

        {/* ── Instructions for newly added domain ────────── */}
        <AnimatePresence>
          {instructions && !activeInstructionDomain && (
            <InstructionsDrawer
              key={instructions.domain + instructions.method}
              instructions={instructions}
              verifying={verifying}
              onVerify={() => handleVerify(instructions.domain)}
              onClose={() => setInstructions(null)}
            />
          )}
        </AnimatePresence>

        {/* ── Domain list ────────────────────────────────── */}
        {(loading || domains.length > 0) && (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
            {/* List header */}
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.25)" }}>
              <span className="text-xs font-semibold text-foreground">Your Domains</span>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{domains.filter(d => d.verified).length} verified</span>
                <span>{domains.filter(d => !d.verified).length} pending</span>
              </div>
            </div>

            {loading ? (
              <div className="p-4 space-y-2">{[1,2].map(i => <div key={i} className="skeleton h-16 rounded-lg" />)}</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
                {domains.map((domain, i) => {
                  const m = METHOD_MAP[domain.verificationMethod] ?? METHOD_MAP.file;
                  const MIcon = m.Icon;
                  const isExpanded = activeInstructionDomain === domain.domain;
                  const isDeleting = confirmDelete === domain.domain;
                  const activeMethod = pendingMethods[domain.domain] ?? domain.verificationMethod;

                  return (
                    <motion.div key={domain._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                      <div className="px-5 py-4 space-y-3">
                        {/* Domain row */}
                        <div className="flex items-center gap-3">
                          {/* Status dot */}
                          <span className="relative flex h-2 w-2 shrink-0">
                            {domain.verified && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: "hsl(var(--success))" }} />}
                            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: domain.verified ? "hsl(var(--success))" : "#F59E0B" }} />
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-foreground">{domain.domain}</span>
                              <span className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded"
                                style={{ background: domain.verified ? "hsl(var(--success)/0.1)" : "hsl(38 92% 50%/0.1)", color: domain.verified ? "hsl(var(--success))" : "#F59E0B", border: `1px solid ${domain.verified ? "hsl(var(--success)/0.22)" : "hsl(38 92% 50%/0.22)"}` }}>
                                {domain.verified ? "VERIFIED" : "PENDING"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <MIcon className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{m.tag}</span>
                              {domain.verifiedAt && <span className="text-[10px] text-muted-foreground">&middot; {new Date(domain.verifiedAt).toLocaleDateString()}</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {domain.verified ? (
                              <button onClick={() => navigate(`/website-scan?url=https://${domain.domain}`)}
                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-medium transition-all"
                                style={{ background: "hsl(var(--primary)/0.1)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary)/0.25)" }}>
                                <Target className="w-3 h-3" />Scan
                              </button>
                            ) : (
                              <button onClick={() => handleShowSteps(domain)} disabled={verifying}
                                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded font-medium transition-all"
                                style={{ background: isExpanded ? "hsl(var(--primary)/0.1)" : "hsl(var(--muted))", border: `1px solid ${isExpanded ? "hsl(var(--primary)/0.3)" : "hsl(var(--border))"}`, color: isExpanded ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}Steps
                              </button>
                            )}
                            <button onClick={() => setConfirmDelete(isDeleting ? null : domain.domain)}
                              className="w-7 h-7 flex items-center justify-center rounded transition-all"
                              style={{ color: isDeleting ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))", background: isDeleting ? "hsl(var(--destructive)/0.1)" : "transparent" }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Delete confirmation */}
                        <AnimatePresence>
                          {isDeleting && (
                            <DeleteConfirm
                              domain={domain.domain}
                              onConfirm={() => handleDelete(domain.domain)}
                              onCancel={() => setConfirmDelete(null)}
                            />
                          )}
                        </AnimatePresence>

                        {/* Instructions for this domain (expanded) */}
                        <AnimatePresence>
                          {!domain.verified && isExpanded && instructions && (
                            <div>
                              {/* Method switcher */}
                              <div className="flex gap-1.5 mb-3">
                                {METHODS.map(mm => {
                                  const MI = mm.Icon;
                                  const active = activeMethod === mm.key;
                                  return (
                                    <button key={mm.key} onClick={() => handleSwitchMethod(domain.domain, mm.key)} disabled={verifying}
                                      className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded flex-1 justify-center font-semibold transition-all"
                                      style={{ background: active ? `${mm.color}10` : "transparent", border: `1px solid ${active ? mm.color + "38" : "hsl(var(--border))"}`, color: active ? mm.color : "hsl(var(--muted-foreground))" }}>
                                      <MI className="w-3 h-3" />{mm.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <InstructionsDrawer
                                instructions={instructions}
                                verifying={verifying}
                                onVerify={() => handleVerify(domain.domain)}
                                onClose={() => { setActiveInstructionDomain(null); setInstructions(null); }}
                              />
                            </div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────── */}
        {!loading && domains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
              <Network className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No domains yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a domain above to start the verification process</p>
            </div>
          </div>
        )}

        {/* ── Why verify ──────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }}>
          <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted)/0.25)" }}>
            <Lock className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">Why ownership verification is required</span>
          </div>
          <div className="divide-y" style={{ borderColor: "hsl(var(--border))" }}>
            {[
              { Icon: Target,      color: "#EF4444", label: "Penetration Testing",  desc: "We actively probe your server — authorization required." },
              { Icon: Zap,         color: "#F59E0B", label: "Load Testing",          desc: "We send high-volume traffic — only for site owners." },
              { Icon: Globe,       color: "#3B82F6", label: "Website Scanning",      desc: "Full endpoint audit needs confirmed site ownership." },
              { Icon: ShieldCheck, color: "#10B981", label: "Preventing Misuse",     desc: "Stops unauthorized scanning of third-party sites." },
            ].map(item => {
              const IIcon = item.Icon;
              return (
                <div key={item.label} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: `${item.color}10` }}>
                    <IIcon className="w-3 h-3" style={{ color: item.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </PageLayout>
  );
}
