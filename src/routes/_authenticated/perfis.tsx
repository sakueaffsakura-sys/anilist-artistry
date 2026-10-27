import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { ProfilePicker } from "@/components/ProfilePicker";

export const Route = createFileRoute("/_authenticated/perfis")({
  staticData: { sitemap: false },
  head: () => ({ meta: [
    { title: "Perfis · Better Mangá" },
    { name: "description", content: "Escolha, crie e gerencie os perfis de leitura da sua conta." },
    { property: "og:title", content: "Perfis · Better Mangá" },
    { property: "og:description", content: "Seus perfis e preferências de leitura no Better Mangá." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PerfisPage,
});

function PerfisPage() {
  const navigate = useNavigate();
  return <><SiteHeader /><ProfilePicker onDone={() => void navigate({ to: "/" })} /></>;
}
