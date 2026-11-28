package __PKG__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

/**
 * Serviço em primeiro plano da procura: roda o motor (DupEngine) numa thread própria e continua com o app fechado,
 * com a tela apagada e depois de o Android fechar a tela do app. Se o Android encerrar o processo, o sistema
 * recria o serviço (ou o vigia DupBgWatch religa) e ele continua de onde parou. Notificação com o andamento e
 * botão Parar; aviso quando a conferência termina e quando aparece uma possível duplicada nova.
 */
public class DupBgService extends Service {
    static final String ACTION_PLAN = "duplicadas.PLAN";
    static final String ACTION_STOP = "duplicadas.STOP";
    static final String ACTION_RESUME = "duplicadas.RESUME";
    static final String ACTION_WAKE = "duplicadas.WAKE";
    private static final String CHANNEL = "procura";
    private static final String CHANNEL_DONE = "procura-fim";
    private static final int NOTIFICATION_ID = 8410;
    private static final int DONE_ID = 8411;
    private static final int DUP_ID = 8412;
    private static final long WAKE_MS = 6L * 3600_000L;

    static volatile DupBgService current;
    static volatile Map<String, Object> lastStatus;
    static volatile boolean running = false;

    private DupBgStore store;
    private volatile DupEngine engine;
    private Thread worker;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private long lastNotify = 0;
    private int dupCount = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        current = this;
        store = DupBgStore.get(this);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    boolean engineAlive() {
        Thread w = worker;
        return engine != null && w != null && w.isAlive();
    }

    static boolean engineRunning() {
        DupBgService s = current;
        return s != null && s.engineAlive();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        // Pedido com startForegroundService: precisa entrar em primeiro plano já.
        if (!goForeground(build("Procurando duplicadas", engineAlive() ? textOf(lastStatus) : "Preparando…", -1, 0, true))) {
            if (!engineAlive()) stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            store.setAuto(false);
            DupBgWatch.cancel(this);
            if (engineAlive()) engine.requestStop();
            else finish(null, null);
            return START_NOT_STICKY;
        }
        if (ACTION_PLAN.equals(action)) {
            Map<String, Object> plan = store.loadPlan();
            if (plan == null) { if (!engineAlive()) finish(null, null); return START_STICKY; }
            store.setAuto(true);
            DupBgWatch.schedule(this);
            if (engineAlive()) engine.applyPlan(plan);
            else launch(plan);
            return START_STICKY;
        }
        if (ACTION_WAKE.equals(action)) {
            if (engineAlive()) { engine.wake(); return START_STICKY; }
        }
        // Recriado pelo Android, religado pelo vigia ou depois de reiniciar: continua o que estava guardado.
        if (engineAlive()) return START_STICKY;
        if (!store.auto() || !launch(null)) { finish(null, null); return START_NOT_STICKY; }
        return START_STICKY;
    }

