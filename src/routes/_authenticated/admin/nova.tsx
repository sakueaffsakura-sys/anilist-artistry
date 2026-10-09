import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { findByAnilistId, uniqueSlug } from "@/lib/series-import";
import { KINDS } from "@/lib/queries";
import { GenreSelect } from "@/components/GenreSelect";
import { normalizeGenres } from "@/lib/work-genres";
import { useSession } from "@/hooks/useAuth";
import { searchAnilist, searchAnilistSmart } from "@/lib/anilist.functions";

export const Route = createFileRoute("/_authenticated/admin/nova")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Nova obra — Better Mangá" },
      { name: "description", content: "Cadastre manualmente uma obra no catálogo do Better Mangá." },
      { property: "og:title", content: "Nova obra — Better Mangá" },
      { property: "og:description", content: "Cadastro manual de obras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NovaObra,
});

function NovaObra() {
  const navigate = useNavigate();
  const { user } = useSession();
  const anilist = useServerFn(searchAnilist);
  const [link, setLink] = useState("");
  const [form, setForm] = useState({
    title: "",
    altTitles: "",
    synopsis: "",
    coverUrl: "",
    bannerUrl: "",
    kind: "Manga",
    status: "Em andamento",
    author: "",
    artist: "",
    genres: [] as string[],
  });
  const [meta, setMeta] = useState<{ anilistId: number | null; rating: number }>({ anilistId: null, rating: 0 });

  function set(key: Exclude<keyof typeof form, "genres">, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const fill = useMutation({
    mutationFn: async () => {
      const results = await searchAnilistSmart(link.trim(), anilist);
      const item = results[0];
      if (!item) throw new Error("Nada encontrado com esse link.");
      return item;
    },
    onSuccess: (item) => {
      setMeta({ anilistId: item.anilistId, rating: item.averageScore });
      setForm((prev) => ({
        ...prev,
        kind: item.suggestedKind,
        title: item.title,
        altTitles: item.altTitles,
        synopsis: item.synopsis,
        coverUrl: item.coverUrl,
        bannerUrl: item.bannerUrl,
        status: item.status || prev.status,
        author: item.author,
        artist: item.artist,
        genres: normalizeGenres(item.genres),
      }));
      toast.success("Dados preenchidos do AniList! Revise e crie a obra.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao buscar no AniList"),
  });

  const create = useMutation({
    mutationFn: async () => {
      const existing = await findByAnilistId(meta.anilistId);
      if (existing) throw new Error(`"${existing.title}" já está no catálogo.`);
      const title = form.title.trim();
      const { data, error } = await supabase
        .from("series")
        .insert({
          slug: await uniqueSlug(title, form.altTitles),
          title,
          anilist_id: meta.anilistId,
          rating: meta.rating,
          alt_titles: form.altTitles,
          synopsis: form.synopsis,
          cover_url: form.coverUrl,
          banner_url: form.bannerUrl,
          kind: form.kind,
          status: form.status,
          author: form.author,
          artist: form.artist,
          genres: normalizeGenres(form.genres),
          published: true,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      toast.success("Obra criada!");
      navigate({ to: "/admin/$id", params: { id } });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Erro ao criar"),
  });

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/admin">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao painel
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-extrabold">Nova obra</h1>

        <section className="mt-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
            <Download className="h-4 w-4 text-primary" /> Preencher com um link do AniList
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) fill.mutate();
            }}
            className="mt-3 flex flex-wrap gap-3"
          >
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://anilist.co/manga/204974/Psychopath-in-Murim"
              className="h-10 min-w-56 flex-1 bg-background"
            />
            <Button type="submit" disabled={fill.isPending} className="h-10 px-5 font-semibold">
              {fill.isPending ? "Buscando…" : "Preencher"}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Cole o link da obra no AniList (mangá, manhwa ou anime) e os campos abaixo preenchem sozinhos. Também aceita link de busca do AniList.
          </p>
        </section>

        <form
          className="mt-6 space-y-4 rounded-2xl border border-border bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Título" required value={form.title} onChange={(v) => set("title", v)} />
          <Field
            label="Títulos alternativos"
            value={form.altTitles}
            onChange={(v) => set("altTitles", v)}
          />
          <div className="space-y-1.5">
            <Label>Sinopse</Label>
            <Textarea
              value={form.synopsis}
              onChange={(event) => set("synopsis", event.target.value)}
              className="min-h-28 bg-background"
            />
          </div>
          <Field
            label="URL da capa"
            value={form.coverUrl}
            onChange={(v) => set("coverUrl", v)}
            placeholder="https://…"
          />
          <Field
            label="URL do banner"
            value={form.bannerUrl}
            onChange={(v) => set("bannerUrl", v)}
            placeholder="https://…"
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select
                value={form.kind}
                onChange={(event) => set("kind", event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {KINDS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(event) => set("status", event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              >
                {["Em andamento", "Completo", "Hiato", "Cancelado", "Em breve"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Autor" value={form.author} onChange={(v) => set("author", v)} />
            <Field label="Arte" value={form.artist} onChange={(v) => set("artist", v)} />
          </div>
          <GenreSelect value={form.genres} onChange={(genres) => setForm((prev) => ({ ...prev, genres }))} />
          <Button
            type="submit"
            disabled={create.isPending || form.title.trim().length === 0}
            className="w-full font-semibold"
          >
            {create.isPending ? "Criando…" : "Criar obra"}
          </Button>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="bg-background"
      />
    </div>
  );
}
