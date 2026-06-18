import { Link, type LinkProps } from "react-router-dom";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "danger";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent-dim text-on-accent border-transparent hover:opacity-90",
  secondary:
    "bg-surface-hover text-text border border-border hover:opacity-90",
  danger:
    "bg-surface-hover text-danger border border-danger/40 hover:bg-danger/10",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2.5 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  children,
  ...props
}: LinkProps & {
  variant?: ButtonVariant;
}) {
  return (
    <Link
      className={cn(
        "inline-flex w-fit items-center justify-center rounded-md border px-3.5 py-2 text-sm font-semibold no-underline",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}
