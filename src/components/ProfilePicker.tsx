import { useState } from "react";
import { Baby, Lock, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles, type AccountProfile } from "@/hooks/use-profiles";
import { MAIN_PROFILE_ID, MAX_PROFILES, type KidsMaxAge } from "@/lib/active-profile";
import { cn } from "@/lib/utils";

const COLORS = ["orange", "blue", "green", "pink", "purple", "yellow"] as const;
const COLOR_CLASS: Record<string, string> = {
  orange: "bg-profile-orange", blue: "bg-profile-blue", green: "bg-profile-green",
  pink: "bg-profile-pink", purple: "bg-profile-purple", yellow: "bg-profile-yellow",
};
const KIDS_LABEL: Record<KidsMaxAge, string> = { L: "Só Livre", "10": "Até 10 anos", "12": "Até 12 anos" };

export function ProfileAvatar({ profile, size = "lg" }: { profile: Pick<AccountProfile, "name" | "color" | "kidsMaxAge">; size?: "sm" | "lg" }) {
  return (
    <span className={cn("relative inline-flex items-center justify-center rounded-2xl font-display font-extrabold text-primary-foreground shadow-lg",
      COLOR_CLASS[profile.color] ?? "bg-primary", size === "lg" ? "h-24 w-24 text-4xl sm:h-28 sm:w-28" : "h-7 w-7 rounded-lg text-xs")}>
      {profile.name.trim().charAt(0).toUpperCase()}
      {profile.kidsMaxAge && size === "lg" ? <Baby className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full bg-background p-1 text-primary" /> : null}
    </span>
  );
}

export function ProfilePicker({ onDone }: { onDone?: () => void }) {
  const { profiles, active, switchTo, refresh } = useProfiles();
  const [manage, setManage] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pinFor, setPinFor] = useState<AccountProfile | null>(null);
  const [pin, setPin] = useState("");

  const choose = async (profile: AccountProfile, typed?: string) => {
    if (profile.hasPin && profile.id !== active.id && typed === undefined) { setPinFor(profile); setPin(""); return; }
    try { await switchTo(profile, typed); setPinFor(null); toast.success(`Perfil ${profile.name}`); onDone?.(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível trocar."); }
  };
  const remove = async (profile: AccountProfile) => {
    if (!confirm(`Apagar o perfil ${profile.name}? O histórico e os favoritos dele serão apagados.`)) return;
    const { error } = await supabase.from("account_profiles").delete().eq("id", profile.id);
    if (error) return toast.error(error.message);
    if (active.id === profile.id) await switchTo(profiles[0]!);
    void refresh();
  };
  const changePin = async (profile: AccountProfile) => {
    const value = prompt(profile.hasPin ? "Novo PIN de 4 números (deixe vazio para remover):" : "PIN de 4 números:");
    if (value === null) return;
    const { error } = await supabase.rpc("set_profile_pin", { _profile: profile.id === MAIN_PROFILE_ID ? null : profile.id, _pin: value.trim() || null } as never);
    if (error) return toast.error(error.message);
    toast.success(value.trim() ? "PIN salvo." : "PIN removido."); void refresh();
  };

  if (creating) return <CreateProfile onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void refresh(); }} />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-10 px-4 py-12 text-center">
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{manage ? "Gerenciar perfis" : "Quem está lendo?"}</h1>
      <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
        {profiles.map((profile) => (
          <div key={profile.id} className="flex w-28 flex-col items-center gap-3">
            <button type="button" onClick={() => manage ? void changePin(profile) : void choose(profile)}
              className={cn("rounded-2xl ring-offset-4 ring-offset-background transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", active.id === profile.id && !manage && "ring-2 ring-primary")}
              aria-label={manage ? `Definir PIN de ${profile.name}` : `Entrar como ${profile.name}`}>
              <ProfileAvatar profile={profile} />
            </button>
            <span className="flex items-center gap-1 text-sm font-semibold">{profile.hasPin ? <Lock className="h-3 w-3 text-muted-foreground" /> : null}{profile.name}</span>
            {profile.kidsMaxAge ? <span className="text-xs text-primary">Infantil · {KIDS_LABEL[profile.kidsMaxAge]}</span> : null}
            {manage && profile.id !== MAIN_PROFILE_ID ? (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove(profile)}><Trash2 className="mr-1 h-3.5 w-3.5" /> Apagar</Button>
            ) : null}
          </div>
        ))}
        {profiles.length < MAX_PROFILES && !manage ? (
          <div className="flex w-28 flex-col items-center gap-3">
            <button type="button" onClick={() => setCreating(true)} aria-label="Adicionar perfil"
              className="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted-foreground transition hover:border-primary hover:text-primary sm:h-28 sm:w-28">
              <Plus className="h-10 w-10" />
            </button>
            <span className="text-sm text-muted-foreground">Adicionar</span>
          </div>
        ) : null}
      </div>
      {manage ? <p className="text-sm text-muted-foreground">Toque num perfil para criar, trocar ou remover o PIN.</p> : null}
      <Button variant="outline" onClick={() => setManage(!manage)}><Pencil className="mr-2 h-4 w-4" />{manage ? "Concluir" : "Gerenciar perfis"}</Button>
      <p className="text-xs text-muted-foreground">{profiles.length}/{MAX_PROFILES} perfis</p>

      {pinFor ? (
        <form className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur" onSubmit={(e) => { e.preventDefault(); void choose(pinFor, pin); }}>
          <div className="w-full max-w-xs space-y-4 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between"><h2 className="font-display text-lg font-bold">PIN de {pinFor.name}</h2>
              <button type="button" aria-label="Fechar" onClick={() => setPinFor(null)}><X className="h-4 w-4" /></button></div>
            <Input autoFocus inputMode="numeric" maxLength={4} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-label="PIN" className="text-center text-2xl tracking-[0.5em]" />
            <Button type="submit" className="w-full" disabled={pin.length !== 4}>Entrar</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function CreateProfile({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("blue");
  const [kids, setKids] = useState<boolean | null>(null);
  const [maxAge, setMaxAge] = useState<KidsMaxAge>("L");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || kids === null) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("account_profiles")
        .insert({ name: name.trim(), color, kids_max_age: kids ? maxAge : null } as never).select("id").single();
      if (error) throw error;
      if (pin.length === 4) {
        const res = await supabase.rpc("set_profile_pin", { _profile: (data as { id: string }).id, _pin: pin } as never);
        if (res.error) throw res.error;
      }
      toast.success("Perfil criado."); onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível criar."); }
    finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-12">
      <h1 className="font-display text-3xl font-extrabold">Novo perfil</h1>
      <div className="flex justify-center"><ProfileAvatar profile={{ name: name || "?", color, kidsMaxAge: kids ? maxAge : null }} /></div>
      <Input autoFocus maxLength={30} placeholder="Nome do perfil" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do perfil" />
      <div className="flex justify-center gap-3">
        {COLORS.map((c) => <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setColor(c)} className={cn("h-9 w-9 rounded-full", COLOR_CLASS[c], color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background")} />)}
      </div>
      <fieldset className="space-y-3 rounded-2xl border border-border p-4">
        <legend className="px-1 font-display font-bold">Quer que seja um perfil infantil?</legend>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={kids === true ? "default" : "outline"} onClick={() => setKids(true)}><Baby className="mr-2 h-4 w-4" /> Sim, infantil</Button>
          <Button type="button" variant={kids === false ? "default" : "outline"} onClick={() => setKids(false)}>Não</Button>
        </div>
        {kids ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Quais obras esse perfil pode ver?</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(KIDS_LABEL) as KidsMaxAge[]).map((age) => (
                <Button key={age} type="button" size="sm" variant={maxAge === age ? "default" : "outline"} onClick={() => setMaxAge(age)}>{KIDS_LABEL[age]}</Button>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>
      <div className="space-y-1">
        <label className="text-sm font-semibold" htmlFor="new-pin">PIN (opcional, 4 números)</label>
        <Input id="new-pin" inputMode="numeric" maxLength={4} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        <Button className="flex-1" disabled={busy || !name.trim() || kids === null || (pin.length > 0 && pin.length !== 4)} onClick={() => void save()}>{busy ? "Criando…" : "Criar perfil"}</Button>
      </div>
    </div>
  );
}

/** Full-screen chooser shown once after sign-in when the account has several profiles. */
export function ProfileGate() {
  const { needsPick } = useProfiles();
  if (!needsPick) return null;
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-background"><ProfilePicker /></div>;
}
