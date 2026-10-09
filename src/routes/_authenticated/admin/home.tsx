import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { HomeSectionEditor } from "@/components/HomeSectionEditor";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, useSession } from "@/hooks/useAuth";
import { HOME_SECTIONS, anilistMetrics, type HomeSectionKey, type SectionMode } from "@/lib/home-sections";
import { fetchSectionAdminWorks, fetchSectionConfigs } from "@/lib/home-section-queries";
import { searchAnilist, searchAnilistSmart } from "@/lib/anilist.functions";

export const Route = createFileRoute("/_authenticated/admin/home")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Colunas da home — Painel Better Mangá" },
    { name: "description", content: "Selecione obras populares, tendências e manhwas da página inicial." },
    { property: "og:title", content: "Colunas da home — Better Mangá" },
    { property: "og:description", content: "Gestão das seções de obras populares, tendências e manhwas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: HomeAdmin,
});

function HomeAdmin() {
  const { user } = useSession();
  const { isAdmin } = useRoles(user?.id);
  const client = useQueryClient();
  const anilist = useServerFn(searchAnilist);
  const [progress, setProgress] = useState("");
  const works = useQuery({ queryKey: ["section-admin-works"], queryFn: fetchSectionAdminWorks, enabled: isAdmin, staleTime: 60_000 });
  const configs = useQuery({ queryKey: ["section-configs"], queryFn: fetchSectionConfigs, enabled: isAdmin });
  const save = useMutation({
    mutationFn: async (input: { section: HomeSectionKey; mode: SectionMode; series_ids: string[] }) => {
      const { data, error } = await supabase.from("home_sections").upsert(input).select("section").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["section-configs"] }); void client.invalidateQueries({ queryKey: ["home-sections"] }); toast.success("Seção salva!"); },
    onError: () => toast.error("Não foi possível salvar a seção."),
  });
  const sync = useMutation({
    mutationFn: async () => {
      const rows = (works.data ?? []).filter((row) => row.anilist_id !== null);
      let completed = 0;
      for (const row of rows) {
        setProgress(`${completed + 1}/${rows.length} · ${row.title}`);
        const items = await searchAnilistSmart(`https://anilist.co/manga/${row.anilist_id}`, anilist);
        const item = items.find((value) => value.anilistId === row.anilist_id);
        if (!item) throw new Error(`Obra não encontrada: ${row.title}`);
        const { data, error } = await supabase.from("series").update(anilistMetrics(item)).eq("id", row.id).select("id").single();
        if (error || !data) throw new Error("Não foi possível atualizar as obras.");
        completed += 1;
        // Keep requests sequential and below AniList's public rate budget.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      return completed;
    },
    onSuccess: (count) => toast.success(`${count} obras atualizadas com o AniList.`),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Falha na atualização. Tente novamente."),
    onSettled: () => { setProgress(""); void client.invalidateQueries({ queryKey: ["section-admin-works"] }); void client.invalidateQueries({ queryKey: ["home-sections"] }); },
  });
  return <AdminShell adminOnly title="Colunas da home" actions={<Button variant="outline" disabled={sync.isPending || !works.data?.some((row) => row.anilist_id !== null)} onClick={() => sync.mutate()}><RefreshCw className="h-4 w-4" />{sync.isPending ? "Atualizando…" : "Atualizar dados do AniList"}</Button>}>
    {progress ? <p role="status" className="mb-4 break-words text-sm text-muted-foreground">{progress}</p> : null}
    {works.isPending || configs.isPending ? <div aria-label="Carregando colunas" className="h-48 rounded bg-muted motion-safe:animate-pulse" /> : null}
    {works.isError || configs.isError ? <div role="alert"><p>Não foi possível carregar as colunas.</p><Button variant="outline" onClick={() => { void works.refetch(); void configs.refetch(); }}>Tentar novamente</Button></div> : null}
    {works.data && configs.data ? HOME_SECTIONS.map(({ key, title }) => {
      const config = configs.data.find((row) => row.section === key);
      return <HomeSectionEditor key={`${key}:${config?.mode}:${config?.series_ids.join(",")}`} section={key} title={title}
        mode={config?.mode === "manual" ? "manual" : "automatic"} ids={config?.series_ids ?? []} works={works.data}
        saving={save.isPending} onSave={(mode, ids) => save.mutate({ section: key, mode, series_ids: ids })} />;
    }) : null}
  </AdminShell>;
}