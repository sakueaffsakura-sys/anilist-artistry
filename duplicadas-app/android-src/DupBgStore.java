package __PKG__;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Arquivos da procura em segundo plano (na pasta privada do app; o token também fica só aqui):
 * plan.json (último plano do app), state.json (estado pequeno), queues.json (filas) e os resultados em pedaços
 * res-<primeiro>.jsonl (1 linha por resultado, numeradas). O app lê os resultados com pull e confirma com ack,
 * e então os pedaços já lidos são apagados.
 */
final class DupBgStore {
    private static DupBgStore instance;
    private static final int SEGMENT_LINES = 1000;
    private static final Pattern SEQ = Pattern.compile("^\\{\"q\":(\\d+)");

    private final File dir;
    private final SharedPreferences prefs;
    private long seq, segFirst;
    private int segLines;

    static synchronized DupBgStore get(Context context) {
        if (instance == null) instance = new DupBgStore(context.getApplicationContext());
        return instance;
    }

    private DupBgStore(Context context) {
        dir = new File(context.getFilesDir(), "dupbg");
        if (!dir.exists()) dir.mkdirs();
        prefs = context.getSharedPreferences("dupbg", Context.MODE_PRIVATE);
        seq = prefs.getLong("seq", 0);
        segFirst = prefs.getLong("segFirst", seq + 1);
        segLines = prefs.getInt("segLines", 0);
        // O número é guardado de 25 em 25: confere no último pedaço (o processo pode ter sido encerrado no meio).
        long[] firsts = segments();
        if (firsts.length > 0) {
            long last = firsts[firsts.length - 1];
            String text = read(segment(last));
            if (text != null) {
                int lines = 0;
                long max = 0;
                for (String line : text.split("\n")) {
                    Matcher m = SEQ.matcher(line);
                    if (!m.find()) continue;
                    lines++;
                    max = Math.max(max, Long.parseLong(m.group(1)));
                }
                if (max >= seq) {
                    seq = max;
                    segFirst = last;
                    segLines = lines;
                    if (segLines >= SEGMENT_LINES) { segFirst = seq + 1; segLines = 0; }
                }
            }
        }
    }

    /* ---------- liga/desliga ---------- */

    boolean auto() { return prefs.getBoolean("auto", false); }

    void setAuto(boolean on) { prefs.edit().putBoolean("auto", on).apply(); }

    /* ---------- plano, estado e filas ---------- */

    synchronized void savePlan(String json) { write("plan.json", json); }

    synchronized Map<String, Object> loadPlan() { return readMap("plan.json"); }

    synchronized void clearPlan() { new File(dir, "plan.json").delete(); }

    synchronized void saveState(Map<String, Object> state, Map<String, Object> queues) {
        if (state != null) write("state.json", Json.stringify(state));
        if (queues != null) write("queues.json", Json.stringify(queues));
    }

    synchronized Map<String, Object> loadState() { return readMap("state.json"); }

    synchronized Map<String, Object> loadQueues() { return readMap("queues.json"); }

    /* ---------- resultados ---------- */

    synchronized long seq() { return seq; }

    /** Guarda um resultado numerado (o número vai na frente da linha, para achar rápido). */
    synchronized void append(Map<String, Object> r) {
        long q = seq + 1;
        StringBuilder b = new StringBuilder();
        b.append("{\"q\":").append(q);
        String body = Json.stringify(r);
        if (body.length() > 2) b.append(',').append(body, 1, body.length());
        else b.append('}');
        b.append('\n');
        try (OutputStream out = new FileOutputStream(segment(segFirst), true)) {
            out.write(b.toString().getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return;
        }
        seq = q;
        segLines++;
        boolean rotate = segLines >= SEGMENT_LINES;
        if (rotate) { segFirst = seq + 1; segLines = 0; }
        if (rotate || seq % 25 == 0) prefs.edit().putLong("seq", seq).putLong("segFirst", segFirst).putInt("segLines", segLines).apply();
    }

    /** Resultados depois de `after` (no máximo `max`): {data: "[...]", last, more}. */
    synchronized Object[] pull(long after, int max) {
        StringBuilder b = new StringBuilder("[");
        long last = after;
        int n = 0;
        boolean more = false;
        long[] firsts = segments();
        for (int i = 0; i < firsts.length; i++) {
            if (n >= max) { more = true; break; }
            // Pedaço inteiro já lido: nem abre.
            if (i + 1 < firsts.length && firsts[i + 1] - 1 <= after) continue;
            File f = segment(firsts[i]);
            String text = read(f);
            if (text == null) continue;
            for (String line : text.split("\n")) {
                if (line.isEmpty()) continue;
                Matcher m = SEQ.matcher(line);
                if (!m.find()) continue;
                long q = Long.parseLong(m.group(1));
                if (q <= after) continue;
                if (n >= max) { more = true; break; }
                if (n > 0) b.append(',');
                b.append(line);
                last = q;
                n++;
            }
        }
        b.append(']');
        return new Object[] { b.toString(), last, more || last < seq };
    }

    /** O app guardou tudo até `upTo`: apaga os pedaços inteiros já lidos. */
    synchronized void ack(long upTo) {
        long[] firsts = segments();
        for (int i = 0; i < firsts.length; i++) {
            boolean current = firsts[i] == segFirst;
            long lastInSeg = i + 1 < firsts.length ? firsts[i + 1] - 1 : seq;
            if (lastInSeg <= upTo && (!current || segLines > 0)) {
                segment(firsts[i]).delete();
                if (current) {
                    segFirst = seq + 1;
                    segLines = 0;
                    prefs.edit().putLong("segFirst", segFirst).putInt("segLines", 0).apply();
                }
            }
        }
    }

    private long[] segments() {
        String[] names = dir.list();
        List<Long> l = new ArrayList<>();
        if (names != null) for (String n : names) {
            if (n.startsWith("res-") && n.endsWith(".jsonl")) {
                try { l.add(Long.parseLong(n.substring(4, n.length() - 6))); } catch (NumberFormatException ignored) { /* outro arquivo */ }
            }
        }
        long[] out = new long[l.size()];
        for (int i = 0; i < out.length; i++) out[i] = l.get(i);
        Arrays.sort(out);
        return out;
    }

    private File segment(long first) { return new File(dir, "res-" + first + ".jsonl"); }

    /* ---------- arquivos ---------- */

    private void write(String name, String text) {
        File tmp = new File(dir, name + ".tmp");
        try (OutputStream out = new FileOutputStream(tmp)) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            return;
        }
        File f = new File(dir, name);
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f); }
    }

    private static String read(File f) {
        if (!f.exists()) return null;
        try (InputStream in = new FileInputStream(f)) {
            return new String(DupNet.read(in, 64 * 1024 * 1024, Long.MAX_VALUE), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private Map<String, Object> readMap(String name) {
        String t = read(new File(dir, name));
        if (t == null) return null;
        try { return Json.obj(Json.parse(t)); } catch (Json.ParseError e) { return null; }
    }
}
