import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Award, BookOpen, BookText, BookPlus, LayoutDashboard, PlusCircle, Shield, Users, ExternalLink, Frame, Headset, Wrench, Smartphone, Tags, Images, Menu, ChevronRight, PanelLeft, Search } from "lucide-react";
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
  { to: "/admin/mediocre", label: "MediocreScan API", icon: Search, exact: true, adminOnly: true },
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
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const routing = useRouterState({ select: (st) => st.status === "pending" });
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const t = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(t); }, []);
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(".admin-stat, .admin-work-row, .admin-body section, .admin-hero");
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
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
    { label: "Workspace", paths: ["/admin", "/admin/obras", "/admin/novels", "/admin/nova", "/admin/mediocre"] },
    { label: "Conteúdo & aparência", paths: ["/admin/home", "/admin/generos", "/admin/imagens", "/admin/molduras", "/admin/selos"] },
    { label: "Comunidade & sistema", paths: ["/admin/contas", "/admin/pedidos", "/admin/suporte", "/admin/app", "/admin/manutencao"] },
  ];
  const visible = NAV.filter((n) => !("adminOnly" in n) || isAdmin);
  const current = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to))) ?? NAV[0];
  const CurrentIcon = current.icon;
  const results = query.trim() ? visible.filter((n) => n.label.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();
  const navigation = (compact: boolean) => <nav aria-label="Áreas do painel" className="admin-workspace-nav">
    {groups.map((group) => {
      const items = visible.filter((n) => group.paths.includes(n.to));
      return items.length ? <div key={group.label} className="admin-nav-group">{compact ? <span className="admin-nav-sep" /> : <p className="admin-nav-label">{group.label}</p>}{items.map((n) => <Link key={n.to} to={n.to} title={n.label} onClick={() => setMenuOpen(false)} activeOptions={{ exact: n.exact }} className="admin-workspace-link" activeProps={{ className: "admin-workspace-link-active" }}><span className="admin-nav-icon"><n.icon className="h-4 w-4" /></span>{compact ? null : <><span className="flex-1 truncate">{n.label}</span><ChevronRight className="admin-nav-chevron h-3 w-3" /></>}</Link>)}</div> : null;
    })}
  </nav>;

  return (
    <div className="admin-workspace min-h-screen bg-background" data-collapsed={collapsed ? "true" : "false"} onPointerMove={onPointerMove}>
      <div className="admin-route-bar" data-active={routing ? "true" : "false"} aria-hidden />
      <div className="admin-ambient" aria-hidden><span /><span /></div>
      <aside className="admin-workspace-sidebar hidden lg:flex">
        <Link to="/admin" className="admin-workspace-brand"><img src={SITE_LOGO} alt="Better Mangá" className="h-10 w-12 shrink-0 object-contain" />{collapsed ? null : <span className="font-display text-sm font-bold">Better Mangá<span className="mt-1 block font-sans text-[10px] font-semibold uppercase text-primary">Publishing studio</span></span>}</Link>
        <div className="flex-1 overflow-y-auto px-3 py-6">{navigation(collapsed)}</div>
        <div className="admin-sidebar-foot">
          {collapsed ? null : <div className="admin-clock"><span className="admin-live-dot" />Online<span className="ml-auto tabular-nums">{now ? now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span><span className="text-muted-foreground">{now ? now.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : ""}</span></div>}
          {collapsed ? null : <div className="admin-account-card"><span className="admin-avatar">{initial}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{user?.email ?? "Conta"}</p><p className="mt-1 text-[10px] font-semibold text-primary">{isAdmin ? "Administrador" : isStaff ? "Uploader" : "Conta"}</p></div></div>}
          <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}><PanelLeft className="h-4 w-4" />{collapsed ? null : "Recolher"}</Button>
        </div>
      </aside>
      <div className="admin-workspace-main min-w-0">
        <header className="admin-workspace-topbar sticky top-0 z-30 flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu do painel" title="Menu do painel"><Menu className="h-5 w-5" /></Button></SheetTrigger><SheetContent side="left" className="admin-workspace-drawer overflow-y-auto"><SheetTitle className="mb-8 font-display">Better Mangá Studio</SheetTitle>{navigation(false)}</SheetContent></Sheet>
            <Link to="/admin" className="hidden text-xs text-muted-foreground hover:text-foreground sm:block">Studio</Link><ChevronRight className="hidden h-3 w-3 text-muted-foreground sm:block" /><span className="truncate text-xs font-semibold">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="admin-quick-search hidden md:block">
              <Search className="h-3.5 w-3.5" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ir para página…" aria-label="Buscar página do painel" />
              {results.length ? <div className="admin-quick-results">{results.map((n) => <Link key={n.to} to={n.to} onClick={() => setQuery("")} className="admin-quick-item"><n.icon className="h-4 w-4 text-primary" />{n.label}</Link>)}</div> : null}
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs"><Link to="/"><ExternalLink className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver site</span></Link></Button>
            <span className="admin-avatar admin-avatar-sm">{initial}</span>
          </div>
        </header>
        <main className="admin-content admin-workspace-content min-w-0 px-4 py-7 sm:px-8 sm:py-9 xl:px-10">
          <div className="admin-page-heading admin-hero mb-8 flex flex-wrap items-center justify-between gap-5">
            <span className="admin-hero-grid" aria-hidden /><span className="admin-hero-sweep" aria-hidden />
            <div className="flex min-w-0 items-center gap-4"><span className="admin-hero-icon"><CurrentIcon className="h-6 w-6" /></span><div className="min-w-0"><p className="mb-1 text-[10px] font-bold uppercase text-primary">Painel editorial · {isAdmin ? "Administração" : "Publicação"}</p><h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>{subtitle ? <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{subtitle}</p> : null}<div className="admin-dashes" aria-hidden><span /><span /><span /><span /><span /></div></div></div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
          </div>
          <div className="admin-body">{body}</div>
        </main>
        <footer className="admin-foot"><span>Better Mangá / Studio</span><span>{current.label}</span></footer>
      </div>
    </div>
  );
}

function CountUp({ value }: { value: ReactNode }) {
  const target = typeof value === "string" || typeof value === "number" ? Number(String(value).replace(/\D/g, "")) : NaN;
  const [shown, setShown] = useState<number | null>(null);
  const ref = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(target) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(null); return; }
    const start = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - start) / 900); setShown(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) ref.current = requestAnimationFrame(tick); };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [target]);
  if (!Number.isFinite(target) || shown === null) return <>{value}</>;
  return <>{shown >= target ? value : shown.toLocaleString("pt-BR")}</>;
}

export function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="admin-stat relative min-w-0 overflow-hidden px-5 py-6">
      <div className="admin-stat-icon mb-4">{icon}</div>
      <p className="font-display text-2xl font-extrabold tabular-nums sm:text-3xl"><CountUp value={value} /></p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
