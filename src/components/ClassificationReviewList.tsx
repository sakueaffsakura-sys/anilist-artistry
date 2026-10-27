import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClassificationReviewItem, type ReviewRow } from "@/components/ClassificationReviewItem";

interface ClassificationReviewListProps {
  rows: ReviewRow[];
  savingId: string | null;
  onApprove: (row: ReviewRow) => void;
  onDismiss: (id: string) => void;
}

export function ClassificationReviewList({ rows, savingId, onApprove, onDismiss }: ClassificationReviewListProps) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages - 1);
  return <div>
    <ul className="max-h-[45dvh] overflow-y-auto divide-y divide-border pr-1">
      {rows.slice(current * 10, (current + 1) * 10).map((row) => <ClassificationReviewItem
        key={row.work.id} row={row} busy={savingId !== null} saving={savingId === row.work.id}
        onApprove={() => onApprove(row)} onDismiss={() => onDismiss(row.work.id)} />)}
    </ul>
    {pages > 1 ? <nav aria-label="Páginas de revisão" className="mt-3 flex items-center justify-between border-t border-border pt-3">
      <Button variant="ghost" size="icon" aria-label="Revisões anteriores" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft /></Button>
      <span className="text-xs text-muted-foreground">{current + 1} / {pages} · {rows.length} obras</span>
      <Button variant="ghost" size="icon" aria-label="Próximas revisões" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ChevronRight /></Button>
    </nav> : null}
  </div>;
}