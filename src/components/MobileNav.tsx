import { Link, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  BookPlus,
  History,
  House,
  ListOrdered,
  Users,
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
  { to: "/catalogo", label: "Buscar", icon: Search, exact: false },
  { to: "/biblioteca", label: "Biblioteca", icon: BookOpen, exact: false },
  { to: "/ranking", label: "Ranking", icon: Trophy, exact: true },
  { to: "/reels", label: "Reels", icon: Clapperboard, exact: false },
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
      className="mobile-site-nav fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
    >
      <div className="flex h-14 w-full items-stretch overflow-hidden px-1">
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
                className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5"
                aria-current={active ? "page" : undefined}
              >
                <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-[11px] font-semibold", active ? "text-foreground" : "text-muted-foreground")}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                type="button"
                className="h-auto min-w-0 flex-1 flex-col gap-0.5 rounded-none px-0 hover:bg-transparent"
                aria-label="Menu"
              >
                <MenuIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Menu
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link to="/listas" className="flex items-center gap-2">
                  <ListOrdered className="h-4 w-4" /> Listas
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/ranking-leitores" className="flex items-center gap-2">
                  <Users className="h-4 w-4" /> Ranking de leitores
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/pedidos" className="flex items-center gap-2">
                  <BookPlus className="h-4 w-4" /> Pedir uma obra
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
                      <History className="h-4 w-4" /> Histórico
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
