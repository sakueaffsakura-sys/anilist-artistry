package __PKG__;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Pedidos à API da MediocreScan pelo mesmo caminho que o Estúdio usa no celular (HttpURLConnection, sem o
 * User-Agent do navegador): só aceita endereços da API, manda o token no cabeçalho e devolve status e texto.
 * cover(url): confere uma capa (abre a imagem aqui no Android e devolve só as medidas e o hash, sem o arquivo).
 * bg*: procura em segundo plano (serviço DupBgService com o motor DupEngine), que continua com o app fechado.
 */
@CapacitorPlugin(name = "DupHttp")
public class DupHttpPlugin extends Plugin {
    static final String API = "https://api.mediocretoons.net/";
    /** Capas (só com binary=true): imagem em base64, para o app calcular o hash da capa. */
    static final String CDN = "https://cdn.mediocrescan.com/";
    static final int MAX_BODY = 12 * 1024 * 1024;

    @PluginMethod
    public void get(final PluginCall call) {
        final String url = call.getString("url", "");
        final String token = call.getString("token", "");
        final boolean binary = Boolean.TRUE.equals(call.getBoolean("binary", false));
        boolean allowed = url != null && (url.startsWith(API) || (binary && url.startsWith(CDN)));
        if (!allowed || url.length() > 800 || url.matches(".*\\s.*")) {
            call.reject("Endereço inválido.");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                long t0 = System.currentTimeMillis();
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(20_000);
                    c.setReadTimeout(45_000);
                    c.setInstanceFollowRedirects(true);
                    c.setUseCaches(false);
                    c.setRequestProperty("Accept", binary ? "image/*" : "application/json");
                    c.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7");
                    String t = token == null ? "" : token.trim().replaceFirst("(?i)^Bearer\\s+", "");
                    if (!t.isEmpty() && !binary) c.setRequestProperty("Authorization", "Bearer " + t);
                    int status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    JSObject o = new JSObject();
                    o.put("status", status);
                    if (binary) {
                        byte[] bytes = in == null ? new byte[0] : readBytes(in, 4 * 1024 * 1024);
                        o.put("body", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
                        o.put("type", c.getContentType());
                    } else o.put("body", in == null ? "" : read(in));
                    o.put("ms", System.currentTimeMillis() - t0);
                    call.resolve(o);
                } catch (Exception e) {
                    call.reject("Sem conexão com a MediocreScan (" + e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "") + ").");
                } finally {
                    if (c != null) {
                        try { c.disconnect(); } catch (Exception ignored) { /* já encerrada */ }
                    }
                }
            }
        }, "duplicadas-http").start();
    }

    /** Endereços de capa aceitos: só da MediocreScan (site, CDN ou API). */
    static final String COVER_HOSTS = "^https://([a-z0-9-]+\\.)*(mediocrescan\\.com|mediocretoons\\.net)/\\S{1,780}$";
    static final int MAX_IMAGE = 8 * 1024 * 1024;

    /**
     * Confere uma capa: baixa a imagem (até 8 MB, sem o token), tenta abrir como imagem e devolve
     * {s: status, t: tipo, b: bytes, w, h, std: variação de brilho 0–128, hash: dHash 9×8 em 16 hexadecimais, ok, err, ms}.
     * Sem conexão: s = 0 (o app tenta de novo depois).
     */
    @PluginMethod
    public void cover(final PluginCall call) {
        final String url = call.getString("url", "");
        if (url == null || !url.matches(COVER_HOSTS)) {
            call.reject("Endereço inválido.");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                long t0 = System.currentTimeMillis();
                HttpURLConnection c = null;
                JSObject o = new JSObject();
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(20_000);
                    c.setReadTimeout(30_000);
                    c.setInstanceFollowRedirects(true);
                    c.setUseCaches(false);
                    c.setRequestProperty("Accept", "image/avif,image/webp,image/*,*/*;q=0.8");
                    c.setRequestProperty("Referer", "https://mediocrescan.com/");
                    int status = c.getResponseCode();
                    String type = c.getContentType();
                    o.put("s", status);
                    o.put("t", type == null ? "" : type);
                    if (status >= 200 && status < 300) {
                        InputStream in = c.getInputStream();
                        try {
                            byte[] bytes = in == null ? new byte[0] : readBytes(in, MAX_IMAGE);
                            o.put("b", bytes.length);
                            for (Map.Entry<String, Object> m : DupImages.measureBytes(bytes).entrySet()) o.put(m.getKey(), m.getValue());
                        } catch (IOException big) {
                            o.put("ok", false);
                            o.put("err", "imagem grande demais (mais de 8 MB)");
                        }
                    } else {
                        InputStream err = c.getErrorStream();
                        if (err != null) err.close();
                        o.put("ok", false);
                    }
                } catch (Exception e) {
                    o.put("s", 0);
                    o.put("ok", false);
                    o.put("err", e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : ""));
                } finally {
                    if (c != null) {
                        try { c.disconnect(); } catch (Exception ignored) { /* já encerrada */ }
                    }
                }
                o.put("ms", System.currentTimeMillis() - t0);
                call.resolve(o);
            }
        }, "duplicadas-capa").start();
    }

    /* ---------- procura em segundo plano ---------- */

    private boolean askedNotifications = false;

    /** Liga (ou atualiza) a procura em segundo plano com o plano do app (token, ritmo, filas, catálogo). */
    @PluginMethod
    public void bgStart(PluginCall call) {
        JSObject plan = call.getObject("plan");
        if (plan == null) { call.reject("Plano vazio."); return; }
        try {
            DupBgStore.get(getContext()).savePlan(plan.toString());
            DupBgStore.get(getContext()).setAuto(true);
            Intent i = new Intent(getContext(), DupBgService.class).setAction(DupBgService.ACTION_PLAN);
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
        } catch (RuntimeException e) {
            call.reject("O Android não deixou ligar a procura em segundo plano: " + e.getMessage());
            return;
        }
        askNotifications();
        JSObject o = new JSObject();
        o.put("ok", true);
        call.resolve(o);
    }

    @PluginMethod
    public void bgStop(PluginCall call) {
        DupBgStore.get(getContext()).setAuto(false);
        DupBgWatch.cancel(getContext());
        if (DupBgService.engineRunning()) {
            try {
                Intent i = new Intent(getContext(), DupBgService.class).setAction(DupBgService.ACTION_STOP);
                if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
                else getContext().startService(i);
            } catch (RuntimeException ignored) { /* já parado */ }
        }
        call.resolve(new JSObject());
    }

    /** Andamento: {status: JSON do motor, running, auto, seq (último resultado), battery, notifications}. */
    @PluginMethod
    public void bgStatus(PluginCall call) {
        JSObject o = new JSObject();
        Map<String, Object> st = DupBgService.status();
        o.put("status", st == null ? null : Json.stringify(st));
        o.put("running", DupBgService.engineRunning());
        DupBgStore store = DupBgStore.get(getContext());
        o.put("auto", store.auto());
        o.put("seq", store.seq());
        PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
        o.put("battery", pm != null && Build.VERSION.SDK_INT >= 23 && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        o.put("notifications", Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
        call.resolve(o);
    }

    /** Resultados guardados pelo motor depois de `after` (em pedaços de até `max`). */
    @PluginMethod
    public void bgPull(PluginCall call) {
        long after = call.getLong("after", 0L) == null ? 0 : call.getLong("after", 0L);
        Integer max = call.getInt("max", 400);
        Object[] r = DupBgStore.get(getContext()).pull(after, max == null ? 400 : Math.max(1, Math.min(2000, max)));
        JSObject o = new JSObject();
        o.put("data", (String) r[0]);
        o.put("last", (Long) r[1]);
        o.put("more", (Boolean) r[2]);
        call.resolve(o);
    }

    /** O app guardou os resultados até `upTo`: podem ser apagados do celular. */
    @PluginMethod
    public void bgAck(PluginCall call) {
        Long upTo = call.getLong("upTo", 0L);
        DupBgStore.get(getContext()).ack(upTo == null ? 0 : upTo);
        call.resolve(new JSObject());
    }

    /** Pede ao Android para não economizar bateria com o app (sem isso ele pode parar a procura com o app fechado). */
    @PluginMethod
    public void bgBattery(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 23) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
        } catch (RuntimeException e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (RuntimeException ignored) { /* sem tela de ajuste */ }
        }
        call.resolve(new JSObject());
    }

    /** Pede a permissão de avisos (Android 13+), para a notificação do andamento aparecer. */
    @PluginMethod
    public void bgNotifications(PluginCall call) {
        askedNotifications = false;
        askNotifications();
        call.resolve(new JSObject());
    }

    private void askNotifications() {
        if (askedNotifications || Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        askedNotifications = true;
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 5021);
        }
    }

    private static byte[] readBytes(InputStream in, int max) throws IOException {
        try {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16 * 1024];
            int total = 0;
            for (int n; (n = in.read(chunk)) != -1; ) {
                total += n;
                if (total > max) throw new IOException("imagem grande demais");
                buf.write(chunk, 0, n);
            }
            return buf.toByteArray();
        } finally {
            in.close();
        }
    }

    private static String read(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16 * 1024];
            int total = 0;
            for (int n; (n = in.read(chunk)) != -1; ) {
                total += n;
                if (total > MAX_BODY) throw new IOException("resposta grande demais");
                buf.write(chunk, 0, n);
            }
            return new String(buf.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            in.close();
        }
    }
}
