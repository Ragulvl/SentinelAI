import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, CheckCircle, XCircle, Clock, Trash2, FileText,
  Globe, Code, Loader2, Info, Lock, Zap, Target, ArrowRight,
  Plus, RefreshCw,
} from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";
import { websiteScanService, VerifiedDomain, VerificationInstructions } from "@/services/websiteScan.service";
import { useToast } from "@/hooks/use-toast";

const METHOD_ICONS: Record<string, React.ElementType> = {
  file: FileText,
  dns: Globe,
  meta: Code,
};

const METHOD_DESCRIPTIONS: Record<string, string> = {
  file: "Place the authorization file within the web root of your target host.",
  dns: "Publish a TXT record containing the verification token in your DNS configuration.",
  meta: "Embed a verification metadata tag into the main HTML head of your index page.",
};

const METHODS = [
  { key: "file" as const, label: "File Upload", icon: FileText, desc: "Place file in web root", color: "#5B6CFF" },
  { key: "meta" as const, label: "Meta Tag", icon: Code, desc: "Embed HTML tag", color: "#7F5AF0" },
  { key: "dns" as const, label: "DNS Record", icon: Globe, desc: "Add TXT record", color: "#00D4FF" },
];

export default function DomainVerificationPage() {
  const [domains, setDomains] = useState<VerifiedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<"file" | "dns" | "meta">("file");
  const [instructions, setInstructions] = useState<VerificationInstructions | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { loadDomains(); }, []);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const data = await websiteScanService.getVerifiedDomains();
      setDomains(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load domains", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateVerification = async () => {
    if (!newDomain.trim()) { toast({ title: "Domain required", variant: "destructive" }); return; }
    try {
      setVerifying(true);
      const result = await websiteScanService.initiateVerification(newDomain, verificationMethod);
      setInstructions(result);
      toast({ title: "Verification Initiated", description: "Follow the instructions below to verify your domain" });
      await loadDomains();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to initiate verification", variant: "destructive" });
    } finally { setVerifying(false); }
  };

  const handleAddOwnedDomain = async () => {
    if (!newDomain.trim()) { toast({ title: "Domain required", variant: "destructive" }); return; }
    if (!confirm(`Add "${newDomain}" as an owned domain without verification?`)) return;
    try {
      setVerifying(true);
      const result = await websiteScanService.addOwnedDomain(newDomain);
      if (result.success) {
        toast({ title: "Domain added", description: result.message });
        setNewDomain(""); setInstructions(null);
        await loadDomains();
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to add domain", variant: "destructive" });
    } finally { setVerifying(false); }
  };

  const handleVerifyDomain = async (domain: string) => {
    try {
      setVerifying(true);
      const result = await websiteScanService.verifyDomain(domain);
      if (result.success) {
        toast({ title: "Domain verified", description: result.message });
        setInstructions(null);
        await loadDomains();
      } else {
        toast({ title: "Verification Failed", description: result.message, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to verify domain", variant: "destructive" });
    } finally { setVerifying(false); }
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`Remove ${domain}?`)) return;
    try {
      await websiteScanService.deleteDomain(domain);
      toast({ title: "Domain removed" });
      await loadDomains();
      if (instructions?.domain === domain) setInstructions(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete domain", variant: "destructive" });
    }
  };

  const verifiedCount = domains.filter(d => d.verified).length;
  const pendingCount = domains.filter(d => !d.verified).length;

  return (
    <PageLayout>
      <PageHeader
        title="Domain Verification"
        description="Verify ownership of your domains to enable external vulnerability scanning and penetration testing."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Domains" }]}
        actions={
          <button onClick={loadDomains} className="btn-ghost-border gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Left: Add Domain Form ─────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Add domain card */}
          <div className="card-elevated p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "hsl(234 100% 68% / 0.12)", border: "1px solid hsl(234 100% 68% / 0.25)" }}>
                <Plus className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Add New Domain</h3>
                <p className="text-xs text-muted-foreground">Verify ownership before scanning</p>
              </div>
            </div>

            <div>
              <label className="section-label block mb-2">Domain or URL</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  placeholder="example.com or https://example.com"
                  value={newDomain} onChange={e => setNewDomain(e.target.value)}
                  disabled={verifying} className="input-base pl-10 text-sm font-mono"
                  onKeyDown={e => e.key === "Enter" && handleInitiateVerification()}
                />
              </div>
            </div>

            <div>
              <label className="section-label block mb-3">Verification Method</label>
              <div className="grid grid-cols-3 gap-3">
                {METHODS.map(method => {
                  const Icon = method.icon;
                  const isActive = verificationMethod === method.key;
                  return (
                    <button key={method.key} onClick={() => setVerificationMethod(method.key)}
                      className="flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all text-center"
                      style={{
                        background: isActive ? `${method.color}10` : "transparent",
                        borderColor: isActive ? `${method.color}60` : "hsl(var(--border))",
                      }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: isActive ? `${method.color}20` : "hsl(var(--muted))" }}>
                        <Icon className="w-4 h-4" style={{ color: isActive ? method.color : "hsl(var(--muted-foreground))" }} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: isActive ? method.color : "hsl(var(--foreground))" }}>
                          {method.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{method.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed p-3 rounded-lg"
                style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}>
                {METHOD_DESCRIPTIONS[verificationMethod]}
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={handleInitiateVerification} disabled={verifying || !newDomain.trim()}
                className="btn-primary flex-1 justify-center py-2.5 text-sm">
                {verifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Shield className="w-4 h-4" /> Start Verification</>}
              </button>
              <button onClick={handleAddOwnedDomain} disabled={verifying || !newDomain.trim()}
                className="btn-secondary px-5 text-sm shrink-0">
                Quick Add
              </button>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg"
              style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}>
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
              <span>Use <span className="font-medium text-foreground">Quick Add</span> for local testing or dev environments where verification isn't applicable.</span>
            </div>
          </div>

          {/* Verification instructions */}
          <AnimatePresence>
            {instructions && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="card-elevated p-5 space-y-4"
                style={{ borderLeft: "3px solid hsl(var(--primary))" }}>
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Verification Instructions</h3>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">{instructions.domain}</span>
                </div>
                <pre className="text-xs text-muted-foreground p-4 rounded-xl overflow-auto whitespace-pre-wrap font-mono leading-relaxed"
                  style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                  {instructions.instructions}
                </pre>
                <button onClick={() => handleVerifyDomain(instructions.domain)} disabled={verifying}
                  className="btn-primary text-sm gap-2 w-full justify-center py-2.5">
                  {verifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <><CheckCircle className="w-4 h-4" /> Verify Ownership</>}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right: Domains List + Info ────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total", value: domains.length, color: "text-foreground", bg: "hsl(var(--muted) / 0.5)" },
              { label: "Verified", value: verifiedCount, color: "text-success", bg: "hsl(var(--success) / 0.08)" },
              { label: "Pending", value: pendingCount, color: "text-warning", bg: "hsl(38 92% 50% / 0.08)" },
            ].map(stat => (
              <div key={stat.label} className="text-center p-4 rounded-xl"
                style={{ background: stat.bg, border: "1px solid hsl(var(--border))" }}>
                <div className={`text-2xl font-black metric-number ${stat.color}`}>{stat.value}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Domains list */}
          <div className="card-elevated p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Your Domains</h3>
              {domains.length > 0 && (
                <span className="text-xs text-muted-foreground">{domains.length} domain{domains.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}
              </div>
            ) : domains.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                  <Shield className="w-5 h-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No domains yet</p>
                <p className="text-xs text-muted-foreground">Add a domain on the left to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {domains.map((domain, i) => {
                  const MethodIcon = METHOD_ICONS[domain.verificationMethod] || Globe;
                  return (
                    <motion.div key={domain._id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="group flex items-center gap-3 p-4 rounded-xl transition-all"
                      style={{
                        background: domain.verified ? "hsl(var(--success) / 0.05)" : "hsl(var(--muted) / 0.4)",
                        border: `1px solid ${domain.verified ? "hsl(var(--success) / 0.2)" : "hsl(var(--border))"}`,
                      }}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${domain.verified ? "text-success" : "text-warning"}`}
                        style={{ background: domain.verified ? "hsl(var(--success) / 0.12)" : "hsl(38 92% 50% / 0.1)" }}>
                        {domain.verified
                          ? <CheckCircle className="w-4 h-4" />
                          : <Clock className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">{domain.domain}</span>
                          <span className={`badge text-[10px] ${domain.verified ? "badge-success" : "badge-warning"}`}>
                            {domain.verified ? "Verified" : "Pending"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <MethodIcon className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{domain.verificationMethod}</span>
                          {domain.verifiedAt && (
                            <span className="text-[11px] text-muted-foreground">
                              · {new Date(domain.verifiedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!domain.verified && (
                          <button onClick={() => handleVerifyDomain(domain.domain)} disabled={verifying}
                            className="btn-ghost-border text-xs py-1 px-2.5">Verify</button>
                        )}
                        {domain.verified && (
                          <button onClick={() => navigate(`/website-scan?url=https://${domain.domain}`)}
                            className="btn-ghost-border text-xs py-1 px-2.5 gap-1">
                            <Target className="w-3 h-3" /> Scan
                          </button>
                        )}
                        <button onClick={() => handleDeleteDomain(domain.domain)}
                          className="icon-btn text-destructive/60 hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Why verify */}
          <div className="card-elevated p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Why Verify?</h3>
            </div>
            {[
              { icon: Target, label: "Penetration Testing", desc: "Required for active vuln scans", color: "#EF4444" },
              { icon: Zap, label: "Load Testing", desc: "Required for stress testing", color: "#F59E0B" },
              { icon: Globe, label: "Website Scanning", desc: "Full endpoint auditing", color: "#5B6CFF" },
              { icon: Shield, label: "Authorized Access", desc: "Prevents unauthorized scans", color: "#22C55E" },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center gap-3 py-1">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: `${item.color}18` }}>
                    <Icon className="w-3 h-3" style={{ color: item.color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
