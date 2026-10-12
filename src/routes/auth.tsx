import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Entrar no Better Mangá" },
      {
        name: "description",
        content: "Crie sua conta para favoritar obras, salvar o histórico de leitura e comentar.",
      },
      { property: "og:title", content: "Entrar no Better Mangá" },
      { property: "og:description", content: "Favoritos, histórico e comentários na sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();
  const { user } = useSession();

  useEffect(() => {
    if (user) navigate({ to: "/", replace: true });
  }, [user, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username: username || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent(true);
          toast.success("Conta criada! Confira seu e-mail para ativar.");
        } else {
          toast.success("Conta criada! Bem-vindo ao Better Mangá.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta!");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center" aria-label="Better Mangá — início">
          <img
            src="https://cdn.mediocrescan.com/usuarios/156358/056c603c2288529c82b19ad4906b02c7f5a67be8.webp"
            alt="Better Mangá"
            className="h-24 w-auto object-contain drop-shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
          />
        </Link>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-card)]">
          <h1 className="font-display text-xl font-extrabold">
            {mode === "in" ? "Entrar" : "Criar conta"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Favorite obras, salve seu progresso e comente.
          </p>

          {sent ? (
            <p className="mt-6 rounded-lg bg-surface-2 p-4 text-sm">
              Enviamos um e-mail de confirmação para <strong>{email}</strong>. Clique no link para
              ativar sua conta.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "up" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="username">Nome de usuário</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="seu_nick"
                    className="bg-background"
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="bg-background"
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full font-semibold">
                {busy ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" onClick={google} className="w-full font-semibold">
            Continuar com Google
          </Button>

          <button
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setSent(false);
            }}
            className="mt-5 w-full text-sm text-muted-foreground hover:text-primary"
          >
            {mode === "in" ? "Não tem conta? Criar agora" : "Já tenho conta, entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
