import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Home, ArrowLeft, Shield } from "lucide-react";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center text-center px-6 relative overflow-hidden"
      style={{ background: "hsl(var(--background))" }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 40%, hsl(234 100% 68% / 0.06) 0%, transparent 70%)",
        }}
      />
      <div className="absolute inset-0 dot-grid opacity-[0.03] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 max-w-md"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "hsl(234 100% 68% / 0.25)",
                filter: "blur(24px)",
                transform: "scale(2)",
              }}
            />
            <div
              className="relative w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, hsl(234 100% 68%), hsl(262 82% 70%))",
                boxShadow: "0 0 32px hsl(234 100% 68% / 0.4)",
              }}
            >
              <Shield className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        {/* 404 */}
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          className="text-[96px] font-black leading-none mb-4 gradient-text"
          style={{ letterSpacing: "-0.05em" }}
        >
          404
        </motion.div>

        <h1
          className="text-xl font-bold text-foreground mb-2"
          style={{ letterSpacing: "-0.02em" }}
        >
          Page not found
        </h1>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
          Let's get you back on track.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary text-sm gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go back
          </button>
          <button
            onClick={() => navigate("/")}
            className="btn-primary text-sm gap-2"
          >
            <Home className="w-4 h-4" />
            Go home
          </button>
        </div>

        {/* Quick links */}
        <div className="mt-10 pt-8" style={{ borderTop: "1px solid hsl(var(--border))" }}>
          <p className="text-xs text-muted-foreground mb-4">Or try these pages:</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {[
              { label: "Dashboard", path: "/repos" },
              { label: "Monitoring", path: "/monitoring" },
              { label: "History", path: "/scan-history" },
              { label: "Profile", path: "/profile" },
            ].map(link => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
