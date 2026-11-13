package __PKG__;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Motor de envio nativo (Java puro, sem nada do Android): a mesma lógica do engine.js, mas rodando no
 * serviço em primeiro plano. Assim o envio continua mesmo quando o Android fecha a tela do app.
 *
 * Ritmo: uma obra por vez até o fim, 5 capítulos por envio, 1 min 12 s entre envios, no máximo 1 pedido
 * por minuto à API da MediocreScan (o CDN das páginas não conta), esperas crescentes quando ela recusa.
 * Os eventos têm os mesmos nomes e campos do engine.js, para a tela tratar os dois do mesmo jeito.
 */
final class EnvioEngine {
    static final String API = "https://api.mediocretoons.net";
    static final String CDN = "https://cdn.mediocrescan.com";
    static final int PER_SEND = 5;
    static final long WAIT_MS = 72_000L;
    static final long API_GAP_MS = 60_000L;
    static final long CDN_GAP_MS = 1_500L;
    /** Recusa seguida da MediocreScan: 1, 2, 5, 10 e depois 15 min entre tentativas. */
    static final long[] LOCK_STEPS = { 60_000L, 120_000L, 300_000L, 600_000L, 900_000L };
    static final int MAX_LOCKS = 12;
    /** Falha de conexão: espera cada vez mais (cerca de 22 min no total) antes de desistir. */
    static final long[] NET_WAITS = { 20_000L, 30_000L, 60_000L, 120_000L, 180_000L, 300_000L, 300_000L, 300_000L };
    /** O CDN recusando várias páginas seguidas é bloqueio; uma recusa isolada é página que não existe. */
    static final int CDN_REFUSALS_FOR_BLOCK = 5;
    static final int API_TIMEOUT_MS = 45_000;
    static final int SITE_TIMEOUT_MS = 120_000;
    static final long PACE_FRESH_MS = 10 * 60_000L;

    /* Modo automático: de quanto em quanto tempo olha as listas da MediocreScan e os pedidos. */
    static final long AUTO_CYCLE_MS = 20 * 60_000L;
    /** Obras do site conferidas por ciclo, das que estão há mais tempo sem conferir. */
    static final int AUTO_ROUND_ROBIN = 4;
    /** Pedidos de leitores procurados na MediocreScan por ciclo (1 pedido à API cada). */
    static final int AUTO_REQUEST_SEARCHES = 2;
    /** Obras novas colocadas na fila por ciclo. */
    static final int AUTO_DISCOVER_MAX = 20;
    /** Falhas seguidas de uma obra antes de o automático deixá-la para depois. */
    static final int AUTO_MAX_FAILS = 2;
    private static final Pattern UUID =Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Pattern IP_BLOCK = Pattern.compile("ip\\s+bloquead|bloquead|blocked|banned", Pattern.CASE_INSENSITIVE);

    /** O usuário pediu para parar. */
    static final class Stopped extends RuntimeException {
        Stopped() { super("Envio parado."); }
    }

    /** Erro que para o envio inteiro (chave recusada, sessão encerrada, site em manutenção...). */
    static final class Fatal extends RuntimeException {
        Fatal(String message) { super(message); }
    }

    /** Falta de conexão ou recusas seguidas: o envio comum para; o automático espera e tenta de novo. */
    static final class Retryable extends RuntimeException {
        Retryable(String message) { super(message); }
    }

    /** Erro de uma obra ou de um capítulo: anota e segue para a próxima. */
    static final class Soft extends Exception {
        Soft(String message) { super(message); }
    }

    static final class Request {
        String method = "GET";
        String url;
        String body;
        final Map<String, String> headers = new LinkedHashMap<>();
        int timeoutMs = API_TIMEOUT_MS;
        boolean followRedirects = true;
    }

    static final class Response {
        int status;
        String body = "";
        String location;
    }

    interface Http {
        Response send(Request request) throws IOException;
        void abort();
    }

    interface Clock {
        long now();
        void sleep(long ms) throws InterruptedException;
    }

    /** Para onde vão os eventos e o que precisa ficar guardado no celular. */
    interface Host {
        void emit(Map<String, Object> event);
        void savePace(long api, long pair, long lock);
        void saveSession(Session session);
        void moved(String origin);
        /** Obra de índice `index` da lista terminou (para retomar da próxima se o app for fechado). */
        void workDone(int index);
    }

    static final class Session {
        String mode;
        String code;
        String email;
        String access;
        String refresh;
        long expires;

        static Session from(Object v) {
            Map<String, Object> m = Json.obj(v);
            if (m == null) return null;
            Session s = new Session();
            s.mode = Json.str(m.get("mode"));
            s.code = Json.str(m.get("code"));
            s.email = Json.str(m.get("email"));
            s.access = Json.str(m.get("access"));
            s.refresh = Json.str(m.get("refresh"));
            Long e = Json.whole(m.get("expires"));
            s.expires = e == null ? 0 : e;
            return s.mode == null ? null : s;
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("mode", mode);
            if (code != null) m.put("code", code);
            if (email != null) m.put("email", email);
            if (access != null) m.put("access", access);
            if (refresh != null) m.put("refresh", refresh);
            if (expires > 0) m.put("expires", expires);
            return m;
        }

        boolean isEmail() { return "email".equals(mode); }
    }

    static final class Config {
        volatile String site;
        String token;
        String supabaseUrl;
        String supabaseKey;
        volatile Session session;
        long paceApi = -1;
        long pacePair = -1;
        long paceLock = -1;

        static Config from(Object v) {
            Map<String, Object> m = Json.obj(v);
            Config c = new Config();
            if (m == null) return c;
            c.site = Json.str(m.get("site"));
            c.token = Json.str(m.get("token"));
            c.supabaseUrl = Json.str(m.get("supabaseUrl"));
            c.supabaseKey = Json.str(m.get("supabaseKey"));
            c.session = Session.from(m.get("session"));
            return c;
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("site", site);
            m.put("token", token);
            m.put("supabaseUrl", supabaseUrl);
            m.put("supabaseKey", supabaseKey);
            Session s = session;
            m.put("session", s == null ? null : s.toMap());
            return m;
        }
    }

