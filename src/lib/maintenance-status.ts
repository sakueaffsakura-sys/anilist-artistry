import { createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";
import { getMaintenanceStatus } from "./maintenance.functions";

export const maintenanceStatusSchema = z.object({
  enabled: z.boolean(), title: z.string(), message: z.string(),
  media_kind: z.enum(["image", "video"]), media_url: z.string(),
});

// SSR uses the server boundary. Browser reads must not depend on an
// authenticated RPC gateway or an expired viewer bearer token.
export const fetchMaintenanceStatus = createIsomorphicFn()
  .server(async () => maintenanceStatusSchema.parse(await getMaintenanceStatus()))
  .client(async () => {
    const response = await fetch("/api/public/maintenance", {
      cache: "no-store", credentials: "omit",
    });
    if (!response.ok) throw new Error("Não foi possível verificar a manutenção.");
    return maintenanceStatusSchema.parse(await response.json());
  });

export const maintenanceUnavailable = {
  enabled: true, title: "Voltamos em breve.",
  message: "Estamos preparando o próximo capítulo do Better Mangá. Obrigado por esperar.",
  media_kind: "image" as const, media_url: "",
};