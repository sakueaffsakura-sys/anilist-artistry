import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { openSupportChat } from "@/components/SupportChat";

export const Route = createFileRoute("/privacidade")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Better Mangá" },
      {
        name: "description",
        content:
          "Saiba quais dados o Better Mangá coleta, como eles são usados e quais são os seus direitos de privacidade.",
      },
      { property: "og:title", content: "Política de Privacidade — Better Mangá" },
      {
        property: "og:description",
        content: "Quais dados coletamos, como usamos e como você pode exercer seus direitos.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://bettermanga.net/privacidade" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://bettermanga.net/privacidade" }],
  }),
  component: Privacidade,
});

type Section = { title: string; paragraphs: string[] };

const SECTIONS: Section[] = [
  {
    title: "1. Quem somos",
    paragraphs: [
      "O Better Mangá (https://bettermanga.net) é uma plataforma de leitura de mangás, manhwas, manhuas e comics. Esta política explica quais dados tratamos, por quê e quais são os seus direitos.",
    ],
  },
  {
    title: "2. Dados que coletamos",
    paragraphs: [
      "Dados de conta: ao criar uma conta, guardamos o e-mail informado (ou o e-mail vinculado ao login com Google) e o perfil que você monta — nome de usuário, avatar e descrição, quando você os preenche.",
      "Dados de uso da plataforma: suas obras favoritas, listas criadas, histórico e progresso de leitura, comentários, reações e pedidos de obras. Esses dados existem para que as funções do site funcionem para você.",
      "Dados técnicos: informações básicas de sessão e segurança, como registros de acesso usados para proteger a plataforma contra abusos.",
    ],
  },
  {
    title: "3. Como usamos os dados",
    paragraphs: [
      "Usamos seus dados para manter sua conta, salvar seu progresso de leitura, personalizar recomendações, responder pedidos de suporte e enviar notificações dentro do site sobre obras e capítulos que você acompanha.",
      "Não vendemos seus dados pessoais e não usamos seus dados para publicidade fora da plataforma.",
    ],
  },
  {
    title: "4. Compartilhamento",
    paragraphs: [
      "Seu perfil público (nome de usuário, avatar e conteúdo que você publica, como comentários e listas) fica visível para outros visitantes do site, conforme as configurações do seu perfil.",
      "Provedores de infraestrutura processam dados em nosso nome apenas para operar o serviço: autenticação (incluindo login com Google, quando você escolhe essa opção), hospedagem e armazenamento. Cada um só recebe o necessário para a função que executa.",
    ],
  },
  {
    title: "5. Armazenamento e segurança",
    paragraphs: [
      "Os dados ficam armazenados em servidores com controle de acesso restrito. Aplicamos regras que impedem que visitantes ou outras contas acessem informações privadas de usuários.",
      "Senhas de contas criadas por e-mail são guardadas apenas em forma criptografada; quem faz login com Google não cria senha no site.",
    ],
  },
  {
    title: "6. Cookies e armazenamento local",
    paragraphs: [
      "Usamos cookies e armazenamento local essenciais para manter você conectado e lembrar preferências da interface, como o tema do site. Não usamos cookies de rastreamento de terceiros para publicidade.",
    ],
  },
  {
    title: "7. Seus direitos",
    paragraphs: [
      "Você pode, a qualquer momento: editar ou remover informações do seu perfil, excluir listas, comentários e favoritos, e solicitar a exclusão da sua conta e dos dados associados.",
      "Para pedir uma cópia dos seus dados, correção ou exclusão da conta, fale com nosso suporte pelo chat do site. Atendemos pedidos conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).",
    ],
  },
  {
    title: "8. Menores de idade",
    paragraphs: [
      "A plataforma não é direcionada a crianças. Não criamos intencionalmente contas para menores de 13 anos; se identificarmos uma conta nesse caso, os dados serão removidos.",
    ],
  },
  {
    title: "9. Alterações desta política",
    paragraphs: [
      "Esta política pode ser atualizada para refletir mudanças no serviço. A data da última revisão aparece no topo da página e mudanças relevantes serão comunicadas no site.",
    ],
  },
];

const UPDATED = "12 de outubro de 2026";

function Privacidade() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
            <ScrollText className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-foreground md:text-3xl">Política de Privacidade</h1>
            <p className="text-xs text-muted-foreground">Última atualização: {UPDATED}</p>
          </div>
        </div>

        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <section key={section.title} className="rounded-xl border border-foreground/10 bg-surface-2/60 p-5 md:p-6">
              <h2 className="mb-3 text-base font-semibold text-foreground md:text-lg">{section.title}</h2>
              <div className="space-y-2.5">
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-sm leading-relaxed text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-primary/25 bg-primary/5 p-5 text-center md:p-6">
          <p className="text-sm text-muted-foreground">
            Dúvidas sobre privacidade ou pedidos sobre seus dados?{" "}
            <button
              type="button"
              onClick={openSupportChat}
              className="font-semibold text-primary underline-offset-4 transition-colors hover:underline"
            >
              Fale com o suporte
            </button>
            .
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
