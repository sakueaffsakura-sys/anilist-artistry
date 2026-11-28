package __PKG__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Religa a procura em segundo plano quando o celular liga de novo ou quando o app é atualizado (novo APK), sem
 * precisar abrir o app. Só age se a procura estava ligada.
 */
public class DupBgBoot extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)) return;
        try {
            if (!DupBgStore.get(context).auto()) return;
            DupBgWatch.schedule(context);
            DupBgWatch.wake(context);
        } catch (RuntimeException ignored) {
            // O Android não deixou: a procura volta quando o app for aberto.
        }
    }
}
