// Arquivo de inicialização para cPanel ("Setup Node.js App" → Application startup file: app.cjs).
// Antes, rode: npm install && npm run build:cpanel
import("./.output/server/index.mjs").catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
