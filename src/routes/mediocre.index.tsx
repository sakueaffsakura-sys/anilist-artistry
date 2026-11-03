import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { extractList, pick, text, titleKey, type MediocreOperation } from "@/lib/mediocre-api";
import { EmptyState } from "@/components/mediocre/MediocreViews";
import { PublicWorkCard, RetryError, ShowcaseLayout, SkeletonGrid, useMediocrePublic } from "@/components/mediocre/MediocreShowcase";

export const Route = createFileRoute("/mediocre/")({
  head: () => ({ meta: [{ title: "MediocreScan Obras — Better Mangá" }, { name: "description", content: "Explore obras, novels, capítulos e conteúdos disponíveis na API MediocreScan." }, { property: "og:title", content: "MediocreScan Obras" }, { property: "og:description", content: "Explore obras, novels, capítulos e conteúdos disponíveis na API." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ShowcaseHome,
});

const TABS: Array<{ id: MediocreOperation | "buscar"; label: string }> = [
  { id: "home", label: "Início" },
  { id: "recentes", label: "Obras recentes" },
  { id: "recentes_ia", label: "Obras com IA" },
  { id: "buscar", label: "Buscar obra" },
];

function ShowcaseHome() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("home");
  const [filter, setFilter] = useState("");
  const [idInput, setIdInput] = useState("20141");
  const navigate = useNavigate();
  const q = useDebouncedValue(filter, 250);
  const op = tab === "buscar" ? "home" : tab;
  const query = useMediocrePublic({ operation: op }, tab !== "buscar");
  const rows = useMemo(() => {
    const list = extractList(query.data) ?? [];
    const key = titleKey(q);
    return key ? list.filter((r) => titleKey(text(pick(r, "obr_nome", "nome")) ?? "").includes(key)) : list;
  }, [query.data, q]);

  const go = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{1,9}$/.test(idInput) && Number(idInput) > 0) void navigate({ to: "/mediocre/obra/$id", params: { id: idInput } });
  };

  return (
    <ShowcaseLayout>
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Seções">
        {TABS.map((t) => <Button key={t.id} size="sm" className="shrink-0" variant={tab === t.id ? "default" : "outline"} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Button>)}
      </nav>
      {tab === "buscar" ? (
        <form onSubmit={go} className="flex max-w-sm gap-2">
          <Input inputMode="numeric" aria-label="ID da obra" value={idInput} onChange={(e) => setIdInput(e.target.value.replace(/\D/g, ""))} />
          <Button type="submit"><Search className="mr-1 h-4 w-4" />Buscar</Button>
        </form>
      ) : (
        <>
          <Input placeholder="Filtrar por título…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" aria-label="Filtrar por título" />
          {query.isLoading ? <SkeletonGrid />
            : query.error ? <RetryError message={query.error.message || "Não foi possível carregar as obras."} onRetry={() => void query.refetch()} />
            : !rows.length ? <EmptyState message="Nenhuma obra encontrada." />
            : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{rows.map((r, i) => <PublicWorkCard key={String(pick(r, "obr_id", "id") ?? i)} row={r} showIa={tab === "recentes_ia"} />)}</div>}
        </>
      )}
    </ShowcaseLayout>
  );
}
