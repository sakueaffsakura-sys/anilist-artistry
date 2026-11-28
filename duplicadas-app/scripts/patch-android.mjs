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

// MainActivity: plugin DupHttp; se o Android encerrar a parte do WebView (pouca memória), recria a tela em vez de
// fechar o app — a procura roda no serviço nativo e continua de qualquer jeito.
writeFileSync(main, `package ${pkg};

import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private volatile boolean visible = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DupHttpPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null) {
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    runOnUiThread(() -> { if (visible) recreate(); else finish(); });
                    return true;
                }
            });
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        visible = true;
    }

    @Override
    public void onPause() {
        visible = false;
        super.onPause();
    }
}
`);

// Permissões e declaração do serviço da procura em segundo plano, do vigia e do religamento.
const manifestPath = "android/app/src/main/AndroidManifest.xml";
let m = readFileSync(manifestPath, "utf8");
const perms = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
  "android.permission.ACCESS_WIFI_STATE",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.WAKE_LOCK",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.RECEIVE_BOOT_COMPLETED",
].filter((p) => !m.includes(`"${p}"`)).map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
if (perms) m = m.replace(/<\/manifest>\s*$/, `${perms}\n</manifest>\n`);
if (!m.includes(".DupBgService")) {
  // specialUse (Android 14+): procura longa sem o limite diário de 6 h da sincronização de dados no Android 15.
  m = m.replace("</application>", `        <service android:name=".DupBgService" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="dataSync|specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Procura contínua de obras duplicadas no catálogo, ligada pelo usuário, com notificação e botão Parar." />
        </service>
        <service android:name=".DupBgWatch" android:permission="android.permission.BIND_JOB_SERVICE" android:exported="false" />
        <receiver android:name=".DupBgBoot" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
    </application>`);
}
writeFileSync(manifestPath, m);
if (!m.includes("FOREGROUND_SERVICE_SPECIAL_USE") || !m.includes(".DupBgService") || !m.includes(".DupBgWatch") || !m.includes(".DupBgBoot")) {
  throw new Error("Manifesto sem o serviço da procura em segundo plano");
}
console.log(`Versão 1.${build}; plugin DupHttp e procura em segundo plano (${pkg}).`);
