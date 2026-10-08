const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

function inspectCpanel(root, env = process.env, version = process.versions.node) {
  const errors = [];
  // Vite 8 requires Node 22.12+ on the supported Node 22 line.
  const [major, minor] = version.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) errors.push("Use Node.js 22.12 ou superior.");
  const entry = resolve(root, ".output/server/index.mjs");
  if (!existsSync(entry)) errors.push("Versão Node ausente: execute npm run build:cpanel fora do editor Lovable.");
  if (!existsSync(resolve(root, ".output/public"))) errors.push("Arquivos públicos ausentes: envie toda a pasta .output, incluindo public.");
  for (const name of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"]) {
    if (!env[name]?.trim()) errors.push(`Configure ${name} nas variáveis do aplicativo cPanel.`);
  }
  const warnings = [];
  if (!env.SUPABASE_SERVICE_ROLE_KEY) warnings.push("Sem credencial administrativa do banco próprio, mídia privada de manutenção e algumas funções administrativas não funcionarão.");
  if (!env.FISH_AUDIO_API_KEY) warnings.push("Fish Audio indisponível sem chave própria; a voz do aparelho continua disponível.");
  if (!env.LOVABLE_API_KEY) warnings.push("A narração pelo serviço Lovable não estará disponível fora daqui sem configuração compatível.");
  return { entry, errors, warnings };
}

module.exports = { inspectCpanel };