import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chapterNeighbors, emergencyVisible, visibleWorks } from "./emergency";

// Públicas de propósito: só entregam a cópia enquanto o banco está fora do ar. Com o banco no ar
// respondem apenas { databaseUp: true }, então login e perfil continuam obrigatórios normalmente.

export const getEmergencyState = createServerFn({ method: "GET" }).handler(async () => {
  const { isDatabaseUp, backupConfigured } = await import("./emergency.server");
  return { databaseUp: await isDatabaseUp(), configured: backupConfigured() };
});

export const getEmergencyIndex = createServerFn({ method: "GET" }).handler(async () => {
  const { isDatabaseUp, readBackupIndex } = await import("./emergency.server");
  if (await isDatabaseUp()) return { databaseUp: true as const };
  const index = await readBackupIndex();
  return { databaseUp: false as const, generated_at: index?.generated_at ?? null, works: index ? visibleWorks(index.works) : [] };
});

export const getEmergencyWork = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { isDatabaseUp, readBackupIndex, readBackupWorkChapters } = await import("./emergency.server");
    if (await isDatabaseUp()) return { databaseUp: true as const };
    const index = await readBackupIndex();
    const work = index?.works.find((w) => w.slug === data.slug || w.id === data.slug) ?? null;
    if (!work || !emergencyVisible(work.age_rating)) return { databaseUp: false as const, work: null, chapters: [] };
    const chapters = (await readBackupWorkChapters(work.id)).sort((a, b) => Number(b.number) - Number(a.number));
    return { databaseUp: false as const, work, chapters };
  });

export const getEmergencyChapter = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { isDatabaseUp, readBackupIndex, readBackupChapter, readBackupWorkChapters } = await import("./emergency.server");
    if (await isDatabaseUp()) return { databaseUp: true as const };
    const chapter = await readBackupChapter(data.id);
    const index = chapter ? await readBackupIndex() : null;
    const work = index?.works.find((w) => w.id === chapter?.series_id) ?? null;
    if (!chapter || !work || !emergencyVisible(work.age_rating)) return { databaseUp: false as const, chapter: null, work: null, prev: null, next: null };
    const { prev, next } = chapterNeighbors(await readBackupWorkChapters(work.id), chapter.id);
    return { databaseUp: false as const, chapter, work: { slug: work.slug, title: work.title, kind: work.kind }, prev, next };
  });

/** Painel: data da última cópia salva. Só administradores. */
export const getBackupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas administradores.");
    const { backupConfigured, readBackupIndex } = await import("./emergency.server");
    if (!backupConfigured()) return { configured: false as const };
    const index = await readBackupIndex();
    return { configured: true as const, generated_at: index?.generated_at ?? null, works: index?.works.length ?? 0, chapters: index?.chapters_saved ?? 0 };
  });
