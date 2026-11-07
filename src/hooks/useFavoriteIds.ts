import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useAuth";
import { useActiveProfile } from "@/lib/active-profile";

const EMPTY: ReadonlySet<string> = new Set<string>();

/**
 * Ids das obras favoritas do perfil ativo (um pedido leve, compartilhado por todos os cartões da página),
 * para o coração de cada capa mostrar o estado certo e não tentar favoritar duas vezes.
 */
export function useFavoriteIds(): ReadonlySet<string> {
  const { user } = useSession();
  const profile = useActiveProfile();
  const query = useQuery({
    queryKey: ["favorite-ids", user?.id, profile.id],
    enabled: Boolean(user),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("favorites")
        .select("series_id")
        .eq("user_id", user!.id)
        .eq("profile_id", profile.id);
      if (error) throw error;
      return new Set((data ?? []).map((row) => row.series_id as string)) as ReadonlySet<string>;
    },
  });
  return query.data ?? EMPTY;
}
