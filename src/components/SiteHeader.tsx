import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookPlus, BookMarked, Headset, LogOut, Search, Shield, User2 } from "lucide-react";
import { WorkNotifications } from "@/components/WorkNotifications";
import { supabase } from "@/integrations/supabase/client";
import { MobileNav } from "@/components/MobileNav";
import { openSupportChat } from "@/components/SupportChat";
import { useProfile, useRoles, useSession } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/catalogo", label: "Catálogo" },
  { to: "/ranking", label: "Ranking" },
  { to: "/biblioteca", label: "Coleções" },
  { to: "/listas", label: "Listas" },
  { to: "/ranking-leitores", label: "Leitores" },
  { to: "/historico", label: "Histórico" },
] as const;

export function SiteHeader() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { isStaff } = useRoles(user?.id);
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
      <header
        className="sticky top-0 z-40 border-b border-foreground/5 bg-background/75 backdrop-blur-sm"
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:h-20 sm:gap-3 sm:px-4 md:px-8">
          <Link to="/" className="flex shrink-0 items-center" aria-label="Better Mangá — início">
            <img
              src="https://cdn.mediocrescan.com/usuarios/156358/056c603c2288529c82b19ad4906b02c7f5a67be8.webp"
              alt="Better Mangá"
              className="h-16 w-auto object-contain drop-shadow-[0_0_14px_color-mix(in_oklab,var(--primary)_45%,transparent)] sm:h-20"
            />
          </Link>

          <div className="min-w-0 flex-1 lg:hidden" />

          <nav className="hidden items-center gap-1 text-sm font-medium lg:order-none lg:flex lg:w-auto lg:min-w-0 lg:flex-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: false }}
                className="group relative flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-2 transition-all"
                activeProps={{ className: "text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground hover:bg-foreground/5 hover:text-foreground" }}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
                        isActive ? "bg-primary shadow-[var(--shadow-glow)]" : "bg-transparent group-hover:bg-foreground/25"
                      }`}
                    />
                    {item.label}
                  </>
                )}
              </Link>
            ))}
          </nav>

          <div className="hidden flex-1 lg:block" />

          <Button
            asChild
            variant="ghost"
            className="group hidden h-9 w-40 shrink-0 items-center gap-2.5 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4 text-muted-foreground transition-all hover:border-foreground/15 hover:bg-foreground/[0.06] hover:text-foreground lg:flex xl:w-52"
          >
            <Link to="/catalogo" search={{ q: "", kind: "Todos" }}>
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left text-[13px]">Buscar...</span>
              <span className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                <kbd className="rounded border border-foreground/10 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] leading-none text-muted-foreground">Ctrl</kbd>
                <kbd className="rounded border border-foreground/10 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] leading-none text-muted-foreground">K</kbd>
              </span>
            </Link>
          </Button>


          <Button asChild size="icon" variant="ghost" title="Pedir uma obra" className="shrink-0"><Link to="/pedidos" aria-label="Pedir uma obra"><BookPlus className="h-[18px] w-[18px]" /></Link></Button>
          <WorkNotifications />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex min-w-0 items-center gap-2" aria-label="Conta">
                  <span className="relative shrink-0 pb-2">
                    <span className="relative z-10 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-foreground/10 bg-surface-2">
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User2 className="h-4 w-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="absolute -bottom-1 left-1/2 z-30 min-w-max -translate-x-1/2">
                      <span className="inline-flex h-[18px] items-center justify-center gap-1 rounded-full border border-foreground/10 bg-foreground/[0.07] px-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground backdrop-blur-sm">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-primary" />
                        <span className="tabular-nums leading-none">{profile?.level ?? 1}</span>
                      </span>
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link to="/u/$username" params={{ username: profile?.username ?? "" }} className="flex items-center gap-2">
                    <User2 className="h-4 w-4" /> Meu perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/biblioteca" className="flex items-center gap-2">
                    <BookMarked className="h-4 w-4" /> Minha biblioteca
                  </Link>
                </DropdownMenuItem>
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
            <Button asChild size="sm" className="rounded-full font-semibold">
              <Link to="/auth">Entrar</Link>
            </Button>
          )}
        </div>
      </header>
      <MobileNav />
    </>
  );
}

export const SITE_LOGO =
  "https://cdn.mediocrescan.com/usuarios/156358/056c603c2288529c82b19ad4906b02c7f5a67be8.webp";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="hidden border-t border-border/70 bg-background lg:block">
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 md:px-8">
        <div className="mb-8 grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="space-y-4">
            <Link to="/" className="group flex w-fit items-center gap-3">
              <img
                src={SITE_LOGO}
                alt="Better Mangá"
                className="h-20 w-auto object-contain drop-shadow-[0_0_14px_color-mix(in_oklab,var(--primary)_45%,transparent)] transition-transform duration-200 group-hover:scale-105 sm:h-28"
              />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              Organize sua coleção e acompanhe o que você curte — leia mangás,
              manhwas e comics num só lugar.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Navegação
            </h3>
            <nav className="flex flex-col gap-2.5">
              <Link to="/pedidos" className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary">Pedir uma obra</Link>
              <Link
                to="/"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Início
              </Link>
              <Link
                to="/catalogo"
                search={{ q: "", kind: "Todos" }}
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Pesquisar
              </Link>
              <Link
                to="/biblioteca"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Minha Coleção
              </Link>
              <Link
                to="/listas"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Listas
              </Link>
            </nav>
          </div>

          <div className="space-y-3">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Comunidade
            </h3>
            <nav className="flex flex-col gap-2.5">
              <Link
                to="/ranking"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Ranking de obras
              </Link>
              <Link
                to="/ranking-leitores"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Ranking de leitores
              </Link>
              <Link
                to="/historico"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Histórico
              </Link>
              <Link
                to="/catalogo"
                search={{ q: "", kind: "Todos" }}
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Explorar obras
              </Link>
            </nav>
          </div>

          <div className="space-y-3">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-foreground">
              Redes Sociais
            </h3>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openSupportChat}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-emerald-500"
              >
                <Headset className="h-4 w-4" />
                Suporte
              </button>
            </div>
            <nav className="flex flex-col gap-2.5 pt-2">
              <Link
                to="/auth"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Entrar / Criar conta
              </Link>
              <Link
                to="/biblioteca"
                className="w-fit text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Continuar lendo
              </Link>
            </nav>
          </div>
        </div>

        <div className="relative border-t border-border/70 pt-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-xs font-bold text-muted-foreground">
              © {year} Better Mangá. Todos os direitos reservados.
            </p>
            <div className="flex items-center gap-5 text-xs font-bold text-muted-foreground">
              <Link
                to="/catalogo"
                search={{ q: "", kind: "Todos" }}
                className="transition-colors hover:text-primary"
              >
                Catálogo
              </Link>
              <Link
                to="/ranking"
                className="transition-colors hover:text-primary"
              >
                Obras
              </Link>
              <Link
                to="/ranking-leitores"
                className="transition-colors hover:text-primary"
              >
                Leitores
              </Link>
              <Link
                to="/listas"
                className="transition-colors hover:text-primary"
              >
                Listas
              </Link>
              <Link
                to="/privacidade"
                className="transition-colors hover:text-primary"
              >
                Privacidade
              </Link>
              <Link
                to="/excluir-conta"
                className="transition-colors hover:text-primary"
              >
                Excluir conta
              </Link>
            </div>
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 opacity-10"
          >
            <img
              src={SITE_LOGO}
              alt=""
              className="h-[200px] w-[200px] object-contain"
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
