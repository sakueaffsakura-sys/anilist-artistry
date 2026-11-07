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
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Serviço em primeiro plano que faz o envio de verdade (motor nativo EnvioEngine numa thread própria).
 * Continua com o app minimizado, com a tela apagada e mesmo se o Android fechar a tela do app; se o
 * Android encerrar o processo, o sistema recria o serviço e ele continua de onde parou.
 *
 * Modo antigo (jsMode): quando o envio roda na tela (navegador/teste), o serviço só segura o processo
 * vivo e mostra a notificação que a tela manda.
 */
public class EnvioService extends Service {
    static final String ACTION_START = "estudio.START";
    static final String ACTION_UPDATE = "estudio.UPDATE";
    static final String ACTION_STOP = "estudio.STOP_REQUEST";
    static final String ACTION_JOB = "estudio.JOB";
    private static final String CHANNEL = "envio";
    private static final String CHANNEL_DONE = "envio-fim";
    private static final int NOTIFICATION_ID = 7310;
    private static final int DONE_ID = 7311;
    private static final long RESUME_MAX_AGE_MS = 30 * 60_000L;
    private static final long WAKE_MS = 6L * 60L * 60L * 1000L;

    /** Serviço em primeiro plano (qualquer modo). */
    static volatile boolean running = false;
    /** true quando quem envia é a tela (modo antigo); false com o motor nativo. */
    static volatile boolean jsMode = false;
    static volatile EnvioService current;

    interface Listener { void onEvent(String json); }
    static volatile Listener listener;

    private static final EnvioEngine.Clock CLOCK = new EnvioEngine.Clock() {
        @Override public long now() { return System.currentTimeMillis(); }
        @Override public void sleep(long ms) throws InterruptedException { Thread.sleep(Math.max(1, ms)); }
    };

    private EnvioStore store;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private volatile EnvioEngine engine;
    private Thread worker;

    // Estado da notificação.
    private String workName = "Enviando obras";
    private long done = 0, total = 0;
    private String endTitle, endText;

    @Override
    public void onCreate() {
        super.onCreate();
        current = this;
        store = EnvioStore.get(this);
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
        EnvioService s = current;
        return s != null && s.engineAlive();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (intent == null) {
            // O Android recriou o serviço depois de encerrar o app: continua o envio guardado.
            if (engineAlive()) return START_STICKY;
            if (resumeSaved()) return START_STICKY;
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_JOB.equals(action)) {
            startJob(intent.getStringExtra("job"), intent.getStringExtra("config"));
            return START_STICKY;
        }
        if (ACTION_STOP.equals(action)) {
            if (engineAlive()) {
                engine.requestStop();
                show(build("Parando o envio…", "Terminando o passo atual.", -1, 0, 0, false));
                return START_STICKY;
            }
            EstudioPlugin.emitStop();
            return START_NOT_STICKY;
        }
        // Modo antigo: a tela envia e manda o texto da notificação.
        if (engineAlive()) return START_STICKY;
        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        int progress = intent.getIntExtra("progress", -1);
        int max = intent.getIntExtra("max", 0);
        Notification n = build(title != null ? title : "Enviando obras", text != null ? text : "", progress, max, 0, false);
        if (!running) {
            if (!goForeground(n)) { stopSelf(); return START_NOT_STICKY; }
            jsMode = true;
            acquireLocks();
        } else {
            show(n);
        }
        return START_NOT_STICKY;
    }

    /* ---------- trabalho nativo ---------- */

    private void startJob(String jobJson, String configJson) {
        // Pedido com startForegroundService: precisa entrar em primeiro plano já (mesmo se já estiver enviando).
        boolean busy = engineAlive();
        Notification first = busy
                ? build(workName, done + " de " + total + " capítulos", (int) Math.min(Integer.MAX_VALUE, done), (int) Math.min(Integer.MAX_VALUE, total), 0, true)
                : build("Preparando o envio…", "", -1, 0, 0, false);
        if (!goForeground(first)) {
            if (!busy) {
                emitLocal("run-error", "message", "O Android não deixou o envio rodar em segundo plano. Abra o app e toque em Continuar.", "works", 0, "added", 0);
                stopSelf();
            }
            return;
        }
        if (busy) {
            emitLocal("log", "text", "Já existe um envio em andamento; o novo pedido foi ignorado.");
            return;
        }
        Map<String, Object> job, config;
        try {
            job = Json.obj(Json.parse(jobJson));
            config = Json.obj(Json.parse(configJson));
        } catch (Json.ParseError e) {
            job = null;
            config = null;
        }
        if (job == null || config == null) {
            emitLocal("run-error", "message", "Dados do envio inválidos.", "works", 0, "added", 0);
            finishForeground("Envio não iniciado", "Dados do envio inválidos.");
            return;
        }
        store.saveJob(job);
        store.saveConfig(config);
        launch(job, config);
    }

