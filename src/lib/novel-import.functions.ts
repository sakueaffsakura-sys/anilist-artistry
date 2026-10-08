import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { extractChapter } from "@/lib/novel-content";
export { extractChapter, prepareChapterText } from "@/lib/novel-content";

export const importNovelChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Sem permissão.");
    const { fetchNovelHtml } = await import("./novel-fetch.server");
    let html: string;
    try {
      html = await fetchNovelHtml(data.url);
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Não foi possível abrir o link." };
    }
    const result = extractChapter(html, data.url);
    if (result.content.length < 50)
      return {
        ok: false as const,
        error: "O site carrega o texto só no navegador. Abra o capítulo, copie o texto (ou salve a página) e cole aqui.",
      };
    return { ok: true as const, ...result };
  });

