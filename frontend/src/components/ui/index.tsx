"use client";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { forwardRef, InputHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

// ── Button ──────────────────────────────────────────────────────────────────
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "plasma" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "plasma", size = "md", loading, children, className, disabled, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-display font-600 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none";
    const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-5 py-2.5 text-sm", lg: "px-7 py-3.5 text-base" };
    const variants = {
      plasma: "btn-plasma",
      ghost: "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/20",
      danger: "bg-aurora-rose/10 border border-aurora-rose/30 text-aurora-rose hover:bg-aurora-rose/20",
      outline: "bg-transparent border border-plasma/40 text-plasma-300 hover:bg-plasma/10",
    };
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(base, sizes[size], variants[variant], className)}
        {...props}
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// ── Input ───────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-white/50 font-mono uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={clsx(
            "w-full bg-white/4 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20",
            "focus:outline-none focus:ring-1 transition-all duration-200",
            "font-body",
            error
              ? "border-aurora-rose/50 focus:border-aurora-rose focus:ring-aurora-rose/20"
              : "border-white/8 focus:border-plasma/60 focus:ring-plasma/20 hover:border-white/15",
            icon && "pl-9",
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-aurora-rose">{error}</p>}
    </div>
  )
);
Input.displayName = "Input";

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  className,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={clsx(
        "glass rounded-2xl p-6",
        glow && "shadow-card hover:shadow-plasma transition-shadow duration-500",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Badge ───────────────────────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

const badgeStyles: Record<BadgeVariant, string> = {
  default: "bg-white/5 text-white/40 border-white/10",
  success: "bg-aurora-cyan/10 text-aurora-cyan border-aurora-cyan/20",
  warning: "bg-aurora-amber/10 text-aurora-amber border-aurora-amber/20",
  error: "bg-aurora-rose/10 text-aurora-rose border-aurora-rose/20",
  info: "bg-plasma/10 text-plasma-300 border-plasma/20",
};

const statusToVariant: Record<string, BadgeVariant> = {
  completed: "success",
  recording: "error",
  processing: "warning",
  joining: "warning",
  pending: "default",
  failed: "error",
  stopped: "default",
};

export function Badge({
  children,
  variant = "default",
  status,
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  status?: string;
  className?: string;
}) {
  const v = status ? (statusToVariant[status] ?? "default") : variant;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono border",
        badgeStyles[v],
        className
      )}
    >
      {status && <span className={`status-dot ${status}`} />}
      {children}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx("shimmer rounded-lg", className)} />
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  icon,
  accent = "plasma",
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  accent?: "plasma" | "cyan" | "violet" | "amber";
}) {
  const accents = {
    plasma: "text-plasma-400 bg-plasma/10 border-plasma/20",
    cyan: "text-aurora-cyan bg-aurora-cyan/10 border-aurora-cyan/20",
    violet: "text-aurora-violet bg-aurora-violet/10 border-aurora-violet/20",
    amber: "text-aurora-amber bg-aurora-amber/10 border-aurora-amber/20",
  };
  return (
    <Card className="flex items-center gap-4">
      <div className={clsx("w-12 h-12 rounded-xl border flex items-center justify-center", accents[accent])}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-white/40 font-mono uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-display font-700 text-white mt-0.5">{value}</p>
      </div>
    </Card>
  );
}
