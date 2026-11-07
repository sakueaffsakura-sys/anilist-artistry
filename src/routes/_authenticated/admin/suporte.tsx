import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { SupportConversation } from "@/components/SupportChat";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/suporte")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Suporte — Better Mangá" },
    { name: "description", content: "Atenda as conversas de suporte dos leitores." },
    { property: "og:title", content: "Suporte — Better Mangá" },
    { property: "og:description", content: "Central de atendimento dos leitores." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SupportAdmin,
});

function SupportAdmin() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: threads = [] } = useQuery({
    queryKey: ["support-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("user_id, body, from_staff, created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map = new Map<string, { user_id: string; last: string; at: string; waiting: boolean }>();
      for (const m of data) if (!map.has(m.user_id)) map.set(m.user_id, { user_id: m.user_id, last: m.body, at: m.created_at, waiting: !m.from_staff });
      const ids = [...map.keys()];
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, username, avatar_url").in("id", ids)
        : { data: [] };
      const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
      return [...map.values()].map((t) => ({ ...t, profile: pm.get(t.user_id) }));
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("support-inbox")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, () =>
        qc.invalidateQueries({ queryKey: ["support-inbox"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const current = threads.find((t) => t.user_id === selected);

  const closeChat = async () => {
    if (!selected || !confirm("Encerrar o chat? Todas as mensagens desta conversa serão apagadas permanentemente.")) return;
    const { error } = await supabase.from("support_messages").delete().eq("user_id", selected);
    if (error) { toast.error(error.message); return; }
    toast.success("Chat encerrado e apagado");
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["support-inbox"] });
    qc.invalidateQueries({ queryKey: ["support-thread", selected] });
  };

  return (
    <AdminShell title="Suporte" subtitle="Conversas individuais de cada conta" adminOnly>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card">
          {threads.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa aberta.</p>}
          {threads.map((t) => (
            <button
              key={t.user_id}
              onClick={() => setSelected(t.user_id)}
              className={`flex w-full items-center gap-3 border-b border-border p-3 text-left hover:bg-muted ${selected === t.user_id ? "bg-muted" : ""}`}
            >
              <img src={t.profile?.avatar_url || "/placeholder.svg"} alt="" className="h-9 w-9 rounded-full bg-muted object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="truncate">{t.profile?.username ?? "Usuário"}</span>
                  {t.waiting && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" title="Aguardando resposta" />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{t.last}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex h-[70vh] flex-col overflow-hidden rounded-lg border border-border bg-card">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="font-semibold">{current?.profile?.username ?? "Conversa"}</span>
                <Button variant="destructive" size="sm" onClick={closeChat}><Trash2 className="mr-1 h-4 w-4" /> Encerrar chat</Button>
              </div>
              <SupportConversation userId={selected} staff />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Selecione uma conversa</div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
