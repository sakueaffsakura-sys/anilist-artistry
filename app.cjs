// Passenger entry. Resolve from this file, not the working directory chosen by cPanel.
const { pathToFileURL } = require("node:url");
const { inspectCpanel } = require("./scripts/cpanel-runtime.cjs");

async function startCpanel(root = __dirname) {
  const result = inspectCpanel(root);
  if (result.errors.length) throw new Error(result.errors.join("\n"));
  process.env.NODE_ENV = "production";
  // Passenger controls listening; never replace its supplied PORT with a fixed port.
  if (process.env.PORT) process.env.NITRO_PORT = process.env.PORT;
  return import(pathToFileURL(result.entry).href);
}

if (require.main === module) {
  startCpanel().catch(() => {
    // Only report known setup errors; arbitrary exception objects can contain credentials.
    const result = inspectCpanel(__dirname);
    console.error(result.errors.length ? result.errors.join("\n") : "Falha ao iniciar o servidor. Verifique os registros privados do aplicativo no cPanel.");
    process.exitCode = 1;
  });
}
module.exports = { startCpanel };