    /** plan: o novo plano do app; null = continuar do estado guardado. */
    private boolean launch(Map<String, Object> plan) {
        Map<String, Object> state = store.loadState();
        Map<String, Object> queues = store.loadQueues();
        if (plan == null && state == null) return false;
        final DupEngine e = new DupEngine(new DupNet(), new DupImages(), host);
        if (state != null) e.restore(state, plan == null ? queues : null);
        if (plan != null) e.applyPlan(plan);
        engine = e;
        acquireLocks();
        worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    e.run();
                } catch (Throwable t) {
                    store.append(Json.map("k", "erro", "text", "Erro inesperado na procura (" + t.getClass().getSimpleName() + ")."));
                } finally {
                    Map<String, Object> st = e.status();
                    engine = null;
                    String err = Json.str(st.get("error"));
                    if (err != null) {
                        // Token recusado ou outro erro que não passa sozinho: desliga até o app mandar um plano novo.
                        store.setAuto(false);
                        DupBgWatch.cancel(DupBgService.this);
                        finish("Procura parada", err);
                    } else {
                        finish(null, null);
                    }
                }
            }
        }, "duplicadas-procura");
        worker.start();
        return true;
    }

    private final DupEngine.Host host = new DupEngine.Host() {
        @Override public long now() { return System.currentTimeMillis(); }
        @Override public void sleep(long ms) throws InterruptedException { Thread.sleep(Math.max(1, ms)); }
        @Override public void result(Map<String, Object> r) {
            store.append(r);
            if ("fim".equals(r.get("k"))) doneNotice(r);
        }
        @Override public void status(Map<String, Object> s) {
            lastStatus = s;
            updateNotification(s);
        }
        @Override public void save(Map<String, Object> state, Map<String, Object> queues) { store.saveState(state, queues); }
        @Override public void possibleDuplicate(String title) { dupNotice(title); }
    };

    /* ---------- notificações ---------- */

    private static long num(Map<String, Object> s, String k) {
        Long v = s == null ? null : Json.whole(s.get(k));
        return v == null ? 0 : v;
    }

    private static String hhmm(long at) {
        return new SimpleDateFormat("HH:mm", Locale.ROOT).format(new Date(at));
    }

    static String titleOf(Map<String, Object> s) {
        String phase = s == null ? "" : String.valueOf(s.get("phase"));
        switch (phase) {
            case "catalogo": return "Lendo o catálogo";
            case "recentes": return "Olhando as obras novas";
            case "detalhes": return "Lendo detalhes e sinopses";
            case "capas": return "Conferindo capas";
            case "pausa": return "Pausa";
            case "espera": return "Tudo conferido";
            case "erro": return "Procura parada";
            default: return "Procurando duplicadas";
        }
    }

    static String textOf(Map<String, Object> s) {
        if (s == null) return "Preparando…";
        String phase = String.valueOf(s.get("phase"));
        String reason = Json.str(s.get("waitReason"));
        long dl = num(s, "detailsLeft"), cl = num(s, "coversLeft");
        String left = (dl > 0 ? dl + " detalhes" : "") + (dl > 0 && cl > 0 ? " e " : "") + (cl > 0 ? cl + " capas" : "");
        if ("pausa".equals(phase) && reason != null) return reason + ". Volta às " + hhmm(num(s, "waitUntil")) + ".";
        if ("erro".equals(phase)) return String.valueOf(s.get("error"));
        if ("espera".equals(phase)) return "Próxima olhada nas obras novas às " + hhmm(num(s, "nextAt")) + ".";
        if ("catalogo".equals(phase) || "recentes".equals(phase)) return "Página " + num(s, "catPage") + (num(s, "catPages") > 0 ? " de " + num(s, "catPages") : "") + " · " + num(s, "known") + " obras";
        long speed = num(s, "detailsPerMin") + num(s, "coversPerMin");
        return (left.isEmpty() ? "Terminando…" : "Faltam " + left) + (speed > 0 ? " · " + speed + "/min" : "");
    }

    private void updateNotification(Map<String, Object> s) {
        long now = System.currentTimeMillis();
        if (now - lastNotify < 1500 && !"espera".equals(s.get("phase")) && !"pausa".equals(s.get("phase"))) return;
        lastNotify = now;
        long dt = num(s, "detailsTotal"), dd = num(s, "detailsDone"), ct = num(s, "coversTotal"), cd = num(s, "coversDone");
        long total = dt + ct, done = dd + cd;
        boolean bar = total > 0 && done < total && !"espera".equals(s.get("phase"));
        try { show(build(titleOf(s), textOf(s), bar ? (int) Math.min(Integer.MAX_VALUE, done) : -1, bar ? (int) Math.min(Integer.MAX_VALUE, total) : 0, true)); }
        catch (RuntimeException ignored) { /* a notificação nunca para a procura */ }
    }

    private void doneNotice(Map<String, Object> r) {
        notifyDone("Conferência completa", num(r, "details") + " detalhes e " + num(r, "covers") + " capas conferidos. Abra o app para ver as duplicadas e os problemas.");
    }

    private void dupNotice(String title) {
        dupCount++;
        notifyOnce(DUP_ID, "Possível duplicada nova" + (dupCount > 1 ? " (" + dupCount + ")" : ""), "“" + title + "” tem o mesmo título de outra obra já salva.");
    }

    private void notifyDone(String title, String text) { notifyOnce(DONE_ID, title, text); }

    private void notifyOnce(int id, String title, String text) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        ensureChannels();
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Notification n = new NotificationCompat.Builder(this, CHANNEL_DONE)
                .setSmallIcon(android.R.drawable.ic_menu_search)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setContentIntent(openApp(piFlags))
                .build();
        try { nm.notify(id, n); } catch (RuntimeException ignored) { /* sem permissão de aviso */ }
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Procura em andamento", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Mostra o andamento da procura de duplicadas em segundo plano.");
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_DONE) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_DONE, "Avisos da procura", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Avisa quando a conferência termina e quando aparece uma possível duplicada nova.");
            nm.createNotificationChannel(ch);
        }
    }

    private PendingIntent openApp(int flags) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(this, 1, open, flags);
    }

    private Notification build(String title, String text, int progress, int max, boolean withStop) {
        ensureChannels();
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_search)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(false)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setContentIntent(openApp(piFlags))
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (withStop) {
            Intent stop = new Intent(this, DupBgService.class).setAction(ACTION_STOP);
            PendingIntent stopPi = Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(this, 2, stop, piFlags) : PendingIntent.getService(this, 2, stop, piFlags);
            b.addAction(0, "Parar", stopPi);
        }
        if (max > 0 && progress >= 0) b.setProgress(max, Math.min(progress, max), false);
        return b.build();
    }

    private void show(Notification n) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIFICATION_ID, n);
    }

    private boolean goForeground(Notification n) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                // "Uso especial": sem o limite de 6 h por dia que o Android 15 impõe à sincronização de dados.
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
            running = true;
            return true;
        } catch (RuntimeException e) {
            // O Android não deixou (app em segundo plano sem liberação de bateria): volta ao abrir o app.
            return false;
        }
    }

    private void finish(String title, String text) {
        releaseLocks();
        running = false;
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (RuntimeException ignored) { /* já fora do primeiro plano */ }
        if (title != null) notifyDone(title, text);
        stopSelf();
    }

    /* ---------- energia ---------- */

    private void acquireLocks() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "duplicadas:procura");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null) wakeLock.acquire(WAKE_MS);
        } catch (RuntimeException ignored) { /* segue sem trava */ }
        try {
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    @SuppressWarnings("deprecation") int mode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                    wifiLock = wm.createWifiLock(mode, "duplicadas:procura");
                    wifiLock.setReferenceCounted(false);
                }
            }
            if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
        } catch (RuntimeException ignored) { /* segue sem trava */ }
    }

    private void releaseLocks() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (RuntimeException ignored) { /* ok */ }
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (RuntimeException ignored) { /* ok */ }
    }

    /** Vigia do Android: acorda o motor (ex.: depois do modo soneca) e renova a trava de energia. */
    static void poke() {
        DupBgService s = current;
        if (s == null || !s.engineAlive()) return;
        s.engine.wake();
        s.acquireLocks();
    }

    static Map<String, Object> status() {
        DupBgService s = current;
        DupEngine e = s == null ? null : s.engine;
        return e != null ? e.status() : lastStatus;
    }

    /** Android 15: fim do tempo permitido em segundo plano (não deve acontecer com "uso especial"). */
    public void onTimeout(int startId, int fgsType) {
        DupEngine e = engine;
        if (e != null) e.requestStop();
        finish("Procura pausada pelo Android", "Limite de tempo em segundo plano. Abra o app para continuar.");
    }

    @Override
    public void onDestroy() {
        DupEngine e = engine;
        if (e != null) e.requestStop();
        running = false;
        releaseLocks();
        if (current == this) current = null;
        super.onDestroy();
    }
}
