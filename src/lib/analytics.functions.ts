import { createServerFn } from "@tanstack/react-start";

// Measurement IDs are public by design (they ship in every gtag page); only the ID is returned.
export const getAnalyticsId = createServerFn({ method: "GET" }).handler(async () => {
  const id = process.env["GOOGLE_ANALYTICS_MEASUREMENT_ID"]?.trim() ?? "";
  return { id: /^G-[A-Z0-9]+$/i.test(id) ? id : null };
});
