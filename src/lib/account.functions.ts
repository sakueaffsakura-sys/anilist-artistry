import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Exclui permanentemente a conta do usuário autenticado (exigência da Play Store).
// O usuário só pode apagar a própria conta: o ID vem do token validado, nunca do cliente.
export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error("Não foi possível excluir a conta. Tente novamente.");
    return { ok: true };
  });
