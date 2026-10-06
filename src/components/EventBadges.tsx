import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";

/** Selos de evento abertos que o usuário pode resgatar. */
export function EventBadges() {
  const { user } = useSession();
  const qc = useQueryClient();
  const events = useQuery({
    queryKey: ["badge-events-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badge_events").select("*").eq("active", true).order("created_at", { ascending: false });
      if (error) throw error;
      return data.filter((e) => !e.ends_at || new Date(e.ends_at) > new Date());
    },
  });
  const progress = useQuery({
    queryKey: ["event-progress", user?.id, events.data?.map((e) => e.id).join()],
    enabled: !!user && !!events.data?.length,
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const e of events.data!) {
        const { data } = await supabase.rpc("event_badge_progress", { _event: e.id });
        out[e.id] = data ?? 0;
      }
      return out;
    },
  });
  const mine = useQuery({
    queryKey: ["my-event-badges", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profile_badges").select("event_id").eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.event_id).filter(Boolean) as string[]);
    },
  });
  const claim = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("claim_event_badge", { _event: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Selo resgatado!");
      qc.invalidateQueries({ queryKey: ["my-event-badges"] });
      qc.invalidateQueries({ queryKey: ["comments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao resgatar"),
  });

  if (!events.data?.length) return null;
  return (
    <section className="rounded-xl border border-primary/30 bg-card/60 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Award className="h-5 w-5 text-primary" /> Evento de selos
      </h2>
      <div className="flex flex-wrap gap-3">
        {events.data.map((ev) => {
          const owned = mine.data?.has(ev.id);
          return (
            <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
              <img loading="lazy" decoding="async" src={ev.image_url} alt={ev.name} className="h-12 w-12 object-contain" />
              <div className="min-w-0">
                <p className="font-semibold">{ev.name}</p>
                {ev.description ? <p className="text-xs text-muted-foreground">{ev.description}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {ev.required_chapters > 0 ? `Leia ${ev.required_chapters} capítulos` : "Resgate grátis"}
                  {user && ev.required_chapters > 0 ? ` · ${Math.min(progress.data?.[ev.id] ?? 0, ev.required_chapters)}/${ev.required_chapters}` : ""}
                  {ev.ends_at ? ` · até ${new Date(ev.ends_at).toLocaleDateString("pt-BR")}` : ""}
                </p>
              </div>
              {!user ? (
                <span className="text-xs text-muted-foreground">Entre para resgatar</span>
              ) : owned ? (
                <span className="flex items-center gap-1 text-xs text-primary"><Check className="h-4 w-4" /> Resgatado</span>
              ) : (
                <Button size="sm" disabled={claim.isPending || (progress.data?.[ev.id] ?? 0) < ev.required_chapters} onClick={() => claim.mutate(ev.id)}>Resgatar</Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
