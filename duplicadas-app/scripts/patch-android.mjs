// Ajustes no projeto Android gerado pelo Capacitor (roda no GitHub, depois de "cap add android").
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const build = Number(process.env.BUILD_NUMBER) || 1;

// Versão: cada build do GitHub vira uma versão maior, para o Android aceitar a atualização por cima.
const gradle = "android/app/build.gradle";
let g = readFileSync(gradle, "utf8");
g = g.replace(/versionCode\s+\d+/, `versionCode ${build}`).replace(/versionName\s+"[^"]*"/, `versionName "1.${build}"`);
writeFileSync(gradle, g);

// Tema preto também nas barras do Android (status e navegação) e no fundo da janela (sem clarão branco ao abrir).
const stylesPath = "android/app/src/main/res/values/styles.xml";
let st = readFileSync(stylesPath, "utf8");
const black = `
        <item name="android:statusBarColor">#000000</item>
        <item name="android:navigationBarColor">#000000</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowBackground">@android:color/black</item>`;
const before = st;
st = st.replace(/(<style name="AppTheme\.NoActionBar"[^>]*>)/, `$1${black}`);
if (st === before) throw new Error("styles.xml sem AppTheme.NoActionBar");
st = st.replace(/(<style name="AppTheme"[^>]*>)/, `$1${black}`);
writeFileSync(stylesPath, st);

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

// Plugin nativo de pedidos (o mesmo caminho do Estúdio, que funciona com a API da MediocreScan).
const javaDir = main.slice(0, main.lastIndexOf("/"));
for (const f of readdirSync("android-src").filter((x) => x.endsWith(".java"))) {
  writeFileSync(join(javaDir, f), readFileSync(join("android-src", f), "utf8").replace("package __PKG__;", `package ${pkg};`));
}

// Tela acesa enquanto o app está aberto: a leitura do catálogo roda na tela e pode levar vários minutos.
writeFileSync(main, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DupHttpPlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
`);
console.log(`Versão 1.${build}; MainActivity com a tela acesa e o plugin DupHttp (${pkg}).`);
