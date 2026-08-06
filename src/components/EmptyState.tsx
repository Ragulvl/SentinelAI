import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) => {
  const ActionIcon = action?.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-center justify-center py-16 text-center ${className}`}
    >
      {/* Icon container with subtle glow */}
      <div className="relative mb-5">
        <div className="w-16 h-16 rounded-2xl bg-primary/8 border border-primary/15 flex items-center justify-center animate-float">
          <Icon className="w-7 h-7 text-primary/60" />
        </div>
        <div className="absolute inset-0 rounded-2xl blur-xl bg-primary/5 -z-10" />
      </div>

      <h3 className="text-base font-semibold text-foreground mb-1.5">{title}</h3>

      {description && (
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-6">
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary"
        >
          {ActionIcon && <ActionIcon className="w-4 h-4" />}
          {action.label}
        </button>
      )}
    </motion.div>
  );
};
