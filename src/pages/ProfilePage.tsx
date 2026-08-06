import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { User, Mail, Calendar, LogOut, Github, Shield, ExternalLink } from "lucide-react";
import { PageLayout } from "@/components/PageLayout";
import { PageHeader } from "@/components/PageHeader";

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  if (!user) {
    navigate("/login");
    return null;
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  };

  const initials = user.name
    ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : (user.username?.slice(0, 2).toUpperCase() || "U");

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <PageLayout>
      <PageHeader
        title="Profile"
        description="Manage your account settings and preferences."
        breadcrumbs={[{ label: "Account" }, { label: "Profile" }]}
        actions={
          <button onClick={handleLogout} className="btn-ghost-border gap-2 text-xs text-destructive/80 hover:text-destructive">
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        }
      />

      <div className="max-w-2xl space-y-5">
        {/* Profile header card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-elevated p-6"
        >
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name || user.username}
                  className="w-20 h-20 rounded-2xl object-cover"
                  style={{ border: "1px solid hsl(var(--border))" }}
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center text-white text-2xl font-bold"
                  style={{ background: "linear-gradient(135deg, hsl(234 100% 68%), hsl(262 82% 70%))" }}
                >
                  {initials}
                </div>
              )}
              <div
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "hsl(var(--success))", border: "2px solid hsl(var(--card))" }}
              >
                <div className="w-2 h-2 rounded-full bg-white" />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
                    {user.name || user.username}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">@{user.username}</p>
                </div>
                <a
                  href={`https://github.com/${user.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost-border gap-1.5 text-xs shrink-0"
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </a>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="badge badge-primary">
                  <Shield className="w-3 h-3" />
                  Free Plan
                </span>
                <span className="badge badge-success">
                  <Activity className="w-3 h-3" />
                  Active
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Account details */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.07 }}
          className="card-elevated p-5"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Account Details</h3>
          <div className="space-y-3">
            {[
              { icon: User, label: "Display Name", value: user.name || "Not set" },
              { icon: Mail, label: "Username", value: `@${user.username}` },
              { icon: Github, label: "GitHub ID", value: String(user.userId) || "—" },
              { icon: Calendar, label: "Account Type", value: "GitHub OAuth" },
            ].map(row => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center justify-between py-2"
                  style={{ borderBottom: "1px solid hsl(var(--border-subtle))" }}>
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Icon className="w-4 h-4 shrink-0" />
                    {row.label}
                  </div>
                  <span className="text-sm text-foreground font-medium">{row.value}</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14 }}
          className="card-elevated p-5"
        >
          <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => navigate("/repos")}
              className="card-interactive p-3 text-left">
              <div className="text-xs font-semibold text-foreground mb-0.5">New Scan</div>
              <div className="text-[10px] text-muted-foreground">Scan a GitHub repository</div>
            </button>
            <button onClick={() => navigate("/monitoring")}
              className="card-interactive p-3 text-left">
              <div className="text-xs font-semibold text-foreground mb-0.5">Monitoring</div>
              <div className="text-[10px] text-muted-foreground">View uptime dashboard</div>
            </button>
            <button onClick={() => navigate("/scan-history")}
              className="card-interactive p-3 text-left">
              <div className="text-xs font-semibold text-foreground mb-0.5">Scan History</div>
              <div className="text-[10px] text-muted-foreground">Browse past results</div>
            </button>
            <button onClick={() => navigate("/website-scan")}
              className="card-interactive p-3 text-left">
              <div className="text-xs font-semibold text-foreground mb-0.5">Website Scan</div>
              <div className="text-[10px] text-muted-foreground">Audit an endpoint</div>
            </button>
          </div>
        </motion.div>

        {/* Danger zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl p-5"
          style={{
            background: "hsl(0 84% 60% / 0.04)",
            border: "1px solid hsl(0 84% 60% / 0.2)",
          }}
        >
          <h3 className="text-sm font-semibold text-destructive mb-1">Danger Zone</h3>
          <p className="text-xs text-muted-foreground mb-4">Actions in this area cannot be reversed.</p>
          <button onClick={handleLogout} className="btn-ghost-border gap-2 text-xs text-destructive/80 hover:text-destructive">
            <LogOut className="w-3.5 h-3.5" />
            Sign out of SentinalAI
          </button>
        </motion.div>
      </div>
    </PageLayout>
  );
};

export default ProfilePage;
