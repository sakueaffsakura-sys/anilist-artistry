import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Ban, Check, Pencil, Save, Search, Shield, Trash2, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { subscriptionSeal } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRoles, useSession } from "@/hooks/useAuth";
import { Pager } from "@/components/Pager";
import { ADMIN_PAGE_SIZE, fetchAdminAccounts } from "@/lib/admin-lists";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/admin/contas")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Gerenciar contas — Better Mangá" },
      { name: "description", content: "Edite perfis, cargos, XP e bloqueios dos leitores." },
      { property: "og:title", content: "Gerenciar contas — Better Mangá" },
      { property: "og:description", content: "Gestão de contas e cargos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Contas,
});

type Account = {
  id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string | null;
  level: number; xp: number; banned: boolean; created_at: string; roles: string[]; subscription_tier: string;
};

const ROLES = [
  { key: "admin", label: "Admin", desc: "Controle total do site" },
  { key: "uploader", label: "Uploader", desc: "Publica obras e capítulos" },
] as const;

function Contas() {
  const { user } = useSession();
  const { isAdmin } = useRoles(user?.id);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Account | null>(null);

  const [page, setPage] = useState(1);
  const term = useDebouncedValue(q);
  const accounts = useQuery({
    queryKey: ["admin-accounts", page, term],
    enabled: isAdmin,
    queryFn: ({ signal }) => fetchAdminAccounts(page, term, signal),
    placeholderData: keepPreviousData,
  });
  const rows = accounts.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((accounts.data?.total ?? 0) / ADMIN_PAGE_SIZE));
  useEffect(() => { if (page > pages && !accounts.isFetching) setPage(pages); }, [page, pages, accounts.isFetching]);

  return (p.data ?? []).map((a) => ({ ...a, roles: (r.data ?? []).filter((x) => x.user_id === a.id).map((x) => x.role as string) })) as Account[];
    },
  });

  const rows = useMemo(
    () => (accounts.data ?? []).filter((a) => `${a.username} ${a.display_name ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [accounts.data, q],
  );

  return (
    <AdminShell adminOnly title="Contas" subtitle={`${accounts.data?.total ?? 0} contas cadastradas`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por nome ou @usuário…" className="h-11 bg-surface pl-9" />
      </div>

      {accounts.isFetching ? <p role="status" className="mt-4 text-sm text-muted-foreground">Carregando contas…</p> : null}
      {accounts.isError ? <div role="alert" className="mt-4 text-sm text-destructive">Não foi possível carregar as contas. <Button variant="outline" onClick={() => void accounts.refetch()}>Tentar novamente</Button></div> : null}
      <div aria-busy={accounts.isFetching} className="mt-5 grid gap-3 md:grid-cols-2">
        {rows.map((a) => (
          <div key={a.id} className={`flex items-center gap-4 rounded-2xl border bg-surface p-4 ${a.banned ? "border-destructive/50" : "border-border"}`}>
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-lg font-bold text-primary ring-2 ring-border">
              {a.avatar_url ? <img src={a.avatar_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : a.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Link to="/u/$username" params={{ username: a.username }} className="truncate font-bold hover:text-primary">
                  {a.display_name || a.username}
                </Link>
                <span className="rounded border border-border px-1.5 text-[10px] font-bold text-muted-foreground">Nv. {a.level}</span>
                {a.roles.map((r) => (
                  <span key={r} className="flex items-center gap-0.5 rounded bg-primary/15 px-1.5 text-[10px] font-bold uppercase text-primary">
                    {r === "admin" ? <Shield className="h-2.5 w-2.5" /> : <UploadIcon className="h-2.5 w-2.5" />} {r}
                  </span>
                ))}
                {a.banned ? (
                  <span className="flex items-center gap-0.5 rounded bg-destructive/15 px-1.5 text-[10px] font-bold text-destructive">
                    <Ban className="h-2.5 w-2.5" /> Bloqueado
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                @{a.username} · {a.xp.toLocaleString("pt-BR")} XP · desde {new Date(a.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
            </Button>
          </div>
        ))}
      </div>
      {rows.length === 0 && !accounts.isLoading && !accounts.isError ? <p className="mt-10 text-center text-sm text-muted-foreground">Nenhuma conta encontrada.</p> : null}

      <Pager page={page} pages={pages} onChange={setPage} />
      <AccountDialog account={editing} selfId={user?.id} onClose={() => setEditing(null)} />
    </AdminShell>
  );
}

function AccountDialog({ account, selfId, onClose }: { account: Account | null; selfId?: string | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ username: "", display_name: "", avatar_url: "", bio: "", xp: "0", banned: false, roles: [] as string[], subscription_tier: "none" });
  useEffect(() => {
    if (!account) return;
    setF({
      username: account.username,
      display_name: account.display_name ?? "",
      avatar_url: account.avatar_url ?? "",
      bio: account.bio ?? "",
      xp: String(account.xp),
      banned: account.banned,
      roles: account.roles,
      subscription_tier: account.subscription_tier ?? "none",
    });
  }, [account]);
  const isSelf = account?.id === selfId;

  const badges = useQuery({
    queryKey: ["admin-badges", account?.id],
    enabled: Boolean(account),
    queryFn: async () => {
      if (!account) return [];
      const { data, error } = await supabase
        .from("profile_badges")
        .select("id, name, image_url, event_id")
        .eq("user_id", account.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const badgeEvents = useQuery({
    queryKey: ["admin-account-badge-events"],
    enabled: Boolean(account),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badge_events")
        .select("id, name, image_url, active, ends_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const giveBadge = useMutation({
    mutationFn: async (event: { id: string; name: string; image_url: string }) => {
      if (!account) return;
      const { error } = await supabase
        .from("profile_badges")
        .insert({
          user_id: account.id,
          name: event.name,
          image_url: event.image_url,
          event_id: event.id,
          position: (badges.data?.length ?? 0) + 1,
        });
      if (error) throw new Error(error.code === "23505" ? "Este usuário já possui esse selo." : error.message);
    },
    onSuccess: () => {
      toast.success("Selo enviado para o perfil!");
      qc.invalidateQueries({ queryKey: ["admin-badges", account?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível enviar o selo."),
  });

  const removeBadge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("profile_badges").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Selo removido.");
      qc.invalidateQueries({ queryKey: ["admin-badges", account?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível remover."),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!account) return;
      const username = f.username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, "");
      if (username.length < 3) throw new Error("Usuário precisa ter 3+ caracteres (letras, números, _ ou .).");
      const xp = Math.max(0, Math.floor(Number(f.xp) || 0));
      const { error } = await supabase
        .from("profiles")
        .update({
          username,
          display_name: f.display_name.trim().slice(0, 60) || null,
          avatar_url: f.avatar_url.trim() || null,
          bio: f.bio.trim().slice(0, 500) || null,
          xp,
          level: 1 + Math.floor(xp / 1000),
          banned: isSelf ? false : f.banned,
          subscription_tier: f.subscription_tier,
        })
        .eq("id", account.id);
      if (error) throw error.message.includes("duplicate") ? new Error("Esse @usuário já existe.") : error;
      for (const r of ROLES) {
        const had = account.roles.includes(r.key);
        const has = f.roles.includes(r.key);
        if (had === has || (isSelf && r.key === "admin")) continue;
        const res = has
          ? await supabase.from("user_roles").insert({ user_id: account.id, role: r.key })
          : await supabase.from("user_roles").delete().eq("user_id", account.id).eq("role", r.key);
        if (res.error) throw res.error;
      }
    },
    onSuccess: () => {
      toast.success("Conta atualizada!");
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  return (
    <Dialog open={Boolean(account)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar conta</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>@usuário</Label>
            <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Nome de exibição</Label>
            <Input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>URL do avatar</Label>
          <Input value={f.avatar_url} onChange={(e) => setF({ ...f, avatar_url: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Bio</Label>
          <Textarea value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>XP (nível = 1 + XP ÷ 1000)</Label>
          <Input type="number" min={0} value={f.xp} onChange={(e) => setF({ ...f, xp: e.target.value })} />
        </div>
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-bold">Selo de assinatura</p>
          <div className="grid grid-cols-5 gap-2">
            {(["none", "bronze", "prata", "ouro", "diamante"] as const).map((tier) => {
              const seal = subscriptionSeal(tier);
              const active = f.subscription_tier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setF({ ...f, subscription_tier: tier })}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[11px] font-semibold transition-colors ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {seal ? (
                    <img src={seal.seal} alt={seal.label} className="h-8 w-8 object-contain" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center text-muted-foreground/50">—</span>
                  )}
                  {seal?.label ?? "Nenhum"}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-bold">Selos do perfil</p>
          <p className="text-xs text-muted-foreground">Envie um selo cadastrado ou remova os que este usuário já possui.</p>
          <div className="flex flex-wrap gap-2">
            {(badges.data ?? []).map((b) => (
              <span key={b.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs">
                <img src={b.image_url} alt={b.name} title={b.name} className="h-6 w-6 object-contain" />
                <span className="max-w-28 truncate">{b.name}</span>
                <button
                  type="button"
                  aria-label={`Remover selo ${b.name}`}
                  onClick={() => removeBadge.mutate(b.id)}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            {badges.data?.length === 0 ? <span className="text-xs text-muted-foreground">Nenhum selo recebido.</span> : null}
          </div>
          <div className="border-t border-border pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground">
              <Award className="h-3.5 w-3.5" /> Catálogo de selos
            </p>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {(badgeEvents.data ?? []).map((event) => {
                const owned = badges.data?.some((badge) => badge.event_id === event.id) ?? false;
                const expired = !event.active || Boolean(event.ends_at && new Date(event.ends_at) <= new Date());
                return (
                  <Button
                    key={event.id}
                    type="button"
                    variant="outline"
                    disabled={owned || giveBadge.isPending}
                    onClick={() => giveBadge.mutate(event)}
                    className="h-auto min-h-20 justify-start gap-2 whitespace-normal p-2 text-left"
                    title={owned ? "Este usuário já possui o selo" : `Enviar ${event.name}`}
                  >
                    <img src={event.image_url} alt="" className="h-10 w-10 shrink-0 object-contain" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 block text-xs font-semibold">{event.name}</span>
                      <span className={`mt-1 flex items-center gap-1 text-[10px] ${owned ? "text-primary" : "text-muted-foreground"}`}>
                        {owned ? <><Check className="h-3 w-3" /> Recebido</> : expired ? "Evento encerrado" : "Evento ativo"}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
            {badgeEvents.data?.length === 0 ? <p className="py-3 text-xs text-muted-foreground">Nenhum selo cadastrado.</p> : null}
          </div>
        </div>
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-bold">Cargos</p>
          {ROLES.map((r) => (
            <label key={r.key} className="flex items-center justify-between text-sm">
              <span>
                <span className="font-semibold">{r.label}</span> <span className="text-xs text-muted-foreground">— {r.desc}</span>
              </span>
              <Switch
                disabled={isSelf && r.key === "admin"}
                checked={f.roles.includes(r.key)}
                onCheckedChange={(v) => setF({ ...f, roles: v ? [...f.roles, r.key] : f.roles.filter((x) => x !== r.key) })}
              />
            </label>
          ))}
        </div>
        <label className="flex items-center justify-between rounded-xl border border-destructive/40 p-3 text-sm">
          <span>
            <span className="font-semibold text-destructive">Bloquear conta</span>
            <span className="block text-xs text-muted-foreground">Impede de comentar no site.</span>
          </span>
          <Switch disabled={isSelf} checked={f.banned} onCheckedChange={(v) => setF({ ...f, banned: v })} />
        </label>
        <Button disabled={save.isPending} onClick={() => save.mutate()} className="w-full font-semibold">
          <Save className="mr-2 h-4 w-4" /> {save.isPending ? "Salvando…" : "Salvar conta"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
