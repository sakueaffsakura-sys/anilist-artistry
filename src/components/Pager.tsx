import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Paginação padrão: anterior, "página X de Y" e próxima, com os mesmos botões do resto do site. */
export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Páginas">
      <Button type="button" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft className="h-4 w-4" /> Anterior
      </Button>
      <span className="px-2 text-[13px] font-semibold text-muted-foreground tabular-nums" aria-current="page">
        Página {page} de {pages}
      </span>
      <Button type="button" variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Próxima <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
