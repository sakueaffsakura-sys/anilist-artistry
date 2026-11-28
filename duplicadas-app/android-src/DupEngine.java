package __PKG__;

import java.text.Normalizer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Motor da procura em segundo plano (Java puro: roda no serviço do Android e nos testes).
 *
 * Faz sozinho, com o app fechado, o trabalho demorado: ler o catálogo (completo ou só as obras novas), os detalhes
 * de cada obra (sinopse, nomes, autores) e conferir as capas. Os resultados vão para o Host (arquivo no celular) e
 * o app junta tudo ao catálogo quando abre; a procura de duplicadas roda no app.
 *
 * Eficiência: pedidos à API num ritmo que se ajusta sozinho (acelera depois de muitos acertos, nunca abaixo do
 * mínimo aprendido; recusa = mais devagar e espera 1, 2, 5, 10, 15 min) e capas em paralelo, em várias linhas ao
 * mesmo tempo (o servidor de imagens é outro). Sem internet: espera e tenta de novo, sem desistir. Token recusado
 * (401): para e avisa.
 */
final class DupEngine {
    static final String API = "https://api.mediocretoons.net";
    static final String CDN = "https://cdn.mediocrescan.com/";
    static final long[] BACKOFF_S = { 60, 120, 300, 600, 900 };
    static final long[] OFFLINE_S = { 15, 30, 60, 120, 300 };
    static final int MAX_PAGES = 1500;
    static final int SLIM_LIST = 40;
    static final int SLIM_TEXT = 1600;
    static final String[][] LISTS = { { "adicionadas", "/obras/adicionados-recentes", "20" }, { "atualizadas", "/obras/atualizadas-recentes", "30" } };

    /* ---------- o que o motor usa de fora ---------- */

    static final class Resp {
        int status;
        String type;
        byte[] body;
        long ms;
        String error;

        String text() { return body == null ? "" : new String(body, java.nio.charset.StandardCharsets.UTF_8); }
    }

    interface Http {
        /** GET; status 0 + error quando não houve resposta. binary: imagem (sem limite de texto). */
        Resp get(String url, Map<String, String> headers, boolean binary);
    }

    interface Images {
        /** Abre a imagem e mede: {w, h, std, hash, ok}. */
        Map<String, Object> measure(byte[] body);
    }

    interface Host {
        long now();
        void sleep(long ms) throws InterruptedException;
        /** Um resultado para o app juntar ao catálogo (vai para o arquivo). */
        void result(Map<String, Object> r);
        /** Andamento mudou (notificação e tela). */
        void status(Map<String, Object> s);
        /** Guarda o estado (pequeno) e, se queues != null, as filas. */
        void save(Map<String, Object> state, Map<String, Object> queues);
        /** Obra nova com o mesmo título de outra já salva (aviso no celular). */
        void possibleDuplicate(String title);
    }

    static final class Fatal extends Exception {
        Fatal(String m) { super(m); }
    }

    static final class Stopped extends Exception {
        Stopped() { super("parado"); }
    }

    /* ---------- estado ---------- */

    private final Http http;
    private final Images images;
    private final Host host;
    private final Object lock = new Object();
    private volatile boolean stop = false;

    // Ajustes do plano.
    private volatile String token = "";
    private volatile long gapMs = 1500, minGapMs = 800;
    /** Mínimo aprendido com recusas da API (vale por 24 h). */
    private volatile long learnedFloor = 0, learnedAt = 0;
    private volatile long coverGapMs = 250;
    private volatile int coverThreads = 3;
    private volatile long everyMs = 6L * 3600_000L;
    private volatile boolean coversOn = true;

    // Catálogo.
    private String catalogMode = null;
    private Map<String, Object> progress = new LinkedHashMap<>();
    private Map<String, Object> pagers = new LinkedHashMap<>();
    private Map<String, Object> prevIds = new LinkedHashMap<>();
    private final Set<Long> known = new HashSet<>();
    private final Set<String> cores = new HashSet<>();
    private final Set<String> skipWords = new HashSet<>();
    private long nextRecentAt = 0;

    // Filas.
    private final ArrayDeque<Long> details = new ArrayDeque<>();
    private final ArrayDeque<Object[]> covers = new ArrayDeque<>();
    private final Set<Long> detailsDone = new HashSet<>();
    private final Set<Long> coversDone = new HashSet<>();
    private long detailsCount = 0, coversCount = 0, detailsTotal = 0, coversTotal = 0;
    private int coversBusy = 0;
    private boolean queuesDirty = false;
    private long lastQueueSave = 0;

    // Ritmo da API.
    private long lastApiAt = 0, curGap = -1;
    private int okStreak = 0;
    // Ritmo das capas (todas as linhas juntas).
    private long nextCoverAt = 0, coverPauseUntil = 0, coverPauseS = 30;

