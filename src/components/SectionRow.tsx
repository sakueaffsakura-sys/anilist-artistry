import type { ReactNode } from "react";

export function SectionRow({
  icon,
  title,
  action,
  subtitle,
  count,
  children,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  subtitle?: string;
  /** Quantidade mostrada ao lado do título (ex.: obras na prateleira). */
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="cv-auto discovery-section mb-9 sm:mb-11">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="section-title">
            {icon ? <span className="text-primary [&_svg]:h-[18px] [&_svg]:w-[18px]">{icon}</span> : null}
            <span className="min-w-0 truncate">{title}</span>
            {typeof count === "number" && count > 0 ? <span className="section-count" aria-label={`${count} obras`}>{count}</span> : null}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Fileira de capas com rolagem para o lado (a largura de cada item vem de `shelfItem`). */
export function HScroll({ children }: { children: ReactNode }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-proximity scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:gap-4 sm:px-0 [&>div]:snap-start">{children}</div>
  );
}

/** Largura padrão de um item nas fileiras: cabem quase 3 capas num celular de 360 px. */
export const shelfItem = "w-[104px] shrink-0 sm:w-[136px] lg:w-[152px]";
