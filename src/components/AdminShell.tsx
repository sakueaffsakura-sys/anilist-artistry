import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Award, BookOpen, BookText, BookPlus, LayoutDashboard, PlusCircle, Shield, Users, ExternalLink, Frame, Headset, Wrench, Smartphone, Tags, Images } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { useRoles, useSession } from "@/hooks/useAuth";
import { claimFirstAdmin } from "@/lib/staff.functions";

const NAV = [
  { to: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/admin/home", label: "Colunas da home", icon: BookOpen, exact: true, adminOnly: true },
  { to: "/admin/app", label: "App Android · APKs", icon: Smartphone, exact: true, adminOnly: true },
  { to: "/admin/obras", label: "Obras", icon: BookOpen, exact: false },
  { to: "/admin/nova", label: "Nova obra", icon: PlusCircle, exact: true },
  { to: "/admin/novels", label: "Novels", icon: BookText, exact: false },
  { to: "/admin/generos", label: "Gêneros", icon: Tags, exact: true, adminOnly: true },
  { to: "/admin/imagens", label: "Imagens", icon: Images, exact: true },
  { to: "/admin/contas", label: "Contas", icon: Users, exact: true, adminOnly: true },
  { to: "/admin/molduras", label: "Molduras", icon: Frame, exact: true, adminOnly: true },
  { to: "/admin/selos", label: "Selos", icon: Award, exact: true, adminOnly: true },
  { to: "/admin/suporte", label: "Suporte", icon: Headset, exact: true, adminOnly: true },
  { to: "/admin/pedidos", label: "Pedidos", icon: BookPlus, exact: true, adminOnly: true },
  { to: "/admin/manutencao", label: "Manutenção", icon: Wrench, exact: true, adminOnly: true },
] as const;

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
  adminOnly,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const { user } = useSession();
  const { isStaff, isAdmin, isLoading } = useRoles(user?.id);
  const queryClient = useQueryClient();
  const claim = useServerFn(claimFirstAdmin);
  const claimAdmin = useMutation({
    mutationFn: async () => claim({}),
    onSuccess: (r) => {
      if (r.granted) {
        toast.success("Você agora é administrador do site.");
        queryClient.invalidateQueries({ queryKey: ["roles", user?.id] });
      } else toast.error(r.reason);
    },
    onError: () => toast.error("Não foi possível assumir o painel."),
  });

  let body: ReactNode = children;
  if (isLoading || !user) {
    body = <p className="py-20 text-center text-muted-foreground">Verificando acesso…</p>;
  } else if (!isStaff || (adminOnly && !isAdmin)) {
    body = (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/15">
          <Shield className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-extrabold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {adminOnly && isStaff ? "Somente administradores podem gerenciar contas." : "Só a equipe pode acessar o painel."}
        </p>
        {!isStaff ? (
          <Button className="mt-6 font-semibold" disabled={claimAdmin.isPending} onClick={() => claimAdmin.mutate()}>
            Assumir como administrador
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="site-content admin-layout mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <aside className="admin-sidebar sticky top-20 hidden h-fit w-56 shrink-0 border-r border-border pr-5 lg:block">
          <div className="mb-4 flex items-center gap-2.5 border-b border-border px-3 pb-5 pt-1">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-extrabold">Painel</p>
              <p className="text-[11px] text-muted-foreground">{isAdmin ? "Administrador" : "Uploader"}</p>
            </div>
          </div>
          <nav aria-label="Áreas do painel" className="space-y-1">
            {NAV.filter((n) => !("adminOnly" in n) || isAdmin).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.exact }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                activeProps={{ className: "!bg-primary/15 !text-primary" }}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </Link>
            ))}
          </nav>
          <div className="my-3 h-px bg-border" />
          <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ExternalLink className="h-4 w-4" /> Ver site
          </Link>
        </aside>

        <main className="admin-content min-w-0 flex-1">
          <nav aria-label="Navegação do painel" className="admin-mobile-tabs no-scrollbar mb-6 flex gap-1 overflow-x-auto border-b border-border pb-2 lg:hidden">
            {NAV.filter((n) => !("adminOnly" in n) || isAdmin).map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.exact }}
                className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-xs font-semibold text-muted-foreground"
                activeProps={{ className: "!bg-primary/10 !text-primary" }}
              >
                <n.icon className="h-3.5 w-3.5" /> {n.label}
              </Link>
            ))}
          </nav>
          <div className="admin-page-heading mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
            <div>
              <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {actions}
          </div>
          {body}
        </main>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="admin-stat relative overflow-hidden rounded-lg border border-border bg-surface p-5">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">{icon}</div>
      <p className="mt-4 font-display text-2xl font-extrabold sm:text-3xl">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
