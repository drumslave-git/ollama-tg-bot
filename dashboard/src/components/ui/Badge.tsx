import { cn } from "../../lib/cn";

type BadgeVariant = "default" | "ok" | "warn" | "danger";

export type { BadgeVariant };

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-border text-muted",
  ok: "border-accent/35 text-accent",
  warn: "border-warning/35 text-warning",
  danger: "border-danger/35 text-danger",
};

export function Badge({
  variant = "default",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border bg-surface px-3 py-1.5 text-xs font-semibold",
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function badgeVariant(
  state: boolean | null | undefined,
  trueVariant: BadgeVariant = "ok",
  falseVariant: BadgeVariant = "warn",
): BadgeVariant {
  if (state === true) return trueVariant;
  if (state === false) return falseVariant;
  return "warn";
}
