package __PKG__;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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

/**
 * Pedidos à API da MediocreScan pelo mesmo caminho que o Estúdio usa no celular (HttpURLConnection, sem o
 * User-Agent do navegador): só aceita endereços da API, manda o token no cabeçalho e devolve status e texto.
 * cover(url): confere uma capa (abre a imagem aqui no Android e devolve só as medidas e o hash, sem o arquivo).
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
                            measure(bytes, o);
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

    /** Abre a imagem em tamanho reduzido e mede: largura e altura reais, hash (dHash) e variação de brilho. */
    private static void measure(byte[] bytes, JSObject o) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        int w = bounds.outWidth, h = bounds.outHeight;
        if (w <= 0 || h <= 0) { o.put("ok", false); return; }
        o.put("w", w);
        o.put("h", h);
        int sample = 1;
        while (Math.min(w, h) / (sample * 2) >= 64) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bm = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        if (bm == null) { o.put("ok", false); return; }
        try {
            Bitmap s9 = Bitmap.createScaledBitmap(bm, 9, 8, true);
            StringBuilder hex = new StringBuilder();
            for (int y = 0; y < 8; y++) {
                int b = 0;
                for (int x = 0; x < 8; x++) b = (b << 1) | (lum(s9.getPixel(x, y)) > lum(s9.getPixel(x + 1, y)) ? 1 : 0);
                hex.append(String.format("%02x", b));
            }
            if (s9 != bm) s9.recycle();
            Bitmap s16 = Bitmap.createScaledBitmap(bm, 16, 16, true);
            double sum = 0, sq = 0;
            for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) { double l = lum(s16.getPixel(x, y)); sum += l; sq += l * l; }
            if (s16 != bm) s16.recycle();
            double mean = sum / 256.0;
            o.put("std", Math.sqrt(Math.max(0, sq / 256.0 - mean * mean)));
            o.put("hash", hex.toString());
            o.put("ok", true);
        } finally {
            bm.recycle();
        }
    }

    /** Brilho do pixel (transparente conta como branco). */
    private static double lum(int px) {
        double a = ((px >>> 24) & 0xff) / 255.0;
        double l = ((px >> 16) & 0xff) * 0.299 + ((px >> 8) & 0xff) * 0.587 + (px & 0xff) * 0.114;
        return a * l + (1 - a) * 255;
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
