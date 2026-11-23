import { Link } from "@tanstack/react-router";

/** Formatos que a home mostra, na ordem das abas (cada aba filtra exatamente o formato gravado na obra). */
export const HOME_FORMATS = ["Comic", "Comic2", "Shoujo", "Shoujo2", "Manga", "Yaoi", "Yuri", "Hentai", "English", "Novel"] as const;
export type HomeFormat = (typeof HOME_FORMATS)[number];

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
