import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { lazy, Suspense } from "react";

// ── Eager (always needed on first load) ───────────────────────────────────
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AuthCallback from "./pages/AuthCallback";

// ── Lazy (loaded only when the route is visited) ──────────────────────────
const RepoSelectPage             = lazy(() => import("./pages/RepoSelectPage"));
const ScanProgressPage           = lazy(() => import("./pages/ScanProgressPage"));
const ResultsPage                = lazy(() => import("./pages/ResultsPage"));
const EditorPage                 = lazy(() => import("./pages/EditorPage"));
const MonitoringPage             = lazy(() => import("./pages/MonitoringPage"));
const WebsiteScanPage            = lazy(() => import("./pages/WebsiteScanPage"));
const ComprehensiveWebsiteScanResults = lazy(() => import("./pages/ComprehensiveWebsiteScanResults"));
const PenetrationTestPage        = lazy(() => import("./pages/PenetrationTestPage"));
const LoadTestPage               = lazy(() => import("./pages/LoadTestPage"));
const DomainVerificationPage     = lazy(() => import("./pages/DomainVerificationPage"));
const UnifiedHistoryPage         = lazy(() => import("./pages/UnifiedHistoryPage"));
const ProfilePage                = lazy(() => import("./pages/ProfilePage"));
const SandboxScanPage            = lazy(() => import("./pages/SandboxScanPage"));
const NotFound                   = lazy(() => import("./pages/NotFound"));

// ── Shared page-level loading fallback ────────────────────────────────────
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl animate-pulse"
        style={{ background: "hsl(var(--primary) / 0.15)", border: "1px solid hsl(var(--primary) / 0.25)" }}
      />
      <span className="text-xs text-muted-foreground font-mono tracking-wide">Loading...</span>
    </div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"                   element={<LandingPage />} />
              <Route path="/login"              element={<LoginPage />} />
              <Route path="/auth/callback"      element={<AuthCallback />} />
              <Route path="/repos"              element={<RepoSelectPage />} />
              <Route path="/scan"               element={<ScanProgressPage />} />
              <Route path="/results"            element={<ResultsPage />} />
              <Route path="/editor"             element={<EditorPage />} />
              <Route path="/monitoring"         element={<MonitoringPage />} />
              <Route path="/website-scan"       element={<WebsiteScanPage />} />
              <Route path="/website-scan/:scanId" element={<ComprehensiveWebsiteScanResults />} />
              <Route path="/pentest"            element={<PenetrationTestPage />} />
              <Route path="/loadtest"           element={<LoadTestPage />} />
              <Route path="/domain-verification" element={<DomainVerificationPage />} />
              <Route path="/scan-history"       element={<UnifiedHistoryPage />} />
              <Route path="/sandbox"            element={<SandboxScanPage />} />
              <Route path="/profile"            element={<ProfilePage />} />
              <Route path="*"                   element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
