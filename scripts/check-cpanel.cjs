const { resolve } = require("node:path");
const { inspectCpanel } = require("./cpanel-runtime.cjs");
const result = inspectCpanel(resolve(__dirname, ".."));
for (const error of result.errors) console.error(`ERRO: ${error}`);
for (const warning of result.warnings) console.warn(`AVISO: ${warning}`);
if (!result.errors.length) console.log("Arquivos e variáveis essenciais presentes. Instalação real, login e leitura ainda precisam de teste na hospedagem.");
process.exitCode = result.errors.length ? 1 : 0;