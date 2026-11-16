package __PKG__;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
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
    /** Capítulos por pedido ao site (máximo do site) e por lote no ritmo seguro. */
    static final int PER_SEND = 5;
    /** Maior lote do ciclo que os Ajustes aceitam (o site recebe de 5 em 5, um pedido logo depois do outro). */
    static final int MAX_BATCH = 30;
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

    /*
     * Ciclo (padrão, escolhido pelo dono em 16/11): pega 15 capítulos de uma vez, manda ao site e pausa 2 min antes do
     * próximo lote. Os números vêm dos Ajustes (Config.cycle*); com mais de 1 lote por ciclo, espera 33 s entre eles.
     */
    static final int CYCLE_BATCH = 15;
    static final long CYCLE_GAP_MS = 33_000L;
    static final int CYCLE_BATCHES = 1;
    static final long CYCLE_PAUSE_MS = 120_000L;
    /** Recusa da API no meio do lote: os próximos lotes encolhem 5 capítulos (até 5) e voltam 5 a cada 1 h sem recusa. */
    static final int BATCH_STEP = 5;
    static final long BATCH_RESTORE_MS = 60 * 60_000L;
    /** Entre os pedidos de capítulo de um mesmo lote. */
    static final long CYCLE_BURST_GAP_MS = 2_000L;
    /** Entre os outros pedidos à API (obra, listas, busca), para não virar rajada fora do lote. */
    static final long CYCLE_OTHER_GAP_MS = 10_000L;

    /* Modo automático: de quanto em quanto tempo olha as obras atualizadas na MediocreScan (1 pedido à API). */
    static final long AUTO_CYCLE_MS = 10 * 60_000L;
    /** De quanto em quanto tempo procura obras novas e liga pedidos de leitores. */
    static final long AUTO_DISCOVER_MS = 30 * 60_000L;
    /** Espera antes de tentar de novo quando algo precisa do admin (chave recusada, sessão encerrada). */
    static final long AUTO_FATAL_RETRY_MS = 30 * 60_000L;
    /** Obras do site conferidas por ciclo, das que estão há mais tempo sem conferir. */
    static final int AUTO_ROUND_ROBIN = 4;
    /** Pedidos de leitores procurados na MediocreScan por ciclo (1 pedido à API cada). */
    static final int AUTO_REQUEST_SEARCHES = 2;
    /** Obras novas colocadas na fila por ciclo. */
    static final int AUTO_DISCOVER_MAX = 20;
    /** Falhas seguidas de uma obra antes de o automático deixá-la para depois. */
    static final int AUTO_MAX_FAILS = 2;
    /** Depois desse tempo, uma obra deixada para depois por falhas volta a ser tentada. */
    static final long AUTO_FAIL_FORGET_MS = 6 * 3600_000L;
    /** Capítulos da primeira passada em obras novas (com a opção ligada): elas entram no site logo e o resto vem depois. */
    static final int AUTO_FIRST_PASS = 10;
    /** Bateria mínima (fora do carregador) para o automático continuar. */
    static final int AUTO_MIN_BATTERY = 15;
    /** De quanto em quanto tempo confere de novo uma condição que segurou o automático (Wi-Fi, carregador, bateria). */
    static final long AUTO_HOLD_CHECK_MS = 30_000L;

    /*
     * Revisão das obras do site (escolhida pelo dono): ao ligar o automático, antes da fila, confere cada obra que já
     * está no site e manda os capítulos novos. Custa 1 pedido à API por obra (mais os capítulos novos).
     */
    /** Uma revisão terminada há menos disso não se repete ao religar (abrir o app de novo, mudar uma opção). */
    static final long REVIEW_SKIP_MS = 60 * 60_000L;
    /** Com o automático ligado direto, revisa tudo de novo a cada 12 h. */
    static final long REVIEW_EVERY_MS = 12 * 3600_000L;
    /** Revisão cortada no meio (app fechado, celular desligado) continua de onde parou se começou há menos disso. */
    static final long REVIEW_RESUME_MS = 12 * 3600_000L;
    /** Espera antes de tentar de novo quando o site não devolve a lista de obras. */
    static final long REVIEW_RETRY_MS = 10 * 60_000L;
    /** Páginas da lista de obras do site (30 por página) lidas no máximo. */
    static final int REVIEW_MAX_PAGES = 50;

    /*
     * Rodízio (pedido do dono em 16/11): várias obras recebem capítulos ao mesmo tempo. Cada lote é dividido entre
     * elas (1 capítulo de cada, em roda); cada obra recebe até "capítulos por obra" e dá a vez para a próxima da fila.
     */
    /** Mais obras ao mesmo tempo que os Ajustes aceitam (o site lista 50 da fila por vez). */
    static final int AUTO_MAX_WORKS = 30;
    /** Obras abertas por volta (cada uma pede a lista de capítulos à API): o rodízio enche aos poucos, sem parar os lotes. */
    static final int WHEEL_OPEN_PER_ROUND = 5;
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
        /** Estado do aparelho para as condições do automático (null = não sabe; nada segura o envio). */
        default Device device() { return null; }
        /** Guarda a velocidade aprendida (intervalo atual, intervalo mínimo e até quando ele vale). */
        default void saveSpeed(long gap, long min, long minUntil) { }
        /** Revisão das obras do site em andamento ou a última feita (para continuar depois de o app fechar). */
        default Map<String, Object> loadReview() { return null; }
        default void saveReview(Map<String, Object> review) { }
    }

    /** Rede e bateria no momento. */
    static final class Device {
        boolean online = true;
        boolean wifi = true;
        boolean charging = true;
        int battery = -1;
    }

    /** Opções do modo automático (escolhidas no app). */
    static final class AutoOptions {
        boolean discover = true;
        boolean requests = true;
        boolean wifiOnly = false;
        boolean chargingOnly = false;
        /** Capítulos da primeira passada em obras novas; 0 = envia cada obra inteira. */
        int firstPass = AUTO_FIRST_PASS;
        /** Ao ligar (e a cada 12 h), revisa as obras do site antes da fila. */
        boolean review = true;
        /** Rodízio: quantas obras recebem capítulos ao mesmo tempo (1 = uma de cada vez, até o fim). */
        int works = 1;
        /** Rodízio: capítulos que cada obra recebe antes de dar a vez para a próxima da fila (0 = até acabar). */
        int perWork = 0;
        /** Obra escolhida ao ligar (0 = nenhuma): recebe os lotes inteiros antes de tudo. */
        long focusId;
        String focusTitle;
        int focusChapters;

        static AutoOptions from(Map<String, Object> job) {
            AutoOptions o = new AutoOptions();
            if (job == null) return o;
            if (job.get("works") != null) o.works = (int) Config.clamp(job.get("works"), 1, AUTO_MAX_WORKS, 1);
            if (job.get("perWork") != null) o.perWork = (int) Config.clamp(job.get("perWork"), 0, 1000, 0);
            Map<String, Object> f = Json.obj(job.get("focus"));
            Long fid = f == null ? null : Json.whole(f.get("id"));
            if (fid != null && fid > 0) {
                o.focusId = fid;
                o.focusTitle = Json.str(f.get("title"));
                o.focusChapters = (int) Config.clamp(f.get("chapters"), 0, 5000, 0);
            }
            if (job.get("review") != null) o.review = Json.truthy(job.get("review"));
            if (job.get("discover") != null) o.discover = Json.truthy(job.get("discover"));
            if (job.get("requests") != null) o.requests = Json.truthy(job.get("requests"));
            o.wifiOnly = Json.truthy(job.get("wifiOnly"));
            o.chargingOnly = Json.truthy(job.get("chargingOnly"));
            if (job.get("firstPass") != null) {
                Long n = Json.whole(job.get("firstPass"));
                o.firstPass = n == null ? 0 : (int) Math.max(0, Math.min(100, n));
            }
            return o;
        }
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
        /** "cycle" (padrão): lotes com espera e pausa a cada ciclo; "safe": 1 pedido por minuto, 5 a cada 1 min 12 s. */
        boolean fast = true;
        int cycleBatch = CYCLE_BATCH;
        long cycleGapMs = CYCLE_GAP_MS;
        int cycleBatches = CYCLE_BATCHES;
        long cyclePauseMs = CYCLE_PAUSE_MS;
        /** Lotes já feitos no ciclo atual e fim do último (guardados para continuar o ciclo depois de reabrir). */
        long speedGap = -1;
        long speedMin = -1;
        long speedMinUntil = -1;

        static Config from(Object v) {
            Map<String, Object> m = Json.obj(v);
            Config c = new Config();
            if (m == null) return c;
            c.site = Json.str(m.get("site"));
            c.token = Json.str(m.get("token"));
            c.supabaseUrl = Json.str(m.get("supabaseUrl"));
            c.supabaseKey = Json.str(m.get("supabaseKey"));
            c.session = Session.from(m.get("session"));
            c.fast = !"safe".equals(Json.str(m.get("speed")));
            Map<String, Object> cy = Json.obj(m.get("cycle"));
            if (cy != null) {
                c.cycleBatch = (int) clamp(cy.get("batch"), 1, MAX_BATCH, CYCLE_BATCH);
                c.cycleGapMs = clamp(cy.get("gap"), 0, 600, CYCLE_GAP_MS / 1000) * 1000L;
                c.cycleBatches = (int) clamp(cy.get("batches"), 1, 20, CYCLE_BATCHES);
                c.cyclePauseMs = clamp(cy.get("pause"), 0, 3600, CYCLE_PAUSE_MS / 1000) * 1000L;
            }
            return c;
        }

        private static long clamp(Object v, long min, long max, long def) {
            Long n = Json.whole(v);
            return n == null ? def : Math.max(min, Math.min(max, n));
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("site", site);
            m.put("token", token);
            m.put("supabaseUrl", supabaseUrl);
            m.put("supabaseKey", supabaseKey);
            Session s = session;
            m.put("session", s == null ? null : s.toMap());
            m.put("speed", fast ? "cycle" : "safe");
            m.put("cycle", Json.map("batch", cycleBatch, "gap", cycleGapMs / 1000, "batches", cycleBatches, "pause", cyclePauseMs / 1000));
            return m;
        }
    }

    static final class WorkRef {
        final long id;
        final String title;
        WorkRef(long id, String title) { this.id = id; this.title = title; }
    }

    /** Revisão das obras do site: as que faltam conferir e o que já deu (guardada no celular a cada obra). */
    static final class Review {
        long startedAt, finishedAt, added;
        int total, checked, news, failed, queued;
        final List<WorkRef> left = new ArrayList<>();

        Map<String, Object> toMap() {
            List<Object> l = new ArrayList<>();
            for (WorkRef w : left) l.add(Json.map("id", w.id, "title", w.title));
            return Json.map("startedAt", startedAt, "finishedAt", finishedAt, "total", total, "checked", checked,
                "news", news, "failed", failed, "queued", queued, "added", added, "left", l);
        }

        static Review from(Map<String, Object> m) {
            if (m == null) return null;
            Review r = new Review();
            r.startedAt = count(m, "startedAt");
            r.finishedAt = count(m, "finishedAt");
            r.added = count(m, "added");
            r.total = (int) count(m, "total");
            r.checked = (int) count(m, "checked");
            r.news = (int) count(m, "news");
            r.failed = (int) count(m, "failed");
            r.queued = (int) count(m, "queued");
            List<Object> l = Json.arr(m.get("left"));
            if (l != null) for (Object o : l) {
                Map<String, Object> w = Json.obj(o);
                Long id = w == null ? null : Json.whole(w.get("id"));
                if (id != null && id > 0) r.left.add(new WorkRef(id, Json.str(w.get("title"))));
            }
            return r;
        }

        WorkRef find(long id) {
            for (WorkRef w : left) if (w.id == id) return w;
            return null;
        }

        void remove(long id) {
            for (Iterator<WorkRef> it = left.iterator(); it.hasNext();) if (it.next().id == id) it.remove();
        }
    }

    /** Obra aberta no rodízio (ou a escolhida): os capítulos desta vez e o que já foi. */
    static final class Slot {
        final long id;
        String title, slug, source, cover;
        boolean created, focus;
        int priority;
        /** Capítulos que faltam nesta vez (já cortados no limite da vez). */
        final List<Long> pending = new ArrayList<>();
        Entries entries;
        /** Quantos faltavam no total ao abrir; `total` = os desta vez. */
        long totalAll, total, tried, added, skipped;
        Slot(long id) { this.id = id; }

        Map<String, Object> toMap() {
            return Json.map("id", id, "name", title, "slug", slug, "cover", cover, "got", tried, "total", total, "added", added,
                "later", Math.max(0, totalAll - total), "focus", focus, "source", source, "priority", priority);
        }
    }

    /** Pedido da tela: "Enviar agora" numa obra (capítulos 0 = todos os que faltam). */
    static final class FocusReq {
        final long id;
        final String title;
        final int chapters;
        FocusReq(long id, String title, int chapters) { this.id = id; this.title = title; this.chapters = chapters; }
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
    private volatile int locksInRow;
    private volatile int cdnRefusals;
    /* Ciclo: lotes feitos no ciclo atual; enquanto busca os capítulos de um lote, os pedidos saem mais juntos. */
    private int cycleDone;
    private volatile boolean inBatch;
    /* Lote encolhido depois de recusa da API (MAX_VALUE = o lote dos Ajustes) e hora da última recusa. */
    private volatile int batchCap = Integer.MAX_VALUE;
    private volatile long lastRefusal = -1;
    /*
     * Páginas do capítulo (CDN) buscadas numa thread à parte enquanto o próximo capítulo pede à API: o lote fica mais
     * curto sem mudar o intervalo entre pedidos à API. Só com `cdnHttp` (o serviço passa um; os testes, não).
     */
    private final Http cdnHttp;
    private final ThreadPoolExecutor cdnPool;

    EnvioEngine(Config cfg, Http http, Http uiHttp, Clock clock, Host host) {
        this(cfg, http, uiHttp, null, clock, host);
    }

    EnvioEngine(Config cfg, Http http, Http uiHttp, Http cdnHttp, Clock clock, Host host) {
        this.cfg = cfg;
        this.http = http;
        this.uiHttp = uiHttp;
        this.cdnHttp = cdnHttp;
        this.clock = clock;
        this.host = host;
        if (cdnHttp != null) {
            cdnPool = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, new LinkedBlockingQueue<Runnable>(), new ThreadFactory() {
                @Override
                public Thread newThread(Runnable r) {
                    Thread t = new Thread(r, "estudio-cdn");
                    t.setDaemon(true);
                    return t;
                }
            });
            cdnPool.allowCoreThreadTimeOut(true);
        } else cdnPool = null;
        long now = clock.now();
        lastApi = fresh(cfg.paceApi, now);
        lastPair = fresh(cfg.pacePair, now);
        lastLockEnd = fresh(cfg.paceLock, now);
        // Continua o ciclo de onde parou (se o último lote foi há pouco).
        if (cfg.speedGap > 0 && cfg.speedMin > 0 && now - cfg.speedMin < PACE_FRESH_MS) cycleDone = (int) Math.min(cfg.speedGap, cfg.cycleBatches);
    }

    /** Intervalo atual entre pedidos à API. */
    long apiGapMs() {
        if (!cfg.fast) return API_GAP_MS;
        return inBatch ? CYCLE_BURST_GAP_MS : CYCLE_OTHER_GAP_MS;
    }

    /** Duração aproximada de um ciclo completo (lotes + esperas + pausa). */
    long cycleMs() {
        long fetch = (long) cfg.cycleBatch * CYCLE_BURST_GAP_MS + 5_000L;
        return cfg.cycleBatches * fetch + Math.max(0, cfg.cycleBatches - 1) * cfg.cycleGapMs + cfg.cyclePauseMs;
    }

    /** Capítulos por hora no ritmo escolhido (quando cada capítulo pede à API). */
    int perHour() {
        if (!cfg.fast) return (int) (3600_000L / API_GAP_MS);
        return (int) Math.max(1, (long) cfg.cycleBatch * cfg.cycleBatches * 3600_000L / Math.max(1, cycleMs()));
    }

    /** Capítulos por minuto, para o texto de registro. */
    int perMinute() { return Math.max(1, Math.round(perHour() / 60f)); }

    private void emitSpeed() {
        emit("speed", "fast", cfg.fast, "perHour", perHour(), "batch", cfg.cycleBatch, "gapS", cfg.cycleGapMs / 1000,
            "batches", cfg.cycleBatches, "pauseS", cfg.cyclePauseMs / 1000);
    }

    private void saveCycle() {
        try { host.saveSpeed(cycleDone, clock.now(), 0); } catch (RuntimeException ignored) { /* ok */ }
    }

    private static long fresh(long v, long now) {
        return v > 0 && v <= now && now - v < PACE_FRESH_MS ? v : -1;
    }

    boolean isRunning() { return running; }

    /** O admin pediu para parar (botão Parar ou desligou o automático). */
    boolean stopRequested() { return stop; }

    void requestStop() {
        stop = true;
        http.abort();
        if (cdnHttp != null) cdnHttp.abort();
    }

    /** Fim do trabalho: solta a thread das páginas. */
    void close() {
        if (cdnPool != null) cdnPool.shutdownNow();
    }

    /** Modo automático: acorda da espera (o admin pôs obras na fila pelo app). */
    void wake() { wake = true; }

    /* Rodízio e obra escolhida (só no automático). */
    private final List<Slot> wheel = new ArrayList<>();
    private int wheelCursor;
    private Slot focus;
    private volatile FocusReq focusReq;
    /** Obras que já receberam a vez delas no rodízio (id → quando): voltam depois das outras da fila. */
    private final Map<Long, Long> rested = new LinkedHashMap<>();

    /**
     * "Enviar agora" numa obra: com o automático rodando, ela passa na frente de tudo (revisão, rodízio, fila) e
     * recebe os lotes inteiros até receber `chapters` capítulos (0 = todos os que faltam). Depois tudo continua.
     */
    void requestFocus(long id, String title, int chapters) {
        focusReq = new FocusReq(id, title, Math.max(0, chapters));
        wake = true;
    }

    /* Revisão das obras do site (só no automático). */
    private Review review;
    private long reviewFinishedAt, reviewRetryAt;
    /** Fim da última revisão que conferiu alguma obra (a conferência de rotina descansa nas 6 h seguintes). */
    private long reviewCoveredAt;
    private volatile boolean reviewWanted, reviewForce;

    /**
     * Pede uma revisão das obras do site: ao abrir o app (vale se a última foi há mais de 1 h) ou no botão
     * "Revisar agora" (`force`, revisa mesmo que tenha acabado de revisar). Acorda o automático se ele estiver esperando.
     */
    void requestReview(boolean force) {
        if (force) reviewForce = true;
        reviewWanted = true;
        wake = true;
    }

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

    /**
     * Antes de cada lote. Ritmo segura: 1 min 12 s do começo do lote anterior. Ciclo: espera entre lotes
     * (33 s) contada do fim do lote anterior e, completados os lotes do ciclo (3 = 15 capítulos), a pausa (2 min).
     */
    private void pairWait() {
        inBatch = false;
        long mark = Math.max(lastPair, lastLockEnd);
        if (!cfg.fast) {
            if (mark < 0) return;
            long ms = Math.max(0, WAIT_MS - (clock.now() - mark));
            if (ms > 0) { emit("waiting", "ms", ms); pause(ms); }
            return;
        }
        boolean cycleEnd = cycleDone >= cfg.cycleBatches;
        if (mark >= 0) {
            long need = cycleEnd ? cfg.cyclePauseMs : cfg.cycleGapMs;
            long ms = Math.max(0, need - (clock.now() - mark));
            if (ms > 0) {
                emit("waiting", "ms", ms, "cycle", cycleEnd, "next", batchSize(), "batches", cfg.cycleBatches);
                pause(ms);
            }
        }
        if (cycleEnd) cycleDone = 0;
    }

    /** Fim de um lote: conta no ciclo e marca a hora (as esperas contam daqui). */
    private void batchDone() {
        synchronized (pace) {
            lastPair = clock.now();
            savePace();
        }
        cycleDone++;
        saveCycle();
        restoreBatch();
    }

    /** A API recusou no meio do ciclo: os próximos lotes vão menores (15 → 10 → 5) até passar 1 h sem recusa. */
    private void shrinkBatch() {
        lastRefusal = clock.now();
        if (!cfg.fast) return;
        int cur = batchSize();
        if (cur <= PER_SEND) return;
        batchCap = Math.max(PER_SEND, cur - BATCH_STEP);
        log("A MediocreScan recusou pedidos: os próximos lotes vão com " + batchCap + " capítulos. Volta a "
            + cfg.cycleBatch + " aos poucos, depois de 1 h sem recusa.");
        emit("batch-size", "batch", batchCap, "max", cfg.cycleBatch, "reason", "recusa");
    }

    private void restoreBatch() {
        if (batchCap >= cfg.cycleBatch || lastRefusal < 0 || clock.now() - lastRefusal < BATCH_RESTORE_MS) return;
        batchCap = Math.min(cfg.cycleBatch, batchCap + BATCH_STEP);
        lastRefusal = clock.now();
        if (batchCap >= cfg.cycleBatch) batchCap = Integer.MAX_VALUE;
        log("1 h sem recusa da MediocreScan: lotes de " + batchSize() + " capítulos de novo.");
        emit("batch-size", "batch", batchSize(), "max", cfg.cycleBatch, "reason", "volta");
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
        long gap = api ? apiGapMs() : CDN_GAP_MS;
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
                if (api && wait > 2000 && !announced) { emit("api-wait", "ms", wait, "gapMs", gap); announced = true; }
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
        return mediocre(api, path, http);
    }

    private Object mediocre(boolean api, String path, Http http) throws Soft {
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
                if (api) shrinkBatch();
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

    /** Capítulos por lote: os do ciclo (15 por padrão; menos depois de recusa) ou 5 no ritmo seguro. */
    int batchSize() { return cfg.fast ? Math.max(1, Math.min(cfg.cycleBatch, batchCap)) : PER_SEND; }

    /** Manda os capítulos de um lote ao site de 5 em 5 (máximo do site por pedido), um pedido logo depois do outro. */
    private long[] postChapters(long id, List<Map<String, Object>> chapters) throws Soft {
        long added = 0, skipped = 0;
        for (int i = 0; i < chapters.size(); i += PER_SEND) {
            Map<String, Object> r = site(chapterPayload(id, new ArrayList<>(chapters.subList(i, Math.min(chapters.size(), i + PER_SEND)))));
            added += count(r, "added");
            skipped += count(r, "skipped");
        }
        return new long[] { added, skipped };
    }

    /** Um capítulo do lote: os dados, ou o motivo de ter ficado de fora. */
    static final class Fetched {
        final long capId;
        ChapterData data;
        String error;
        boolean missing;
        Map<String, Object> meta;
        boolean fromList;
        Future<Object> content;
        Fetched(long capId) { this.capId = capId; }
    }

    /**
     * Busca os capítulos de um lote. Com a thread das páginas, cada capítulo pede à API (no intervalo do lote) e já
     * passa as páginas (CDN) para a outra thread, seguindo para o próximo sem esperar; no fim, junta tudo na ordem.
     */
    private List<Fetched> fetchGroup(List<Long> group, Entries entries, long posBase, long total) throws Soft {
        List<Fetched> out = new ArrayList<>();
        for (int k = 0; k < group.size(); k++) {
            long capId = group.get(k);
            Fetched f = new Fetched(capId);
            out.add(f);
            emit("fetching", "n", k + 1, "of", group.size(), "pos", posBase + k + 1, "total", total);
            if (cdnPool == null) {
                try {
                    f.data = chapterData(capId, entries);
                    if (f.data == null) f.missing = true;
                } catch (Soft e) {
                    f.error = e.getMessage();
                }
                continue;
            }
            try {
                Map<String, Object> e = entries.map.get(capId);
                if (e != null && Json.str(e.get("cap_uuid")) != null) {
                    f.meta = new LinkedHashMap<>();
                    f.meta.put("obr_id", entries.obrId);
                    f.meta.putAll(e);
                    f.fromList = true;
                } else {
                    f.meta = Json.obj(unwrap(mediocre(true, "/capitulos/" + capId)));
                    if (f.meta == null) { f.missing = true; continue; }
                }
                final String path = contentPath(f.meta);
                if (path == null) {
                    if (f.fromList) f.data = chapterData(capId, entries);
                    else f.data = new ChapterData(f.meta, null);
                    if (f.data == null) f.missing = true;
                    continue;
                }
                f.content = cdnPool.submit(new java.util.concurrent.Callable<Object>() {
                    @Override
                    public Object call() {
                        try { return mediocre(false, path, cdnHttp); } catch (Soft ignored) { return null; }
                    }
                });
            } catch (Soft e) {
                f.error = e.getMessage();
            }
        }
        for (Fetched f : out) {
            if (f.content == null) continue;
            Object content = await(f.content);
            f.content = null;
            if (content == null && f.fromList) {
                // As páginas pelo código da lista falharam: tenta pelo caminho normal (pede à API).
                try {
                    f.data = chapterData(f.capId, new Entries());
                    if (f.data == null) f.missing = true;
                } catch (Soft e) {
                    f.error = e.getMessage();
                }
            } else f.data = new ChapterData(f.meta, content);
        }
        return out;
    }

    /** Espera as páginas buscadas na outra thread; o botão Parar e os erros graves passam para cá. */
    private Object await(Future<Object> fu) {
        for (;;) {
            try {
                return fu.get(500, TimeUnit.MILLISECONDS);
            } catch (TimeoutException t) {
                if (stop) { fu.cancel(true); throw new Stopped(); }
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                fu.cancel(true);
                throw new Stopped();
            } catch (ExecutionException ee) {
                Throwable c = ee.getCause();
                if (c instanceof RuntimeException) throw (RuntimeException) c;
                if (c instanceof Error) throw (Error) c;
                return null;
            } catch (java.util.concurrent.CancellationException ce) {
                throw new Stopped();
            }
        }
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
        return sendWork(id, name, left, 0);
    }

    /**
     * `limit` > 0: envia só os primeiros `limit` capítulos que faltam e devolve a obra para o fim da fila
     * (primeira passada do automático em obras novas); o resto vem quando as outras obras novas tiverem a delas.
     */
    private Outcome sendWork(long id, String name, int left, int limit) throws Soft {
        inBatch = false;
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
        long totalAll = rem != null ? rem : pending.size();
        boolean limited = limit > 0 && pending.size() > limit;
        if (limited) pending = new ArrayList<>(pending.subList(0, limit));
        long total = limited ? pending.size() : totalAll;
        Entries entries = listEntries(work);
        Map<String, Object> wm = Json.obj(unwrap(work));
        String title = wm != null && Json.str(wm.get("obr_nome")) != null && !Json.str(wm.get("obr_nome")).isEmpty()
            ? Json.str(wm.get("obr_nome")) : name != null && !name.isEmpty() ? name : "Obra " + id;
        emit("work-start", "id", id, "name", title, "slug", w.get("slug"), "created", Json.truthy(w.get("created")), "total", total, "left", left);
        if (!pending.isEmpty()) {
            int fast = 0;
            for (Long c : pending) { Map<String, Object> e = entries.map.get(c); if (e != null && e.get("cap_uuid") != null) fast++; }
            log(fast > 0 ? fast + " de " + pending.size() + " capítulo(s) vêm direto do CDN (rápido)."
                : "A lista desta obra não traz o código dos capítulos: cada um pede à API" + (cfg.fast ? " (lotes de " + batchSize() + ")." : " (1 por minuto)."));
        }
        long added = 0, skipped = 0, tried = 0;
        boolean failed = true;
        try {
            for (int i = 0; i < pending.size();) {
                // Obra escolhida na tela: esta para aqui (o site guarda o que falta) e a escolhida vai na frente.
                if (autoOpts != null && focusReq != null) {
                    log(title + ": pausada para a obra escolhida; continua depois.");
                    break;
                }
                holdIfNeeded();
                pairWait();
                long batchStart = clock.now();
                // O lote pode mudar entre um e outro (encolhe depois de recusa da API e volta depois).
                List<Long> group = pending.subList(i, Math.min(pending.size(), i + batchSize()));
                i += group.size();
                inBatch = true;
                emit("sending", "from", tried + 1, "to", tried + group.size(), "total", total);
                List<Map<String, Object>> chapters = new ArrayList<>();
                for (Fetched f : fetchGroup(group, entries, tried, total)) {
                    if (f.error != null) log("Capítulo " + f.capId + ": " + f.error);
                    else if (f.missing || f.data == null) log("Capítulo " + f.capId + ": não encontrado na MediocreScan.");
                    else chapters.add(Json.map("capId", f.capId, "meta", f.data.meta, "content", f.data.content));
                }
                inBatch = false;
                long fetchMs = clock.now() - batchStart;
                tried += group.size();
                skipped += group.size() - chapters.size();
                if (!chapters.isEmpty()) {
                    emit("posting", "count", chapters.size());
                    long[] r = postChapters(id, chapters);
                    added += r[0];
                    skipped += r[1];
                }
                if (cfg.fast) batchDone();
                else synchronized (pace) {
                    // Segura: no máximo 5 capítulos a cada 1 min 12 s, contados do começo do lote.
                    lastPair = batchStart;
                    savePace();
                }
                emit("progress", "id", id, "done", Math.min(tried, total), "total", total, "added", added, "skipped", skipped, "left", left,
                    "batch", group.size(), "batchMs", clock.now() - batchStart, "fetchMs", fetchMs);
            }
            failed = false;
        } finally {
            // Mesmo parando no meio, o site fica sabendo o que falta e retoma esta obra primeiro.
            long remaining = Math.max(totalAll - tried, 0);
            Map<String, Object> finish = Json.map("action", "finish", "obraId", id, "added", added, "remaining", remaining);
            if (limited && !failed && !stop && remaining > 0) finish.put("defer", true);
            if (failed || stop) {
                try { site(finish, true); } catch (Soft | RuntimeException ignored) { /* melhor esforço */ }
            } else {
                site(finish);
            }
        }
        long later = limited ? Math.max(totalAll - tried, 0) : 0;
        emit("work-done", "id", id, "name", title, "added", added, "skipped", skipped, "left", Math.max(0, left - 1), "later", later);
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
        emitSpeed();
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
        emitSpeed();
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
            for (int i = 0; i < todo.size();) {
                pairWait();
                long batchStart = clock.now();
                int from = i;
                List<Long> group = todo.subList(i, Math.min(todo.size(), i + batchSize()));
                i += group.size();
                inBatch = true;
                for (Long c : group) emit("chapter-state", "id", id, "capId", c, "state", "sending");
                emit("sending", "from", from + 1, "to", from + group.size(), "total", todo.size());
                List<Map<String, Object>> chapters = new ArrayList<>();
                for (Fetched f : fetchGroup(group, entries, from, todo.size())) {
                    if (f.error != null || f.missing || f.data == null) {
                        emit("chapter-state", "id", id, "capId", f.capId, "state", "fail");
                        skipped++;
                        if (f.error != null) log("Capítulo " + f.capId + ": " + f.error);
                        continue;
                    }
                    chapters.add(Json.map("capId", f.capId, "meta", f.data.meta, "content", f.data.content));
                }
                if (!chapters.isEmpty()) {
                    emit("posting", "count", chapters.size());
                    long[] r = postChapters(id, chapters);
                    long sk = r[1];
                    added += r[0];
                    skipped += sk;
                    // O site responde em conjunto; quem falhou aparece na conferência do fim.
                    for (Map<String, Object> c : chapters) emit("chapter-state", "id", id, "capId", c.get("capId"), "state", sk > 0 ? "check" : "site");
                }
                inBatch = false;
                if (cfg.fast) batchDone();
                else synchronized (pace) {
                    lastPair = batchStart;
                    savePace();
                }
                emit("progress", "id", id, "done", Math.min(i, todo.size()), "total", todo.size(), "added", added, "skipped", skipped, "left", 1,
                    "batch", group.size(), "batchMs", clock.now() - batchStart);
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
        inBatch = false;
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
    /** Maior número de capítulo que a lista mostra para a obra (capítulos recentes ou campo de último capítulo), ou -1. */
    static double listLatest(Map<String, Object> o) {
        double max = -1;
        List<Object> caps = Json.arr(o.get("capitulos"));
        if (caps != null) for (Object c : caps) {
            Map<String, Object> cm = Json.obj(c);
            Object n = cm == null ? null : cm.get("cap_num") != null ? cm.get("cap_num") : cm.get("numero");
            double v = number(n);
            if (v > max) max = v;
        }
        for (Map.Entry<String, Object> e : o.entrySet()) {
            String k = e.getKey().toLowerCase(java.util.Locale.ROOT);
            if (!(k.contains("ultim") && k.contains("cap")) && !k.equals("cap_num") && !k.contains("total_cap")) continue;
            Object v = e.getValue();
            if (v instanceof Map) { Map<String, Object> m = Json.obj(v); v = m == null ? null : m.get("cap_num") != null ? m.get("cap_num") : m.get("numero"); }
            double d = number(v);
            if (d > max) max = d;
        }
        return max;
    }

    private static double number(Object v) {
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof String) { try { return Double.parseDouble(((String) v).trim().replace(',', '.')); } catch (NumberFormatException ignored) { return -1; } }
        return -1;
    }

    private void scanLists(boolean discover, Map<Long, String> seen, Map<Long, String> updates) throws Soft {
        inBatch = false;
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
        Map<Long, Double> siteLatest = new HashMap<>();
        for (int i = 0; i < ids.size(); i += 100) {
            Map<String, Object> r = site(Json.map("action", "check", "ids", new ArrayList<>(ids.subList(i, Math.min(ids.size(), i + 100)))));
            // Último capítulo que o site já tem de cada obra (sites novos mandam; os antigos não).
            Map<String, Object> latest = Json.obj(r.get("latest"));
            if (latest != null) for (Map.Entry<String, Object> e : latest.entrySet()) {
                try { siteLatest.put(Long.parseLong(e.getKey()), number(e.getValue())); } catch (NumberFormatException ignored) { /* ok */ }
            }
            imported.addAll(longs(r.get("imported")));
            known.addAll(longs(r.get("imported")));
            known.addAll(longs(r.get("queued")));
            known.addAll(longs(r.get("failed")));
        }
        int news = 0, upToDate = 0;
        for (Long id : updated) {
            if (!imported.contains(id)) continue;
            Map<String, Object> entry = found.get(id);
            String sig = signature(entry);
            String before = seen.put(id, sig);
            double theirs = listLatest(entry);
            Double ours = siteLatest.get(id);
            boolean newer;
            if (theirs >= 0 && ours != null && ours >= 0) {
                // Dá para comparar: só confere a obra se a MediocreScan tem capítulo depois do último do site.
                newer = theirs > ours;
                if (!newer) upToDate++;
            } else {
                // Sem números: primeira vez nesta sessão confere; depois, só se a lista mudou.
                newer = before == null || (!sig.isEmpty() && !sig.equals(before));
            }
            if (newer) {
                if (!updates.containsKey(id)) news++;
                updates.put(id, workNameOf(entry));
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
        if (news > 0 || queued > 0 || discover) {
            log("Listas da MediocreScan: " + news + " obra(s) do site com capítulos novos"
                + (upToDate > 0 ? " (" + upToDate + " já em dia)" : "") + (discover ? ", " + queued + " obra(s) nova(s) na fila" : "") + ".");
        }
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
        if (wake && !reviewWanted) log("Obras novas na fila: o automático voltou a enviar.");
        wake = false;
    }

    /* Condições do automático (Wi-Fi, carregador, bateria): só valem com o automático ligado. */
    private volatile AutoOptions autoOpts;

    /** Está no modo automático agora (a obra escolhida só vale nele). */
    boolean autoRunning() { return running && autoOpts != null; }

    /** Motivo para segurar o automático agora, ou null para seguir. */
    String holdReason(AutoOptions o) {
        if (o == null) return null;
        Device d;
        try { d = host.device(); } catch (RuntimeException e) { d = null; }
        if (d == null) return null;
        if (!d.online) return "Sem internet";
        if (o.wifiOnly && !d.wifi) return "Esperando o Wi-Fi";
        if (o.chargingOnly && !d.charging) return "Esperando o carregador";
        if (!d.charging && d.battery >= 0 && d.battery < AUTO_MIN_BATTERY) return "Bateria baixa (" + d.battery + "%)";
        return null;
    }

    /** Segura o envio (entre lotes ou entre obras) até a condição voltar; avisa a tela de tempos em tempos. */
    private void holdIfNeeded() {
        AutoOptions o = autoOpts;
        String why = holdReason(o);
        if (why == null) return;
        log(why + ": o automático espera e continua sozinho.");
        long since = clock.now(), nextBeat = 0;
        while (why != null) {
            checkStop();
            if (clock.now() >= nextBeat) {
                emit("auto-hold", "reason", why, "since", since);
                nextBeat = clock.now() + 5 * 60_000L;
            }
            pause(AUTO_HOLD_CHECK_MS);
            String now = holdReason(o);
            if (now != null && !now.equals(why)) nextBeat = 0;
            why = now;
        }
        emit("resume");
        log("Condições de volta: o automático continua.");
    }

    /** Obra deixada para depois por falhas seguidas (esquecida depois de 6 h). */
    private boolean failedOut(Map<Long, long[]> fails, long id) {
        long[] f = fails.get(id);
        if (f == null) return false;
        if (clock.now() - f[1] > AUTO_FAIL_FORGET_MS) { fails.remove(id); return false; }
        return f[0] >= AUTO_MAX_FAILS;
    }

    private void saveReview(Review r) {
        try { host.saveReview(r == null ? null : r.toMap()); } catch (RuntimeException ignored) { /* só não continua depois */ }
    }

    /**
     * Lista as obras do site vindas da MediocreScan (páginas de 30) e monta a revisão: primeiro as que ainda saem
     * (em andamento, hiato...), depois as completas; dentro de cada grupo, as mais lidas primeiro. As que estão na
     * fila do site ficam de fora: a fila já cuida delas logo depois da revisão.
     */
    private Review startReview() throws Soft {
        emit("review-scan");
        List<Map<String, Object>> rows = new ArrayList<>();
        Set<Long> ids = new LinkedHashSet<>();
        for (int page = 1; page <= REVIEW_MAX_PAGES; page++) {
            checkStop();
            Map<String, Object> r = site(Json.map("action", "site_list", "filter", "mediocre", "q", "", "page", page));
            List<Object> items = Json.arr(r.get("items"));
            if (items == null || items.isEmpty()) break;
            for (Object o : items) {
                Map<String, Object> m = Json.obj(o);
                Long id = m == null ? null : Json.whole(m.get("source_mediocre_id"));
                if (id != null && id > 0 && ids.add(id)) rows.add(m);
            }
            long total = count(r, "total"), size = count(r, "pageSize");
            if (size <= 0) size = 30;
            if (items.size() < size || (total > 0 && (long) page * size >= total)) break;
        }
        Set<Long> queued = new HashSet<>();
        List<Long> all = new ArrayList<>(ids);
        for (int i = 0; i < all.size(); i += 100) {
            checkStop();
            Map<String, Object> r = site(Json.map("action", "check", "ids", new ArrayList<>(all.subList(i, Math.min(all.size(), i + 100)))));
            queued.addAll(longs(r.get("queued")));
        }
        Collections.sort(rows, new Comparator<Map<String, Object>>() {
            @Override
            public int compare(Map<String, Object> a, Map<String, Object> b) {
                int ca = "Completo".equalsIgnoreCase(Json.str(a.get("status"))) ? 1 : 0;
                int cb = "Completo".equalsIgnoreCase(Json.str(b.get("status"))) ? 1 : 0;
                if (ca != cb) return ca - cb;
                return Long.compare(count(b, "views"), count(a, "views"));
            }
        });
        Review rv = new Review();
        rv.startedAt = clock.now();
        for (Map<String, Object> m : rows) {
            long id = Json.whole(m.get("source_mediocre_id"));
            if (queued.contains(id)) { rv.queued++; continue; }
            rv.left.add(new WorkRef(id, Json.str(m.get("title"))));
        }
        rv.total = rv.left.size();
        return rv;
    }

    /** Começa a revisão se foi pedida (ao ligar, ao abrir o app, no botão) ou se já passaram 12 h da última. */
    private void maybeStartReview(AutoOptions opts) {
        if (review != null) return;
        long now = clock.now();
        boolean due = opts.review && reviewFinishedAt > 0 && now - reviewFinishedAt >= REVIEW_EVERY_MS;
        if (!(reviewWanted || due) || now < reviewRetryAt) return;
        boolean force = reviewForce;
        if (!force && !opts.review) { reviewWanted = false; return; }
        if (!force && !due && reviewFinishedAt > 0 && now - reviewFinishedAt < REVIEW_SKIP_MS) {
            reviewWanted = false;
            long ago = (now - reviewFinishedAt) / 60_000L;
            log("As obras do site foram revisadas há " + (ago < 1 ? "menos de 1 min" : ago + " min") + ": a próxima revisão vem sozinha em "
                + Math.max(1, (REVIEW_EVERY_MS - (now - reviewFinishedAt) + 1_800_000L) / 3_600_000L) + " h. Para revisar agora, toque em Revisar obras.");
            emit("review-skip", "finishedAt", reviewFinishedAt, "nextMs", REVIEW_EVERY_MS - (now - reviewFinishedAt));
            return;
        }
        Review rv;
        try {
            rv = startReview();
        } catch (Soft e) {
            log("Revisão das obras do site: " + e.getMessage() + " Tenta de novo em 10 min.");
            reviewRetryAt = now + REVIEW_RETRY_MS;
            return;
        }
        reviewWanted = false;
        reviewForce = false;
        review = rv;
        saveReview(rv);
        if (rv.left.isEmpty()) log("Revisão das obras do site: nenhuma obra para conferir agora" + (rv.queued > 0 ? " (as " + rv.queued + " do site estão na fila)" : "") + ".");
        else log("Revisão das obras do site: " + rv.total + " obra(s) para conferir" + (rv.queued > 0 ? " (" + rv.queued + " já estão na fila e vão depois)" : "")
            + ". Primeiro as que ainda saem, as mais lidas antes. Depois vem a fila.");
        emit("review-start", "total", rv.total, "done", 0, "news", 0, "added", 0, "queued", rv.queued, "resumed", false);
        if (rv.left.isEmpty()) finishReview();
    }

    /**
     * Um passo da revisão: a próxima obra do site. As que a lista da MediocreScan já mostrou com capítulo novo passam
     * na frente. Erro numa obra não para a revisão (anota e segue); sem internet a obra fica para a próxima tentativa.
     */
    private Outcome reviewStep(Map<Long, long[]> fails, Map<Long, String> updates) {
        Review rv = review;
        WorkRef w = null;
        String source = "revisao";
        for (Iterator<Map.Entry<Long, String>> it = updates.entrySet().iterator(); it.hasNext() && w == null;) {
            Map.Entry<Long, String> u = it.next();
            WorkRef in = rv.find(u.getKey());
            if (in != null) { it.remove(); w = in; source = "atualizada"; }
        }
        if (w == null) w = rv.left.get(0);
        emit("auto-pick", "id", w.id, "source", source, "priority", 0, "limit", 0, "review", rv.checked + 1, "reviewTotal", rv.total);
        Outcome out = null;
        try {
            out = sendWork(w.id, w.title, rv.left.size(), 0);
            rv.added += out.added;
            if (out.added > 0) rv.news++;
            fails.remove(w.id);
        } catch (Soft e) {
            rv.failed++;
            long[] f = fails.get(w.id);
            fails.put(w.id, new long[] { (f == null ? 0 : f[0]) + 1, clock.now() });
            log((w.title != null && !w.title.isEmpty() ? w.title : "Obra " + w.id) + ": " + e.getMessage() + " A revisão segue para a próxima.");
        }
        rv.remove(w.id);
        rv.checked++;
        saveReview(rv);
        emit("review-progress", "done", rv.checked, "total", rv.total, "news", rv.news, "added", rv.added, "failed", rv.failed,
            "id", w.id, "name", w.title, "workAdded", out == null ? 0 : out.added);
        if (rv.left.isEmpty()) finishReview();
        return out;
    }

    private void finishReview() {
        Review rv = review;
        if (rv == null) return;
        rv.finishedAt = clock.now();
        reviewFinishedAt = rv.finishedAt;
        if (rv.checked > 0) reviewCoveredAt = rv.finishedAt;
        review = null;
        saveReview(rv);
        if (rv.checked > 0) log("Revisão concluída: " + rv.checked + " obra(s) do site conferida(s), "
            + (rv.news == 0 ? "nenhuma com capítulo novo" : rv.news + " com capítulos novos (+" + rv.added + " capítulos)")
            + (rv.failed > 0 ? ", " + rv.failed + " com erro" : "") + ". Agora a fila; a próxima revisão vem em 12 h.");
        emit("review-done", "checked", rv.checked, "total", rv.total, "news", rv.news, "added", rv.added, "failed", rv.failed,
            "ms", rv.finishedAt - rv.startedAt, "nextMs", REVIEW_EVERY_MS);
    }

    /**
     * Abre uma obra para o rodízio (ou como escolhida): pede a lista à API, cria/atualiza no site e guarda os
     * capítulos que faltam, cortados em `quota` (0 = todos). Devolve null se a obra não existe mais na MediocreScan.
     */
    private Slot openSlot(long id, String name, int quota, String source, int priority, boolean isFocus) throws Soft {
        inBatch = false;
        Object work = mediocre(true, "/obras/" + id);
        if (work == null) {
            site(Json.map("action", "finish", "obraId", id, "added", 0, "remaining", 0));
            emit("work-done", "id", id, "name", name, "added", 0, "skipped", 0, "left", 0, "note", "não encontrada na MediocreScan", "wheel", true);
            return null;
        }
        Map<String, Object> w = site(Json.map("action", "work", "obraId", id, "work", work, "publish", true));
        List<Long> pending = longs(w.get("pendingCapIds"));
        Long rem = Json.whole(w.get("remaining"));
        Slot sl = new Slot(id);
        sl.totalAll = rem != null ? Math.max(rem, pending.size()) : pending.size();
        if (quota > 0 && pending.size() > quota) pending = new ArrayList<>(pending.subList(0, quota));
        sl.pending.addAll(pending);
        sl.total = pending.size();
        sl.entries = listEntries(work);
        Map<String, Object> wm = Json.obj(unwrap(work));
        sl.title = wm != null && Json.str(wm.get("obr_nome")) != null && !Json.str(wm.get("obr_nome")).isEmpty()
            ? Json.str(wm.get("obr_nome")) : name != null && !name.isEmpty() ? name : "Obra " + id;
        sl.slug = Json.str(w.get("slug"));
        sl.created = Json.truthy(w.get("created"));
        sl.source = source;
        sl.priority = priority;
        sl.focus = isFocus;
        emit("slot-open", "id", id, "name", sl.title, "slug", sl.slug, "created", sl.created, "total", sl.total,
            "later", Math.max(0, sl.totalAll - sl.total), "source", source, "priority", priority, "focus", isFocus);
        return sl;
    }

    /**
     * Fecha a vez de uma obra: conta ao site o que falta. Se ainda falta (bateu o limite da vez), vai para o fim da
     * fila (`defer`) e descansa no rodízio até as outras terem a vez delas.
     */
    private void closeSlot(Slot sl, String note) {
        long remaining = Math.max(0, sl.totalAll - sl.tried);
        boolean turnOver = remaining > 0 && sl.pending.isEmpty() && !stop;
        Map<String, Object> finish = Json.map("action", "finish", "obraId", sl.id, "added", sl.added, "remaining", remaining);
        if (turnOver && !sl.focus) finish.put("defer", true);
        try {
            site(finish, stop);
        } catch (Soft | RuntimeException e) {
            if (!stop) log(sl.title + ": o site não confirmou o fim da vez (" + e.getMessage() + ").");
        }
        if (turnOver && !sl.focus) rested.put(sl.id, clock.now());
        emit("work-done", "id", sl.id, "name", sl.title, "added", sl.added, "skipped", sl.skipped, "left", 0,
            "later", turnOver ? remaining : 0, "wheel", true, "focus", sl.focus, "note", note);
    }

    /** Une as listas de capítulos das obras abertas (o código de cada capítulo é único na MediocreScan). */
    private static Entries merged(List<Slot> slots) {
        Entries all = new Entries();
        for (Slot sl : slots) {
            if (sl.entries == null) continue;
            for (Map.Entry<Long, Map<String, Object>> e : sl.entries.map.entrySet()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("obr_id", sl.entries.obrId != null ? sl.entries.obrId : sl.id);
                m.putAll(e.getValue());
                all.map.put(e.getKey(), m);
            }
        }
        return all;
    }

    /**
     * Um lote dividido entre as obras abertas: 1 capítulo de cada, em roda, até encher o lote. As páginas vêm como
     * num lote normal; o site recebe os de cada obra separados (de 5 em 5). Devolve os capítulos novos no site.
     */
    private long wheelLote(List<Slot> slots) {
        holdIfNeeded();
        pairWait();
        long batchStart = clock.now();
        int size = batchSize();
        List<Long> group = new ArrayList<>();
        Map<Long, Slot> owner = new HashMap<>();
        List<Slot> live = new ArrayList<>();
        for (Slot sl : slots) if (!sl.pending.isEmpty()) live.add(sl);
        if (live.isEmpty()) return 0;
        int start = live.size() > 1 ? wheelCursor % live.size() : 0;
        Map<Slot, Integer> taken = new HashMap<>();
        for (boolean more = true; more && group.size() < size;) {
            more = false;
            for (int k = 0; k < live.size() && group.size() < size; k++) {
                Slot sl = live.get((start + k) % live.size());
                int t = taken.containsKey(sl) ? taken.get(sl) : 0;
                if (t >= sl.pending.size()) continue;
                long cap = sl.pending.get(t);
                group.add(cap);
                owner.put(cap, sl);
                taken.put(sl, t + 1);
                more = true;
            }
        }
        wheelCursor = start + 1;
        inBatch = true;
        emit("sending", "from", 1, "to", group.size(), "total", group.size(), "works", taken.size());
        Map<Slot, List<Map<String, Object>>> byWork = new LinkedHashMap<>();
        List<Fetched> got;
        try {
            got = fetchGroup(group, merged(live), 0, group.size());
        } catch (Soft e) {
            inBatch = false;
            log("Lote: " + e.getMessage());
            if (cfg.fast) batchDone();
            return 0;
        } finally {
            inBatch = false;
        }
        long fetchMs = clock.now() - batchStart;
        for (Fetched f : got) {
            Slot sl = owner.get(f.capId);
            sl.pending.remove(f.capId);
            sl.tried++;
            if (f.error != null) { log(sl.title + ", capítulo " + f.capId + ": " + f.error); sl.skipped++; continue; }
            if (f.missing || f.data == null) { sl.skipped++; continue; }
            List<Map<String, Object>> list = byWork.get(sl);
            if (list == null) byWork.put(sl, list = new ArrayList<>());
            list.add(Json.map("capId", f.capId, "meta", f.data.meta, "content", f.data.content));
        }
        long added = 0;
        int count = 0;
        for (List<Map<String, Object>> l : byWork.values()) count += l.size();
        if (count > 0) emit("posting", "count", count, "works", byWork.size());
        for (Map.Entry<Slot, List<Map<String, Object>>> e : byWork.entrySet()) {
            Slot sl = e.getKey();
            try {
                long[] r = postChapters(sl.id, e.getValue());
                sl.added += r[0];
                sl.skipped += r[1];
                added += r[0];
            } catch (Soft x) {
                sl.skipped += e.getValue().size();
                log(sl.title + ": o site recusou os capítulos (" + x.getMessage() + ").");
            }
        }
        if (cfg.fast) batchDone();
        else synchronized (pace) {
            lastPair = batchStart;
            savePace();
        }
        emit("wheel-lote", "batch", group.size(), "works", taken.size(), "added", added, "batchMs", clock.now() - batchStart, "fetchMs", fetchMs);
        return added;
    }

    private void emitWheel(int max) {
        List<Object> l = new ArrayList<>();
        if (focus != null) l.add(focus.toMap());
        for (Slot sl : wheel) l.add(sl.toMap());
        emit("wheel", "slots", l, "max", max, "rested", rested.size());
    }

    /**
     * Obra escolhida na tela: abre (tirando do rodízio se estava lá) e manda um lote inteiro dela por volta, até
     * receber o que foi pedido. Devolve true enquanto houver obra escolhida (a volta foi dela).
     */
    private boolean focusStep(Map<Long, long[]> fails, int max, long[] totals) {
        FocusReq rq = focusReq;
        if (rq != null) {
            focusReq = null;
            if (focus != null) {
                Slot old = focus;
                focus = null;
                closeSlot(old, "trocada por outra obra escolhida");
                if (old.added > 0) { totals[0] += old.added; totals[1]++; }
            }
            for (Iterator<Slot> it = wheel.iterator(); it.hasNext();) {
                Slot sl = it.next();
                if (sl.id != rq.id) continue;
                it.remove();
                closeSlot(sl, "virou a obra escolhida");
                if (sl.added > 0) { totals[0] += sl.added; totals[1]++; }
            }
            rested.remove(rq.id);
            fails.remove(rq.id);
            String name = rq.title != null && !rq.title.isEmpty() ? rq.title : "Obra " + rq.id;
            log("Obra escolhida: " + name + " (" + (rq.chapters > 0 ? rq.chapters + " capítulos" : "todos os capítulos que faltam")
                + "). Ela recebe os lotes inteiros; o resto espera.");
            emit("focus-start", "id", rq.id, "name", name, "chapters", rq.chapters);
            Slot sl;
            try {
                sl = openSlot(rq.id, rq.title, rq.chapters, "escolhida", 0, true);
            } catch (Soft e) {
                log(name + ": " + e.getMessage());
                emit("focus-done", "id", rq.id, "name", name, "added", 0, "error", e.getMessage());
                return true;
            }
            if (sl == null) { emit("focus-done", "id", rq.id, "name", name, "added", 0, "note", "não encontrada"); return true; }
            if (sl.pending.isEmpty()) {
                closeSlot(sl, "já estava em dia");
                log(sl.title + ": já está em dia no site.");
                emit("focus-done", "id", sl.id, "name", sl.title, "added", 0, "note", "em dia");
                return true;
            }
            focus = sl;
            emitWheel(max);
        }
        if (focus == null) return false;
        wheelLote(Collections.singletonList(focus));
        if (focus.pending.isEmpty()) {
            Slot f = focus;
            focus = null;
            closeSlot(f, null);
            // Recebeu o que você pediu: o resto dela volta para a vez normal, depois das outras.
            if (f.totalAll > f.tried) rested.put(f.id, clock.now());
            if (f.added > 0) { totals[0] += f.added; totals[1]++; }
            log("Obra escolhida concluída: " + f.title + " +" + f.added + " capítulo(s)" + (f.totalAll > f.tried ? "; faltam " + (f.totalAll - f.tried) + ", que seguem na fila" : "") + ".");
            emit("focus-done", "id", f.id, "name", f.title, "added", f.added, "later", Math.max(0, f.totalAll - f.tried));
        }
        emitWheel(max);
        return true;
    }

    /** Fecha a vez de todas as obras abertas (ao parar ou ao sair do rodízio), contando ao site o que falta. */
    private void closeAll(long[] totals) {
        List<Slot> all = new ArrayList<>(wheel);
        if (focus != null) all.add(0, focus);
        wheel.clear();
        focus = null;
        for (Slot sl : all) {
            closeSlot(sl, stop ? "parou no meio" : null);
            if (sl.added > 0) { totals[0] += sl.added; totals[1]++; }
        }
    }

    /**
     * Enche o rodízio até `opts.works` obras (no máximo WHEEL_OPEN_PER_ROUND por volta): pedidas por leitores,
     * obras do site com capítulos novos, a fila na ordem do site (as que já tiveram a vez por último) e, sem nada
     * disso, a conferência de rotina. Devolve quantas abriu.
     */
    private int fillWheel(AutoOptions opts, List<Long> open, Map<Long, Map<String, Object>> info, Map<Long, String> updates,
                          Map<Long, long[]> fails, long[] totals) {
        Set<Long> inWheel = new HashSet<>();
        for (Slot sl : wheel) inWheel.add(sl.id);
        if (focus != null) inWheel.add(focus.id);
        List<Object[]> cands = new ArrayList<>();
        for (Long id : open) {
            Map<String, Object> im = info.get(id);
            if (count(im, "priority") > 0 && !inWheel.contains(id)) cands.add(new Object[] { id, im == null ? null : Json.str(im.get("title")), "fila", (int) count(im, "priority"), opts.perWork });
        }
        for (Map.Entry<Long, String> u : updates.entrySet())
            if (!inWheel.contains(u.getKey()) && !failedOut(fails, u.getKey())) cands.add(new Object[] { u.getKey(), u.getValue(), "atualizada", 0, 0 });
        for (Long id : open) if (!rested.containsKey(id)) {
            Map<String, Object> im = info.get(id);
            if (count(im, "priority") <= 0 && !inWheel.contains(id)) cands.add(new Object[] { id, im == null ? null : Json.str(im.get("title")), "fila", 0, opts.perWork });
        }
        for (Long id : rested.keySet()) if (open.contains(id) && !inWheel.contains(id)) {
            Map<String, Object> im = info.get(id);
            if (count(im, "priority") <= 0) cands.add(new Object[] { id, im == null ? null : Json.str(im.get("title")), "fila", 0, opts.perWork });
        }
        int opened = 0;
        Set<Long> tried = new HashSet<>();
        for (Object[] c : cands) {
            if (wheel.size() >= opts.works || opened >= WHEEL_OPEN_PER_ROUND) break;
            long id = (Long) c[0];
            if (!tried.add(id) || inWheel.contains(id)) continue;
            String src = (String) c[2];
            if ("atualizada".equals(src)) updates.remove(id);
            rested.remove(id);
            emit("auto-pick", "id", id, "source", src, "priority", c[3], "limit", c[4], "wheel", true);
            try {
                Slot sl = openSlot(id, (String) c[1], (Integer) c[4], src, (Integer) c[3], false);
                opened++;
                if (sl == null) continue;
                Map<String, Object> im = info.get(id);
                sl.cover = im == null ? null : Json.str(im.get("cover"));
                if (sl.pending.isEmpty()) {
                    closeSlot(sl, "em dia");
                    continue;
                }
                wheel.add(sl);
                inWheel.add(id);
                fails.remove(id);
                emitWheel(opts.works);
            } catch (Soft e) {
                opened++;
                long[] f = fails.get(id);
                long n = (f == null ? 0 : f[0]) + 1;
                fails.put(id, new long[] { n, clock.now() });
                log((c[1] != null ? c[1] : "Obra " + id) + ": " + e.getMessage()
                    + (n >= AUTO_MAX_FAILS ? " O automático deixa esta obra para depois (tenta de novo em 6 h)." : ""));
            }
        }
        return opened;
    }

    void runAuto(boolean discover, boolean requests) {
        AutoOptions o = new AutoOptions();
        o.discover = discover;
        o.requests = requests;
        runAuto(o);
    }

    /**
     * Modo automático: fica ligado e decide sozinho o que enviar, na ordem
     * revisão das obras do site (ao ligar, ao abrir o app e a cada 12 h: confere cada obra já enviada e manda os
     * capítulos novos; uma revisão cortada continua de onde parou) → fila do site (pedidos de leitores primeiro; com a primeira passada ligada, obras novas recebem os primeiros
     * capítulos e voltam para o fim da fila, e só depois as outras recebem o resto) → obras do site atualizadas na
     * MediocreScan → conferência das obras do site há mais tempo sem conferir. A cada ciclo também liga pedidos de
     * leitores e (opcional) põe obras novas na fila. Sem nada para fazer, espera e olha de novo. A fila é relida
     * depois de cada obra. Wi-Fi, carregador e bateria seguram o envio sem desligar o automático.
     */
    void runAuto(AutoOptions opts) {
        running = true;
        locksInRow = 0;
        autoOpts = opts;
        long totalAdded = 0;
        int done = 0;
        Map<Long, long[]> fails = new HashMap<>();
        Map<Long, String> seen = new HashMap<>();
        Map<Long, String> updates = new LinkedHashMap<>();
        long nextScan = 0, nextDiscover = 0;
        int robin = 0;
        emit("run-start", "count", 0, "auto", true);
        emitSpeed();
        wheel.clear();
        focus = null;
        rested.clear();
        wheelCursor = 0;
        if (opts.focusId > 0) focusReq = new FocusReq(opts.focusId, opts.focusTitle, opts.focusChapters);
        // Revisão: continua a que foi cortada no meio; senão pede uma (vale se a última acabou há mais de 1 h).
        review = null;
        reviewFinishedAt = 0;
        reviewCoveredAt = 0;
        reviewRetryAt = 0;
        Review saved = null;
        try { saved = Review.from(host.loadReview()); } catch (RuntimeException ignored) { /* sem revisão guardada */ }
        if (saved != null && saved.finishedAt > 0) {
            reviewFinishedAt = saved.finishedAt;
            if (saved.checked > 0) reviewCoveredAt = saved.finishedAt;
        }
        if (opts.review && saved != null && saved.finishedAt == 0 && !saved.left.isEmpty() && clock.now() - saved.startedAt < REVIEW_RESUME_MS) {
            review = saved;
            log("Continuando a revisão das obras do site: " + saved.checked + " de " + saved.total + " já conferidas.");
            emit("review-start", "total", saved.total, "done", saved.checked, "news", saved.news, "added", saved.added, "queued", saved.queued, "resumed", true);
        } else if (opts.review) {
            reviewWanted = true;
        }
        log("Modo automático ligado: " + (opts.review ? "revisão das obras do site, " : "") + "fila do site"
            + (opts.works > 1 ? " (" + opts.works + " obras ao mesmo tempo" + (opts.perWork > 0 ? ", " + opts.perWork + " capítulos para cada uma por vez" : "") + ")"
                : opts.firstPass > 0 ? " (obras novas primeiro com " + opts.firstPass + " capítulos)" : "")
            + ", obras atualizadas" + (opts.discover ? ", obras novas" : "") + (opts.requests ? " e pedidos de leitores" : "")
            + (opts.wifiOnly ? "; só no Wi-Fi" : "") + (opts.chargingOnly ? "; só carregando" : "") + ".");
        try {
            for (;;) {
                checkStop();
                wake = false;
                try {
                holdIfNeeded();
                // Obra escolhida na tela ("Enviar agora"): passa na frente de tudo até receber o que foi pedido.
                long[] ft = new long[2];
                boolean focused = focusStep(fails, opts.works, ft);
                totalAdded += ft[0];
                done += (int) ft[1];
                if (focused) continue;
                if (clock.now() >= nextScan) {
                    // A cada 10 min: obras do site atualizadas. A cada 30 min: também obras novas e pedidos.
                    boolean full = clock.now() >= nextDiscover;
                    nextScan = clock.now() + AUTO_CYCLE_MS;
                    if (full) { nextDiscover = clock.now() + AUTO_DISCOVER_MS; robin = 0; }
                    emit("auto-scan");
                    if (full && opts.requests) {
                        try { autoRequests(); } catch (Soft e) { log("Pedidos: " + e.getMessage()); }
                    }
                    try { scanLists(full && opts.discover, seen, updates); } catch (Soft e) { log("Listas da MediocreScan: " + e.getMessage()); }
                }
                // Revisão das obras do site: vem antes da fila (ao ligar, ao abrir o app e a cada 12 h).
                maybeStartReview(opts);
                if (review != null) {
                    Outcome o = reviewStep(fails, updates);
                    // "Obras" do automático = obras que receberam capítulos (conferida em dia não conta).
                    if (o != null && o.added > 0) { totalAdded += o.added; done++; }
                    continue;
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
                Map<Long, Map<String, Object>> info = new HashMap<>();
                List<Object> items = Json.arr(plan.get("items"));
                if (items != null) for (Object io : items) {
                    Map<String, Object> im = Json.obj(io);
                    Long id = im == null ? null : Json.whole(im.get("id"));
                    if (id != null) info.put(id, im);
                }
                List<Long> open = new ArrayList<>();
                for (Long id : queue) if (!failedOut(fails, id)) open.add(id);
                // Rodízio: várias obras ao mesmo tempo, cada lote dividido entre elas.
                if (opts.works > 1 || !wheel.isEmpty()) {
                    long[] wt = new long[2];
                    int opened = opts.works > 1 ? fillWheel(opts, open, info, updates, fails, wt) : 0;
                    totalAdded += wt[0];
                    done += (int) wt[1];
                    if (!wheel.isEmpty()) {
                        emit("auto-plan", "queue", Math.max(open.size(), count(plan, "queueTotal")), "requests", count(plan, "requestsWaiting"), "updates", updates.size(), "works", done, "added", totalAdded);
                        wheelLote(wheel);
                        for (Iterator<Slot> it = wheel.iterator(); it.hasNext();) {
                            Slot sl = it.next();
                            if (!sl.pending.isEmpty()) continue;
                            it.remove();
                            closeSlot(sl, null);
                            if (sl.added > 0) { totalAdded += sl.added; done++; }
                        }
                        emitWheel(opts.works);
                        continue;
                    }
                    // Abriu obras, mas todas estavam em dia: tenta as próximas.
                    if (opened > 0) continue;
                    // Nada para o rodízio: só a conferência de rotina (ou espera).
                    open.clear();
                    updates.clear();
                }
                WorkRef next = null;
                String source = "fila";
                int limit = 0;
                // 1) pedida por leitores, ou obra que parou no meio: na ordem do site.
                // 2) obras do site com capítulos novos na MediocreScan (leitores esperando a continuação).
                // 3) primeira passada das obras novas. 4) o resto da fila.
                if (!open.isEmpty()) {
                    Long pick = null;
                    for (Long id : open) {
                        Map<String, Object> im = info.get(id);
                        boolean runningNow = im != null && "running".equals(Json.str(im.get("status")));
                        if (count(im, "priority") > 0) { pick = id; break; }
                        if (runningNow) {
                            pick = id;
                            long onSite = count(im, "chapters_on_site");
                            if (opts.firstPass > 0 && onSite < opts.firstPass) limit = (int) (opts.firstPass - onSite);
                            break;
                        }
                    }
                    if (pick == null && !updates.isEmpty()) {
                        for (Iterator<Map.Entry<Long, String>> it = updates.entrySet().iterator(); it.hasNext() && next == null;) {
                            Map.Entry<Long, String> u = it.next();
                            it.remove();
                            if (!failedOut(fails, u.getKey())) { next = new WorkRef(u.getKey(), u.getValue()); source = "atualizada"; }
                        }
                    }
                    // Primeira passada: obra nova (ainda com poucos capítulos no site) recebe só os primeiros.
                    if (next == null && pick == null && opts.firstPass > 0) {
                        for (Long id : open) {
                            Map<String, Object> im = info.get(id);
                            long onSite = count(im, "chapters_on_site");
                            if (onSite < opts.firstPass) { pick = id; limit = (int) (opts.firstPass - onSite); break; }
                        }
                    }
                    if (next == null) {
                        if (pick == null) pick = open.get(0);
                        Map<String, Object> im = info.get(pick);
                        next = new WorkRef(pick, im == null ? null : Json.str(im.get("title")));
                    }
                }
                if (next == null) {
                    for (Iterator<Map.Entry<Long, String>> it = updates.entrySet().iterator(); it.hasNext() && next == null;) {
                        Map.Entry<Long, String> u = it.next();
                        it.remove();
                        if (!failedOut(fails, u.getKey())) { next = new WorkRef(u.getKey(), u.getValue()); source = "atualizada"; }
                    }
                }
                // Conferência de rotina: desnecessária nas 6 h depois de uma revisão completa.
                boolean reviewedRecently = reviewCoveredAt > 0 && clock.now() - reviewCoveredAt < REVIEW_EVERY_MS / 2;
                if (next == null && robin < AUTO_ROUND_ROBIN && !reviewedRecently) {
                    for (Long id : longs(plan.get("sync"))) {
                        if (failedOut(fails, id)) continue;
                        next = new WorkRef(id, null);
                        source = "conferencia";
                        robin++;
                        break;
                    }
                }
                emit("auto-plan", "queue", Math.max(open.size(), count(plan, "queueTotal")), "requests", count(plan, "requestsWaiting"), "updates", updates.size(), "works", done, "added", totalAdded);
                if (next == null) {
                    idle(nextScan - clock.now(), done, totalAdded);
                    continue;
                }
                // Diz à tela de onde veio a obra (fila/pedido, atualizada na MediocreScan ou conferência de rotina).
                Map<String, Object> pi = info.get(next.id);
                emit("auto-pick", "id", next.id, "source", source, "priority", count(pi, "priority"), "limit", limit);
                try {
                    totalAdded += sendWork(next.id, next.title, Math.max(1, open.size() + updates.size()), limit).added;
                    done++;
                    fails.remove(next.id);
                } catch (Soft e) {
                    long[] f = fails.get(next.id);
                    long n = (f == null ? 0 : f[0]) + 1;
                    fails.put(next.id, new long[] { n, clock.now() });
                    log((next.title != null && !next.title.isEmpty() ? next.title : "Obra " + next.id) + ": " + e.getMessage()
                        + (n >= AUTO_MAX_FAILS ? " O automático deixa esta obra para depois (tenta de novo em 6 h)." : ""));
                }
                } catch (Retryable e) {
                    // Sem internet ou MediocreScan recusando: espera e tenta de novo, sem desligar o automático.
                    log(e.getMessage().replaceFirst("\\. O envio.*$", ".") + " O automático tenta de novo em 15 min.");
                    locksInRow = 0;
                    idle(15 * 60_000L, done, totalAdded);
                } catch (Fatal e) {
                    // Chave recusada, sessão encerrada...: o automático não desliga; avisa e tenta de novo depois.
                    String why = "Precisa de você: " + e.getMessage();
                    log(why + " O automático tenta de novo em 30 min.");
                    emit("auto-hold", "reason", why, "since", clock.now());
                    pause(AUTO_FATAL_RETRY_MS);
                    emit("resume");
                }
            }
        } catch (Stopped e) {
            // O site fica sabendo o que falta de cada obra aberta (rodízio e escolhida).
            long[] ct = new long[2];
            closeAll(ct);
            totalAdded += ct[0];
            done += (int) ct[1];
            emit("run-stopped", "works", done, "added", totalAdded, "auto", true);
        } catch (Fatal e) {
            emit("run-error", "message", e.getMessage(), "works", done, "added", totalAdded, "auto", true);
        } catch (RuntimeException e) {
            emit("run-error", "message", "Erro inesperado no modo automático (" + e.getClass().getSimpleName() + "). Toque em Ligar para continuar.", "works", done, "added", totalAdded, "auto", true);
        } finally {
            autoOpts = null;
            running = false;
        }
    }
}
