import { Link, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  House,
  LogOut,
  Menu as MenuIcon,
  Search,
  Shield,
  Trophy,
  User2,
  Clapperboard,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useRoles, useSession } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ITEMS = [
  { to: "/", label: "Início", icon: House, exact: true },
  { to: "/catalogo", label: "Pesquisar", icon: Search, exact: false },
  { to: "/biblioteca", label: "Coleção", icon: BookOpen, exact: false },
  { to: "/reels", label: "Reels", icon: Clapperboard, exact: false },
  { to: "/ranking", label: "Obras", icon: Trophy, exact: true },
] as const;

export function MobileNav() {
  const { user } = useSession();
  const { data: profile } = useProfile(user?.id);
  const { isStaff } = useRoles(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <nav
      aria-label="Navegação do celular"
      className="mobile-site-nav fixed inset-x-0 bottom-0 z-[100] border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="flex h-16 w-full items-stretch overflow-hidden px-1">
        <div className="flex w-full items-stretch gap-1">
          {ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.to
              : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className={cn("relative my-1 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md transition-colors", active && "bg-primary/10")}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  className={
                    "h-[18px] w-[18px] transition-all duration-300 " +
                    (active
                      ? "scale-110 text-primary drop-shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_70%,transparent)]"
                      : "text-muted-foreground")
                  }
                />
                <span
                  className={
                    "text-[9px] font-extrabold  transition-colors duration-200 " +
                    (active ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  {item.label}
                </span>
                <span
                  className={
                    "absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full transition-opacity " +
                    (active
                      ? "bg-primary opacity-100 shadow-[0_0_8px_color-mix(in_oklab,var(--primary)_90%,transparent)]"
                      : "opacity-0")
                  }
                />
              </Link>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                type="button"
                className="my-1 h-auto min-w-0 flex-1 flex-col gap-1 px-0"
                aria-label="Menu"
              >
                <MenuIcon className="h-[18px] w-[18px] text-muted-foreground transition-all duration-300" />
                <span className="text-[9px] font-extrabold  text-muted-foreground transition-colors duration-200">
                  Menu
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to="/ranking-leitores" className="flex items-center gap-2">
                  <Trophy className="h-4 w-4" /> Ranking de leitores
                </Link>
              </DropdownMenuItem>
              {user ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link
                      to="/u/$username"
                      params={{ username: profile?.username ?? "" }}
                      className="flex items-center gap-2"
                    >
                      <User2 className="h-4 w-4" /> Meu perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/historico" className="flex items-center gap-2">
                      <House className="h-4 w-4" /> Histórico
                    </Link>
                  </DropdownMenuItem>
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
                </>
              ) : (
                <DropdownMenuItem asChild>
                  <Link to="/auth" className="flex items-center gap-2">
                    <User2 className="h-4 w-4" /> Entrar
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
