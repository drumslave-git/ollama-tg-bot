import { cn } from "../../lib/cn";

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-surface p-6",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function Page({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>{children}</div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-2xl font-bold tracking-tight">{title}</h2>
        {description ? (
          <p className="m-0 mt-1.5 max-w-xl text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Hint({
  className,
  children,
  variant = "default",
}: {
  className?: string;
  children: React.ReactNode;
  variant?: "default" | "warn" | "success";
}) {
  return (
    <p
      className={cn(
        "m-0 mt-1.5 text-xs text-muted",
        variant === "warn" && "text-warning",
        variant === "success" && "text-accent",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 mt-1.5 text-sm leading-snug text-danger">{children}</p>
  );
}

export function SectionTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      className={cn(
        "m-0 mb-3 text-base font-semibold text-text",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function LoadingState({ children = "Loading…" }: { children?: React.ReactNode }) {
  return (
    <p className="py-16 text-center text-muted">{children}</p>
  );
}

export function Actions({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mt-2 flex flex-wrap gap-3", className)}>{children}</div>
  );
}
