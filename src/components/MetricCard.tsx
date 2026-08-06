import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "framer-motion";

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  trendLabel?: string;
  icon?: React.ElementType;
  color?: "primary" | "success" | "warning" | "destructive" | "info" | "muted";
  className?: string;
  loading?: boolean;
}

const colorMap = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
  muted: "text-muted-foreground",
};

const iconBgMap = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
  muted: "bg-muted text-muted-foreground",
};

export const MetricCard = ({
  label,
  value,
  trend,
  trendValue,
  trendLabel,
  icon: Icon,
  color = "primary",
  className = "",
  loading = false,
}: MetricCardProps) => {
  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
      ? "text-destructive"
      : "text-muted-foreground";

  if (loading) {
    return (
      <div className={`card-elevated p-4 ${className}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="skeleton h-4 w-24 rounded" />
          <div className="skeleton h-8 w-8 rounded-md" />
        </div>
        <div className="skeleton h-8 w-16 rounded mb-1" />
        <div className="skeleton h-3 w-20 rounded" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`card-elevated p-4 ${className}`}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          <div className={`flex items-center justify-center w-8 h-8 rounded-md ${iconBgMap[color]}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className={`text-2xl font-bold font-mono ${colorMap[color]} mb-1`}>
        {value}
      </div>
      {(trend || trendValue || trendLabel) && (
        <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
          {trend && <TrendIcon className="w-3 h-3" />}
          {trendValue && <span className="font-medium">{trendValue}</span>}
          {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
        </div>
      )}
    </motion.div>
  );
};
