import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, BookPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/hooks/useAuth";
import { fetchWorkNotifications } from "@/lib/work-requests";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function WorkNotifications() {
  const { user } = useSession();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["work-notifications", user?.id], enabled: Boolean(user), queryFn: () => user ? fetchWorkNotifications(user.id) : Promise.resolve([]), refetchInterval: 60_000, refetchIntervalInBackground: false });
  const unread = (query.data ?? []).filter((item) => !item.read_at);
  const read = useMutation({
    mutationFn: async (id?: string) => {
      if (!user) return;
      let update = supabase.from("work_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
      if (id) update = update.eq("id", id);
      const { error } = await update;
      if (error) throw error;
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["work-notifications"] }); },
    onError: () => toast.error("Não foi possível marcar a notificação."),
  });
  if (!user) return null;
  return <Popover>
    <PopoverTrigger asChild><Button size="icon" variant="ghost" className="relative shrink-0" aria-label={unread.length ? `Notificações: ${unread.length} não lidas` : "Notificações"} title="Notificações"><Bell className="h-[18px] w-[18px]" />{unread.length ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" /> : null}</Button></PopoverTrigger>
    <PopoverContent align="end" className="w-[min(360px,calc(100vw-24px))] p-0">
      <div className="flex items-center justify-between border-b border-border p-4"><h2 className="font-display font-bold">Notificações</h2>{unread.length ? <Button size="icon" variant="ghost" title="Marcar todas como lidas" aria-label="Marcar todas como lidas" disabled={read.isPending} onClick={() => read.mutate(undefined)}><CheckCheck className="h-4 w-4" /></Button> : null}</div>
      <div className="max-h-80 overflow-y-auto">
        {query.isPending ? <p className="p-4 text-sm text-muted-foreground">Carregando…</p> : query.isError ? <p role="alert" className="p-4 text-sm text-destructive">Não foi possível carregar os avisos.</p> : !query.data?.length ? <p className="p-4 text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p> : query.data.map((item) => item.series ? <Link key={item.id} to="/obra/$slug" params={{ slug: item.series.slug }} onClick={() => { if (!item.read_at) read.mutate(item.id); }} className={cn("flex gap-3 border-b border-border p-4 text-sm hover:bg-muted", !item.read_at && "bg-primary/5")}><BookPlus className="mt-1 h-5 w-5 shrink-0 text-primary" /><span><strong className="block">{item.series.title}</strong><span className="text-muted-foreground">A obra que você pediu já está disponível.</span></span></Link> : null)}
      </div>
      <Button asChild variant="ghost" className="w-full rounded-none"><Link to="/pedidos">Meus pedidos</Link></Button>
    </PopoverContent>
  </Popover>;
}