    // Andamento.
    private volatile String phase = "parado";
    private volatile String waitReason = null;
    private volatile long waitUntil = 0;
    private volatile String error = null;
    /** Itens feitos nos últimos 5 min: [hora, 0 = detalhe | 1 = capa]. */
    private final ArrayDeque<long[]> recentDone = new ArrayDeque<>();
    private long lastStatusAt = 0;
    private volatile boolean finishedOnce = false;

    DupEngine(Http http, Images images, Host host) {
        this.http = http;
        this.images = images;
        this.host = host;
    }

    /* ---------- plano (vem do app) e estado guardado ---------- */

    /**
     * Plano do app: {token, gapMs, minGapMs, coverGapMs, coverThreads, everyMs, covers (liga/desliga), catalog
     * ("full" | "recent" | null), progress, pagers, prevIds, known: [ids], cores: [títulos normalizados], skip:
     * [palavras], detailsQueue: [ids], coversQueue: [[id, url]]}. Troca as filas pelas do app (ele sabe o que falta).
     */
    void applyPlan(Map<String, Object> plan) {
        synchronized (lock) {
            String t = Json.str(plan.get("token"));
            if (t != null) token = t.trim().replaceFirst("(?i)^bearer\\s+", "");
            gapMs = clamp(longOf(plan.get("gapMs"), gapMs), 300, 60_000);
            minGapMs = clamp(longOf(plan.get("minGapMs"), minGapMs), 300, 60_000);
            Long lf = Json.whole(plan.get("learnedFloor")), la = Json.whole(plan.get("learnedAt"));
            if (lf != null && la != null && lf > learnedFloor) { learnedFloor = lf; learnedAt = la; }
            // Começa no ritmo do app; se já aprendeu um ritmo melhor (ou mais lento), mantém.
            curGap = curGap < 0 ? gapMs : Math.min(curGap, gapMs);
            curGap = Math.max(curGap, floor());
            coverGapMs = clamp(longOf(plan.get("coverGapMs"), coverGapMs), 30, 10_000);
            coverThreads = (int) clamp(longOf(plan.get("coverThreads"), coverThreads), 1, 6);
            everyMs = clamp(longOf(plan.get("everyMs"), everyMs), 15 * 60_000L, 7L * 24 * 3600_000L);
            if (plan.containsKey("covers")) coversOn = Json.truthy(plan.get("covers"));
            if (plan.containsKey("catalog")) catalogMode = Json.str(plan.get("catalog"));
            Map<String, Object> p = Json.obj(plan.get("progress"));
            if (p != null) progress = new LinkedHashMap<>(p);
            Map<String, Object> pg = Json.obj(plan.get("pagers"));
            if (pg != null) pagers = new LinkedHashMap<>(pg);
            Map<String, Object> pv = Json.obj(plan.get("prevIds"));
            if (pv != null) prevIds = new LinkedHashMap<>(pv);
            List<Object> k = Json.arr(plan.get("known"));
            if (k != null) { known.clear(); for (Object o : k) { Long id = Json.whole(o); if (id != null) known.add(id); } }
            List<Object> c = Json.arr(plan.get("cores"));
            if (c != null) { cores.clear(); for (Object o : c) { String s = Json.str(o); if (s != null && !s.isEmpty()) cores.add(s); } }
            List<Object> sk = Json.arr(plan.get("skip"));
            if (sk != null) { skipWords.clear(); for (Object o : sk) { String s = Json.str(o); if (s != null) skipWords.add(s); } }
            Long nr = Json.whole(plan.get("nextRecentAt"));
            if (nr != null) nextRecentAt = nr;
            List<Object> dq = Json.arr(plan.get("detailsQueue"));
            if (dq != null) {
                details.clear();
                detailsDone.clear();
                for (Object o : dq) { Long id = Json.whole(o); if (id != null) details.add(id); }
                detailsCount = 0;
                detailsTotal = details.size();
            }
            List<Object> cq = Json.arr(plan.get("coversQueue"));
            if (cq != null) {
                covers.clear();
                coversDone.clear();
                for (Object o : cq) {
                    List<Object> pair = Json.arr(o);
                    Long id = pair != null && pair.size() >= 2 ? Json.whole(pair.get(0)) : null;
                    String url = pair != null && pair.size() >= 2 ? Json.str(pair.get(1)) : null;
                    if (id != null && url != null) covers.add(new Object[] { id, url });
                }
                coversCount = 0;
                coversTotal = covers.size();
            }
            error = null;
            finishedOnce = false;
            queuesDirty = true;
            lock.notifyAll();
        }
        saveNow(true);
        pushStatus(true);
    }

