import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, BookPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/hooks/useAuth";
import { fetchWorkNotifications } from "@/lib/work-requests";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Item = { id: string; kind: "chapter" | "request"; read_at: string | null; created_at: string; slug: string; title: string; cover: string | null; text: string; chapter?: string | undefined };

function when(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `há ${h} hora${h > 1 ? "s" : ""}`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

async function fetchChapterNotifications(userId: string) {
  const { data, error } = await supabase.from("chapter_notifications").select("id, read_at, created_at, series(slug, title, cover_url), chapters(number)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export function WorkNotifications() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "chapter" | "request">("all");
  const query = useQuery({
    queryKey: ["work-notifications", user?.id],
    enabled: Boolean(user),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<Item[]> => {
      if (!user) return [];
      const [reqs, chaps] = await Promise.all([fetchWorkNotifications(user.id), fetchChapterNotifications(user.id)]);
      const a: Item[] = (chaps ?? []).flatMap((c) => c.series ? [{ id: c.id, kind: "chapter" as const, read_at: c.read_at, created_at: c.created_at, slug: c.series.slug, title: "Novo capítulo", cover: c.series.cover_url, text: `${c.series.title} — Capítulo ${c.chapters?.number ?? ""}`, chapter: c.chapters ? String(c.chapters.number) : undefined }] : []);
      const b: Item[] = (reqs ?? []).flatMap((r) => r.series ? [{ id: r.id, kind: "request" as const, read_at: r.read_at, created_at: r.created_at, slug: r.series.slug, title: "Pedido atendido", cover: null, text: `${r.series.title} já está disponível.` }] : []);
      return [...a, ...b].sort((x, y) => y.created_at.localeCompare(x.created_at));
    },
  });
  const items = (query.data ?? []).filter((i) => tab === "all" || i.kind === tab);
  const unread = (query.data ?? []).filter((i) => !i.read_at);
  const done = () => void qc.invalidateQueries({ queryKey: ["work-notifications"] });

  const read = useMutation({
    mutationFn: async (target?: Item) => {
      if (!user) return;
      const now = new Date().toISOString();
      const run = async (table: "chapter_notifications" | "work_notifications", id?: string) => {
        let q = supabase.from(table).update({ read_at: now }).eq("user_id", user.id).is("read_at", null);
        if (id) q = q.eq("id", id);
        const { error } = await q; if (error) throw error;
      };
      if (target) await run(target.kind === "chapter" ? "chapter_notifications" : "work_notifications", target.id);
      else await Promise.all([run("chapter_notifications"), run("work_notifications")]);
    },
    onSuccess: done,
    onError: () => toast.error("Não foi possível marcar a notificação."),
  });
  const clear = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("chapter_notifications").delete().eq("user_id", user.id);
      if (error) throw error;
      await read.mutateAsync(undefined);
    },
    onSuccess: () => { done(); toast.success("Notificações limpas"); },
    onError: () => toast.error("Não foi possível limpar."),
  });

  if (!user) return null;
  const tabs = [["all", "Todas"], ["chapter", "Capítulos"], ["request", "Pedidos"]] as const;
  return <Popover>
    <PopoverTrigger asChild><Button size="icon" variant="ghost" className="relative shrink-0" aria-label={unread.length ? `Notificações: ${unread.length} não lidas` : "Notificações"} title="Notificações"><Bell className="h-[18px] w-[18px]" />{unread.length ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread.length > 9 ? "9+" : unread.length}</span> : null}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] rounded-2xl p-0">
      <div className="flex items-center justify-between px-4 pt-4"><h2 className="font-display text-lg font-bold">Notificações</h2>
        <div className="flex gap-1">
          {unread.length ? <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={read.isPending} onClick={() => read.mutate(undefined)}><CheckCheck className="h-4 w-4" />Marcar tudo lido</Button> : null}
          {query.data?.some((i) => i.kind === "chapter") ? <Button size="icon" variant="ghost" className="h-8 w-8" title="Limpar" aria-label="Limpar notificações" disabled={clear.isPending} onClick={() => clear.mutate()}><Trash2 className="h-4 w-4" /></Button> : null}
        </div>
      </div>
      <div className="flex gap-1 px-4 py-3">{tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-colors", tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>{l}</button>)}</div>
      <div className="max-h-96 space-y-1.5 overflow-y-auto px-3 pb-3">
        {query.isPending ? <p className="p-3 text-sm text-muted-foreground">Carregando…</p> : query.isError ? <p role="alert" className="p-3 text-sm text-destructive">Não foi possível carregar os avisos.</p> : !items.length ? <p className="p-3 text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p> : items.map((item) => {
          const cls = cn("relative flex gap-3 rounded-xl border p-3 text-sm transition-colors", item.read_at ? "border-transparent hover:bg-muted/50" : "border-border bg-muted/40 hover:bg-muted");
          const body = <>{!item.read_at ? <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-primary" /> : null}
            <div className="ml-1.5 h-14 w-10 shrink-0 overflow-hidden rounded-md bg-muted">{item.cover ? <img src={item.cover} alt="" loading="lazy" className="h-full w-full object-cover" /> : <BookPlus className="m-auto mt-4 h-5 w-5 text-primary" />}</div>
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h4 className="font-semibold">{item.title}</h4><span className="shrink-0 text-[11px] text-muted-foreground">{when(item.created_at)}</span></div><p className="line-clamp-2 text-muted-foreground">{item.text}</p></div></>;
          const onClick = () => { if (!item.read_at) read.mutate(item); };
          return item.chapter
            ? <Link key={item.id} to="/obra/$slug/$chapter" params={{ slug: item.slug, chapter: item.chapter }} onClick={onClick} className={cls}>{body}</Link>
            : <Link key={item.id} to="/obra/$slug" params={{ slug: item.slug }} onClick={onClick} className={cls}>{body}</Link>;
        })}
      </div>
      <Button asChild variant="ghost" className="w-full rounded-none rounded-b-2xl border-t border-border"><Link to="/pedidos">Meus pedidos</Link></Button>
    </PopoverContent>
  </Popover>;
}
