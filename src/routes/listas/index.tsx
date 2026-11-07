import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Globe, ListOrdered, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PageTitle, TabButton } from "@/components/LibraryBits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { coverUrl } from "@/lib/media";

export const Route = createFileRoute("/listas/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Listas — Better Mangá" },
      { name: "description", content: "Organize obras em listas e descubra listas criadas pela comunidade." },
      { property: "og:title", content: "Listas — Better Mangá" },
      { property: "og:description", content: "Organize obras e descubra listas da comunidade." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bettermanga.net/listas" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://bettermanga.net/listas" }],
  }),
  component: ListasPage,
});

type ListRow = {
  id: string;
  title: string;
  user_id: string;
  created_at: string;
  list_items: { series: { cover_url: string | null } | null }[];
};

async function withAuthors(rows: ListRow[]) {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const map = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id, username").in("id", ids);
    for (const p of data ?? []) map.set(p.id, p.username);
  }
  return rows.map((r) => ({ ...r, author: map.get(r.user_id) ?? "leitor" }));
}

const LIST_SELECT = "id, title, user_id, created_at, list_items(series(cover_url))";

function ListasPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"publicas" | "minhas" | "seguidas">("publicas");
  const [nick, setNick] = useState("");
  const [sort, setSort] = useState("recent");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const lists = useQuery({
    queryKey: ["lists", tab, user?.id],
    enabled: tab === "publicas" || Boolean(user),
    queryFn: async () => {
      if (tab === "seguidas") {
        const { data, error } = await supabase
          .from("list_follows")
          .select(`lists!inner(${LIST_SELECT})`)
          .eq("user_id", user!.id);
        if (error) throw error;
        return withAuthors(((data ?? []) as unknown as { lists: ListRow }[]).map((r) => r.lists));
      }
      let q = supabase.from("lists").select(LIST_SELECT).order("created_at", { ascending: false }).limit(60);
      q = tab === "minhas" ? q.eq("user_id", user!.id) : q.eq("is_public", true);
      const { data, error } = await q;
      if (error) throw error;
      return withAuthors((data ?? []) as unknown as ListRow[]);
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("lists")
        .insert({ user_id: user!.id, title: title.trim(), description: desc.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setDesc("");
      setTab("minhas");
      qc.invalidateQueries({ queryKey: ["lists"] });
      toast.success("Lista criada");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const shown = (lists.data ?? [])
    .filter((l) => !nick || l.author.toLowerCase().includes(nick.replace("@", "").toLowerCase()))
    .sort((a, b) =>
      sort === "size" ? b.list_items.length - a.list_items.length : b.created_at.localeCompare(a.created_at),
    );

  const needsLogin = tab !== "publicas" && !user;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="site-content mx-auto max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <PageTitle
          icon={<ListOrdered />}
          title="Listas"
          subtitle="Organize obras e descubra listas da comunidade"
          right={
            user ? (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Nova lista
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova lista</DialogTitle>
                  </DialogHeader>
                  <Input placeholder="Nome da lista" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <Textarea placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
                    Criar lista
                  </Button>
                </DialogContent>
              </Dialog>
            ) : null
          }
        />

        <div className="chip-row" role="tablist" aria-label="Quais listas">
          <TabButton active={tab === "publicas"} onClick={() => setTab("publicas")} icon={<Globe />} label="Públicas" />
          <TabButton active={tab === "minhas"} onClick={() => setTab("minhas")} icon={<ListOrdered />} label="Minhas" />
          <TabButton active={tab === "seguidas"} onClick={() => setTab("seguidas")} icon={<Bookmark />} label="Seguidas" />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Filtrar pelo @nick de quem criou…"
              aria-label="Filtrar pelo criador"
              className="h-9 pl-9"
            />
          </div>
          <select
            aria-label="Ordenar listas"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-9 rounded-md border border-border bg-surface-2 px-3 text-[13px] text-foreground"
          >
            <option value="recent">Mais recentes</option>
            <option value="size">Mais obras</option>
          </select>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {tab === "publicas" ? "Listas públicas da comunidade." : tab === "minhas" ? "As listas que você criou." : "Listas que você segue."}
        </p>

        {needsLogin ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            <Link to="/auth" className="text-primary">Entre</Link> para ver suas listas.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => {
              const covers = l.list_items.map((i) => i.series?.cover_url ?? null).filter(Boolean).slice(0, 3);
              return (
                <Link
                  key={l.id}
                  to="/listas/$id"
                  params={{ id: l.id }}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:border-primary/50"
                >
                  <span className="relative block h-[84px] w-[96px] shrink-0" aria-hidden="true">
                    {covers.length ? covers.map((cover, i) => (
                      <img
                        key={i}
                        src={coverUrl(cover)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="absolute top-0 h-[84px] w-[56px] rounded-md border-2 border-surface object-cover"
                        style={{ left: i * 20, zIndex: 3 - i }}
                      />
                    )) : <span className="grid h-[84px] w-[56px] place-items-center rounded-md bg-surface-2 text-muted-foreground"><ListOrdered className="h-5 w-5" /></span>}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-semibold leading-snug">{l.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">@{l.author} · {l.list_items.length.toLocaleString("pt-BR")} {l.list_items.length === 1 ? "obra" : "obras"}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        {!needsLogin && shown.length === 0 && !lists.isLoading ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Nenhuma lista encontrada.</p>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
