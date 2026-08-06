import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, CheckCircle, XCircle, Clock, Trash2, FileText,
  Globe, Code, Loader2, Info,
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

  return (
    <PageLayout>
      <PageHeader
        title="Domain Verification"
        description="Verify ownership of your domains to enable external vulnerability scanning and penetration testing."
        breadcrumbs={[{ label: "Security Tools" }, { label: "Domains" }]}
      />

      <div className="max-w-2xl space-y-5">
        {/* Add domain card */}
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Add New Domain</h3>

          <div>
            <label className="section-label block mb-2">Domain or URL</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                placeholder="example.com or https://example.com"
                value={newDomain} onChange={e => setNewDomain(e.target.value)}
                disabled={verifying} className="input-base pl-10 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="section-label block mb-2">Verification Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(["file", "meta", "dns"] as const).map(method => {
                const Icon = METHOD_ICONS[method];
                return (
                  <button key={method} onClick={() => setVerificationMethod(method)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-xs ${
                      verificationMethod === method
                        ? "border-primary/60 bg-primary/8 text-primary"
                        : "border-border text-muted-foreground hover:border-border-active hover:text-foreground"
                    }`}
                    style={{ background: verificationMethod === method ? "hsl(234 100% 68% / 0.08)" : undefined }}>
                    <Icon className="w-4 h-4" />
                    <span className="font-medium capitalize">{method === "file" ? "File Upload" : method === "meta" ? "Meta Tag" : "DNS Record"}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{METHOD_DESCRIPTIONS[verificationMethod]}</p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleInitiateVerification} disabled={verifying} className="btn-primary flex-1 justify-center text-sm">
              {verifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : "Start Verification"}
            </button>
            <button onClick={handleAddOwnedDomain} disabled={verifying} className="btn-secondary px-4 text-sm">
              Quick Add
            </button>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 rounded-lg"
            style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}>
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
            Use "Quick Add" for local testing or dev environments where verification isn't applicable.
          </div>
        </div>

        {/* Verification instructions */}
        <AnimatePresence>
          {instructions && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="card-elevated p-5 space-y-3"
              style={{ borderColor: "hsl(var(--primary) / 0.4)", borderLeft: "3px solid hsl(var(--primary))" }}>
              <h3 className="text-sm font-semibold text-foreground">Verification Instructions</h3>
              <pre className="text-xs text-muted-foreground p-3 rounded-xl overflow-auto whitespace-pre-wrap font-mono leading-relaxed"
                style={{ background: "hsl(var(--muted))", border: "1px solid hsl(var(--border))" }}>
                {instructions.instructions}
              </pre>
              <button onClick={() => handleVerifyDomain(instructions.domain)} disabled={verifying}
                className="btn-primary text-sm gap-2">
                {verifying ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <><CheckCircle className="w-4 h-4" /> Verify Ownership</>}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Domains list */}
        <div className="card-elevated p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Your Domains</h3>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="skeleton h-14 rounded-xl" />)}
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-10">
              <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No domains added yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Add a domain above to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {domains.map(domain => {
                const MethodIcon = METHOD_ICONS[domain.verificationMethod] || Globe;
                return (
                  <div key={domain._id} className="flex items-center gap-3 p-3.5 rounded-xl transition-colors"
                    style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))" }}>
                    {domain.verified ? (
                      <CheckCircle className="w-4 h-4 text-success shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-warning shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{domain.domain}</span>
                        <span className={`badge text-[10px] ${domain.verified ? "badge-success" : "badge-warning"}`}>
                          {domain.verified ? "Verified" : "Pending"}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <MethodIcon className="w-3 h-3" />
                          {domain.verificationMethod.toUpperCase()}
                        </span>
                      </div>
                      {domain.verifiedAt && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Verified {new Date(domain.verifiedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!domain.verified && (
                        <button onClick={() => handleVerifyDomain(domain.domain)} disabled={verifying}
                          className="btn-ghost-border text-xs py-1 px-2.5">Verify</button>
                      )}
                      {domain.verified && (
                        <button onClick={() => navigate(`/website-scan?url=https://${domain.domain}`)}
                          className="btn-ghost-border text-xs py-1 px-2.5">Scan</button>
                      )}
                      <button onClick={() => handleDeleteDomain(domain.domain)}
                        className="icon-btn text-destructive/60 hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
