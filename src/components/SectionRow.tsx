import type { ReactNode } from "react";

export function SectionRow({
  icon,
  title,
  action,
  subtitle,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  subtitle?: string;
  /** Quantidade mostrada ao lado do título (ex.: obras na prateleira). */
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="cv-auto discovery-section mb-10 sm:mb-12">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="min-w-0">
          <h2 className="section-title">
            <span className="text-primary">{icon}</span>
            {title}
            {typeof count === "number" && count > 0 ? <span className="section-count" aria-label={`${count} obras`}>{count}</span> : null}
          </h2>
          {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function HScroll({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar -mx-1 flex snap-x snap-proximity gap-4 overflow-x-auto px-1 pb-3 [&>div]:snap-start">{children}</div>
  );
}
