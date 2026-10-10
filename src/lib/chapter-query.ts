import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Content is fetched independently from the lightweight work/chapter index. */
export function chapterQueryOptions(chapterId: string) {
  return queryOptions({
    queryKey: ["chapter-content", chapterId],
    queryFn: async () => {
      const { data, error } = await supabase.from("chapters")
        .select("id, pages, content")
        .eq("id", chapterId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}