import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGenres } from "@/hooks/use-genres";
import { useRoles, useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { genreLabel } from "@/lib/work-genres";

export const Route = createFileRoute("/_authenticated/admin/generos")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Gêneros — Painel Better Mangá" },
    { name: "description", content: "Gerencie os gêneros disponíveis para obras e novels." },
    { property: "og:title", content: "Gêneros — Painel Better Mangá" },
    { property: "og:description", content: "Gestão dos gêneros do catálogo Better Mangá." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: GenresAdmin,
});

function GenresAdmin() {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const { user } = useSession();
  const { isAdmin } = useRoles(user?.id);
  const genres = useGenres();
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: async () => {
      const value = genreLabel(name);
      if (!isAdmin) throw new Error("Somente administradores podem adicionar gêneros.");
      if (!value || value.length > 80) throw new Error("Informe um gênero de até 80 caracteres.");
      if (genres.data?.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) throw new Error("Esse gênero já está disponível.");
      const { error } = await supabase.from("custom_genres").insert({ name: value });
      if (error) throw new Error(error.code === "23505" ? "Esse gênero já existe." : "Não foi possível adicionar o gênero.");
    },
    onSuccess: () => { setName(""); void qc.invalidateQueries({ queryKey: ["all-genres"] }); toast.success("Gênero adicionado."); },
    onError: (error) => toast.error(error.message),
  });
  return <AdminShell title="Gêneros" subtitle={`${genres.data?.length ?? 0} gêneros disponíveis`} adminOnly>
    <form className="flex flex-wrap items-end gap-3 border-b border-border pb-6" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="genre-name">Novo gênero</Label><Input id="genre-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required className="bg-surface" /></div>
      <Button type="submit" disabled={add.isPending || !isAdmin || genres.isPending || genres.isError}><Plus className="h-4 w-4" /> Adicionar</Button>
    </form>
    <div className="relative mt-6"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Buscar gênero" placeholder="Buscar gênero…" value={search} onChange={(event) => setSearch(event.target.value)} className="bg-surface pl-9" /></div>
    {genres.isError ? <div className="py-6"><p className="text-destructive">Não foi possível carregar os gêneros.</p><Button variant="outline" onClick={() => void genres.refetch()}>Tentar novamente</Button></div> : null}
    {genres.isPending ? <p className="py-6 text-muted-foreground">Carregando…</p> : <ul className="mt-5 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{(genres.data ?? []).filter((item) => item.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((item) => <li key={item} className="break-words border-b border-border py-3 text-sm">{item}</li>)}</ul>}
  </AdminShell>;
}