    private boolean resumeSaved() {
        Map<String, Object> job = store.loadJob();
        Map<String, Object> config = store.loadConfig();
        if (job == null || config == null) return false;
        if (System.currentTimeMillis() - store.beat() > RESUME_MAX_AGE_MS) {
            store.clearJob();
            return false;
        }
        if (!goForeground(build("Continuando o envio…", "O Android reiniciou o app; o envio continua de onde parou.", -1, 0, 0, false))) return false;
        emitLocal("log", "text", "O Android reiniciou o app durante o envio. Continuando de onde parou…");
        launch(job, config);
        return true;
    }

    private void launch(final Map<String, Object> job, Map<String, Object> config) {
        EnvioEngine.Config c = EnvioEngine.Config.from(config);
        long[] p = store.loadPace();
        c.paceApi = p[0];
        c.pacePair = p[1];
        c.paceLock = p[2];
        final EnvioEngine e = new EnvioEngine(c, new HttpConn(null), new HttpConn(null), CLOCK, host);
        engine = e;
        jsMode = false;
        endTitle = null;
        endText = null;
        acquireLocks();
        worker = new Thread(new Runnable() {
            @Override
            public void run() {
                runJob(e, job);
            }
        }, "estudio-envio");
        worker.start();
    }

    private void runJob(EnvioEngine e, Map<String, Object> job) {
        try {
            String type = Json.str(job.get("type"));
            if ("works".equals(type)) {
                List<EnvioEngine.WorkRef> works = new ArrayList<>();
                List<Object> list = Json.arr(job.get("works"));
                if (list != null) {
                    for (Object o : list) {
                        Map<String, Object> w = Json.obj(o);
                        Long id = w == null ? null : Json.whole(w.get("id"));
                        if (id != null && id > 0) works.add(new EnvioEngine.WorkRef(id, Json.str(w.get("title"))));
                    }
                }
                Long index = Json.whole(job.get("index"));
                e.runWorks(works, index == null ? 0 : (int) Math.max(0, index));
            } else if ("chapters".equals(type)) {
                Long id = Json.whole(job.get("workId"));
                List<Long> caps = new ArrayList<>();
                List<Object> list = Json.arr(job.get("capIds"));
                if (list != null) for (Object o : list) { Long c = Json.whole(o); if (c != null) caps.add(c); }
                if (id == null) throw new IllegalArgumentException("obra");
                e.runChapters(id, Json.str(job.get("title")), caps);
            } else {
                emitLocal("run-error", "message", "Tipo de envio desconhecido.", "works", 0, "added", 0);
            }
        } catch (Throwable t) {
            emitLocal("run-error", "message", "Erro inesperado no envio (" + t.getClass().getSimpleName() + ").", "works", 0, "added", 0);
        } finally {
            store.clearJob();
            engine = null;
            finishForeground(endTitle != null ? endTitle : "Envio encerrado", endText != null ? endText : "");
        }
    }

    private final EnvioEngine.Host host = new EnvioEngine.Host() {
        @Override public void emit(Map<String, Object> event) { onEvent(event); }
        @Override public void savePace(long api, long pair, long lock) { store.savePace(api, pair, lock); }
        @Override public void saveSession(EnvioEngine.Session s) { store.saveSession(s.toMap()); }
        @Override public void moved(String origin) { store.saveSite(origin); }
        @Override public void workDone(int index) { store.advanceJob(index + 1); }
    };

    private void emitLocal(String type, Object... kv) {
        Map<String, Object> e = Json.map("type", type);
        for (int i = 0; i + 1 < kv.length; i += 2) e.put(String.valueOf(kv[i]), kv[i + 1]);
        onEvent(e);
    }

