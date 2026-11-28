package __PKG__;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Testes do motor em segundo plano com uma API e um servidor de imagens de mentira e relógio simulado
 * (roda no GitHub antes do build: javac + java, sem Android).
 */
public class DupEngineTest {
    static int fail = 0;

    static void check(boolean ok, String what) {
        System.out.println((ok ? "ok   " : "FAIL ") + what);
        if (!ok) fail++;
    }

    /** API de mentira: busca paginada (ou não), listas, detalhes; conta pedidos e recusa quando mandado. */
    static final class FakeApi implements DupEngine.Http {
        final List<Map<String, Object>> works = Collections.synchronizedList(new ArrayList<>());
        volatile boolean buscaWorks = true;
        volatile int refuseDetail = -1;
        volatile int refusals = 0;
        volatile boolean unauthorized = false;
        final AtomicLong apiCalls = new AtomicLong(), cdnCalls = new AtomicLong();
        final List<Long> apiTimes = Collections.synchronizedList(new ArrayList<>());
        final AtomicLong clock;

        FakeApi(AtomicLong clock) { this.clock = clock; }

        void add(long id, String title) {
            Map<String, Object> w = new LinkedHashMap<>();
            w.put("obr_id", id);
            w.put("obr_nome", title);
            w.put("obr_imagem", "c" + id + ".webp");
            works.add(w);
        }

        static DupEngine.Resp json(int status, String body) {
            DupEngine.Resp r = new DupEngine.Resp();
            r.status = status;
            r.type = "application/json";
            r.body = body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            return r;
        }

        List<Map<String, Object>> newestFirst() {
            List<Map<String, Object>> l = new ArrayList<>(works);
            Collections.reverse(l);
            return l;
        }

        @Override
        public DupEngine.Resp get(String url, Map<String, String> headers, boolean binary) {
            if (url.startsWith(DupEngine.CDN)) {
                cdnCalls.incrementAndGet();
                DupEngine.Resp r = new DupEngine.Resp();
                if (url.contains("c13.")) { r.status = 404; r.body = new byte[0]; return r; }
                r.status = 200;
                r.type = "image/webp";
                r.body = new byte[] { 1, 2, 3 };
                return r;
            }
            apiCalls.incrementAndGet();
            apiTimes.add(clock.get());
            check(headers.get("Authorization") != null && headers.get("Authorization").startsWith("Bearer "), "token goes in the header");
            if (unauthorized) return json(401, "{}");
            String path = url.substring(DupEngine.API.length());
            if (path.startsWith("/obras/buscar")) {
                if (!buscaWorks) return json(200, "{\"data\":[]}");
                int page = Integer.parseInt(path.replaceAll(".*pagina=(\\d+).*", "$1"));
                int per = 60, total = (works.size() + per - 1) / per;
                List<Object> slice = new ArrayList<>(works.subList(Math.min(works.size(), (page - 1) * per), Math.min(works.size(), page * per)));
                Map<String, Object> pag = Json.map("currentPage", (long) page, "totalPages", (long) total, "totalItems", (long) works.size());
                return json(200, Json.stringify(Json.map("data", slice, "pagination", pag)));
            }
            if (path.startsWith("/obras/adicionados-recentes") || path.startsWith("/obras/atualizadas-recentes")) {
                int size = path.startsWith("/obras/adicionados") ? 20 : 30;
                int page = 1;
                // Esta API só pagina com "pagina=" (as outras formas devolvem a primeira página de novo).
                if (path.contains("pagina=")) page = Integer.parseInt(path.replaceAll(".*pagina=(\\d+).*", "$1"));
                List<Map<String, Object>> all = newestFirst();
                List<Object> slice = new ArrayList<>(all.subList(Math.min(all.size(), (page - 1) * size), Math.min(all.size(), page * size)));
                return json(200, Json.stringify(Json.map("data", slice)));
            }
            if (path.matches("/obras/\\d+")) {
                long id = Long.parseLong(path.substring(7));
                if (id == refuseDetail && refusals < 1) { refusals++; return json(429, "{}"); }
                Map<String, Object> w = null;
                synchronized (works) { for (Map<String, Object> x : works) if (Json.whole(x.get("obr_id")) == id) w = x; }
                if (w == null) return json(404, "{}");
                Map<String, Object> d = new LinkedHashMap<>(w);
                d.put("obr_descricao", "Sinopse da obra " + id);
                List<Object> caps = new ArrayList<>();
                for (int i = 0; i < 120; i++) caps.add(Json.map("cap_id", (long) i));
                d.put("capitulos", caps);
                return json(200, Json.stringify(Json.map("data", d)));
            }
            return json(404, "{}");
        }
    }

    static final class FakeHost implements DupEngine.Host {
        final AtomicLong clock;
        final List<Map<String, Object>> results = Collections.synchronizedList(new ArrayList<>());
        final List<String> dups = Collections.synchronizedList(new ArrayList<>());
        volatile Map<String, Object> lastStatus;
        volatile Map<String, Object> state, queues;

