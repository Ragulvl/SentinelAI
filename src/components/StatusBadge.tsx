import { CheckCircle, AlertTriangle, XCircle, Info, Shield } from "lucide-react";

type SeverityLevel = "critical" | "high" | "medium" | "low" | "info" | "secure";
type StatusLevel = "up" | "down" | "degraded" | "operational" | "unknown";

interface StatusBadgeProps {
  type: "severity" | "status";
  value: SeverityLevel | StatusLevel;
  size?: "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

const SEVERITY_CONFIG: Record<SeverityLevel, { label: string; className: string; icon: React.ElementType }> = {
  critical: { label: "Critical", className: "severity-critical bg-[hsl(var(--destructive)/0.1)] border border-[hsl(var(--destructive)/0.3)]", icon: XCircle },
  high: { label: "High", className: "text-orange-400 bg-orange-500/10 border border-orange-500/30", icon: AlertTriangle },
  medium: { label: "Medium", className: "severity-medium bg-[hsl(var(--warning)/0.1)] border border-[hsl(var(--warning)/0.3)]", icon: AlertTriangle },
  low: { label: "Low", className: "severity-low bg-[hsl(var(--info)/0.1)] border border-[hsl(var(--info)/0.3)]", icon: Info },
  info: { label: "Info", className: "severity-info bg-muted/50 border border-border", icon: Info },
  secure: { label: "Secure", className: "text-success bg-success/10 border border-success/30", icon: CheckCircle },
};

const STATUS_CONFIG: Record<StatusLevel, { label: string; className: string; dot: string }> = {
  up: { label: "Operational", className: "text-success bg-success/10 border border-success/20", dot: "bg-success" },
  operational: { label: "Operational", className: "text-success bg-success/10 border border-success/20", dot: "bg-success" },
  degraded: { label: "Degraded", className: "text-warning bg-warning/10 border border-warning/20", dot: "bg-warning" },
  down: { label: "Offline", className: "text-destructive bg-destructive/10 border border-destructive/20", dot: "bg-destructive" },
  unknown: { label: "Unknown", className: "text-muted-foreground bg-muted border border-border", dot: "bg-muted-foreground" },
};

export const StatusBadge = ({
  type,
  value,
  size = "sm",
  showIcon = true,
  className = "",
}: StatusBadgeProps) => {
  const sizeClasses = size === "sm" ? "text-[11px] px-2 py-0.5 gap-1" : "text-xs px-2.5 py-1 gap-1.5";

  if (type === "severity") {
    const config = SEVERITY_CONFIG[value as SeverityLevel];
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center font-medium rounded-md capitalize ${sizeClasses} ${config.className} ${className}`}
      >
        {showIcon && <Icon className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />}
        {config.label}
      </span>
    );
  }

  const config = STATUS_CONFIG[value as StatusLevel];
  return (
    <span
      className={`inline-flex items-center font-medium rounded-md ${sizeClasses} ${config.className} ${className}`}
    >
      {showIcon && (
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${value === "up" || value === "operational" ? "animate-pulse" : ""}`} />
      )}
      {config.label}
    </span>
  );
};

export type { SeverityLevel, StatusLevel };
