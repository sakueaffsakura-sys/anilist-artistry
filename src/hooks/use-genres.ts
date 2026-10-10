import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GENRES, normalizeGenres } from "@/lib/work-genres";

export function useGenres() {
  return useQuery({
    queryKey: ["all-genres"],
    queryFn: async () => {
      const [works, custom] = await Promise.all([
        supabase.from("series").select("genres").eq("published", true),
        supabase.from("custom_genres").select("name").order("name"),
      ]);
      if (works.error) throw works.error;
      if (custom.error) throw custom.error;
      const dynamicGenres = (works.data ?? []).flatMap((r) => r.genres ?? []);
      return normalizeGenres([...GENRES, ...dynamicGenres, ...(custom.data ?? []).map((r) => r.name)]).sort((a, b) => 
        a.localeCompare(b, "pt-BR")
      );
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}
