import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classificationSnapshotSchema, reviewClassificationSchema, classificationUpdate } from "./work-classification";
import { GENRES } from "./work-genres";

export const approveWorkClassification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ work: classificationSnapshotSchema, suggestion: reviewClassificationSchema.shape.works.element, mode: z.enum(["missing", "review"]) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: admin, error: roleError } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Somente administradores podem aprovar classificações.");
    const { data: custom, error: genreError } = await supabase.from("custom_genres").select("name");
    if (genreError) throw new Error("Não foi possível conferir os gêneros permitidos.");
    const changes = classificationUpdate(data.work, data.suggestion, [...GENRES, ...(custom ?? []).map((genre) => genre.name)], data.mode);
    if (!changes) return { saved: false, message: "Não há alteração segura para salvar." };
    if (data.work.kind === "Novel") throw new Error("Novels permanecem no painel próprio.");
    const { data: saved, error } = await supabase.from("series").update(changes)
      .eq("id", data.work.id).eq("updated_at", data.work.updated_at).eq("kind", data.work.kind)
      .contains("genres", data.work.genres).containedBy("genres", data.work.genres)
      .filter("age_rating", data.work.age_rating === null ? "is" : "eq", data.work.age_rating)
      .select("id").maybeSingle();
    if (error) throw new Error("Não foi possível salvar esta classificação.");
    return { saved: Boolean(saved), message: saved ? "Classificação aprovada e salva." : "A obra mudou desde a análise. Analise novamente antes de salvar." };
  });