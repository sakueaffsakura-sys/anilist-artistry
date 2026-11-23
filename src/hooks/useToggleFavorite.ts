import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { activeProfileId } from "@/lib/active-profile";

/** Favoritar / desfavoritar uma obra no perfil ativo (o coração das capas da home). */
export function useToggleFavorite() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => {
      if (!user) throw new Error("Entre na sua conta para favoritar.");
      const { error } = saved
        ? await supabase.from("favorites").delete().eq("user_id", user.id).eq("profile_id", activeProfileId()).eq("series_id", id)
        : await supabase.from("favorites").insert({ user_id: user.id, profile_id: activeProfileId(), series_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
      void queryClient.invalidateQueries({ queryKey: ["favorite-ids"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os favoritos."),
  });
  /** Chama a troca; sem login só avisa. */
  function toggle(id: string, saved: boolean) {
    if (!user) {
      toast.info("Entre na sua conta para favoritar.");
      return;
    }
    mutation.mutate({ id, saved });
  }
  return { toggle, pending: mutation.isPending };
}
