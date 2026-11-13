package __PKG__;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * O que o envio guarda no celular: o trabalho em andamento (para continuar se o Android fechar o app),
 * a configuração, os horários do ritmo e os eventos recentes (a tela lê os que perdeu enquanto estava
 * fechada). Tudo fica na área privada do app.
 */
final class EnvioStore {
    private static final String PREFS = "estudio-envio";
    private static final int KEEP_EVENTS = 600;
    private static final Pattern SEQ = Pattern.compile("^\\{\"seq\":(\\d+)");
    private static EnvioStore instance;

    private final SharedPreferences prefs;
    private final File file;
    private final ArrayDeque<String> recent = new ArrayDeque<>();
    private long seq;
    private int fileLines;
    private String lastStart, lastProgress, lastStatus;

    static synchronized EnvioStore get(Context context) {
        if (instance == null) instance = new EnvioStore(context.getApplicationContext());
        return instance;
    }

    private EnvioStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        file = new File(context.getFilesDir(), "envio-eventos.jsonl");
        seq = prefs.getLong("seq", 0);
        load();
    }

    private void load() {
        if (!file.exists()) return;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            for (String line; (line = r.readLine()) != null; ) {
                if (line.isEmpty()) continue;
                recent.addLast(line);
                fileLines++;
                if (recent.size() > KEEP_EVENTS) recent.removeFirst();
                long s = seqOf(line);
                if (s > seq) seq = s;
            }
        } catch (IOException ignored) {
            // Sem histórico antigo: começa do zero.
        }
    }

    private static long seqOf(String line) {
        Matcher m = SEQ.matcher(line);
        return m.find() ? Long.parseLong(m.group(1)) : 0;
    }

    /** Guarda o evento com número de sequência e hora; devolve a linha JSON (para mandar à tela). */
    synchronized String append(Map<String, Object> event, long at) {
        seq++;
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("seq", seq);
        e.put("at", at);
        for (Map.Entry<String, Object> x : event.entrySet()) if (!"seq".equals(x.getKey()) && !"at".equals(x.getKey())) e.put(x.getKey(), x.getValue());
        String line = Json.stringify(e);
        recent.addLast(line);
        if (recent.size() > KEEP_EVENTS) recent.removeFirst();
        String type = String.valueOf(event.get("type"));
        if ("work-start".equals(type) || "chapters-start".equals(type) || "run-start".equals(type)) { lastStart = line; lastProgress = null; lastStatus = null; }
        else if ("progress".equals(type)) lastProgress = line;
        else if (isStatus(type)) lastStatus = line;
        writeLine(line);
        prefs.edit().putLong("seq", seq).putLong("beat", at).apply();
        return line;
    }

    private static boolean isStatus(String type) {
        switch (type) {
            case "sending": case "fetching": case "posting": case "waiting": case "api-wait":
            case "pause": case "net-retry": case "resume": case "auto-idle": case "auto-scan": case "auto-plan":
                return true;
            default:
                return false;
        }
    }

    private void writeLine(String line) {
        try {
            if (fileLines >= KEEP_EVENTS * 2) {
                // Arquivo grande: regrava só os eventos recentes.
                try (Writer w = new OutputStreamWriter(new FileOutputStream(file, false), StandardCharsets.UTF_8)) {
                    for (String l : recent) { w.write(l); w.write('\n'); }
                }
                fileLines = recent.size();
                return;
            }
            try (Writer w = new OutputStreamWriter(new FileOutputStream(file, true), StandardCharsets.UTF_8)) {
                w.write(line);
                w.write('\n');
            }
            fileLines++;
        } catch (IOException ignored) {
            // Sem espaço: os eventos continuam indo para a tela, só não ficam guardados.
        }
    }

    synchronized long seq() { return seq; }

    long beat() { return prefs.getLong("beat", 0); }

    /** Eventos depois de `since`, mais o estado atual, em JSON (resposta do plugin para a tela). */
    synchronized String eventsJson(long since, boolean running) {
        StringBuilder b = new StringBuilder();
        b.append("{\"seq\":").append(seq).append(",\"running\":").append(running);
        b.append(",\"beat\":").append(beat());
        String job = prefs.getString("job", null);
        b.append(",\"job\":").append(job == null ? "null" : job);
        String session = prefs.getString("session", null);
        b.append(",\"session\":").append(session == null ? "null" : session);
        b.append(",\"events\":[");
        boolean first = true;
        for (Iterator<String> it = recent.iterator(); it.hasNext(); ) {
            String line = it.next();
            if (seqOf(line) <= since) continue;
            if (!first) b.append(',');
            first = false;
            b.append(line);
        }
        b.append("],\"snapshot\":[");
        first = true;
        for (String line : new String[] { lastStart, lastProgress, lastStatus }) {
            if (line == null) continue;
            if (!first) b.append(',');
            first = false;
            b.append(line);
        }
        b.append("]}");
        return b.toString();
    }

    /* ---------- trabalho, configuração, ritmo e sessão ---------- */

    synchronized void saveJob(Map<String, Object> job) { prefs.edit().putString("job", Json.stringify(job)).putLong("beat", System.currentTimeMillis()).apply(); }

    synchronized Map<String, Object> loadJob() {
        try { return Json.obj(Json.parse(prefs.getString("job", "null"))); } catch (Json.ParseError e) { return null; }
    }

    synchronized void clearJob() { prefs.edit().remove("job").apply(); }

    /** Próxima obra da lista (envio de várias obras): se o app for fechado, continua dela. */
    synchronized void advanceJob(int nextIndex) {
        Map<String, Object> job = loadJob();
        if (job == null) return;
        job.put("index", nextIndex);
        prefs.edit().putString("job", Json.stringify(job)).apply();
    }

    synchronized void saveConfig(Map<String, Object> config) { prefs.edit().putString("config", Json.stringify(config)).apply(); }

    synchronized Map<String, Object> loadConfig() {
        try { return Json.obj(Json.parse(prefs.getString("config", "null"))); } catch (Json.ParseError e) { return null; }
    }

    synchronized void saveSession(Map<String, Object> session) {
        prefs.edit().putString("session", Json.stringify(session)).apply();
        Map<String, Object> c = loadConfig();
        if (c != null) { c.put("session", session); saveConfig(c); }
    }

    synchronized void saveSite(String origin) {
        Map<String, Object> c = loadConfig();
        if (c != null) { c.put("site", origin); saveConfig(c); }
    }

    synchronized void savePace(long api, long pair, long lock) {
        prefs.edit().putLong("paceApi", api).putLong("pacePair", pair).putLong("paceLock", lock).apply();
    }

    long[] loadPace() {
        return new long[] { prefs.getLong("paceApi", -1), prefs.getLong("pacePair", -1), prefs.getLong("paceLock", -1) };
    }

    /** Linhas recentes como lista (para testes e diagnóstico). */
    synchronized List<String> recentLines() { return new ArrayList<>(recent); }
}
