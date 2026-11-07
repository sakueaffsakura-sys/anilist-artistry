package __PKG__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * Mantém o envio rodando com o app minimizado ou a tela apagada: notificação fixa com o andamento
 * e um botão "Parar". O trabalho em si continua no app (WebView); aqui só seguramos o processo vivo.
 */
public class EnvioService extends Service {
    static final String ACTION_START = "estudio.START";
    static final String ACTION_UPDATE = "estudio.UPDATE";
    static final String ACTION_STOP = "estudio.STOP_REQUEST";
    private static final String CHANNEL = "envio";
    private static final int NOTIFICATION_ID = 7310;

    static volatile boolean running = false;
    private PowerManager.WakeLock wakeLock;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            EstudioPlugin.emitStop();
            return START_NOT_STICKY;
        }
        String title = intent != null ? intent.getStringExtra("title") : null;
        String text = intent != null ? intent.getStringExtra("text") : null;
        int progress = intent != null ? intent.getIntExtra("progress", -1) : -1;
        int max = intent != null ? intent.getIntExtra("max", 0) : 0;
        Notification notification = build(title != null ? title : "Enviando obras", text != null ? text : "", progress, max);

        if (!running) {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            running = true;
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "bmestudio:envio");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(6L * 60L * 60L * 1000L);
            }
        } else {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, notification);
        }
        return START_NOT_STICKY;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Envio de obras", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Mostra o andamento enquanto o app envia obras ao site.");
        nm.createNotificationChannel(channel);
    }

    private Notification build(String title, String text, int progress, int max) {
        ensureChannel();
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);

        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open == null) open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent openPi = PendingIntent.getActivity(this, 1, open, piFlags);

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
                .setContentIntent(openPi)
                .addAction(0, "Parar", stopPi)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        if (max > 0 && progress >= 0) b.setProgress(max, Math.min(progress, max), false);
        return b.build();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }
}
