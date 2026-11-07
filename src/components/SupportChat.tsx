import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headset, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";

export type SupportMessage = {
  id: string;
  user_id: string;
  from_staff: boolean;
  body: string;
  created_at: string;
};

/** Mensagens de suporte de uma conta, com atualização em tempo real. */
export function useSupportThread(userId?: string) {
  const qc = useQueryClient();
  const key = ["support-thread", userId];
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, user_id, from_staff, body, created_at")
        .eq("user_id", userId!)
        .order("created_at");
      if (error) throw error;
      return data as SupportMessage[];
    },
  });
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`support-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `user_id=eq.${userId}` }, () =>
        qc.invalidateQueries({ queryKey: ["support-thread", userId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);
  return query;
}

export function SupportConversation({ userId, staff }: { userId: string; staff: boolean }) {
  const { data: messages = [] } = useSupportThread(userId);
  const { user } = useSession();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const qc = useQueryClient();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  const send = async () => {
    const body = text.trim().slice(0, 2000);
    if (!body || !user) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({ user_id: userId, sender_id: user.id, from_staff: staff, body });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setText("");
    qc.invalidateQueries({ queryKey: ["support-thread", userId] });
    qc.invalidateQueries({ queryKey: ["support-inbox"] });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {staff ? "Sem mensagens." : "Olá! Envie sua dúvida e a equipe responderá aqui."}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.from_staff === staff;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                {m.body}
                <div className="mt-1 text-[10px] opacity-70">
                  {m.from_staff ? "Suporte" : "Você"} · {new Date(m.created_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2 border-t border-border p-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Escreva sua mensagem..."
          className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}

export const OPEN_SUPPORT_EVENT = "open-support-chat";

/** Abre o chat de suporte a partir de qualquer botão do site. */
export function openSupportChat() {
  window.dispatchEvent(new CustomEvent(OPEN_SUPPORT_EVENT));
}

/** Janela de suporte: abre somente quando o usuário clica no botão "Suporte". */
export function SupportChat() {
  const [open, setOpen] = useState(false);
  const { user } = useSession();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SUPPORT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, onOpen);
  }, []);

  if (!open) return null;
  return (
    <div className="fixed bottom-36 right-4 z-50 flex h-[460px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl md:bottom-20">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 font-semibold"><Headset className="h-4 w-4 text-primary" /> Suporte</div>
        <button onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>
      {user ? (
        <SupportConversation userId={user.id} staff={false} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          Entre na sua conta para falar com o suporte.
          <Button asChild size="sm"><Link to="/auth" onClick={() => setOpen(false)}>Entrar</Link></Button>
        </div>
      )}
    </div>
  );
}
