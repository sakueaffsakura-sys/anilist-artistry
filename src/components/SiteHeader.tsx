import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookPlus, BookMarked, Headset, History, LogOut, Search, Shield, User2 } from "lucide-react";
import { WorkNotifications } from "@/components/WorkNotifications";
import { supabase } from "@/integrations/supabase/client";
import { MobileNav } from "@/components/MobileNav";
import { openSupportChat } from "@/components/SupportChat";
import { useProfile, useRoles, useSession } from "@/hooks/useAuth";
import { useActiveProfile } from "@/lib/active-profile";
import { ProfileAvatar } from "@/components/ProfilePicker";
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
  { to: "/biblioteca", label: "Biblioteca" },
  { to: "/historico", label: "Histórico" },
  { to: "/listas", label: "Listas" },
  { to: "/ranking-leitores", label: "Leitores" },
  { to: "/reels", label: "Reels" },
] as const;

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
      <header className="site-header sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-1.5 px-4 sm:gap-2 sm:px-6 lg:px-8">
          <Link to="/" className="mr-2 flex shrink-0 items-center" aria-label="Better Mangá — início">
            <img src={SITE_LOGO} alt="Better Mangá" className="h-10 w-auto max-w-32 object-contain" />
          </Link>

          <nav aria-label="Navegação principal" className="hidden items-center gap-0.5 text-[13px] font-semibold lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: false }}
                className="site-nav-link whitespace-nowrap rounded-md px-2.5 py-1.5"
                activeProps={{ className: "bg-surface-2 text-foreground" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="min-w-0 flex-1" />

          <Link
            to="/catalogo"
            search={{ q: "", kind: "Todos" }}
            className="hidden h-9 w-40 shrink-0 items-center gap-2 rounded-md bg-surface-2 px-3 text-[13px] text-muted-foreground hover:text-foreground lg:flex xl:w-56"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Buscar obras…</span>
          </Link>

          <Button asChild size="icon" variant="ghost" title="Pedir uma obra" className="shrink-0"><Link to="/pedidos" aria-label="Pedir uma obra"><BookPlus className="h-[18px] w-[18px]" /></Link></Button>
          <WorkNotifications />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="Conta">
                  <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-surface-2">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                </Button>
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
                <DropdownMenuItem asChild>
                  <Link to="/biblioteca" className="flex items-center gap-2">
                    <BookMarked className="h-4 w-4" /> Biblioteca
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
      </header>
      <MobileNav />
    </>
  );
}

export const SITE_LOGO =
  "https://cdn.mediocrescan.com/usuarios/156358/056c603c2288529c82b19ad4906b02c7f5a67be8.webp";

export function SiteFooter() {
  const year = new Date().getFullYear();
  const link = "w-fit text-sm text-muted-foreground hover:text-foreground";
  return (
    <footer className="site-footer hidden border-t border-border bg-surface lg:block">
      <div className="mx-auto grid max-w-7xl grid-cols-4 gap-8 px-8 py-10">
        <div className="space-y-3">
          <Link to="/" className="flex w-fit items-center" aria-label="Better Mangá — início">
            <img src={SITE_LOGO} alt="Better Mangá" className="h-14 w-auto object-contain" />
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Mangás, manhwas, manhuas e comics em português, com capítulos novos todos os dias.
          </p>
        </div>
        <nav className="flex flex-col gap-2.5" aria-label="Navegação">
          <h3 className="mb-1 text-sm font-semibold">Navegação</h3>
          <Link to="/" className={link}>Início</Link>
          <Link to="/catalogo" search={{ q: "", kind: "Todos" }} className={link}>Catálogo</Link>
          <Link to="/biblioteca" className={link}>Biblioteca</Link>
          <Link to="/historico" className={link}>Histórico</Link>
          <Link to="/pedidos" className={link}>Pedir uma obra</Link>
        </nav>
        <nav className="flex flex-col gap-2.5" aria-label="Comunidade">
          <h3 className="mb-1 text-sm font-semibold">Comunidade</h3>
          <Link to="/ranking" className={link}>Ranking de obras</Link>
          <Link to="/ranking-leitores" className={link}>Ranking de leitores</Link>
          <Link to="/listas" className={link}>Listas</Link>
          <Link to="/reels" className={link}>Reels</Link>
        </nav>
        <div className="flex flex-col gap-2.5">
          <h3 className="mb-1 text-sm font-semibold">Ajuda</h3>
          <Button type="button" variant="secondary" size="sm" onClick={openSupportChat} className="w-fit">
            <Headset className="h-4 w-4" />
            Falar com o suporte
          </Button>
          <Link to="/auth" className={link}>Entrar ou criar conta</Link>
          <Link to="/privacidade" className={link}>Privacidade</Link>
          <Link to="/excluir-conta" className={link}>Excluir conta</Link>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-8 py-4 text-xs text-muted-foreground">© {year} Better Mangá. Todos os direitos reservados.</p>
      </div>
    </footer>
  );
}
