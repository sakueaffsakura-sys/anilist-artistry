import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Award, BookOpen, BookText, BookPlus, LayoutDashboard, PlusCircle, Shield, Users, ExternalLink, Frame, Headset, Wrench, Smartphone, Tags, Images, Menu, ChevronRight, PanelLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { SITE_LOGO } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { useRoles, useSession } from "@/hooks/useAuth";
import { claimFirstAdmin } from "@/lib/staff.functions";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/admin/home", label: "Colunas da home", icon: BookOpen, exact: true, adminOnly: true },
  { to: "/admin/app", label: "App Android · APKs", icon: Smartphone, exact: true, adminOnly: true },
  { to: "/admin/obras", label: "Obras", icon: BookOpen, exact: false },
  { to: "/admin/nova", label: "Nova obra", icon: PlusCircle, exact: true },
  { to: "/admin/novels", label: "Novels", icon: BookText, exact: false },
  { to: "/admin/generos", label: "Gêneros", icon: Tags, exact: true, adminOnly: true },
  { to: "/admin/imagens", label: "Imagens", icon: Images, exact: true, adminOnly: true },
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
  const [menuOpen, setMenuOpen] = useState(false);
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

  const groups = [
    { label: "Workspace", paths: ["/admin", "/admin/obras", "/admin/novels", "/admin/nova"] },
    { label: "Conteúdo & aparência", paths: ["/admin/home", "/admin/generos", "/admin/imagens", "/admin/molduras", "/admin/selos"] },
    { label: "Comunidade & sistema", paths: ["/admin/contas", "/admin/pedidos", "/admin/suporte", "/admin/app", "/admin/manutencao"] },
  ];
  const navigation = <nav aria-label="Áreas do painel" className="admin-workspace-nav">
    {groups.map((group) => {
      const items = NAV.filter((n) => group.paths.includes(n.to) && (!("adminOnly" in n) || isAdmin));
      return items.length ? <div key={group.label} className="mb-7"><p className="mb-2 px-3 text-[10px] font-bold uppercase text-muted-foreground">{group.label}</p>{items.map((n) => <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)} activeOptions={{ exact: n.exact }} className="admin-workspace-link" activeProps={{ className: "admin-workspace-link-active" }}><n.icon className="h-4 w-4 shrink-0" /><span className="flex-1">{n.label}</span><ChevronRight className="admin-nav-chevron h-3 w-3" /></Link>)}</div> : null;
    })}
  </nav>;

  return (
    <div className="admin-workspace min-h-screen bg-background">
      <aside className="admin-workspace-sidebar hidden lg:flex">
        <Link to="/admin" className="admin-workspace-brand"><img src={SITE_LOGO} alt="Better Mangá" className="h-11 w-14 object-contain" /><span className="font-display text-sm font-bold">Better Mangá<span className="mt-1 block font-sans text-[10px] font-medium uppercase text-muted-foreground">Publishing studio</span></span></Link>
        <div className="flex-1 overflow-y-auto px-3 py-7">{navigation}</div>
        <div className="border-t border-border p-4"><div className="mb-4 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary"><Shield className="h-4 w-4" /></span><div><p className="text-xs font-bold">{isAdmin ? "Administrador" : isStaff ? "Uploader" : "Conta"}</p><p className="mt-1 text-[10px] text-muted-foreground">Better Mangá Studio</p></div></div><Button asChild variant="outline" size="sm" className="w-full justify-between"><Link to="/">Abrir site <ArrowUpRight className="h-4 w-4" /></Link></Button></div>
      </aside>
      <div className="admin-workspace-main min-w-0 lg:ml-[248px]">
        <header className="admin-workspace-topbar sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu do painel" title="Menu do painel"><Menu className="h-5 w-5" /></Button></SheetTrigger><SheetContent side="left" className="admin-workspace-drawer overflow-y-auto"><SheetTitle className="mb-8 font-display">Better Mangá Studio</SheetTitle>{navigation}</SheetContent></Sheet>
            <PanelLeft className="hidden h-4 w-4 text-muted-foreground lg:block" /><Link to="/admin" className="hidden text-xs text-muted-foreground sm:block">Studio</Link><ChevronRight className="hidden h-3 w-3 text-muted-foreground sm:block" /><span className="truncate text-xs font-semibold">{title}</span>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs"><Link to="/"><ExternalLink className="h-3.5 w-3.5" /> Ver site</Link></Button>
        </header>
        <main className="admin-content admin-workspace-content min-w-0 px-4 py-7 sm:px-8 sm:py-9 xl:px-10">
          <div className="admin-page-heading mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="mb-2 text-[10px] font-bold uppercase text-primary">Painel editorial</p><h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>{subtitle ? <p className="mt-2 max-w-xl text-sm text-muted-foreground">{subtitle}</p> : null}</div>{actions}</div>
          {body}
        </main>
        <footer className="mx-4 flex flex-wrap justify-between gap-2 border-t border-border py-5 text-[10px] text-muted-foreground sm:mx-8"><span>Better Mangá / Studio</span><span>{isAdmin ? "Administração" : "Publicação"}</span></footer>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="admin-stat relative min-w-0 px-5 py-6">
      <div className="mb-4 inline-flex text-primary">{icon}</div>
      <p className="font-display text-2xl font-extrabold sm:text-3xl">{value}</p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
