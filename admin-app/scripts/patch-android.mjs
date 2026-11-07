// Ajustes no projeto Android gerado pelo Capacitor (roda no GitHub, depois de "cap add android").
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const build = Number(process.env.BUILD_NUMBER) || 1;

// Versão: cada build do GitHub vira uma versão maior, para o Android aceitar a atualização.
const gradle = "android/app/build.gradle";
let g = readFileSync(gradle, "utf8");
g = g.replace(/versionCode\s+\d+/, `versionCode ${build}`).replace(/versionName\s+"[^"]*"/, `versionName "1.${build}"`);
writeFileSync(gradle, g);

// Tela acesa enquanto o app está aberto: o envio leva minutos e não pode parar com a tela apagada.
function find(dir, name) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { const r = find(p, name); if (r) return r; }
    else if (f === name) return p;
  }
  return null;
}
const main = find("android/app/src/main/java", "MainActivity.java");
if (!main) throw new Error("MainActivity.java não encontrado");
const pkg = /package\s+([\w.]+);/.exec(readFileSync(main, "utf8"))[1];
writeFileSync(main, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
`);
console.log(`Android ajustado: versão 1.${build}, tela acesa durante o uso.`);