        FakeHost(AtomicLong clock) { this.clock = clock; }

        @Override public long now() { return clock.get(); }
        @Override public void sleep(long ms) { clock.addAndGet(Math.max(1, ms)); Thread.yield(); }
        @Override public void result(Map<String, Object> r) { results.add(r); }
        @Override public void status(Map<String, Object> s) { lastStatus = s; }
        @Override public void save(Map<String, Object> s, Map<String, Object> q) { state = s; if (q != null) queues = q; }
        @Override public void possibleDuplicate(String title) { dups.add(title); }

        long count(String k) {
            synchronized (results) { return results.stream().filter((r) -> k.equals(r.get("k"))).count(); }
        }
    }

    static final class FakeImages implements DupEngine.Images {
        @Override
        public Map<String, Object> measure(byte[] body) {
            return Json.map("w", 300L, "h", 450L, "std", 40.0, "hash", "0123456789abcdef", "ok", true);
        }
    }

    static Thread start(DupEngine e) {
        Thread t = new Thread(e::run, "engine");
        t.setDaemon(true);
        t.start();
        return t;
    }

    static boolean waitFor(java.util.function.BooleanSupplier ok, long realMs) throws InterruptedException {
        long end = System.currentTimeMillis() + realMs;
        while (System.currentTimeMillis() < end) {
            if (ok.getAsBoolean()) return true;
            Thread.sleep(5);
        }
        return ok.getAsBoolean();
    }

    static Map<String, Object> plan(Object... kv) {
        Map<String, Object> p = Json.map("token", "Bearer tok-123", "gapMs", 1000L, "minGapMs", 500L, "coverGapMs", 50L, "coverThreads", 3L, "everyMs", 6L * 3600_000L, "covers", true,
            "skip", new ArrayList<Object>(java.util.Arrays.asList("o", "a", "de", "do", "da", "ia", "manhwa")));
        for (int i = 0; i + 1 < kv.length; i += 2) p.put(String.valueOf(kv[i]), kv[i + 1]);
        return p;
    }