    private void onEvent(Map<String, Object> e) {
        long at = System.currentTimeMillis();
        String line = store.append(e, at);
        try { updateNotification(e, at); } catch (RuntimeException ignored) { /* a notificação nunca para o envio */ }
        Listener l = listener;
        if (l != null) {
            try { l.onEvent(line); } catch (RuntimeException ignored) { /* tela fechada */ }
        }
    }

    private static long num(Map<String, Object> e, String k) {
        Long v = Json.whole(e.get(k));
        return v == null ? 0 : v;
    }

    private static String clock(long ms) {
        long s = Math.max(0, (ms + 999) / 1000);
        return s >= 60 ? (s / 60) + " min " + String.format(java.util.Locale.ROOT, "%02d", s % 60) + " s" : s + " s";
    }

    private void updateNotification(Map<String, Object> e, long at) {
        String type = String.valueOf(e.get("type"));
        String text = null;
        long countdownEnd = 0;
        switch (type) {
            case "run-start":
                text = num(e, "count") + " obra(s) na vez";
                break;
            case "work-start": {
                workName = String.valueOf(e.get("name"));
                total = num(e, "total");
                done = 0;
                long left = num(e, "left");
                text = total + " capítulo(s) para enviar" + (left > 1 ? " · mais " + (left - 1) + " obra(s) depois" : "");
                if (wakeLock != null) { try { wakeLock.acquire(WAKE_MS); } catch (RuntimeException ignored) { /* ok */ } }
                break;
            }
            case "chapters-start":
                workName = String.valueOf(e.get("name"));
                total = num(e, "count");
                done = 0;
                text = total + " capítulo(s) escolhido(s)";
                break;
            case "sending":
                text = "Enviando capítulos " + num(e, "from") + " a " + num(e, "to") + " de " + num(e, "total");
                break;
            case "fetching":
                text = "Baixando capítulo " + num(e, "pos") + " de " + num(e, "total");
                break;
            case "api-wait":
                countdownEnd = at + num(e, "ms");
                text = "Próximo pedido à MediocreScan em " + clock(num(e, "ms")) + " (1 por minuto)";
                break;
            case "posting":
                text = "Publicando " + num(e, "count") + " capítulo(s) no site…";
                break;
            case "progress":
                done = num(e, "done");
                total = num(e, "total");
                text = done + " de " + total + " capítulos · +" + num(e, "added") + " no site";
                break;
            case "waiting":
                countdownEnd = at + num(e, "ms");
                text = "Próximos 5 capítulos em " + clock(num(e, "ms"));
                break;
            case "pause":
                countdownEnd = at + num(e, "ms");
                text = "A MediocreScan recusou (" + e.get("reason") + "). Tentativa " + num(e, "count") + " de " + num(e, "max") + " em " + clock(num(e, "ms"));
                break;
            case "net-retry":
                countdownEnd = at + num(e, "ms");
                text = "Sem conexão " + e.get("where") + " (" + e.get("detail") + "). Tentando de novo (" + num(e, "attempt") + "/" + num(e, "max") + ")";
                break;
            case "resume":
                text = "Continuando…";
                break;
            case "work-done":
                text = "Concluída: +" + num(e, "added") + " capítulo(s)";
                break;
            case "run-done":
                endTitle = "Envio concluído";
                endText = num(e, "works") + " obra(s), " + num(e, "added") + " capítulo(s) enviados.";
                return;
            case "chapters-done":
                endTitle = "Capítulos enviados";
                endText = e.get("name") + ": +" + num(e, "added") + " capítulo(s)" + (num(e, "already") > 0 ? ", " + num(e, "already") + " já estavam no site" : "") + ".";
                return;
            case "run-stopped":
                endTitle = "Envio parado";
                endText = num(e, "added") + " capítulo(s) enviados. Continua de onde parou na próxima vez.";
                return;
            case "run-error":
                endTitle = "Envio parou com erro";
                endText = String.valueOf(e.get("message"));
                return;
            default:
                return;
        }
        if (!engineAlive() && engine == null) return;
        show(build(workName, text, (int) Math.min(Integer.MAX_VALUE, done), (int) Math.min(Integer.MAX_VALUE, total), countdownEnd, true));
    }