    static final class WorkRef {
        final long id;
        final String title;
        WorkRef(long id, String title) { this.id = id; this.title = title; }
    }

    private static final class Entries {
        final Map<Long, Map<String, Object>> map = new LinkedHashMap<>();
        Long obrId;
    }

    private static final class ChapterData {
        final Map<String, Object> meta;
        final Object content;
        ChapterData(Map<String, Object> meta, Object content) { this.meta = meta; this.content = content; }
    }

    private static final class Outcome {
        long added;
    }

    private final Config cfg;
    private final Http http;
    private final Http uiHttp;
    private final Clock clock;
    private final Host host;
    private volatile boolean stop;
    private volatile boolean running;
    private volatile boolean wake;
    private final Object pace = new Object();
    private long lastApi;
    private long lastCdn = -1;
    private long lastPair;
    private long lastLockEnd;
    private int locksInRow;
    private int cdnRefusals;

    EnvioEngine(Config cfg, Http http, Http uiHttp, Clock clock, Host host) {
        this.cfg = cfg;
        this.http = http;
        this.uiHttp = uiHttp;
        this.clock = clock;
        this.host = host;
        long now = clock.now();
        lastApi = fresh(cfg.paceApi, now);
        lastPair = fresh(cfg.pacePair, now);
        lastLockEnd = fresh(cfg.paceLock, now);
    }

    private static long fresh(long v, long now) {
        return v > 0 && v <= now && now - v < PACE_FRESH_MS ? v : -1;
    }

    boolean isRunning() { return running; }

    void requestStop() {
        stop = true;
        http.abort();
    }

    /** Modo automático: acorda da espera (o admin pôs obras na fila pelo app). */
    void wake() { wake = true; }

    /** Sessão renovada pelo app enquanto o envio roda. */
    void updateSession(Session s) {
        if (s != null) cfg.session = s;
    }

    /* ---------- utilidades ---------- */

