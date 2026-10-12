import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteOwnAccount } from "@/lib/account.functions";
import { useSession } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ConfirmDelete";

export const Route = createFileRoute("/excluir-conta")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Excluir conta — Better Mangá" },
      {
        name: "description",
        content:
          "Saiba como excluir permanentemente sua conta do Better Mangá e todos os dados associados, pelo site ou pelo aplicativo.",
      },
      { property: "og:title", content: "Excluir conta — Better Mangá" },
      {
        property: "og:description",
        content: "Exclua permanentemente sua conta do Better Mangá e todos os dados associados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExcluirContaPage,
});

function ExcluirContaPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function excluir() {
    setBusy(true);
    try {
      await deleteOwnAccount();
      await supabase.auth.signOut();
      toast.success("Conta excluída permanentemente.");
      navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a conta.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold">Excluir conta</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Esta página explica como apagar definitivamente sua conta do Better Mangá, tanto pelo site
        quanto pelo aplicativo Android.
      </p>

      <section className="mt-8 space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-lg font-bold">O que é apagado</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Seu perfil, nome de usuário, avatar e nível;</li>
          <li>Biblioteca, favoritos, listas e histórico de leitura;</li>
          <li>Comentários, reações e pedidos de obras;</li>
          <li>Assinatura/selo associados à conta;</li>
          <li>Seu acesso (e-mail e senha) — não será mais possível entrar.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          A exclusão é <strong className="text-foreground">permanente e imediata</strong>: não há
          período de carência nem como recuperar os dados depois.
        </p>
      </section>

      <section className="mt-6 space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-lg font-bold">Como excluir</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Entre na sua conta (pelo site ou pelo aplicativo) com o e-mail e senha cadastrados.</li>
          <li>Abra esta página de exclusão de conta.</li>
          <li>Toque em <strong className="text-foreground">"Excluir minha conta"</strong> e confirme.</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Se preferir, você também pode pedir a exclusão pelo chat de suporte informando o e-mail da
          conta.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold">Excluir agora</h2>
            {user ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Você está entrando como <strong className="text-foreground">{user.email}</strong>.
                  Ao confirmar, a conta e todos os dados serão apagados na hora.
                </p>
                <ConfirmDelete
                  title="Excluir conta permanentemente?"
                  description="Essa ação não pode ser desfeita. Seu perfil, biblioteca, histórico e comentários serão apagados para sempre."
                  onConfirm={excluir}
                >
                  <Button variant="destructive" disabled={busy} className="mt-4 font-semibold">
                    <Trash2 className="mr-2 h-4 w-4" />
                    {busy ? "Excluindo…" : "Excluir minha conta"}
                  </Button>
                </ConfirmDelete>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Para excluir sua conta, primeiro entre com o e-mail e senha cadastrados.
                </p>
                <Button asChild className="mt-4 font-semibold">
                  <Link to="/auth">Entrar para excluir</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