    public static void main(String[] args) throws Exception {
        // 1) Catálogo completo pela busca, depois detalhes e capas de todas.
        {
            AtomicLong clock = new AtomicLong(1_000_000);
            FakeApi api = new FakeApi(clock);
            for (int i = 1; i <= 150; i++) api.add(i, "Obra número " + i);
            FakeHost host = new FakeHost(clock);
            DupEngine e = new DupEngine(api, new FakeImages(), host);
            e.applyPlan(plan("catalog", "full"));
            Thread t = start(e);
            boolean done = waitFor(() -> host.count("fim") > 0, 20_000);
            check(done, "full run finishes (catalog + details + covers)");
            check(host.count("w") == 150, "150 works found: " + host.count("w"));
            check(host.count("d") == 150, "150 details read: " + host.count("d"));
            check(host.count("c") == 150, "150 covers checked: " + host.count("c"));
            Map<String, Object> d = null;
            synchronized (host.results) { for (Map<String, Object> r : host.results) if ("d".equals(r.get("k"))) { d = r; break; } }
            Map<String, Object> o = d == null ? null : Json.obj(Json.obj(d.get("o")).get("data"));
            check(o != null && Long.valueOf(120).equals(o.get("__len_capitulos")) && !o.containsKey("capitulos"), "chapter list becomes its size: " + (o == null ? null : o.keySet()));
            Map<String, Object> c13 = null;
            synchronized (host.results) { for (Map<String, Object> r : host.results) if ("c".equals(r.get("k")) && Long.valueOf(13).equals(r.get("id"))) c13 = r; }
            check(c13 != null && Long.valueOf(404).equals(Json.obj(c13.get("i")).get("s")), "broken cover recorded with its status");
            Map<String, Object> last = null;
            synchronized (host.results) { for (Map<String, Object> r : host.results) if ("p".equals(r.get("k"))) last = r; }
            check(last != null && Json.obj(last.get("progress")).get("finished") != null && "pronto".equals(Json.obj(last.get("progress")).get("step")), "catalog progress ends ready: " + (last == null ? null : last.get("progress")));
            // Ritmo: nunca dois pedidos à API mais perto que o mínimo.
            long minGap = Long.MAX_VALUE;
            synchronized (api.apiTimes) { for (int i = 1; i < api.apiTimes.size(); i++) minGap = Math.min(minGap, api.apiTimes.get(i) - api.apiTimes.get(i - 1)); }
            check(minGap >= 500, "API pacing respected (min gap " + minGap + " ms)");
            Map<String, Object> st = e.status();
            check(Json.whole(st.get("gapMs")) < 1000, "pace speeds up after many successes: " + st.get("gapMs"));

            // 2) Obras novas (recentes): entram na frente e avisam quando o título repete.
            api.add(151, "Obra Nova Legal");
            api.add(152, "Obra número 7 (IA)");
            e.applyPlan(plan("cores", new ArrayList<Object>(java.util.Arrays.asList("obra numero"))));
            long before = host.count("w");
            e.recentNow();
            boolean got = waitFor(() -> host.count("r") > 0 && host.count("d") >= 152, 20_000);
            check(got && host.count("w") - before == 2, "recent check finds the 2 new works: " + (host.count("w") - before));
            check(host.dups.size() == 1 && host.dups.get(0).contains("(IA)"), "possible duplicate warned: " + host.dups);
            e.requestStop();
            t.join(5000);
            check(!t.isAlive(), "stops on request");
            check(host.state != null && host.queues != null, "state and queues saved");
        }
        // 3) Busca não serve: listas, descobrindo que a paginação é "pagina=".
        {
            AtomicLong clock = new AtomicLong(5_000_000);
            FakeApi api = new FakeApi(clock);
            api.buscaWorks = false;
            for (int i = 1; i <= 70; i++) api.add(i, "Titulo " + i);
            FakeHost host = new FakeHost(clock);
            DupEngine e = new DupEngine(api, new FakeImages(), host);
            e.applyPlan(plan("catalog", "full", "covers", false));
            Thread t = start(e);
            boolean done = waitFor(() -> host.count("fim") > 0, 20_000);
            Map<String, Object> last = null;
            synchronized (host.results) { for (Map<String, Object> r : host.results) if ("p".equals(r.get("k"))) last = r; }
            check(done && host.count("w") == 70, "lists read everything when the search doesn't page: " + host.count("w"));
            check(last != null && Long.valueOf(1).equals(Json.obj(last.get("pagers")).get("adicionadas")), "pager discovered (pagina=): " + (last == null ? null : last.get("pagers")));
            check(host.count("c") == 0, "covers off: none checked");
            e.requestStop();
            t.join(5000);
        }
        // 4) Recusa (429): espera, fica mais devagar e continua; 5) token recusado para.
        {
            AtomicLong clock = new AtomicLong(9_000_000);
            FakeApi api = new FakeApi(clock);
            for (int i = 1; i <= 5; i++) api.add(i, "Coisa " + i);
            api.refuseDetail = 3;
            FakeHost host = new FakeHost(clock);
            DupEngine e = new DupEngine(api, new FakeImages(), host);
            List<Object> q = new ArrayList<>(java.util.Arrays.asList(1L, 2L, 3L, 4L, 5L));
            e.applyPlan(plan("detailsQueue", q, "known", q, "covers", false));
            long t0 = clock.get();
            Thread t = start(e);
            boolean done = waitFor(() -> host.count("d") == 5, 20_000);
            check(done, "all details read after a refusal");
            check(clock.get() - t0 >= 60_000, "waited at least 1 min after 429: " + (clock.get() - t0) + " ms");
            check(Json.whole(e.status().get("minGapMs")) >= 1500, "learned a slower minimum after 429: " + e.status().get("minGapMs"));
            e.requestStop();
            t.join(5000);

            api.unauthorized = true;
            DupEngine e2 = new DupEngine(api, new FakeImages(), host);
            e2.applyPlan(plan("detailsQueue", new ArrayList<Object>(java.util.Arrays.asList(1L)), "covers", false));
            Thread t2 = start(e2);
            t2.join(5000);
            check(!t2.isAlive() && "erro".equals(e2.status().get("phase")) && String.valueOf(e2.status().get("error")).contains("401"), "401 stops with an error: " + e2.status().get("error"));
        }
        // 6) Continua de onde parou (estado guardado).
        {
            AtomicLong clock = new AtomicLong(20_000_000);
            FakeApi api = new FakeApi(clock);
            for (int i = 1; i <= 10; i++) api.add(i, "Livro " + i);
            FakeHost host = new FakeHost(clock);
            DupEngine e = new DupEngine(api, new FakeImages(), host);
            List<Object> q = new ArrayList<>();
            for (long i = 1; i <= 10; i++) q.add(i);
            Map<String, Object> state = Json.map("token", "tok", "gapMs", 1000L, "covers", false, "detailsCount", 4L, "detailsTotal", 10L);
            e.restore(state, Json.map("detailsQueue", new ArrayList<Object>(q.subList(4, 10)), "known", q));
            Thread t = start(e);
            boolean done = waitFor(() -> host.count("d") == 6, 20_000);
            check(done && Long.valueOf(10).equals(e.status().get("detailsDone")), "restored queue continues and counts from where it stopped: " + e.status().get("detailsDone") + "/" + e.status().get("detailsTotal"));
            e.requestStop();
            t.join(5000);
        }
        check(DupEngine.image("abc.webp", 9L).equals("https://cdn.mediocrescan.com/obras/9/abc.webp"), "cover address like the app");
        check(DupEngine.normalize("Ação & Reação: O Retorno!").equals("acao e reacao o retorno"), "normalize like the app");
        System.out.println(fail == 0 ? "ALL OK" : fail + " FAILED");
        System.exit(fail == 0 ? 0 : 1);
    }
}
