package __PKG__;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Pedidos HTTP do motor de envio (HttpURLConnection: funciona no Android e no Java comum).
 * Cada pedido roda numa thread própria e o motor espera no máximo o tempo total do pedido: se a
 * resposta não terminar a tempo (rede ruim, servidor mandando aos poucos), o motor recebe "tempo
 * esgotado" e tenta de novo, em vez de ficar parado para sempre.
 */
final class HttpConn implements EnvioEngine.Http {
    private static final int MAX_BODY = 16 * 1024 * 1024;
    private static final ExecutorService POOL = Executors.newCachedThreadPool(new ThreadFactory() {
        private int n = 0;
        @Override
        public synchronized Thread newThread(Runnable r) {
            Thread t = new Thread(r, "estudio-http-" + (++n));
            t.setDaemon(true);
            return t;
        }
    });

    private final String userAgent;
    private volatile Future<EnvioEngine.Response> currentTask;
    private volatile HttpURLConnection currentConn;

    HttpConn(String userAgent) {
        this.userAgent = userAgent;
    }

    @Override
    public EnvioEngine.Response send(final EnvioEngine.Request rq) throws IOException {
        Future<EnvioEngine.Response> task = POOL.submit(new Callable<EnvioEngine.Response>() {
            @Override
            public EnvioEngine.Response call() throws IOException {
                return run(rq);
            }
        });
        currentTask = task;
        try {
            return task.get(Math.max(1000, rq.timeoutMs), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            kill(task);
            throw new SocketTimeoutException("tempo esgotado");
        } catch (CancellationException e) {
            throw new InterruptedIOException("pedido cancelado");
        } catch (InterruptedException e) {
            kill(task);
            Thread.currentThread().interrupt();
            throw new InterruptedIOException("pedido interrompido");
        } catch (ExecutionException e) {
            Throwable c = e.getCause();
            if (c instanceof IOException) throw (IOException) c;
            if (c instanceof RuntimeException) throw new IOException(c.getClass().getSimpleName() + ": " + c.getMessage(), c);
            throw new IOException(String.valueOf(c), c);
        } finally {
            if (currentTask == task) currentTask = null;
        }
    }

    private EnvioEngine.Response run(EnvioEngine.Request rq) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(rq.url).openConnection();
        currentConn = c;
        try {
            c.setRequestMethod(rq.method);
            c.setConnectTimeout(Math.min(rq.timeoutMs, 30_000));
            c.setReadTimeout(rq.timeoutMs);
            c.setInstanceFollowRedirects(rq.followRedirects);
            c.setUseCaches(false);
            if (userAgent != null && !userAgent.isEmpty()) c.setRequestProperty("User-Agent", userAgent);
            c.setRequestProperty("Accept-Language", "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7");
            for (Map.Entry<String, String> h : rq.headers.entrySet()) c.setRequestProperty(h.getKey(), h.getValue());
            if (rq.body != null) {
                byte[] bytes = rq.body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setFixedLengthStreamingMode(bytes.length);
                OutputStream out = c.getOutputStream();
                try { out.write(bytes); } finally { out.close(); }
            }
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            EnvioEngine.Response r = new EnvioEngine.Response();
            r.status = status;
            r.location = c.getHeaderField("Location");
            r.body = in == null ? "" : read(in);
            return r;
        } finally {
            if (currentConn == c) currentConn = null;
            try { c.disconnect(); } catch (Exception ignored) { /* já encerrada */ }
        }
    }

    private void kill(Future<EnvioEngine.Response> task) {
        task.cancel(true);
        HttpURLConnection c = currentConn;
        if (c != null) {
            try { c.disconnect(); } catch (Exception ignored) { /* já encerrada */ }
        }
    }

    /** Corta o pedido em andamento (o botão Parar responde na hora, sem esperar a resposta). */
    @Override
    public void abort() {
        Future<EnvioEngine.Response> t = currentTask;
        if (t != null) kill(t);
    }

    private static String read(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[16 * 1024];
            int total = 0;
            for (int n; (n = in.read(chunk)) != -1; ) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("pedido cancelado");
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
