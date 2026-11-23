import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookMarked, BookPlus, ChevronDown, Headset, History, LogOut, Search, Shield, Trash2, User2 } from "lucide-react";
import { WorkNotifications } from "@/components/WorkNotifications";
import { CoinMenuItem } from "@/components/CoinMenuItem";
import { supabase } from "@/integrations/supabase/client";
import { MobileNav } from "@/components/MobileNav";
import { openSupportChat } from "@/components/SupportChat";
import { useProfile, useRoles, useSession } from "@/hooks/useAuth";
import { useActiveProfile } from "@/lib/active-profile";
import { ProfileAvatar } from "@/components/ProfilePicker";
import { Button } from "@/components/ui/button";
import { DISCORD_URL } from "@/lib/site-links";
import { useSitePref } from "@/lib/site-prefs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Links fixos do cabeçalho; o resto fica no menu "Mais". */
const NAV = [
  { to: "/catalogo", label: "Catálogo" },
  { to: "/ranking", label: "Ranking" },
  { to: "/biblioteca", label: "Coleção" },
] as const;

const MORE = [
  { to: "/historico", label: "Histórico" },
  { to: "/listas", label: "Listas" },
  { to: "/ranking-leitores", label: "Leitores" },
  { to: "/pedidos", label: "Pedir uma obra" },
] as const;

/** Busca do cabeçalho: obra ou autor; Ctrl/Cmd + K leva o cursor até ela. */
function HeaderSearch() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="site-search"
      onSubmit={(event) => {
        event.preventDefault();
        void navigate({ to: "/catalogo", search: { q: value.trim(), kind: "Todos" } });
        inputRef.current?.blur();
      }}
    >
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Buscar obra ou autor"
        aria-label="Buscar obra ou autor"
        autoComplete="off"
        enterKeyHint="search"
      />
      <kbd aria-hidden="true">Ctrl K</kbd>
    </form>
  );
}

export function SiteHeader() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { isStaff } = useRoles(user?.id);
  const activeProfile = useActiveProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link to="/" className="site-logo" aria-label="Better Mangá — início">
            <img src={SITE_LOGO} alt="Better Mangá" />
          </Link>

          <nav aria-label="Navegação principal" className="site-nav">
            <Link to="/" activeOptions={{ exact: true }} className="site-nav-link">Início</Link>
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} activeOptions={{ exact: false }} className="site-nav-link">
                {item.label}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="site-nav-link" aria-label="Mais páginas">
                  Mais <ChevronDown aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {MORE.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          <div className="site-header-spacer" />

          <HeaderSearch />

          <div className="site-header-end">
            <WorkNotifications />
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="site-avatar" aria-label="Conta">
                    <span>
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" />
                      ) : (
                        <User2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {profile ? <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">@{profile.username}</span> · nível {profile.level ?? 1}</p> : null}
                  <DropdownMenuItem asChild>
                    <Link to="/perfis" className="flex items-center gap-2">
                      <ProfileAvatar profile={activeProfile} size="sm" /> <span className="truncate">{activeProfile.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">Trocar</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/u/$username" params={{ username: profile?.username ?? "" }} className="flex items-center gap-2">
                      <User2 className="h-4 w-4" /> Meu perfil
                    </Link>
                  </DropdownMenuItem>
                  <CoinMenuItem />
                  <DropdownMenuItem asChild>
                    <Link to="/biblioteca" className="flex items-center gap-2">
                      <BookMarked className="h-4 w-4" /> Coleção
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/historico" className="flex items-center gap-2"><History className="h-4 w-4" /> Histórico</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/pedidos" className="flex items-center gap-2"><BookPlus className="h-4 w-4" /> Meus pedidos</Link></DropdownMenuItem>
                  {isStaff ? (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2">
                        <Shield className="h-4 w-4" /> Painel
                      </Link>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="flex items-center gap-2">
                    <LogOut className="h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild size="sm" className="ml-1">
                <Link to="/auth">Entrar</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <MobileNav />
    </>
  );
}

export const SITE_LOGO =
  "https://cdn.mediocrescan.com/usuarios/156358/056c603c2288529c82b19ad4906b02c7f5a67be8.webp";

function PrefSwitch({ pref, title, hint }: { pref: "lite" | "tint"; title: string; hint: string }) {
  const [on, setOn] = useSitePref(pref);
  const id = `pref-${pref}`;
  return (
    <div className="footer-pref">
      <div>
        <h4 id={id}>{title}</h4>
        <p>{hint}</p>
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className="switch" onClick={() => setOn(!on)} />
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const { user } = useSession();
  const queryClient = useQueryClient();

  /** Sai da conta e apaga o que o navegador guardou do site (menos as preferências deste rodapé). */
  async function clearSession() {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      Object.keys(window.localStorage).filter((key) => !key.startsWith("bm:")).forEach((key) => window.localStorage.removeItem(key));
      window.sessionStorage.clear();
      if ("caches" in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
    } catch {
      /* segue para a tela de entrada mesmo se o navegador recusar alguma limpeza */
    }
    window.location.assign("/auth");
  }

  return (
    <footer className="site-footer hidden lg:block">
      <div className="site-footer-inner">
        <div className="footer-grid">
          <div>
            <Link to="/" className="footer-brand" aria-label="Better Mangá — início">
              <img src={SITE_LOGO} alt="" />
              <span>Better Mangá</span>
            </Link>
            <p className="footer-tagline">Organize sua coleção e acompanhe o que você curte — tudo num só lugar.</p>
          </div>
          <nav aria-label="Navegação">
            <h3 className="footer-heading">Navegação</h3>
            <div className="footer-links">
              <Link to="/">Início</Link>
              <Link to="/catalogo" search={{ q: "", kind: "Todos" }}>Pesquisar</Link>
              <Link to="/biblioteca">Minha Coleção</Link>
              <Link to="/ranking-leitores">Comunidade</Link>
            </div>
          </nav>
          <div>
            <h3 className="footer-heading">Redes sociais</h3>
            <div className="footer-social">
              {DISCORD_URL ? (
                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="footer-discord">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
                  Discord
                </a>
              ) : null}
              <button type="button" className="footer-support" onClick={openSupportChat}>
                <Headset aria-hidden="true" />Suporte
              </button>
            </div>
            <div className="footer-block">
              <h3 className="footer-heading">Preferências</h3>
              <PrefSwitch pref="lite" title="Modo leve" hint="Desliga brilhos, animações e imagens em alta. Ideal para celular fraco ou internet lenta." />
              <PrefSwitch pref="tint" title="Tema azulado" hint="Deixa o site com um tom azulado escuro. Vale só para você." />
            </div>
            {user ? (
              <div className="footer-block">
                <h3 className="footer-heading">Conta</h3>
                <button type="button" className="footer-account" onClick={() => void clearSession()}>
                  <Trash2 aria-hidden="true" />Limpar sessão e cache
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {year} Better Mangá. Todos os direitos reservados.</span>
          <nav aria-label="Informações legais">
            <Link to="/privacidade">Termos de uso</Link>
            <button type="button" onClick={openSupportChat}>DMCA</button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