    private void emit(String type, Object... kv) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("type", type);
        for (int i = 0; i + 1 < kv.length; i += 2) e.put(String.valueOf(kv[i]), kv[i + 1]);
        try { host.emit(e); } catch (RuntimeException ignored) { /* a tela nunca para o envio */ }
    }

    private void log(String text) { emit("log", "text", text); }

    private void checkStop() {
        if (stop) throw new Stopped();
    }

    /** Espera em pedaços curtos para o botão "Parar" responder rápido. */
    private void pause(long ms) {
        long end = clock.now() + ms;
        while (clock.now() < end) {
            checkStop();
            try { clock.sleep(Math.min(500, end - clock.now())); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new Stopped(); }
        }
        checkStop();
    }

    private void savePace() {
        try { host.savePace(lastApi, lastPair, lastLockEnd); } catch (RuntimeException ignored) { /* ok */ }
    }

    private void netRetry(String where, int attempt, String detail) {
        if (attempt >= NET_WAITS.length) {
            throw new Retryable("Sem resposta " + where + " depois de " + NET_WAITS.length + " tentativas (" + detail
                + "). O envio parou aqui e continua deste ponto quando você tocar em Continuar.");
        }
        long ms = NET_WAITS[attempt];
        emit("net-retry", "where", where, "detail", detail, "attempt", attempt + 1, "max", NET_WAITS.length, "ms", ms);
        pause(ms);
    }

    /** 1 min 12 s a cada 5 capítulos: conta do fim do último lote (ou da última pausa por recusa). */
    private void pairWait() {
        long mark = Math.max(lastPair, lastLockEnd);
        if (mark < 0) return;
        long ms = Math.max(0, WAIT_MS - (clock.now() - mark));
        if (ms > 0) {
            emit("waiting", "ms", ms);
            pause(ms);
        }
    }

    private void lockPause(String reason) {
        locksInRow++;
        if (locksInRow > MAX_LOCKS) {
            throw new Retryable("A MediocreScan continua recusando os pedidos (" + reason + ") depois de " + MAX_LOCKS
                + " esperas. Tente mais tarde" + ("IP bloqueado".equals(reason) ? " ou troque de rede (Wi-Fi ↔ dados móveis)" : "")
                + "; o envio continua de onde parou.");
        }
        long ms = LOCK_STEPS[Math.min(locksInRow - 1, LOCK_STEPS.length - 1)];
        emit("pause", "ms", ms, "reason", reason, "count", locksInRow, "max", MAX_LOCKS);
        pause(ms);
        synchronized (pace) {
            lastLockEnd = clock.now();
            savePace();
        }
        emit("resume");
    }

    /** Reserva a vez de falar com a MediocreScan (API: 1 por minuto; CDN: 1,5 s), em qualquer thread. */
    private void slot(boolean api, boolean ui) {
        long gap = api ? API_GAP_MS : CDN_GAP_MS;
        boolean announced = false;
        for (;;) {
            long wait;
            synchronized (pace) {
                long last = api ? lastApi : lastCdn;
                long now = clock.now();
                wait = last < 0 ? 0 : last + gap - now;
                if (wait <= 0) {
                    if (api) { lastApi = now; savePace(); } else lastCdn = now;
                    return;
                }
            }
            if (ui) {
                try { clock.sleep(Math.min(wait, 500)); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new Stopped(); }
            } else {
                if (api && wait > 2000 && !announced) { emit("api-wait", "ms", wait); announced = true; }
                pause(wait);
            }
        }
    }

    private String token() {
        String t = cfg.token == null ? "" : cfg.token.trim();
        return t.regionMatches(true, 0, "Bearer ", 0, 7) ? t.substring(7).trim() : t;
    }

    private Request get(String url, String bearer) {
        Request rq = new Request();
        rq.url = url;
        rq.headers.put("Accept", "application/json");
        if (bearer != null) rq.headers.put("Authorization", "Bearer " + bearer);
        rq.timeoutMs = API_TIMEOUT_MS;
        return rq;
    }

    /** Pedido do envio à MediocreScan: espera a vez, aguenta recusas e quedas; null quando não existe (404). */
    private Object mediocre(boolean api, String path) throws Soft {
        String token = token();
        if (api && token.isEmpty()) throw new Fatal("Cole sua chave da MediocreScan nas configurações.");
        int netFails = 0;
        for (;;) {
            checkStop();
            slot(api, false);
            Response r;
            try {
                r = http.send(get((api ? API : CDN) + path, api ? token : null));
            } catch (IOException e) {
                checkStop();
                netRetry("da MediocreScan", netFails++, timeoutText(e));
                continue;
            }
            checkStop();
            if (r.status == 401) throw new Fatal("A MediocreScan recusou sua chave (401). Cole uma chave nova nas configurações.");
            if (r.status == 429 || r.status == 403) {
                String head = r.body == null ? "" : r.body.substring(0, Math.min(300, r.body.length()));
                boolean blocked = IP_BLOCK.matcher(head).find();
                if (!api && r.status == 403 && !blocked && ++cdnRefusals < CDN_REFUSALS_FOR_BLOCK) {
                    // Uma página recusada no CDN costuma ser arquivo que não existe mais: pula, sem travar tudo.
                    java.util.regex.Matcher cm = Pattern.compile("/capitulos/([^/]+)/").matcher(path);
                    log("O CDN recusou as páginas" + (cm.find() ? " do capítulo " + cm.group(1) : "") + " (403); esse capítulo fica para depois.");
                    return null;
                }
                String reason = r.status == 429 ? "pedidos demais" : blocked ? "IP bloqueado" : api ? "acesso recusado" : "o CDN recusou as páginas";
                lockPause(reason);
                continue;
            }
            locksInRow = 0;
            if (!api) cdnRefusals = 0;
            if (r.status == 404) return null;
            if (r.status >= 500) {
                netRetry("da MediocreScan", netFails++, "erro " + r.status);
                continue;
            }
            if (r.status < 200 || r.status >= 300) throw new Soft("A MediocreScan respondeu " + r.status + ".");
            try {
                return Json.parse(r.body);
            } catch (Json.ParseError e) {
                netRetry("da MediocreScan", netFails++, "resposta incompleta");
            }
        }
    }

    private static String timeoutText(IOException e) {
        String n = e.getClass().getSimpleName();
        return n.contains("Timeout") ? "tempo esgotado" : "sem conexão";
    }

    /**
     * Pedido da tela (listas, busca, obra) enquanto o envio roda: entra na mesma fila de 1 pedido por
     * minuto, para a navegação não somar pedidos à API.
     */
    Response uiGet(String path, String bearer) throws IOException {
        slot(true, true);
        return uiHttp.send(get(API + path, bearer != null && !bearer.isEmpty() ? bearer : token()));
    }

    /* ---------- sessão do site ---------- */

    private Map<String, String> siteHeaders() {
        Map<String, String> h = new LinkedHashMap<>();
        Session s = cfg.session;
        if (s == null) return h;
        if ("code".equals(s.mode)) { if (s.code != null) h.put("x-ingest-token", s.code); }
        else if (s.access != null) h.put("authorization", "Bearer " + s.access);
        return h;
    }

    /** Renova a sessão do e-mail antes de vencer (e quando o site responde 401). */
    private boolean refreshSession() {
        Session s = cfg.session;
        if (s == null || !s.isEmail() || s.refresh == null || cfg.supabaseUrl == null || cfg.supabaseKey == null) return false;
        for (int attempt = 0; attempt < 3; attempt++) {
            checkStop();
            Request rq = new Request();
            rq.method = "POST";
            rq.url = cfg.supabaseUrl.replaceAll("/+$", "") + "/auth/v1/token?grant_type=refresh_token";
            rq.headers.put("apikey", cfg.supabaseKey);
            rq.headers.put("content-type", "application/json");
            rq.body = Json.stringify(Json.map("refresh_token", s.refresh));
            rq.timeoutMs = 30_000;
            Response r;
            try { r = http.send(rq); }
            catch (IOException e) { pause(10_000); continue; }
            if (r.status < 200 || r.status >= 300) return false;
            Map<String, Object> j;
            try { j = Json.obj(Json.parse(r.body)); } catch (Json.ParseError e) { return false; }
            if (j == null || Json.str(j.get("access_token")) == null) return false;
            Session n = new Session();
            n.mode = "email";
            Map<String, Object> user = Json.obj(j.get("user"));
            n.email = user != null && Json.str(user.get("email")) != null ? Json.str(user.get("email")) : s.email;
            n.access = Json.str(j.get("access_token"));
            n.refresh = Json.str(j.get("refresh_token")) != null ? Json.str(j.get("refresh_token")) : s.refresh;
            Long ttl = Json.whole(j.get("expires_in"));
            n.expires = clock.now() + (ttl == null || ttl <= 0 ? 3600 : ttl) * 1000L;
            cfg.session = n;
            try { host.saveSession(n); } catch (RuntimeException ignored) { /* ok */ }
            emit("session", "session", n.toMap());
            return true;
        }
        return false;
    }

    private void ensureFreshSession() {
        Session s = cfg.session;
        if (s != null && s.isEmail() && s.expires > 0 && s.expires - clock.now() < 120_000) refreshSession();
    }

    private static String origin(String url) {
        java.util.regex.Matcher m = Pattern.compile("^(https?://[^/?#]+)").matcher(url == null ? "" : url);
        return m.find() ? m.group(1).toLowerCase(java.util.Locale.ROOT) : null;
    }

    /** Pedido ao site (endpoint mediocre-ingest), com renovação de sessão, mudança de endereço e novas tentativas. */
    Map<String, Object> site(Map<String, Object> body) throws Soft {
        return site(body, false);
    }

    private Map<String, Object> site(Map<String, Object> body, boolean quiet) throws Soft {
        boolean retried = false;
        int hops = 0, netFails = 0;
        String payload = Json.stringify(body);
        for (;;) {
            if (!quiet) checkStop();
            if (!quiet) ensureFreshSession();
            String base = cfg.site == null || cfg.site.isEmpty() ? "https://anilist-artistry.lovable.app" : cfg.site.replaceAll("/+$", "");
            String endpoint = base + "/api/public/mediocre-ingest";
            Request rq = new Request();
            rq.method = "POST";
            rq.url = endpoint;
            rq.body = payload;
            rq.timeoutMs = SITE_TIMEOUT_MS;
            rq.followRedirects = false;
            rq.headers.put("content-type", "application/json");
            rq.headers.putAll(siteHeaders());
            Response r;
            try {
                r = http.send(rq);
            } catch (IOException e) {
                if (quiet) throw new Soft("sem conexão");
                checkStop();
                netRetry("do site", netFails++, timeoutText(e));
                continue;
            }
            if (r.status == 301 || r.status == 302 || r.status == 303 || r.status == 307 || r.status == 308) {
                String next = resolve(endpoint, r.location);
                String here = origin(endpoint), there = origin(next);
                if (next != null && next.startsWith("https://") && there != null && !there.equals(here) && hops < 3) {
                    hops++;
                    cfg.site = there;
                    try { host.moved(there); } catch (RuntimeException ignored) { /* ok */ }
                    emit("site-moved", "origin", there);
                    log("O site agora responde em " + there.replaceFirst("^https://", "") + ".");
                    continue;
                }
                if (next != null && there != null && there.equals(here) && next.contains("manutencao")) throw new Retryable("O site está em manutenção. Tente de novo depois.");
                throw new Fatal("O site redirecionou o pedido" + (next != null ? " para " + next.replaceFirst("^https?://", "") : "")
                    + ". Coloque o endereço certo em \"Endereço do site\".");
            }
            Map<String, Object> j = null;
            try { j = Json.obj(Json.parse(r.body)); } catch (Json.ParseError ignored) { /* resposta sem JSON */ }
            if (j == null) j = new LinkedHashMap<>();
            String error = Json.str(j.get("error"));
            if (r.status == 401 && !retried && !quiet && refreshSession()) { retried = true; continue; }
            if (r.status == 401) throw new Fatal(error != null ? error : "Sua sessão acabou. Entre de novo.");
            if (r.status == 403) throw new Fatal(error != null ? error : "Esta conta não é administradora do site.");
            if (r.status == 503) throw new Retryable("O site está em manutenção. Tente de novo depois.");
            if (r.status >= 500) {
                if (quiet) throw new Soft("erro " + r.status);
                netRetry("do site", netFails++, "erro " + r.status);
                continue;
            }
            if (r.status < 200 || r.status >= 300) throw new Soft(error != null ? error : "O site respondeu " + r.status + ".");
            return j;
        }
    }

    private static String resolve(String base, String location) {
        if (location == null || location.isEmpty()) return null;
        if (location.startsWith("http://") || location.startsWith("https://")) return location;
        String o = origin(base);
        if (o == null) return null;
        if (location.startsWith("//")) return base.substring(0, base.indexOf(':') + 1) + location;
        if (location.startsWith("/")) return o + location;
        int slash = base.lastIndexOf('/');
        return (slash > o.length() ? base.substring(0, slash + 1) : o + "/") + location;
    }

    /* ---------- dados da MediocreScan ---------- */

    static Object unwrap(Object d) {
        Map<String, Object> m = Json.obj(d);
        if (m != null && Json.obj(m.get("data")) != null) return m.get("data");
        return d;
    }

    static String contentPath(Map<String, Object> m) {
        if (m == null) return null;
        Double obra = Json.num(m.get("obr_id"));
        Double num = Json.num(m.get("cap_num"));
        String uuid = Json.str(m.get("cap_uuid"));
        if (obra == null || obra != Math.rint(obra) || obra <= 0 || obra > 9007199254740991d) return null;
        if (num == null || num < 0 || uuid == null || !UUID.matcher(uuid).matches()) return null;
        String n = num == Math.rint(num) && Math.abs(num) < 1e15 ? Long.toString(num.longValue()) : Double.toString(num);
        return "/obras/" + obra.longValue() + "/capitulos/" + n + "/" + uuid + ".json";
    }

    private static Entries listEntries(Object work) {
        Entries out = new Entries();
        Map<String, Object> w = Json.obj(unwrap(work));
        if (w == null) return out;
        List<Object> caps = Json.arr(w.get("capitulos"));
        if (caps != null) {
            for (Object c : caps) {
                Map<String, Object> cm = Json.obj(c);
                if (cm == null) continue;
                Long id = Json.whole(cm.containsKey("cap_id") && cm.get("cap_id") != null ? cm.get("cap_id") : cm.get("id"));
                if (id == null) continue;
                // O UUID pode vir como cap_uuid ou em outro campo com "uuid" no nome: com ele as páginas vêm
                // direto do CDN, sem gastar o pedido por minuto da API.
                String uuid = Json.str(cm.get("cap_uuid"));
                if (uuid == null || !UUID.matcher(uuid).matches()) {
                    uuid = null;
                    for (Map.Entry<String, Object> en : cm.entrySet()) {
                        String v = Json.str(en.getValue());
                        if (en.getKey().toLowerCase(java.util.Locale.ROOT).contains("uuid") && v != null && UUID.matcher(v).matches()) { uuid = v; break; }
                    }
                    if (uuid != null) { cm = new LinkedHashMap<>(cm); cm.put("cap_uuid", uuid); }
                }
                out.map.put(id, cm);
            }
        }
        Long obr = Json.whole(w.get("obr_id") != null ? w.get("obr_id") : w.get("id"));
        out.obrId = obr != null && obr != 0 ? obr : null;
        return out;
    }

    /**
     * Dados + conteúdo de um capítulo. Se a lista da obra já traz o UUID, vai direto às páginas no CDN
     * (sem pedido à API); senão pede o capítulo à API, respeitando 1 pedido por minuto.
     */
    private ChapterData chapterData(long capId, Entries entries) throws Soft {
        Map<String, Object> e = entries.map.get(capId);
        if (e != null && Json.str(e.get("cap_uuid")) != null) {
            Map<String, Object> meta = new LinkedHashMap<>();
            meta.put("obr_id", entries.obrId);
            meta.putAll(e);
            String path = contentPath(meta);
            if (path != null) {
                Object content = null;
                try { content = mediocre(false, path); } catch (Soft ignored) { /* tenta pela API */ }
                if (content != null) return new ChapterData(meta, content);
            }
        }
        Map<String, Object> meta = Json.obj(unwrap(mediocre(true, "/capitulos/" + capId)));
        if (meta == null) return null;
        String path = contentPath(meta);
        Object content = null;
        if (path != null) {
            try { content = mediocre(false, path); } catch (Soft ignored) { /* vai sem conteúdo; o site conta como pulado */ }
        }
        return new ChapterData(meta, content);
    }

    private static List<Long> longs(Object v) {
        List<Long> out = new ArrayList<>();
        List<Object> a = Json.arr(v);
        if (a == null) return out;
        for (Object o : a) {
            Long n = Json.whole(o);
            if (n != null) out.add(n);
        }
        return out;
    }

    private static long count(Map<String, Object> m, String key) {
        Long v = m == null ? null : Json.whole(m.get(key));
        return v == null ? 0 : v;
    }

    private static Map<String, Object> chapterPayload(long id, List<Map<String, Object>> chapters) {
        return Json.map("action", "chapters", "obraId", id, "chapters", chapters);
    }

    /** Envia UMA obra inteira; se parar no meio, o site guarda onde parou e retoma esta obra primeiro. */
    private Outcome sendWork(long id, String name, int left) throws Soft {
        Outcome out = new Outcome();
        Object work = mediocre(true, "/obras/" + id);
        if (work == null) {
            site(Json.map("action", "finish", "obraId", id, "added", 0, "remaining", 0));
            emit("work-done", "id", id, "name", name, "added", 0, "skipped", 0, "left", Math.max(0, left - 1), "note", "não encontrada na MediocreScan");
            return out;
        }
        Map<String, Object> w = site(Json.map("action", "work", "obraId", id, "work", work, "publish", true));
        List<Long> pending = longs(w.get("pendingCapIds"));
        Long rem = Json.whole(w.get("remaining"));
        long total = rem != null ? rem : pending.size();
        Entries entries = listEntries(work);
        Map<String, Object> wm = Json.obj(unwrap(work));
        String title = wm != null && Json.str(wm.get("obr_nome")) != null && !Json.str(wm.get("obr_nome")).isEmpty()
            ? Json.str(wm.get("obr_nome")) : name != null && !name.isEmpty() ? name : "Obra " + id;
        emit("work-start", "id", id, "name", title, "slug", w.get("slug"), "created", Json.truthy(w.get("created")), "total", total, "left", left);
        if (!pending.isEmpty()) {
            int fast = 0;
            for (Long c : pending) { Map<String, Object> e = entries.map.get(c); if (e != null && e.get("cap_uuid") != null) fast++; }
            log(fast > 0 ? fast + " de " + pending.size() + " capítulo(s) vêm direto do CDN (rápido)."
                : "A lista desta obra não traz o código dos capítulos: cada um pede à API (1 por minuto).");
        }
        long added = 0, skipped = 0, tried = 0;
        boolean failed = true;
        try {
            for (int i = 0; i < pending.size(); i += PER_SEND) {
                pairWait();
                List<Long> group = pending.subList(i, Math.min(pending.size(), i + PER_SEND));
                emit("sending", "from", tried + 1, "to", tried + group.size(), "total", total);
                List<Map<String, Object>> chapters = new ArrayList<>();
                for (int k = 0; k < group.size(); k++) {
                    long capId = group.get(k);
                    emit("fetching", "n", k + 1, "of", group.size(), "pos", tried + k + 1, "total", total);
                    try {
                        ChapterData data = chapterData(capId, entries);
                        if (data == null) { log("Capítulo " + capId + ": não encontrado na MediocreScan."); continue; }
                        chapters.add(Json.map("capId", capId, "meta", data.meta, "content", data.content));
                    } catch (Soft e) {
                        log("Capítulo " + capId + ": " + e.getMessage());
                    }
                }
                tried += group.size();
                skipped += group.size() - chapters.size();
                if (!chapters.isEmpty()) {
                    emit("posting", "count", chapters.size());
                    Map<String, Object> r = site(chapterPayload(id, chapters));
                    added += count(r, "added");
                    skipped += count(r, "skipped");
                }
                synchronized (pace) {
                    lastPair = clock.now(); // o próximo lote só sai 1 min 12 s depois deste terminar
                    savePace();
                }
                emit("progress", "id", id, "done", Math.min(tried, total), "total", total, "added", added, "skipped", skipped, "left", left);
            }
            failed = false;
        } finally {
            // Mesmo parando no meio, o site fica sabendo o que falta e retoma esta obra primeiro.
            long remaining = Math.max(total - tried, 0);
            Map<String, Object> finish = Json.map("action", "finish", "obraId", id, "added", added, "remaining", remaining);
            if (failed || stop) {
                try { site(finish, true); } catch (Soft | RuntimeException ignored) { /* melhor esforço */ }
            } else {
                site(finish);
            }
        }
        emit("work-done", "id", id, "name", title, "added", added, "skipped", skipped, "left", Math.max(0, left - 1));
        out.added = added;
        return out;
    }

    /** Envia as obras em ordem, uma de cada vez, até o fim de cada uma. `start` retoma do meio da lista. */
    void runWorks(List<WorkRef> works, int start) {
        running = true;
        locksInRow = 0;
        long totalAdded = 0;
        int done = 0;
        emit("run-start", "count", Math.max(0, works.size() - start));
        try {
            for (int i = Math.max(0, start); i < works.size(); i++) {
                checkStop();
                WorkRef w = works.get(i);
                try {
                    totalAdded += sendWork(w.id, w.title, works.size() - i).added;
                    done++;
                } catch (Soft e) {
                    log((w.title != null && !w.title.isEmpty() ? w.title : "Obra " + w.id) + ": " + e.getMessage());
                }
                try { host.workDone(i); } catch (RuntimeException ignored) { /* ok */ }
            }
            emit("run-done", "works", done, "added", totalAdded);
        } catch (Stopped e) {
            emit("run-stopped", "works", done, "added", totalAdded);
        } catch (Fatal | Retryable e) {
            emit("run-error", "message", e.getMessage(), "works", done, "added", totalAdded);
        } catch (RuntimeException e) {
            emit("run-error", "message", "Erro inesperado no envio (" + e.getClass().getSimpleName() + "). O envio continua deste ponto quando você tocar em Continuar.", "works", done, "added", totalAdded);
        } finally {
            running = false;
        }
    }

    /**
     * Envia só os capítulos escolhidos de uma obra (botão ao lado de cada capítulo). Os que já estão no
     * site são pulados sem buscar nada; o resto vai de 5 em 5 com a mesma espera.
     */
    void runChapters(long id, String name, List<Long> capIds) {
        running = true;
        locksInRow = 0;
        long added = 0, skipped = 0, already = 0;
        emit("chapters-start", "id", id, "name", name, "count", capIds.size());
        try {
            Object work = mediocre(true, "/obras/" + id);
            if (work == null) throw new Fatal("Obra não encontrada na MediocreScan.");
            Map<String, Object> w = site(Json.map("action", "work", "obraId", id, "work", work, "publish", true));
            Set<Long> pending = new LinkedHashSet<>(longs(w.get("pendingCapIds")));
            Entries entries = listEntries(work);
            List<Long> todo = new ArrayList<>();
            for (Long c : capIds) {
                if (pending.contains(c)) todo.add(c);
                else { already++; emit("chapter-state", "id", id, "capId", c, "state", "site"); }
            }
            for (int i = 0; i < todo.size(); i += PER_SEND) {
                pairWait();
                List<Long> group = todo.subList(i, Math.min(todo.size(), i + PER_SEND));
                for (Long c : group) emit("chapter-state", "id", id, "capId", c, "state", "sending");
                emit("sending", "from", i + 1, "to", i + group.size(), "total", todo.size());
                List<Map<String, Object>> chapters = new ArrayList<>();
                for (int k = 0; k < group.size(); k++) {
                    long capId = group.get(k);
                    emit("fetching", "n", k + 1, "of", group.size(), "pos", i + k + 1, "total", todo.size());
                    try {
                        ChapterData data = chapterData(capId, entries);
                        if (data == null) { emit("chapter-state", "id", id, "capId", capId, "state", "fail"); skipped++; continue; }
                        chapters.add(Json.map("capId", capId, "meta", data.meta, "content", data.content));
                    } catch (Soft e) {
                        emit("chapter-state", "id", id, "capId", capId, "state", "fail");
                        skipped++;
                        log("Capítulo " + capId + ": " + e.getMessage());
                    }
                }
                if (!chapters.isEmpty()) {
                    emit("posting", "count", chapters.size());
                    Map<String, Object> r = site(chapterPayload(id, chapters));
                    long sk = count(r, "skipped");
                    added += count(r, "added");
                    skipped += sk;
                    // O site responde em conjunto; quem falhou aparece na conferência do fim.
                    for (Map<String, Object> c : chapters) emit("chapter-state", "id", id, "capId", c.get("capId"), "state", sk > 0 ? "check" : "site");
                }
                synchronized (pace) {
                    lastPair = clock.now();
                    savePace();
                }
                emit("progress", "id", id, "done", Math.min(i + group.size(), todo.size()), "total", todo.size(), "added", added, "skipped", skipped, "left", 1);
            }
            emit("chapters-done", "id", id, "name", name, "added", added, "skipped", skipped, "already", already);
        } catch (Stopped e) {
            emit("run-stopped", "works", 0, "added", added);
        } catch (Fatal | Retryable e) {
            emit("run-error", "message", e.getMessage(), "works", 0, "added", added);
        } catch (Soft e) {
            emit("run-error", "message", e.getMessage(), "works", 0, "added", added);
        } catch (RuntimeException e) {
            emit("run-error", "message", "Erro inesperado no envio (" + e.getClass().getSimpleName() + ").", "works", 0, "added", added);
        } finally {
            running = false;
        }
    }

    /* ---------- modo automático ---------- */

    /** Título comparável: sem acentos, minúsculo, só letras e números (igual ao site). */
    static String titleKey(String v) {
        if (v == null) return "";
        String s = java.text.Normalizer.normalize(v, java.text.Normalizer.Form.NFD).replaceAll("[\\u0300-\\u036f]", "");
        return s.toLowerCase(java.util.Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private static final String[] LIST_KEYS = { "data", "obras", "results", "items", "lista", "resultados" };

    private static List<Object> findList(Object el, int depth) {
        if (el == null || depth > 3) return new ArrayList<>();
        List<Object> a = Json.arr(el);
        if (a != null) return a;
        Map<String, Object> m = Json.obj(el);
        if (m == null) return new ArrayList<>();
        for (String k : LIST_KEYS) {
            Object v = m.get(k);
            if (Json.arr(v) != null) return Json.arr(v);
            if (Json.obj(v) != null) {
                List<Object> inner = findList(v, depth + 1);
                if (!inner.isEmpty()) return inner;
            }
        }
        return new ArrayList<>();
    }

    /** Obras de uma resposta de lista/busca da MediocreScan. */
    static List<Map<String, Object>> listOf(Object raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : findList(raw, 0)) {
            Map<String, Object> m = Json.obj(o);
            if (m == null) continue;
            // Recomendações vêm como {obra: {...}}.
            Map<String, Object> inner = Json.obj(m.get("obra"));
            out.add(inner != null && !m.containsKey("obr_id") ? inner : m);
        }
        return out;
    }

    private static Long workIdOf(Map<String, Object> o) {
        Long id = Json.whole(o.get("obr_id") != null ? o.get("obr_id") : o.get("id"));
        return id != null && id > 0 ? id : null;
    }

    private static String workNameOf(Map<String, Object> o) {
        String n = Json.str(o.get("obr_nome"));
        return n != null ? n : Json.str(o.get("nome"));
    }

    /** O que a lista diz sobre a obra (último capítulo, data de atualização): se mudou, a obra tem novidade. */
    static String signature(Map<String, Object> o) {
        StringBuilder b = new StringBuilder();
        List<Object> caps = Json.arr(o.get("capitulos"));
        if (caps != null) {
            long max = -1;
            for (Object c : caps) {
                Map<String, Object> cm = Json.obj(c);
                Long id = cm == null ? null : Json.whole(cm.get("cap_id") != null ? cm.get("cap_id") : cm.get("id"));
                if (id != null && id > max) max = id;
            }
            if (max >= 0) b.append('c').append(max);
        }
        for (Map.Entry<String, Object> e : o.entrySet()) {
            Object v = e.getValue();
            if (v == null || v instanceof Map || v instanceof List) continue;
            String k = e.getKey().toLowerCase(java.util.Locale.ROOT);
            if (k.contains("atualiz") || k.contains("updated") || k.contains("ultim")) b.append('|').append(k).append('=').append(v);
        }
        return b.toString();
    }

    private final Set<String> triedRequests = new HashSet<>();

    /**
     * Pedidos de leitores ainda sem obra: procura o título na MediocreScan e, se só uma obra tem exatamente
     * esse nome, liga o pedido a ela (vai para a fila com prioridade). Os outros ficam para o admin escolher.
     */
    private int autoRequests() throws Soft {
        Map<String, Object> r = site(Json.map("action", "requests"));
        List<Object> groups = Json.arr(r.get("groups"));
        if (groups == null) return 0;
        int searched = 0, linked = 0;
        for (Object go : groups) {
            if (searched >= AUTO_REQUEST_SEARCHES) break;
            Map<String, Object> g = Json.obj(go);
            if (g == null || Json.whole(g.get("mediocreId")) != null) continue;
            List<Object> kinds = Json.arr(g.get("kinds"));
            if (kinds != null && kinds.contains("Novel")) continue;
            String title = Json.str(g.get("title"));
            String want = titleKey(title);
            if (want.isEmpty() || !triedRequests.add(want)) continue;
            searched++;
            String q = title.replaceAll("\\s+", " ").trim();
            if (q.length() > 80) q = q.substring(0, 80);
            String enc;
            try { enc = java.net.URLEncoder.encode(q, "UTF-8"); } catch (java.io.UnsupportedEncodingException e) { continue; }
            Map<Long, String> hits = new LinkedHashMap<>();
            for (Map<String, Object> o : listOf(mediocre(true, "/obras/buscar?string=" + enc))) {
                Long id = workIdOf(o);
                if (id == null) continue;
                List<String> names = new ArrayList<>();
                names.add(workNameOf(o));
                List<Object> alts = Json.arr(o.get("obr_titulos_alternativos"));
                if (alts != null) for (Object a : alts) names.add(Json.str(a));
                for (String n : names) {
                    if (n != null && titleKey(n).equals(want)) { hits.put(id, workNameOf(o) != null ? workNameOf(o) : title); break; }
                }
            }
            if (hits.size() != 1) {
                log("Pedido \"" + title + "\": " + (hits.isEmpty() ? "nada com esse nome" : hits.size() + " obras com esse nome")
                    + " na MediocreScan. Fica para você escolher em Pedidos.");
                continue;
            }
            Map.Entry<Long, String> h = hits.entrySet().iterator().next();
            Map<String, Object> res = site(Json.map("action", "request_link", "ids", g.get("ids"), "obraId", h.getKey(), "title", h.getValue()));
            linked++;
            long position = count(res, "position");
            log("Pedido \"" + title + "\" (" + count(g, "count") + " leitor(es)) ligado à obra " + h.getKey() + ": "
                + (count(res, "fulfilled") > 0 ? "já estava no site, leitores avisados." : position > 0 ? "na fila em " + position + "º lugar." : "na fila."));
            emit("auto-request", "title", title, "id", h.getKey());
        }
        return linked;
    }

    /**
     * Olha as listas da MediocreScan: obras do site que aparecem como atualizadas (com novidade desde a última
     * olhada) entram em `updates`; com `discover`, obras que ainda não estão no site vão para a fila.
     */
    private void scanLists(boolean discover, Map<Long, String> seen, Map<Long, String> updates) throws Soft {
        Map<Long, Map<String, Object>> found = new LinkedHashMap<>();
        for (Map<String, Object> o : listOf(mediocre(true, "/obras/atualizadas-recentes"))) {
            Long id = workIdOf(o);
            if (id != null && !found.containsKey(id)) found.put(id, o);
        }
        Set<Long> updated = new LinkedHashSet<>(found.keySet());
        if (discover) {
            for (Map<String, Object> o : listOf(mediocre(true, "/obras/adicionados-recentes"))) {
                Long id = workIdOf(o);
                if (id != null && !found.containsKey(id)) found.put(id, o);
            }
        }
        if (found.isEmpty()) return;
        List<Long> ids = new ArrayList<>(found.keySet());
        Set<Long> imported = new HashSet<>(), known = new HashSet<>();
        for (int i = 0; i < ids.size(); i += 100) {
            Map<String, Object> r = site(Json.map("action", "check", "ids", new ArrayList<>(ids.subList(i, Math.min(ids.size(), i + 100)))));
            imported.addAll(longs(r.get("imported")));
            known.addAll(longs(r.get("imported")));
            known.addAll(longs(r.get("queued")));
            known.addAll(longs(r.get("failed")));
        }
        int news = 0;
        for (Long id : updated) {
            if (!imported.contains(id)) continue;
            String sig = signature(found.get(id));
            String before = seen.put(id, sig);
            // Primeira vez nesta sessão: confere. Depois, só se a lista mostrar algo diferente.
            if (before == null || (!sig.isEmpty() && !sig.equals(before))) {
                if (!updates.containsKey(id)) news++;
                updates.put(id, workNameOf(found.get(id)));
            }
        }
        int queued = 0;
        if (discover) {
            List<Map<String, Object>> items = new ArrayList<>();
            for (Long id : ids) {
                if (known.contains(id)) continue;
                if (items.size() >= AUTO_DISCOVER_MAX) break;
                items.add(Json.map("obraId", id, "title", workNameOf(found.get(id))));
            }
            if (!items.isEmpty()) {
                site(Json.map("action", "enqueue", "items", items));
                queued = items.size();
            }
        }
        log("Listas da MediocreScan: " + news + " obra(s) do site com capítulos novos"
            + (discover ? ", " + queued + " obra(s) nova(s) na fila" : "") + ".");
    }

    /** Espera até `ms` (ou até o app pedir), avisando a tela de tempos em tempos. */
    private void idle(long ms, int works, long added) {
        long end = clock.now() + Math.max(60_000L, ms);
        long nextBeat = 0;
        while (clock.now() < end && !wake) {
            checkStop();
            if (clock.now() >= nextBeat) {
                emit("auto-idle", "ms", end - clock.now(), "works", works, "added", added);
                nextBeat = clock.now() + 5 * 60_000L;
            }
            try { clock.sleep(Math.min(500, Math.max(1, end - clock.now()))); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new Stopped(); }
        }
        checkStop();
        if (wake) log("Obras novas na fila: o automático voltou a enviar.");
        wake = false;
    }

    /**
     * Modo automático: fica ligado e decide sozinho o que enviar, na ordem
     * fila do site (pedidos de leitores primeiro) → obras do site atualizadas na MediocreScan → conferência das
     * obras do site há mais tempo sem conferir. A cada ciclo também liga pedidos de leitores e (opcional) põe
     * obras novas na fila. Sem nada para fazer, espera e olha de novo. A fila é relida depois de cada obra.
     */
    void runAuto(boolean discover, boolean requests) {
        running = true;
        locksInRow = 0;
        long totalAdded = 0;
        int done = 0;
        Map<Long, Integer> fails = new HashMap<>();
        Map<Long, String> seen = new HashMap<>();
        Map<Long, String> updates = new LinkedHashMap<>();
        long nextScan = 0;
        int robin = 0;
        emit("run-start", "count", 0, "auto", true);
        log("Modo automático ligado: fila do site, obras atualizadas" + (discover ? ", obras novas" : "") + (requests ? " e pedidos de leitores" : "") + ".");
        try {
            for (;;) {
                checkStop();
                wake = false;
                try {
                if (clock.now() >= nextScan) {
                    nextScan = clock.now() + AUTO_CYCLE_MS;
                    robin = 0;
                    emit("auto-scan");
                    if (requests) {
                        try { autoRequests(); } catch (Soft e) { log("Pedidos: " + e.getMessage()); }
                    }
                    try { scanLists(discover, seen, updates); } catch (Soft e) { log("Listas da MediocreScan: " + e.getMessage()); }
                }
                Map<String, Object> plan;
                try {
                    plan = site(Json.map("action", "plan", "syncLimit", Math.min(30, AUTO_ROUND_ROBIN + fails.size())));
                } catch (Soft e) {
                    log("Fila do site: " + e.getMessage());
                    idle(5 * 60_000L, done, totalAdded);
                    continue;
                }
                List<Long> queue = longs(plan.get("queue"));
                Map<Long, String> titles = new HashMap<>();
                List<Object> items = Json.arr(plan.get("items"));
                if (items != null) for (Object io : items) {
                    Map<String, Object> im = Json.obj(io);
                    Long id = im == null ? null : Json.whole(im.get("id"));
                    if (id != null) titles.put(id, Json.str(im.get("title")));
                }
                WorkRef next = null;
                int queueLeft = 0;
                for (Long id : queue) {
                    if (fails.containsKey(id) && fails.get(id) >= AUTO_MAX_FAILS) continue;
                    queueLeft++;
                    if (next == null) next = new WorkRef(id, titles.get(id));
                }
                if (next == null) {
                    for (Iterator<Map.Entry<Long, String>> it = updates.entrySet().iterator(); it.hasNext() && next == null;) {
                        Map.Entry<Long, String> u = it.next();
                        it.remove();
                        if (!(fails.containsKey(u.getKey()) && fails.get(u.getKey()) >= AUTO_MAX_FAILS)) next = new WorkRef(u.getKey(), u.getValue());
                    }
                }
                if (next == null && robin < AUTO_ROUND_ROBIN) {
                    for (Long id : longs(plan.get("sync"))) {
                        if (fails.containsKey(id) && fails.get(id) >= AUTO_MAX_FAILS) continue;
                        next = new WorkRef(id, null);
                        robin++;
                        break;
                    }
                }
                emit("auto-plan", "queue", queueLeft, "requests", count(plan, "requestsWaiting"), "updates", updates.size(), "works", done, "added", totalAdded);
                if (next == null) {
                    idle(nextScan - clock.now(), done, totalAdded);
                    continue;
                }
                try {
                    totalAdded += sendWork(next.id, next.title, Math.max(1, queueLeft + updates.size())).added;
                    done++;
                    fails.remove(next.id);
                } catch (Soft e) {
                    int n = (fails.containsKey(next.id) ? fails.get(next.id) : 0) + 1;
                    fails.put(next.id, n);
                    log((next.title != null && !next.title.isEmpty() ? next.title : "Obra " + next.id) + ": " + e.getMessage()
                        + (n >= AUTO_MAX_FAILS ? " O automático deixa esta obra para depois." : ""));
                }
                } catch (Retryable e) {
                    // Sem internet ou MediocreScan recusando: espera e tenta de novo, sem desligar o automático.
                    log(e.getMessage().replaceFirst("\\. O envio.*$", ".") + " O automático tenta de novo em 15 min.");
                    locksInRow = 0;
                    idle(15 * 60_000L, done, totalAdded);
                }
            }
        } catch (Stopped e) {
            emit("run-stopped", "works", done, "added", totalAdded, "auto", true);
        } catch (Fatal e) {
            emit("run-error", "message", e.getMessage(), "works", done, "added", totalAdded, "auto", true);
        } catch (RuntimeException e) {
            emit("run-error", "message", "Erro inesperado no modo automático (" + e.getClass().getSimpleName() + "). Toque em Ligar para continuar.", "works", done, "added", totalAdded, "auto", true);
        } finally {
            running = false;
        }
    }
}
