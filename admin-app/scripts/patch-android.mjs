// Ajustes no projeto Android gerado pelo Capacitor (roda no GitHub, depois de "cap add android").
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const build = Number(process.env.BUILD_NUMBER) || 1;

// Versão: cada build do GitHub vira uma versão maior, para o Android aceitar a atualização.
const gradle = "android/app/build.gradle";
let g = readFileSync(gradle, "utf8");
g = g.replace(/versionCode\s+\d+/, `versionCode ${build}`).replace(/versionName\s+"[^"]*"/, `versionName "1.${build}"`);
writeFileSync(gradle, g);

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
const javaDir = dirname(main);

// Motor de envio nativo + serviço em primeiro plano + plugin (o envio continua com o app fechado).
const sources = readdirSync("android-src").filter((f) => f.endsWith(".java"));
for (const f of sources) {
  writeFileSync(join(javaDir, f), readFileSync(join("android-src", f), "utf8").replace("package __PKG__;", `package ${pkg};`));
}
console.log(`Código nativo copiado: ${sources.join(", ")}`);

writeFileSync(main, `package ${pkg};

import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private volatile boolean visible = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(EstudioPlugin.class);
        super.onCreate(savedInstanceState);
        // Tela acesa enquanto o app está aberto na frente.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        clearCacheAfterUpdate();
        protectRenderer();
    }

    /**
     * Em celulares com pouca memória (ex.: Galaxy A07) o Android encerra a parte do WebView quando o app
     * vai para trás. O envio roda no serviço nativo, então a tela pode ser encerrada à vontade: aqui ela
     * só é recriada (em vez de o app fechar) e, ao voltar, mostra o andamento que o serviço guardou.
     */
    private void protectRenderer() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Esta tela morreu: o serviço para de mandar eventos para ela (a próxima tela busca o que perdeu).
                EnvioService.listener = null;
                // Na frente: recria a tela. Atrás: só fecha (recriar em segundo plano gasta memória e o Android
                // encerraria de novo); o envio continua no serviço e a tela volta ao abrir o app.
                runOnUiThread(() -> { if (visible) recreate(); else finish(); });
                return true;
            }
        });
    }

    /** Depois de instalar uma versão nova, apaga o cache do WebView para não rodar os arquivos antigos. */
    private void clearCacheAfterUpdate() {
        try {
            long code = Build.VERSION.SDK_INT >= 28
                ? getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode()
                : getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            SharedPreferences prefs = getSharedPreferences("estudio", MODE_PRIVATE);
            if (prefs.getLong("lastVersionCode", -1) != code) {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().clearCache(true);
                    getBridge().getWebView().reload();
                }
                prefs.edit().putLong("lastVersionCode", code).apply();
            }
        } catch (Exception ignored) {
            // Sem limpeza: o carregamento com a versão no endereço dos arquivos já evita o cache.
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
        keepWebViewRunning();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewRunning();
    }

    /** Modo antigo (a tela envia): mantém o WebView trabalhando minimizado. O motor nativo não precisa. */
    private void keepWebViewRunning() {
        if (!EnvioService.running || !EnvioService.jsMode || getBridge() == null) return;
        WebView web = getBridge().getWebView();
        if (web == null) return;
        web.onResume();
        web.resumeTimers();
    }
}
`);

// Permissões e declaração do serviço.
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
].filter((p) => !m.includes(`"${p}"`)).map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
if (perms) m = m.replace(/<\/manifest>\s*$/, `${perms}\n</manifest>\n`);
if (!m.includes(".EnvioService")) {
  // specialUse (Android 14+): envio longo sem o limite diário de 6 h da sincronização de dados no Android 15.
  m = m.replace("</application>", `        <service android:name=".EnvioService" android:exported="false" android:stopWithTask="false" android:foregroundServiceType="dataSync|specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="Envio contínuo de capítulos ao site, escolhido pelo usuário, com notificação e botão Parar." />
        </service>\n    </application>`);
}
writeFileSync(manifestPath, m);

if (!m.includes("FOREGROUND_SERVICE_SPECIAL_USE") || !m.includes("specialUse")) throw new Error("Manifesto sem o serviço de uso especial");
console.log(`Android ajustado: versão 1.${build}, motor de envio nativo em primeiro plano.`);
