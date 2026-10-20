import type { ReactNode } from "react";

export function SectionRow({
  icon,
  title,
  action,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="cv-auto mb-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="section-title">
            <span className="text-primary">{icon}</span>
            {title}
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
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-2">{children}</div>
  );
}
