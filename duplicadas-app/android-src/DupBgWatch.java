package __PKG__;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * Vigia da procura em segundo plano: o Android roda isto a cada ~15 min quando há internet. Se a procura estava
 * ligada e o serviço não está rodando (o Android encerrou, o celular dormiu, a internet voltou), religa; se está
 * rodando, acorda o motor (o modo soneca do Android segura as esperas).
 */
public class DupBgWatch extends JobService {
    static final int JOB_ID = 5307;
    static final long PERIOD_MS = 15 * 60_000L;

    static void schedule(Context context) {
        try {
            JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return;
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(context, DupBgWatch.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(PERIOD_MS)
                .setPersisted(true)
                .build());
        } catch (RuntimeException ignored) {
            // Sem o vigia, a procura ainda volta ao abrir o app ou ao reiniciar o celular.
        }
    }

    static void cancel(Context context) {
        try {
            JobScheduler js = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js != null) js.cancel(JOB_ID);
        } catch (RuntimeException ignored) { /* ok */ }
    }

    /** Religa a procura guardada (ou acorda a que está rodando). */
    static void wake(Context context) {
        try {
            if (DupBgService.engineRunning()) { DupBgService.poke(); return; }
            if (!DupBgStore.get(context).auto()) return;
            Intent i = new Intent(context, DupBgService.class).setAction(DupBgService.ACTION_RESUME);
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i);
            else context.startService(i);
        } catch (RuntimeException e) {
            // O Android não deixou iniciar daqui (economia de bateria ligada para o app): volta ao abrir o app.
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
