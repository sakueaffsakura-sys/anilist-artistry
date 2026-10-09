import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GENRES, normalizeGenres } from "@/lib/work-genres";

export function useGenres() {
  return useQuery({
    queryKey: ["all-genres"],
    queryFn: async () => {
      const { data } = await supabase.from("series").select("genres").eq("published", true);
      const dynamicGenres = (data ?? []).flatMap((r) => r.genres ?? []);
      return normalizeGenres([...GENRES, ...dynamicGenres]).sort((a, b) => 
        a.localeCompare(b, "pt-BR")
      );
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}
