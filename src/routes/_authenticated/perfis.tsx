import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { ProfilePicker } from "@/components/ProfilePicker";

export const Route = createFileRoute("/_authenticated/perfis")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Perfis · Better Mangá" }, { name: "description", content: "Escolha, crie e gerencie os perfis de leitura da sua conta." }] }),
  component: PerfisPage,
});

function PerfisPage() {
  const navigate = useNavigate();
  return <><SiteHeader /><ProfilePicker onDone={() => void navigate({ to: "/" })} /></>;
}