    /** Estado guardado (o Android encerrou o app ou o celular reiniciou): continua de onde parou. */
    void restore(Map<String, Object> state, Map<String, Object> queues) {
        Map<String, Object> plan = new LinkedHashMap<>();
        if (state != null) plan.putAll(state);
        if (queues != null) plan.putAll(queues);
        Long d = state == null ? null : Json.whole(state.get("detailsTotal"));
        Long c = state == null ? null : Json.whole(state.get("coversTotal"));
        Long dc = state == null ? null : Json.whole(state.get("detailsCount"));
        Long cc = state == null ? null : Json.whole(state.get("coversCount"));
        applyPlan(plan);
        synchronized (lock) {
            if (d != null && dc != null) { detailsTotal = Math.max(details.size() + dc, d); detailsCount = dc; }
            if (c != null && cc != null) { coversTotal = Math.max(covers.size() + cc, c); coversCount = cc; }
        }
    }

    private Map<String, Object> stateMap() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("token", token);
        s.put("gapMs", gapMs);
        s.put("minGapMs", minGapMs);
        s.put("coverGapMs", coverGapMs);
        s.put("coverThreads", (long) coverThreads);
        s.put("everyMs", everyMs);
        s.put("covers", coversOn);
        s.put("catalog", catalogMode);
        s.put("progress", progress);
        s.put("pagers", pagers);
        s.put("prevIds", prevIds);
        s.put("nextRecentAt", nextRecentAt);
        s.put("learnedFloor", learnedFloor);
        s.put("learnedAt", learnedAt);
        s.put("detailsCount", detailsCount);
        s.put("detailsTotal", detailsTotal);
        s.put("coversCount", coversCount);
        s.put("coversTotal", coversTotal);
        return s;
    }

    private Map<String, Object> queuesMap() {
        Map<String, Object> q = new LinkedHashMap<>();
        List<Object> d = new ArrayList<>(details);
        List<Object> c = new ArrayList<>();
        for (Object[] it : covers) c.add(new ArrayList<Object>(java.util.Arrays.asList(it[0], it[1])));
        q.put("detailsQueue", d);
        q.put("coversQueue", c);
        q.put("known", new ArrayList<Object>(known));
        q.put("cores", new ArrayList<Object>(cores));
        q.put("skip", new ArrayList<Object>(skipWords));
        return q;
    }

    /** Guarda o estado; as filas (grandes) no máximo a cada 45 s, ou já (force). */
    private void saveNow(boolean force) {
        Map<String, Object> s, q = null;
        synchronized (lock) {
            s = stateMap();
            long now = host.now();
            if (queuesDirty && (force || now - lastQueueSave >= 45_000)) {
                q = queuesMap();
                queuesDirty = false;
                lastQueueSave = now;
            }
        }
        try { host.save(s, q); } catch (RuntimeException ignored) { /* guardar nunca para a procura */ }
    }

    /* ---------- controle ---------- */

    void requestStop() {
        stop = true;
        synchronized (lock) { lock.notifyAll(); }
    }

    boolean stopRequested() { return stop; }

    /** Acorda da espera (vigia do Android, app abriu, internet voltou). */
    void wake() {
        synchronized (lock) { lock.notifyAll(); }
    }

    /** Olhar as obras novas agora (sem esperar o horário). */
    void recentNow() {
        synchronized (lock) {
            if (catalogMode == null) catalogMode = "recent";
            lock.notifyAll();
        }
    }

    /* ---------- laço principal ---------- */

    void run() {
        stop = false;
        List<Thread> workers = new ArrayList<>();
        for (int i = 0; i < coverThreads; i++) {
            Thread t = new Thread(this::coverLoop, "duplicadas-capas-" + (i + 1));
            t.setDaemon(true);
            t.start();
            workers.add(t);
        }
        try {
            while (!stop) {
                String mode;
                Long next = null;
                synchronized (lock) {
                    mode = catalogMode;
                    if (mode == null) next = details.poll();
                }
                if (mode != null) {
                    runCatalog(mode);
                    continue;
                }
                if (next != null) {
                    detail(next);
                    continue;
                }
                long now = host.now();
                if (nextRecentAt > 0 && now >= nextRecentAt) {
                    synchronized (lock) { catalogMode = "recent"; }
                    continue;
                }
                idle();
            }
        } catch (Fatal f) {
            error = f.getMessage();
            phase = "erro";
            pushStatus(true);
        } catch (Stopped s) {
            // parado pelo usuário
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        } finally {
            stop = true;
            synchronized (lock) { lock.notifyAll(); }
            for (Thread t : workers) { try { t.join(5000); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); } }
            saveNow(true);
            if (!"erro".equals(phase)) phase = "parado";
            pushStatus(true);
        }
    }

    /** Nada na fila da API: espera as capas terminarem e a hora de olhar as obras novas. */
    private void idle() throws Stopped, InterruptedException {
        boolean coversLeft;
        synchronized (lock) { coversLeft = !covers.isEmpty() || coversBusy > 0; }
        if (!coversLeft && !finishedOnce) {
            finishedOnce = true;
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("k", "fim");
            r.put("details", detailsCount);
            r.put("covers", coversCount);
            host.result(r);
        }
        phase = coversLeft ? "capas" : "espera";
        if (nextRecentAt <= 0) nextRecentAt = host.now() + everyMs;
        pushStatus(true);
        saveNow(!coversLeft);
        long ms = Math.min(nextRecentAt - host.now(), coversLeft ? 5_000 : 15 * 60_000L);
        if (ms > 0) {
            synchronized (lock) {
                if (stop) throw new Stopped();
                if (catalogMode == null && details.isEmpty()) lock.wait(ms);
            }
        }
        if (stop) throw new Stopped();
    }

    /* ---------- API: ritmo, esperas e recusas ---------- */

    private void check() throws Stopped {
        if (stop) throw new Stopped();
    }

    private void waitMs(long ms, String reason) throws Stopped, InterruptedException {
        long end = host.now() + ms;
        waitReason = reason;
        waitUntil = reason == null ? 0 : end;
        if (reason != null) pushStatus(true);
        try {
            while (true) {
                check();
                long left = end - host.now();
                if (left <= 0) break;
                host.sleep(Math.min(left, 1000));
            }
        } finally {
            waitReason = null;
            waitUntil = 0;
        }
    }

    /** GET na API com o ritmo que se ajusta; devolve o JSON (null para 404). */
    Object apiGet(String path) throws Fatal, Stopped, InterruptedException {
        if (token == null || token.isEmpty()) throw new Fatal("Falta o token da MediocreScan: abra o app e coloque o token.");
        int refusals = 0, offline = 0;
        while (true) {
            check();
            long since = host.now() - lastApiAt;
            if (since < curGap) waitMs(curGap - since, null);
            lastApiAt = host.now();
            Map<String, String> h = new LinkedHashMap<>();
            h.put("Accept", "application/json");
            h.put("Authorization", "Bearer " + token);
            Resp r = http.get(API + path, h, false);
            check();
            int st = r == null ? 0 : r.status;
            if (st >= 200 && st < 300) {
                okStreak++;
                // Muitos acertos seguidos: um pouco mais rápido, sem passar do mínimo (o do app ou o aprendido).
                if (okStreak >= 25 && curGap > floor()) { curGap = Math.max(floor(), curGap - 100); okStreak = 0; }
                try { return Json.parse(r.text()); } catch (Json.ParseError e) { return null; }
            }
            if (st == 404) return null;
            if (st == 401) throw new Fatal("A MediocreScan recusou o token (401). Abra o app e troque o token.");
            if (st == 400 || st == 422) return null;
            okStreak = 0;
            if (st == 0) {
                long s = OFFLINE_S[Math.min(offline++, OFFLINE_S.length - 1)];
                phaseWait("Sem conexão: tentando de novo", s);
                continue;
            }
            // Recusa (429/403/5xx): mais devagar daqui em diante (por 24 h não acelera abaixo disso) e espera.
            learnedFloor = Math.min(10_000, Math.max(floor(), curGap + 500));
            learnedAt = host.now();
            curGap = Math.min(15_000, Math.max(curGap * 2, learnedFloor));
            long s = refusals < BACKOFF_S.length ? BACKOFF_S[refusals] : 1800;
            refusals++;
            phaseWait(st == 429 ? "A MediocreScan pediu calma (429)" : st == 403 ? "Acesso recusado (403)" : "Erro " + st + " na MediocreScan", s);
            saveNow(false);
        }
    }

    /** Ritmo mínimo: o do app ou o aprendido nas últimas 24 h, o que for maior. */
    private long floor() {
        if (learnedFloor > 0 && host.now() - learnedAt > 24 * 3600_000L) learnedFloor = 0;
        return Math.max(minGapMs, learnedFloor);
    }

    private void phaseWait(String reason, long seconds) throws Stopped, InterruptedException {
        String before = phase;
        phase = "pausa";
        waitMs(seconds * 1000, reason);
        phase = before;
        pushStatus(true);
    }

    /* ---------- catálogo ---------- */

    private void runCatalog(String mode) throws Fatal, Stopped, InterruptedException {
        try {
            if ("full".equals(mode)) readCatalog();
            else readRecent();
        } finally {
            synchronized (lock) {
                if (mode.equals(catalogMode)) catalogMode = null;
                queuesDirty = true;
            }
            nextRecentAt = host.now() + everyMs;
            saveNow(true);
        }
    }

    private void readCatalog() throws Fatal, Stopped, InterruptedException {
        phase = "catalogo";
        Map<String, Object> p = progress;
        if (!"busca".equals(Json.str(p.get("step"))) && !"adicionadas".equals(Json.str(p.get("step"))) && !"atualizadas".equals(Json.str(p.get("step")))) {
            p.clear();
            p.put("step", "busca");
            p.put("page", 1L);
            p.put("empty", 0L);
            p.put("total", 0L);
            p.put("buscaOk", false);
            p.put("started", host.now());
        }
        while ("busca".equals(Json.str(p.get("step")))) {
            long page = longOf(p.get("page"), 1);
            Object raw = apiGet("/obras/buscar?string=&pagina=" + page);
            List<Object> list = listOf(raw, 0);
            long[] pag = pagination(raw);
            if (page == 1 && (list.isEmpty() || pag == null || (pag[1] < 2 && pag[2] <= list.size()))) {
                step(p, "adicionadas");
                break;
            }
            if (page == 1) p.put("buscaOk", true);
            int added = takeWorks(list, false);
            if (pag != null) p.put("total", pag[1]);
            p.put("page", page + 1);
            catalogStatus("busca", page, pag != null ? pag[1] : 0, added);
            long total = longOf(p.get("total"), 0);
            if (list.isEmpty() || (total > 0 && page + 1 > total) || page + 1 > MAX_PAGES) {
                step(p, pag != null && pag[2] > 0 && known.size() < pag[2] * 0.97 ? "adicionadas" : "pronto");
            }
            progressResult();
        }
        for (String[] L : LISTS) {
            while (L[0].equals(Json.str(p.get("step")))) {
                long page = longOf(p.get("page"), 1);
                List<Object> list = listPage(L, (int) page);
                int added = takeWorks(list, false);
                long empty = added > 0 ? 0 : longOf(p.get("empty"), 0) + 1;
                p.put("empty", empty);
                p.put("page", page + 1);
                catalogStatus(L[0], page, 0, added);
                if (list.isEmpty() || empty >= 2 || page + 1 > MAX_PAGES) step(p, L[0].equals("adicionadas") ? "atualizadas" : "pronto");
                progressResult();
            }
        }
        p.put("finished", host.now());
        progressResult();
        if (known.isEmpty()) throw new Fatal("A MediocreScan respondeu, mas nenhuma página trouxe obras. Abra o app e veja o Diagnóstico.");
    }

    private static void step(Map<String, Object> p, String name) {
        p.put("step", name);
        p.put("page", 1L);
        p.put("empty", 0L);
        p.put("total", 0L);
    }

    /** Só as obras novas: começo das listas até as páginas só trazerem obras já salvas. */
    private void readRecent() throws Fatal, Stopped, InterruptedException {
        phase = "recentes";
        int total = 0;
        for (String[] L : LISTS) {
            int repeat = 0;
            for (int page = 1; page <= 60; page++) {
                List<Object> list = listPage(L, page);
                int added = takeWorks(list, true);
                total += added;
                catalogStatus(L[0], page, 0, added);
                if (list.isEmpty()) break;
                repeat = added > 0 ? 0 : repeat + 1;
                if (repeat >= (L[0].equals("adicionadas") ? 2 : 1)) break;
            }
        }
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("k", "r");
        r.put("added", (long) total);
        r.put("at", host.now());
        host.result(r);
    }

    /** Jeitos de pedir a página N de uma lista (a API pode ignorar um deles). */
    static String pager(int k, int size, int n) {
        switch (k) {
            case 0: return "offset=" + (n - 1) * size;
            case 1: return "pagina=" + n;
            case 2: return "page=" + n;
            case 3: return "offset=" + (n - 1) * size + "&limit=" + size;
            default: return "skip=" + (n - 1) * size;
        }
    }

    /** Página N de uma lista; na página 2 descobre como a API pagina (igual ao app). */
    private List<Object> listPage(String[] L, int n) throws Fatal, Stopped, InterruptedException {
        String name = L[0], path = L[1];
        int size = Integer.parseInt(L[2]);
        List<Object> list;
        Long k = Json.whole(pagers.get(name));
        if (n == 1) list = listOf(apiGet(path), 0);
        else if (k != null && k == -1) list = new ArrayList<>();
        else if (k != null) list = listOf(apiGet(path + "?" + pager(k.intValue(), size, n)), 0);
        else {
            Set<Long> prev = new HashSet<>();
            List<Object> pv = Json.arr(prevIds.get(name));
            if (pv != null) for (Object o : pv) { Long id = Json.whole(o); if (id != null) prev.add(id); }
            list = new ArrayList<>();
            for (int i = 0; i < 5; i++) {
                List<Object> got = listOf(apiGet(path + "?" + pager(i, size, n)), 0);
                boolean differs = false;
                for (Object o : got) { Long id = idOf(o); if (id != null && !prev.contains(id)) { differs = true; break; } }
                if (!got.isEmpty() && differs) { pagers.put(name, (long) i); list = got; break; }
            }
            if (!pagers.containsKey(name)) pagers.put(name, -1L);
        }
        List<Object> ids = new ArrayList<>();
        for (Object o : list) { Long id = idOf(o); if (id != null) ids.add(id); }
        prevIds.put(name, ids);
        return list;
    }

    /** Obras da página: as que não estavam salvas viram resultado e entram nas filas. Devolve quantas eram novas. */
    private int takeWorks(List<Object> list, boolean front) {
        int added = 0;
        for (Object o : list) {
            Map<String, Object> w = workOf(o);
            Long id = w == null ? null : idOf(w);
            if (id == null || titleOf(w) == null) continue;
            boolean isNew;
            synchronized (lock) { isNew = known.add(id); }
            if (!isNew) continue;
            added++;
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("k", "w");
            r.put("o", slim(w, 0));
            host.result(r);
            String cover = image(str(w, "obr_imagem", "imagem", "image", "capa", "cover"), id);
            synchronized (lock) {
                if (front) details.addFirst(id); else details.add(id);
                detailsTotal++;
                finishedOnce = false;
                if (cover != null && coversOn) {
                    if (front) covers.addFirst(new Object[] { id, cover }); else covers.add(new Object[] { id, cover });
                    coversTotal++;
                }
                queuesDirty = true;
                lock.notifyAll();
            }
            if (front) checkDuplicate(titleOf(w));
        }
        return added;
    }

    private void progressResult() {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("k", "p");
        r.put("progress", new LinkedHashMap<>(progress));
        r.put("pagers", new LinkedHashMap<>(pagers));
        r.put("prevIds", new LinkedHashMap<>(prevIds));
        r.put("count", (long) known.size());
        host.result(r);
        saveNow(false);
    }

    private volatile String catStep = null;
    private volatile long catPage = 0, catPages = 0;

    private void catalogStatus(String step, long page, long pages, int added) {
        catStep = step;
        catPage = page;
        catPages = pages;
        pushStatus(false);
    }

    /* ---------- detalhes ---------- */

    private void detail(long id) throws Fatal, Stopped, InterruptedException {
        synchronized (lock) {
            if (!detailsDone.add(id)) return;
        }
        phase = "detalhes";
        Object raw = apiGet("/obras/" + id);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("k", "d");
        r.put("id", id);
        Object s = raw == null ? null : slim(raw, 0);
        r.put("o", s);
        host.result(r);
        synchronized (lock) {
            detailsCount++;
            queuesDirty = true;
        }
        markDone(0);
        pushStatus(false);
        saveNow(false);
    }

    /* ---------- capas (várias linhas ao mesmo tempo) ---------- */

    private void coverLoop() {
        while (!stop) {
            Object[] it = null;
            long waitFor = 0;
            synchronized (lock) {
                long now = host.now();
                if (!coversOn || covers.isEmpty()) {
                    try { lock.wait(5000); } catch (InterruptedException e) { return; }
                    continue;
                }
                if (now < coverPauseUntil) waitFor = coverPauseUntil - now;
                else if (now < nextCoverAt) waitFor = nextCoverAt - now;
                else {
                    it = covers.poll();
                    nextCoverAt = now + coverGapMs;
                    coversBusy++;
                }
            }
            if (it == null) {
                try { host.sleep(Math.min(waitFor, 1000)); } catch (InterruptedException e) { return; }
                continue;
            }
            try {
                cover((Long) it[0], (String) it[1], it);
            } finally {
                synchronized (lock) { coversBusy--; lock.notifyAll(); }
            }
        }
    }

    private void cover(long id, String url, Object[] item) {
        synchronized (lock) {
            if (coversDone.contains(id)) return;
        }
        Map<String, Object> info = new LinkedHashMap<>();
        if (!url.matches("^https://([a-z0-9-]+\\.)*(mediocrescan\\.com|mediocretoons\\.net)/\\S{1,780}$")) {
            info.put("s", -1L);
            String site = url.replaceFirst("^https?://", "").replaceFirst("/.*$", "");
            info.put("err", site.isEmpty() ? "outro site" : site);
        } else {
            Map<String, String> h = new LinkedHashMap<>();
            h.put("Accept", "image/avif,image/webp,image/*,*/*;q=0.8");
            h.put("Referer", "https://mediocrescan.com/");
            Resp r = http.get(url, h, true);
            int st = r == null ? 0 : r.status;
            info.put("s", (long) st);
            info.put("t", r == null || r.type == null ? "" : r.type);
            if (st == 429 || st == 503) {
                // Servidor de imagens pediu calma: todas as linhas param um pouco e esta capa volta para a fila.
                synchronized (lock) {
                    coverPauseUntil = host.now() + coverPauseS * 1000;
                    coverPauseS = Math.min(600, coverPauseS * 2);
                    covers.addFirst(item);
                }
                return;
            }
            synchronized (lock) { coverPauseS = 30; }
            if (st >= 200 && st < 300 && r.body != null) {
                info.put("b", (long) r.body.length);
                if (r.error != null) { info.put("ok", false); info.put("err", r.error); }
                else {
                    try { info.putAll(images.measure(r.body)); } catch (RuntimeException e) { info.put("ok", false); }
                }
            } else {
                info.put("ok", false);
                if (r != null && r.error != null) info.put("err", r.error);
            }
        }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("k", "c");
        res.put("id", id);
        res.put("i", info);
        host.result(res);
        synchronized (lock) {
            coversDone.add(id);
            coversCount++;
            queuesDirty = true;
        }
        markDone(1);
        pushStatus(false);
    }

    /* ---------- aviso de duplicada nova (mesmo título normalizado) ---------- */

    private void checkDuplicate(String title) {
        String core = coreOf(title);
        if (core.length() < 3) return;
        boolean seen;
        synchronized (lock) { seen = !cores.add(core); }
        if (seen) {
            try { host.possibleDuplicate(title); } catch (RuntimeException ignored) { /* aviso nunca para a procura */ }
        }
    }

    /** Título normalizado como no app (sem acentos, pontuação, artigos, formato e números). */
    String coreOf(String title) {
        String n = normalize(title);
        StringBuilder b = new StringBuilder();
        for (String w : n.split(" ")) {
            if (w.isEmpty() || w.matches("\\d+") || skipWords.contains(w)) continue;
            if (b.length() > 0) b.append(' ');
            b.append(w);
        }
        return b.toString();
    }

    static String normalize(String s) {
        if (s == null) return "";
        String f = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "").toLowerCase(Locale.ROOT);
        f = f.replaceAll("[’'`´]", "").replace("&", " e ");
        f = f.replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
        return f.replaceAll("\\s+", " ");
    }

    /* ---------- andamento ---------- */

    private void markDone(int kind) {
        long now = host.now();
        synchronized (recentDone) {
            recentDone.add(new long[] { now, kind });
            while (!recentDone.isEmpty() && now - recentDone.peekFirst()[0] > 5 * 60_000L) recentDone.pollFirst();
        }
    }

    Map<String, Object> status() {
        Map<String, Object> s = new LinkedHashMap<>();
        synchronized (lock) {
            s.put("phase", phase);
            s.put("detailsDone", detailsCount);
            s.put("detailsTotal", Math.max(detailsTotal, detailsCount + details.size()));
            s.put("detailsLeft", (long) details.size());
            s.put("coversDone", coversCount);
            s.put("coversTotal", Math.max(coversTotal, coversCount + covers.size()));
            s.put("coversLeft", (long) covers.size() + coversBusy);
            s.put("catalog", catalogMode);
            s.put("known", (long) known.size());
        }
        s.put("catStep", catStep);
        s.put("catPage", catPage);
        s.put("catPages", catPages);
        s.put("gapMs", curGap);
        s.put("minGapMs", floor());
        s.put("waitReason", waitReason);
        s.put("waitUntil", waitUntil);
        s.put("nextAt", nextRecentAt);
        s.put("error", error);
        long dpm = 0, cpm = 0;
        synchronized (recentDone) {
            long now = host.now();
            long span = recentDone.isEmpty() ? 0 : Math.max(60_000L, now - recentDone.peekFirst()[0]);
            if (span > 0) {
                int d = 0, c = 0;
                for (long[] x : recentDone) { if (x[1] == 0) d++; else c++; }
                dpm = Math.round(d * 60_000.0 / span);
                cpm = Math.round(c * 60_000.0 / span);
            }
        }
        s.put("detailsPerMin", dpm);
        s.put("coversPerMin", cpm);
        return s;
    }

    private void pushStatus(boolean force) {
        long now = host.now();
        if (!force && now - lastStatusAt < 1000) return;
        lastStatusAt = now;
        try { host.status(status()); } catch (RuntimeException ignored) { /* a tela nunca para a procura */ }
    }

    /* ---------- leitura das respostas (igual ao app: api.js) ---------- */

    static List<Object> listOf(Object raw, int depth) {
        List<Object> l = Json.arr(raw);
        if (l != null) return l;
        Map<String, Object> m = Json.obj(raw);
        if (m == null || depth > 3) return new ArrayList<>();
        for (String k : new String[] { "obras", "data", "items", "results", "resultados", "lista", "rows" }) {
            Object v = m.get(k);
            if (Json.arr(v) != null) return Json.arr(v);
            if (Json.obj(v) != null) {
                List<Object> inner = listOf(v, depth + 1);
                if (!inner.isEmpty()) return inner;
            }
        }
        if (depth > 0) return new ArrayList<>();
        List<List<Object>> best = new ArrayList<>();
        best.add(new ArrayList<>());
        deepWorks(raw, 0, best);
        return best.get(0);
    }

    private static void deepWorks(Object v, int d, List<List<Object>> best) {
        if (d > 5 || v == null) return;
        List<Object> l = Json.arr(v);
        if (l != null) {
            List<Object> works = new ArrayList<>();
            for (Object o : l) {
                Map<String, Object> m = Json.obj(o);
                if (m == null) continue;
                Map<String, Object> ob = Json.obj(m.get("obra"));
                if ((m.containsKey("obr_id") && m.containsKey("obr_nome")) || (ob != null && ob.containsKey("obr_id"))) works.add(o);
            }
            if (works.size() > best.get(0).size()) best.set(0, works);
            for (int i = 0; i < Math.min(50, l.size()); i++) deepWorks(l.get(i), d + 1, best);
            return;
        }
        Map<String, Object> m = Json.obj(v);
        if (m != null) for (Object x : m.values()) deepWorks(x, d + 1, best);
    }

    /** [página, total de páginas, total de obras] ou null. */
    static long[] pagination(Object raw) {
        Map<String, Object> m = Json.obj(raw);
        if (m == null) return null;
        Map<String, Object> p = Json.obj(m.get("pagination"));
        if (p == null) p = Json.obj(m.get("meta"));
        if (p == null && Json.obj(m.get("data")) != null) p = Json.obj(Json.obj(m.get("data")).get("pagination"));
        if (p == null) return null;
        long totalPages = firstLong(p, "totalPages", "total_pages", "last_page", "lastPage", "paginas");
        long totalItems = firstLong(p, "totalItems", "total_items", "total", "totalResults");
        long page = firstLong(p, "currentPage", "current_page", "page", "pagina");
        if (totalPages == 0 && totalItems == 0) return null;
        return new long[] { page == 0 ? 1 : page, totalPages, totalItems };
    }

    private static long firstLong(Map<String, Object> p, String... keys) {
        for (String k : keys) {
            Long v = Json.whole(p.get(k));
            if (v != null) return v;
        }
        return 0;
    }

    static Map<String, Object> workOf(Object o) {
        Map<String, Object> m = Json.obj(o);
        if (m == null) return null;
        Map<String, Object> ob = Json.obj(m.get("obra"));
        if (ob != null && !m.containsKey("obr_id") && !m.containsKey("obr_nome")) return ob;
        return m;
    }

    static Long idOf(Object o) {
        Map<String, Object> m = workOf(o);
        if (m == null) return null;
        Long id = Json.whole(m.get("obr_id"));
        if (id == null) id = Json.whole(m.get("id"));
        return id != null && id > 0 ? id : null;
    }

    static String titleOf(Map<String, Object> m) {
        return str(m, "obr_nome", "nome", "title", "titulo");
    }

    static String str(Map<String, Object> o, String... keys) {
        for (String k : keys) {
            Object v = o.get(k);
            if (v instanceof String && !((String) v).trim().isEmpty()) return ((String) v).trim();
            if (v instanceof Number) return String.valueOf(Json.whole(v) != null ? Json.whole(v) : v);
        }
        return null;
    }

    /** Endereço da capa (igual ao image() do app). */
    static String image(String s, Long id) {
        if (s == null || s.trim().isEmpty()) return null;
        s = s.trim();
        if (s.matches("(?i)^https?://.*")) return s.replaceFirst("(?i)^http:", "https:");
        if (s.startsWith("//")) return "https:" + s;
        if (s.matches("^[\\w.-]+$") && id != null) {
            try { return CDN + "obras/" + id + "/" + java.net.URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (java.io.UnsupportedEncodingException e) { return null; }
        }
        if (s.matches("^/?obras/.*")) return CDN + s.replaceFirst("^/", "");
        return null;
    }

    /** Resposta enxuta: listas grandes (capítulos) viram só o tamanho ("__len_chave") e textos muito longos são cortados. */
    static Object slim(Object v, int depth) {
        Map<String, Object> m = Json.obj(v);
        if (m != null) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : m.entrySet()) {
                List<Object> l = Json.arr(e.getValue());
                if (l != null && (l.size() > SLIM_LIST || depth >= 3)) { out.put("__len_" + e.getKey(), (long) l.size()); continue; }
                out.put(e.getKey(), depth >= 4 ? null : slim(e.getValue(), depth + 1));
            }
            return out;
        }
        List<Object> l = Json.arr(v);
        if (l != null) {
            List<Object> out = new ArrayList<>();
            for (Object o : l) out.add(slim(o, depth + 1));
            return out;
        }
        if (v instanceof String && ((String) v).length() > SLIM_TEXT) return ((String) v).substring(0, SLIM_TEXT + 1);
        return v;
    }

    private static long longOf(Object v, long d) {
        Long n = Json.whole(v);
        return n == null ? d : n;
    }

    private static long clamp(long v, long lo, long hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
