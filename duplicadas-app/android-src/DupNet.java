package __PKG__;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Pedidos do motor em segundo plano (HttpURLConnection, o mesmo caminho do Estúdio; Java puro). Cada pedido tem
 * no máximo 90 s para terminar: resposta que chega aos pouquinhos vira "sem resposta" e o motor tenta de novo.
 */
final class DupNet implements DupEngine.Http {
    static final int MAX_TEXT = 16 * 1024 * 1024;
    static final int MAX_IMAGE = 8 * 1024 * 1024;
    static final long TOTAL_MS = 90_000;

    static final class TooBig extends IOException {
        TooBig() { super("grande demais"); }
    }

    @Override
    public DupEngine.Resp get(String url, Map<String, String> headers, boolean binary) {
        DupEngine.Resp r = new DupEngine.Resp();
        long t0 = System.currentTimeMillis();
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(20_000);
            c.setReadTimeout(30_000);
            c.setInstanceFollowRedirects(true);
            c.setUseCaches(false);
            for (Map.Entry<String, String> h : headers.entrySet()) c.setRequestProperty(h.getKey(), h.getValue());
            r.status = c.getResponseCode();
            r.type = c.getContentType();
            InputStream in = r.status >= 400 ? c.getErrorStream() : c.getInputStream();
            if (in != null) {
                try {
                    r.body = read(in, binary ? MAX_IMAGE : MAX_TEXT, t0 + TOTAL_MS);
                } catch (TooBig big) {
                    r.body = new byte[0];
                    r.error = binary ? "imagem grande demais (mais de 8 MB)" : "resposta grande demais";
                } finally {
                    in.close();
                }
            }
        } catch (IOException | RuntimeException e) {
            r.status = 0;
            r.error = e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "");
        } finally {
            if (c != null) {
                try { c.disconnect(); } catch (RuntimeException ignored) { /* já encerrada */ }
            }
        }
        r.ms = System.currentTimeMillis() - t0;
        return r;
    }

    static byte[] read(InputStream in, int max, long deadline) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
            if (out.size() > max) throw new TooBig();
            if (System.currentTimeMillis() > deadline) throw new IOException("tempo esgotado");
        }
        return out.toByteArray();
    }
}
