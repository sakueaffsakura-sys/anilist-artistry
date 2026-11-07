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

// Serviço em primeiro plano + plugin (envio continua com o app minimizado ou a tela apagada).
for (const f of ["EnvioService.java", "EstudioPlugin.java"]) {
  writeFileSync(join(javaDir, f), readFileSync(join("android-src", f), "utf8").replace("package __PKG__;", `package ${pkg};`));
}

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
     * Em celulares com pouca memória (ex.: Galaxy A07) o Android mata a parte do WebView que roda o
     * envio quando o app vai para trás, e o app inteiro reinicia. Aqui: o WebView fica com prioridade
     * alta mesmo fora da tela e, se ainda assim for encerrado, a tela é recriada em vez de fechar o app
     * (o envio continua sozinho de onde parou).
     */
    private void protectRenderer() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        if (Build.VERSION.SDK_INT >= 26) {
            try { getBridge().getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); } catch (Exception ignored) { }
        }
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                runOnUiThread(() -> recreate());
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
    public void onPause() {
        super.onPause();
        keepWebViewRunning();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewRunning();
    }

    /** Durante um envio, o app continua trabalhando mesmo minimizado. */
    private void keepWebViewRunning() {
        if (!EnvioService.running || getBridge() == null) return;
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
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.WAKE_LOCK",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
].filter((p) => !m.includes(`"${p}"`)).map((p) => `    <uses-permission android:name="${p}" />`).join("\n");
if (perms) m = m.replace(/<\/manifest>\s*$/, `${perms}\n</manifest>\n`);
if (!m.includes(".EnvioService")) {
  m = m.replace("</application>", `        <service android:name=".EnvioService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>`);
}
writeFileSync(manifestPath, m);

console.log(`Android ajustado: versão 1.${build}, envio em segundo plano com notificação.`);
