package __PKG__;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Ponte entre o app (JavaScript) e o serviço de envio em segundo plano. */
@CapacitorPlugin(name = "Estudio")
public class EstudioPlugin extends Plugin {
    private static EstudioPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4021);
        }
        Intent intent = new Intent(getContext(), EnvioService.class);
        intent.setAction(EnvioService.ACTION_START);
        intent.putExtra("title", call.getString("title", "Enviando obras"));
        intent.putExtra("text", call.getString("text", ""));
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível iniciar o envio em segundo plano.");
        }
    }

    @PluginMethod
    public void update(PluginCall call) {
        if (!EnvioService.running) {
            call.resolve();
            return;
        }
        int progress = call.getInt("progress", -1);
        int max = call.getInt("max", 0);
        Intent intent = new Intent(getContext(), EnvioService.class);
        intent.setAction(EnvioService.ACTION_UPDATE);
        intent.putExtra("title", call.getString("title", "Enviando obras"));
        intent.putExtra("text", call.getString("text", ""));
        intent.putExtra("progress", progress);
        intent.putExtra("max", max);
        try {
            getContext().startService(intent);
        } catch (Exception ignored) {
            // A notificação só deixa de atualizar; o envio continua.
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), EnvioService.class));
        call.resolve();
    }

    @PluginMethod
    public void batteryStatus(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        result.put("ignoring", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (Exception e) {
            Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    /** Botão "Parar" da notificação. */
    static void emitStop() {
        if (instance != null) instance.notifyListeners("stopRequested", new JSObject());
    }
}
