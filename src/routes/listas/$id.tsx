import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ListOrdered, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PageTitle } from "@/components/LibraryBits";
import { SeriesCard } from "@/components/SeriesCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";

export const Route = createFileRoute("/listas/$id")({
  staticData: { sitemap: true },
  loader: async ({ params, context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["list", params.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("lists")
          .select("id, title, description, user_id, is_public, list_items(series(id, slug, title, cover_url, rating, age_rating))")
          .eq("id", params.id)
          .eq("is_public", true)
          .maybeSingle();
        if (error) throw error;
        return data as unknown as {
          id: string;
          title: string;
          description: string | null;
          user_id: string;
          is_public: boolean;
          list_items: { series: { id: string; slug: string; title: string; cover_url: string | null; rating: number; age_rating?: string | null } | null }[];
        } | null;
      },
    }),
  head: ({ params, loaderData }) => {
    const name = loaderData?.title ?? "Lista da comunidade";
    const description = (loaderData?.description ?? `Descubra as obras reunidas em ${name} no Better Mangá.`).slice(0, 160);
    const url = `https://bettermanga.net/listas/${encodeURIComponent(params.id)}`;
    const cover = loaderData?.list_items.find((item) => item.series?.cover_url?.startsWith("https://"))?.series?.cover_url ?? null;
    return {
      meta: [
        { title: `${name} — Better Mangá` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} — Better Mangá` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: cover ? "summary_large_image" : "summary" },
        ...(cover
          ? [
              { property: "og:image", content: cover },
              { name: "twitter:image", content: cover },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ListaPage,
});

function ListaPage() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const list = useQuery({
    queryKey: ["list", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lists")
        .select("id, title, description, user_id, is_public, list_items(series(id, slug, title, cover_url, rating, age_rating))")
        .eq("id", id)
        .eq("is_public", true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string;
        title: string;
        description: string | null;
        user_id: string;
         is_public: boolean;
        list_items: { series: { id: string; slug: string; title: string; cover_url: string | null; rating: number; age_rating?: string | null } | null }[];
      } | null;
    },
  });

  const following = useQuery({
    queryKey: ["follow", id, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase.from("list_follows").select("list_id").eq("user_id", user!.id).eq("list_id", id).maybeSingle();
      return Boolean(data);
    },
  });

  const toggleFollow = useMutation({
    mutationFn: async () => {
      if (following.data) { const { error: dbErr } = await supabase.from("list_follows").delete().eq("user_id", user!.id).eq("list_id", id); if (dbErr) throw dbErr; }
      else { const { error: dbErr } = await supabase.from("list_follows").insert({ user_id: user!.id, list_id: id }); if (dbErr) throw dbErr; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["follow", id] }),
  });

  const removeItem = useMutation({
    mutationFn: async (seriesId: string) => {
      { const { error: dbErr } = await supabase.from("list_items").delete().eq("list_id", id).eq("series_id", seriesId); if (dbErr) throw dbErr; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["list", id] }),
  });

  const deleteList = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista excluída");
      navigate({ to: "/listas" });
    },
  });

  const data = list.data;
  const isOwner = user && data && user.id === data.user_id;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-10">
        {!data ? (
          <p className="text-muted-foreground">{list.isLoading ? "Carregando…" : "Lista não encontrada."}</p>
        ) : (
          <>
            <PageTitle
              icon={<ListOrdered className="h-7 w-7" />}
              title={data.title}
              subtitle={data.description ?? `${data.list_items.length} obras`}
              right={
                isOwner ? (
                  <Button variant="outline" onClick={() => deleteList.mutate()}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir lista
                  </Button>
                ) : user ? (
                  <Button variant={following.data ? "default" : "outline"} onClick={() => toggleFollow.mutate()}>
                    <Bookmark className={`mr-2 h-4 w-4 ${following.data ? "fill-current" : ""}`} />
                    {following.data ? "Seguindo" : "Seguir lista"}
                  </Button>
                ) : (
                  <Button asChild variant="outline"><Link to="/auth">Entre para seguir</Link></Button>
                )
              }
            />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {data.list_items.map((i) =>
                i.series ? (
                  <div key={i.series.id} className="relative">
                    <SeriesCard slug={i.series.slug} title={i.series.title} cover={i.series.cover_url} rating={i.series.rating} seriesId={i.series.id} ageRating={i.series.age_rating} />
                    {isOwner ? (
                      <button
                        onClick={() => removeItem.mutate(i.series!.id)}
                        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-background/85 hover:text-destructive"
                        aria-label="Remover da lista"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null,
              )}
            </div>
            {data.list_items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Lista vazia. Adicione obras pela página da obra.</p>
            ) : null}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
