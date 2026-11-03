import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [showPw, setShowPw] = useState(false);
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
    // Fora da Lovable (cPanel), o Google usa o OAuth nativo do Supabase: configure o provedor Google no
    // painel de Auth do seu banco e adicione o domínio final às URLs de redirecionamento permitidas.
    if (import.meta.env['VITE_GOOGLE_LOGIN_MODE'] === "native") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/" },
      });
      if (error) toast.error("Não foi possível entrar com o Google.");
      return;
    }
    // Na Lovable, o broker de autenticação continua sendo usado. Carregado só aqui, nunca no servidor.
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google.");
      return;
    }
  }

  const covers = useQuery({
    queryKey: ["auth-covers"],
    queryFn: async () => {
      const { data } = await supabase.from("series").select("id, cover_url").eq("published", true).not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(20);
      return (data ?? []).filter((c): c is { id: string; cover_url: string } => Boolean(c.cover_url));
    },
    staleTime: 10 * 60_000,
  });
  const switchMode = (m: "in" | "up") => { setMode(m); setSent(false); };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.35fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        <div className="absolute -inset-20 grid -rotate-6 grid-cols-5 gap-4 opacity-60">
          {[...(covers.data ?? []), ...(covers.data ?? [])].slice(0, 25).map((c, i) => (
            <div key={`${c.id}-${i}`} className="aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface">
              <img src={c.cover_url} alt="" decoding="async" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-background/40 via-background/60 to-background" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
        <div className="absolute bottom-12 left-12 max-w-xl">
          <img src="https://cdn.mediocrescan.com/usuarios/156358/056c603c2288529c82b19ad4906b02c7f5a67be8.webp" alt="" className="mb-5 h-14 w-auto object-contain" />
          <p className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight">Milhares de capítulos traduzidos, todo dia.</p>
          <p className="mt-4 text-muted-foreground">Comic, mangá, manhwa e novel em português.</p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex justify-center lg:hidden" aria-label="Better Mangá — início">
            <img src="https://cdn.mediocrescan.com/usuarios/156358/056c603c2288529c82b19ad4906b02c7f5a67be8.webp" alt="Better Mangá" className="h-20 w-auto object-contain" />
          </Link>
          <div role="tablist" className="grid grid-cols-2 rounded-full bg-surface p-1">
            {(["in", "up"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => switchMode(m)}
                className={cn("rounded-full py-2.5 text-sm font-semibold transition-colors", mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                {m === "in" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <h1 className="mt-8 font-display text-3xl font-extrabold">{mode === "in" ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mode === "in" ? "Entre para continuar de onde parou." : "Favorite obras, salve seu progresso e comente."}</p>

          <Button type="button" variant="secondary" onClick={google} className="mt-6 h-12 w-full rounded-full font-semibold">
            <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden="true"><path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.06-.15-1.11z" /></svg>
            Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou com e-mail <span className="h-px flex-1 bg-border" />
          </div>

          {sent ? (
            <p className="rounded-2xl border border-border bg-surface p-4 text-sm">
              Enviamos um e-mail de confirmação para <strong>{email}</strong>. Clique no link para ativar sua conta.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {mode === "up" ? (
                <FieldIcon icon={<User className="h-4 w-4" />}>
                  <Input aria-label="Nome de usuário" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nome de usuário" className="h-12 rounded-full bg-surface pl-11" />
                </FieldIcon>
              ) : null}
              <FieldIcon icon={<Mail className="h-4 w-4" />}>
                <Input aria-label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="h-12 rounded-full bg-surface pl-11" />
              </FieldIcon>
              <FieldIcon icon={<Lock className="h-4 w-4" />}>
                <Input aria-label="Senha" type={showPw ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha" className="h-12 rounded-full bg-surface pl-11 pr-12" />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </FieldIcon>
              <Button type="submit" disabled={busy} className="h-12 w-full rounded-full text-base font-semibold">
                {busy ? "Aguarde…" : mode === "in" ? "Entrar" : "Criar conta"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "in" ? "Não tem uma conta? " : "Já tem uma conta? "}
            <button type="button" onClick={() => switchMode(mode === "in" ? "up" : "in")} className="font-semibold text-primary hover:underline">
              {mode === "in" ? "Criar conta" : "Entrar"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

function FieldIcon({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-muted-foreground">{icon}</span>
      {children}
    </div>
  );
}
