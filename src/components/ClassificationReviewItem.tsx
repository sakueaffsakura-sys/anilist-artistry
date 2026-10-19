import { Check, X, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgeRatingBadge } from "@/components/AgeRatingBadge";
import { ageRatingLabel } from "@/lib/age-ratings";
import type { ClassificationReview } from "@/lib/work-classification";

export type ReviewRow = ClassificationReview & { status: "pending" | "saved" | "dismissed" | "conflict"; message?: string };
export function ClassificationReviewItem({ row, busy, saving, onApprove, onDismiss }: {
  row: ReviewRow; busy: boolean; saving: boolean; onApprove: () => void; onDismiss: () => void;
}) {
  const { work, suggestion, changes } = row;
  return <li className="space-y-3 py-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h3 className="min-w-0 break-words font-semibold">{work.title}</h3>
      <span className="text-xs text-muted-foreground">{row.status === "saved" ? "Salva" : row.status === "dismissed" ? "Descartada" : row.status === "conflict" ? "Reanálise necessária" : !suggestion?.confident ? "Informações insuficientes" : changes ? "Aguardando revisão" : "Sem alteração"}</span>
    </div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 text-sm">
      <div className="min-w-0 space-y-2"><p className="text-xs font-semibold text-muted-foreground">Atual</p><p className="break-words">{work.kind}</p><p className="break-words text-muted-foreground">{work.genres.join(" · ") || "Sem gêneros"}</p>{work.age_rating ? <AgeRatingBadge value={work.age_rating} /> : <p className="text-xs text-muted-foreground">Idade não informada</p>}</div>
      <ArrowRight aria-hidden="true" className="mt-6 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0 space-y-2"><p className="text-xs font-semibold text-primary">Após aprovação</p><p className={changes?.kind ? "break-words text-primary" : "break-words"}>{changes?.kind ?? work.kind}</p><p className={changes?.genres ? "break-words text-primary" : "break-words text-muted-foreground"}>{(changes?.genres ?? work.genres).join(" · ") || "Sem gêneros"}</p>{changes?.age_rating || work.age_rating ? <AgeRatingBadge value={changes?.age_rating ?? work.age_rating} /> : <p className="text-xs text-muted-foreground">{ageRatingLabel(null)}</p>}</div>
    </div>
    <div className="space-y-1 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
      <p className="break-words">{suggestion?.justification || "A IA não apresentou uma sugestão verificável para esta obra."}</p>
      {suggestion?.missing_information.length ? <p className="break-words"><span className="font-semibold text-foreground">Faltam informações: </span>{suggestion.missing_information.join("; ")}</p> : null}
    </div>
    {row.message ? <p role="status" className="break-words text-sm text-muted-foreground">{row.message}</p> : null}
    {row.status === "pending" && changes ? <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss}><X className="h-4 w-4" />Descartar</Button>
      <Button size="sm" disabled={busy} onClick={onApprove}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Aprovar e salvar</Button>
    </div> : null}
  </li>;
}