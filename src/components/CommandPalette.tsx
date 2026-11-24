import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookMarked, BookOpen, CornerDownLeft, LayoutGrid, Search, Trophy, Zap, type LucideIcon } from "lucide-react";
import { fetchSeries } from "@/lib/queries";
import { coverUrl } from "@/lib/media";
import { kindLabel } from "@/lib/work-categories";

type Navigate = ReturnType<typeof useNavigate>;

type Entry = {
  key: string;
  section: "obras" | "paginas" | "busca";
  label: string;
  icon?: LucideIcon;
  cover?: string | null;
  hint?: string;
  run: (navigate: Navigate) => void;
};

/** Atalhos de página, na ordem do modelo. */
const PAGES: Entry[] = [
  { key: "catalogo", section: "paginas", label: "Catálogo", icon: LayoutGrid, run: (n) => void n({ to: "/catalogo", search: { q: "", kind: "Todos" } }) },
  { key: "lancamentos", section: "paginas", label: "Lançamentos", icon: Zap, run: (n) => void n({ to: "/atualizados", search: { formato: "Comic", pagina: 1 } }) },
  { key: "ranking", section: "paginas", label: "Ranking", icon: Trophy, run: (n) => void n({ to: "/ranking" }) },
  { key: "listas", section: "paginas", label: "Minhas Listas", icon: BookMarked, run: (n) => void n({ to: "/listas" }) },
  { key: "historico", section: "paginas", label: "Continue Lendo", icon: BookOpen, run: (n) => void n({ to: "/historico" }) },
];

const SECTION_LABEL: Record<Entry["section"], string> = { obras: "Obras", paginas: "Páginas", busca: "Busca" };

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();
}

/** Painel de busca (Ctrl/Cmd + K): obras por título e atalhos para as páginas principais. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);

  // Pequena espera para não consultar a cada tecla.
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(text.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!open) return;
    setText("");
    setTerm("");
    setActive(0);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = previous;
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  const works = useQuery({
    queryKey: ["palette-search", term],
    enabled: open && term.length >= 2,
    staleTime: 60_000,
    queryFn: () => fetchSeries({ search: term, limit: 6, order: "views" }),
  });

  const entries = useMemo<Entry[]>(() => {
    const query = normalize(text.trim());
    const pages = query ? PAGES.filter((page) => normalize(page.label).includes(query)) : PAGES;
    if (!query) return pages;
    const found: Entry[] = (works.data ?? []).map((work) => ({
      key: `obra-${work.id}`,
      section: "obras",
      label: work.title,
      cover: work.cover_url,
      hint: kindLabel(work.kind),
      run: (n) => void n({ to: "/obra/$slug", params: { slug: work.slug } }),
    }));
    const search: Entry = {
      key: "busca",
      section: "busca",
      label: `Buscar “${text.trim()}” no catálogo`,
      icon: Search,
      run: (n) => void n({ to: "/catalogo", search: { q: text.trim(), kind: "Todos" } }),
    };
    return [...found, ...pages, search];
  }, [text, works.data]);

  useEffect(() => setActive(0), [entries.length, term]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || typeof document === "undefined") return null;

  const choose = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    entry.run(navigate);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (entries.length ? (index + 1) % entries.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (entries.length ? (index - 1 + entries.length) % entries.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(entries[active]);
    }
  };

  let lastSection: Entry["section"] | null = null;

  return createPortal(
    <div className="cmdk-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Buscar no site" onKeyDown={onKeyDown}>
        <div className="cmdk-head">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Buscar obra ou autor"
            aria-label="Buscar obra ou autor"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={entries[active] ? `cmdk-${entries[active].key}` : undefined}
          />
        </div>
        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef}>
          {entries.map((entry, index) => {
            const heading = entry.section !== lastSection ? SECTION_LABEL[entry.section] : null;
            lastSection = entry.section;
            const Icon = entry.icon;
            return (
              <div key={entry.key}>
                {heading ? <div className="cmdk-label">{heading}</div> : null}
                <div
                  id={`cmdk-${entry.key}`}
                  role="option"
                  aria-selected={index === active}
                  className="cmdk-item"
                  onMouseMove={() => { if (active !== index) setActive(index); }}
                  onClick={() => choose(entry)}
                >
                  <span className="cmdk-icon">
                    {entry.cover !== undefined ? (
                      <img src={coverUrl(entry.cover)} alt="" loading="lazy" decoding="async" />
                    ) : Icon ? (
                      <Icon aria-hidden="true" />
                    ) : null}
                  </span>
                  <span className="cmdk-text">{entry.label}</span>
                  {entry.hint ? <span className="cmdk-hint">{entry.hint}</span> : null}
                </div>
              </div>
            );
          })}
          {text.trim().length >= 2 && works.isPending ? <p className="cmdk-empty">Buscando…</p> : null}
        </div>
        <div className="cmdk-foot" aria-hidden="true">
          <span><kbd className="cmdk-kbd"><ArrowUp /></kbd><kbd className="cmdk-kbd"><ArrowDown /></kbd>navegar</span>
          <span><kbd className="cmdk-kbd cmdk-kbd-enter"><CornerDownLeft /></kbd>abrir</span>
          <span><kbd className="cmdk-kbd cmdk-kbd-esc">Esc</kbd>fechar</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
