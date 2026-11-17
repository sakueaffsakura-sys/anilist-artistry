package __PKG__;

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
