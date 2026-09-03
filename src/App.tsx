import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { lazy, Suspense, useEffect, useState } from "react";
import { AuthService } from "./services/auth.service";

// ── Eager (always needed on first load) ───────────────────────────────────
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AuthCallback from "./pages/AuthCallback";

// ── Lazy (loaded only when the route is visited) ──────────────────────────
const RepoSelectPage             = lazy(() => import("./pages/RepoSelectPage"));
const CodeScanPage               = lazy(() => import("./pages/CodeScanPage"));
const ScanProgressPage           = lazy(() => import("./pages/ScanProgressPage"));
const ResultsPage                = lazy(() => import("./pages/ResultsPage"));
const EditorPage                 = lazy(() => import("./pages/EditorPage"));
const MonitoringPage             = lazy(() => import("./pages/MonitoringPage"));
const PenetrationTestPage        = lazy(() => import("./pages/PenetrationTestPage"));
const LoadTestPage               = lazy(() => import("./pages/LoadTestPage"));
const DomainVerificationPage     = lazy(() => import("./pages/DomainVerificationPage"));
const UnifiedHistoryPage         = lazy(() => import("./pages/UnifiedHistoryPage"));
const ProfilePage                = lazy(() => import("./pages/ProfilePage"));
const SandboxScanPage            = lazy(() => import("./pages/SandboxScanPage"));
const NotFound                   = lazy(() => import("./pages/NotFound"));
const AdminPage                  = lazy(() => import("./pages/AdminPage"));

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

// ── Admin route guard ─────────────────────────────────────────────────────
// Simplified: just re-verify auth on mount (gets fresh role from DB), then
// try promote-self if needed. No complex state machine.
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdmin, refreshAuth } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      // 1. Always re-fetch role from DB on mount (clears any stale cache)
      await refreshAuth();

      // 2. If still not admin after re-fetch, try promote-self
            if (token) {
        const res = await fetch('/api/auth/promote-self', {
          credentials: 'include',
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).catch(() => null);

        // If promotion happened or user is already admin, re-fetch role
        if (res?.role === 'admin' || res?.role === 'superadmin') {
          await refreshAuth();
        }
      }
      setChecking(false);
    };
    bootstrap();
  }, []); // run once on mount

  if (loading || checking) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-5xl">🔒</div>
        <h1 className="text-lg font-semibold">Access Denied</h1>
        <p className="text-sm text-muted-foreground">You don't have admin privileges.</p>
        <a href="/" className="text-xs text-primary underline">Go back home</a>
      </div>
    </div>
  );
  return <>{children}</>;
};

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
              <Route path="/code-scan"          element={<CodeScanPage />} />
              <Route path="/scan"               element={<ScanProgressPage />} />
              <Route path="/results"            element={<ResultsPage />} />
              <Route path="/editor"             element={<EditorPage />} />
              <Route path="/monitoring"         element={<MonitoringPage />} />
              <Route path="/pentest"            element={<PenetrationTestPage />} />
              <Route path="/loadtest"           element={<LoadTestPage />} />
              <Route path="/domain-verification" element={<DomainVerificationPage />} />
              <Route path="/scan-history"       element={<UnifiedHistoryPage />} />
              <Route path="/sandbox"            element={<SandboxScanPage />} />
              <Route path="/profile"            element={<ProfilePage />} />
              <Route path="/admin"              element={<AdminRoute><AdminPage /></AdminRoute>} />
              <Route path="*"                   element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
