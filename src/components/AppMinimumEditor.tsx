import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { appMinimumSchema } from "@/lib/app-versions";

export interface AppMinimumEditorProps {
  release: { id: string; version_code: number; version_name: string; minimum_version_code: number };
  disabled?: boolean;
}

export function AppMinimumEditor({ release, disabled }: AppMinimumEditorProps) {
  const id = useId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minimum, setMinimum] = useState(String(release.minimum_version_code));
  const save = useMutation({ mutationFn: async () => {
    const parsed = appMinimumSchema.safeParse({ version_code: release.version_code, minimum_version_code: Number(minimum) });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Confira o código mínimo.");
    // Change only this field: APK, publication status and release identity remain untouched.
    const { data, error } = await supabase.from("app_releases")
      .update({ minimum_version_code: parsed.data.minimum_version_code })
      .eq("id", release.id).eq("version_code", release.version_code).select("id");
    if (error || !data?.length) throw new Error("Não foi possível salvar. Confirme seu acesso administrativo e tente novamente.");
  }, onSuccess: () => {
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["admin-app-releases"] });
    void qc.invalidateQueries({ queryKey: ["admin-app-version-status"] });
    toast.success("Versão mínima atualizada.");
  } });
  return <>
    <Button variant="ghost" size="icon" title="Editar versão mínima" aria-label={`Editar versão mínima de ${release.version_name}`} disabled={disabled} onClick={() => {
      setMinimum(String(release.minimum_version_code)); save.reset(); setOpen(true);
    }}><Pencil className="h-4 w-4" /></Button>
    <Dialog open={open} onOpenChange={(value) => { if (!save.isPending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Versão mínima · {release.version_name}</DialogTitle>
          <DialogDescription>Código do APK: {release.version_code}. O maior mínimo entre as versões publicadas determina quais versões são bloqueadas.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <div className="space-y-2"><Label htmlFor={id}>Código mínimo aceito</Label><Input id={id} type="number" min="1" max={release.version_code} step="1" value={minimum} required disabled={save.isPending} onChange={(event) => setMinimum(event.target.value)} /></div>
          <p className="text-sm text-muted-foreground">Aumentar o mínimo pode bloquear leitores imediatamente. Reduzir pode liberar versões antigas.</p>
          {save.isError ? <p role="alert" className="text-sm text-destructive">{save.error.message}</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" disabled={save.isPending}><Save className="h-4 w-4" />{save.isPending ? "Salvando…" : "Salvar mínimo"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}