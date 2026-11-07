import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, ChevronDown, ListPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { STATUSES } from "@/components/LibraryBits";

export function StatusButton({ userId, seriesId }: { userId: string; seriesId: string }) {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["status", seriesId, userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("reading_status")
        .select("status")
        .eq("user_id", userId)
        .eq("series_id", seriesId)
        .maybeSingle();
      return data?.status ?? null;
    },
  });
  const set = useMutation({
    mutationFn: async (value: string | null) => {
      if (!value) {
        { const { error: dbErr } = await supabase.from("reading_status").delete().eq("user_id", userId).eq("series_id", seriesId); if (dbErr) throw dbErr; }
      } else {
        const { error } = await supabase
          .from("reading_status")
          .upsert({ user_id: userId, series_id: seriesId, status: value, updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["status", seriesId] });
      qc.invalidateQueries({ queryKey: ["col-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });
  const current = STATUSES.find((s) => s.key === status.data);
  const Icon = current?.icon ?? BookOpen;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="h-10">
          <Icon className="h-4 w-4 text-primary" /> {current?.label ?? "Status de leitura"}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s.key} onClick={() => set.mutate(s.key)} className="gap-2">
            <s.icon className="h-4 w-4" /> {s.label}
            {status.data === s.key ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        {status.data ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => set.mutate(null)}>Remover status</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AddToListButton({ userId, seriesId }: { userId: string; seriesId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const lists = useQuery({
    queryKey: ["my-lists", userId, seriesId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lists")
        .select("id, title, list_items(series_id)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id,
        title: l.title,
        has: (l.list_items ?? []).some((i) => i.series_id === seriesId),
      }));
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ id, has }: { id: string; has: boolean }) => {
      if (has) { const { error: dbErr } = await supabase.from("list_items").delete().eq("list_id", id).eq("series_id", seriesId); if (dbErr) throw dbErr; }
      else {
        const { error } = await supabase.from("list_items").insert({ list_id: id, series_id: seriesId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-lists", userId, seriesId] });
      qc.invalidateQueries({ queryKey: ["lists"] });
    },
  });
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className="h-10">
          <ListPlus className="h-4 w-4" /> Adicionar à lista
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {(lists.data ?? []).map((l) => (
          <DropdownMenuItem
            key={l.id}
            onSelect={(e) => {
              e.preventDefault();
              toggle.mutate({ id: l.id, has: l.has });
            }}
          >
            <span className="truncate">{l.title}</span>
            {l.has ? <Check className="ml-auto h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        {lists.data?.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Você ainda não tem listas.</p>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/listas">Criar nova lista</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
