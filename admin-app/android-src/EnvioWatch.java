package __PKG__;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.Map;

/**
 * Vigia do modo automático: o Android roda este serviço a cada ~15 min, só quando há internet.
 * Se o automático estava ligado (trabalho "auto" guardado) e o serviço de envio não está rodando
 * (o Android encerrou, o app travou, a internet voltou depois de muito tempo), religa sozinho.
 * Com o app liberado da economia de bateria, o Android deixa iniciar o serviço em primeiro plano daqui.
 */
public class EnvioWatch extends JobService {
    static final int JOB_ID = 4207;
    static final long PERIOD_MS = 15 * 60_000L;

    static void schedule(Context context) {
        try {
            JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
            JobInfo info = new JobInfo.Builder(JOB_ID, new ComponentName(context, EnvioWatch.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(PERIOD_MS)
                .setPersisted(true)
                .build();
            js.schedule(info);
        } catch (RuntimeException ignored) {
            // Sem o vigia, o automático ainda volta ao abrir o app, ao reiniciar o celular ou ao atualizar.
        }
    }

    static void cancel(Context context) {
        try {
            JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js != null) js.cancel(JOB_ID);
        } catch (RuntimeException ignored) { /* ok */ }
    }

    /** Religa o automático guardado se o serviço não estiver rodando. Devolve true se pediu para religar. */
    static boolean wake(Context context) {
        try {
            if (EnvioService.engineRunning()) return false;
            Map<String, Object> job = EnvioStore.get(context).loadJob();
            if (job == null || !"auto".equals(Json.str(job.get("type")))) return false;
            Intent i = new Intent(context, EnvioService.class).setAction(EnvioService.ACTION_RESUME);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i);
            else context.startService(i);
            return true;
        } catch (RuntimeException e) {
            // O Android não deixou iniciar daqui (app com economia de bateria): volta ao abrir o app.
            return false;
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        wake(getApplicationContext());
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return false;
    }
}
