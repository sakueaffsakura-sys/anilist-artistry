import { Link } from "@tanstack/react-router";

import { HOME_FORMATS, type HomeFormat } from "@/lib/home-formats";

export { HOME_FORMATS };
export type { HomeFormat };

/** Abas de formato logo abaixo do cabeçalho da home. */
export function FormatTabs({ active }: { active: HomeFormat }) {
  return (
    <nav className="format-tabs" aria-label="Formato das obras">
      <div className="format-tabs-inner">
        {HOME_FORMATS.map((format) => (
          <Link
            key={format}
            to="/"
            search={{ formato: format }}
            className="format-tab"
            data-active={format === active}
            aria-current={format === active ? "page" : undefined}
            preload="intent"
          >
            {format}
          </Link>
        ))}
      </div>
    </nav>
  );
}
