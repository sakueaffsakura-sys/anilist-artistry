package __PKG__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.Map;

/**
 * Religa o modo automático sozinho quando o celular liga de novo ou quando o app é atualizado (novo APK),
 * sem precisar abrir o app. Só age se o automático estava ligado (trabalho "auto" guardado no celular).
 * Esses dois avisos do Android podem iniciar o serviço em primeiro plano mesmo com o app fechado.
 */
public class EnvioBoot extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) return;
        try {
            Map<String, Object> job = EnvioStore.get(context).loadJob();
            if (job == null || !"auto".equals(Json.str(job.get("type")))) return;
            EnvioWatch.schedule(context);
            EnvioWatch.wake(context);
        } catch (RuntimeException ignored) {
            // O Android não deixou: o automático volta quando o app for aberto.
        }
    }
}