    /* ---------- notificação ---------- */

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Envio de obras", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Mostra o andamento enquanto o app envia obras ao site.");
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_DONE) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_DONE, "Fim do envio", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Avisa quando um envio termina, para ou dá erro.");
            nm.createNotificationChannel(ch);
        }
    }

    private PendingIntent openApp(int flags) {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(this, 1, open, flags);
    }

    private Notification build(String title, String text, int progress, int max, long countdownEnd, boolean withStop) {
        ensureChannels();
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        Intent stop = new Intent(this, EnvioService.class);
        stop.setAction(ACTION_STOP);
        PendingIntent stopPi = PendingIntent.getService(this, 2, stop, piFlags);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setContentIntent(openApp(piFlags))
                .addAction(0, "Parar", stopPi)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (max > 0 && progress >= 0) b.setProgress(max, Math.min(progress, max), false);
        if (countdownEnd > System.currentTimeMillis()) {
            // Contagem regressiva ao vivo na notificação, sem precisar atualizar a cada segundo.
            b.setWhen(countdownEnd).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        } else {
            b.setShowWhen(false);
        }
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
            // O Android não deixou entrar em primeiro plano (ex.: app em segundo plano no Android 12+).
            // O trabalho continua guardado e é retomado quando o app for aberto.
            return false;
        }
    }

    private void finishForeground(String title, String text) {
        releaseLocks();
        running = false;
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (RuntimeException ignored) { /* já fora do primeiro plano */ }
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null && title != null) {
            ensureChannels();
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            Notification n = new NotificationCompat.Builder(this, CHANNEL_DONE)
                    .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                    .setAutoCancel(true)
                    .setContentIntent(openApp(piFlags))
                    .build();
            nm.notify(DONE_ID, n);
        }
        stopSelf();
    }

    /* ---------- energia ---------- */

    private void acquireLocks() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bmestudio:envio");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null) wakeLock.acquire(WAKE_MS);
        } catch (RuntimeException ignored) { /* segue sem trava */ }
        try {
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    // Mantém o Wi-Fi acordado com a tela apagada (senão o Android derruba a conexão).
                    @SuppressWarnings("deprecation") int mode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                    wifiLock = wm.createWifiLock(mode, "bmestudio:envio");
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

    /* ---------- chamadas do plugin ---------- */

    static boolean stopJob() {
        EnvioService s = current;
        if (s == null || !s.engineAlive()) return false;
        s.engine.requestStop();
        return true;
    }

    static void updateSession(Map<String, Object> session) {
        EnvioService s = current;
        EnvioEngine e = s == null ? null : s.engine;
        if (e != null) e.updateSession(EnvioEngine.Session.from(session));
    }

    /** Pedido da tela à API enquanto o envio roda: mesma fila de 1 pedido por minuto. */
    static EnvioEngine.Response uiGet(Context context, String path, String token) throws IOException {
        EnvioService s = current;
        EnvioEngine e = s == null ? null : s.engine;
        if (e != null && e.isRunning()) return e.uiGet(path, token);
        EnvioEngine.Request rq = new EnvioEngine.Request();
        rq.url = EnvioEngine.API + path;
        rq.headers.put("Accept", "application/json");
        if (token != null && !token.isEmpty()) rq.headers.put("Authorization", "Bearer " + token.replaceFirst("(?i)^Bearer\\s+", ""));
        return new HttpConn(null).send(rq);
    }

    /** Android 15: fim do tempo permitido em segundo plano (não deve acontecer com "uso especial"). */
    public void onTimeout(int startId, int fgsType) {
        EnvioEngine e = engine;
        if (e != null) e.requestStop();
        emitLocal("log", "text", "O Android encerrou o envio em segundo plano por limite de tempo. Abra o app para continuar.");
        finishForeground("Envio pausado pelo Android", "Limite de tempo em segundo plano. Abra o app para continuar.");
    }

    @Override
    public void onDestroy() {
        EnvioEngine e = engine;
        if (e != null) e.requestStop();
        running = false;
        jsMode = false;
        releaseLocks();
        if (current == this) current = null;
        super.onDestroy();
    }
}
