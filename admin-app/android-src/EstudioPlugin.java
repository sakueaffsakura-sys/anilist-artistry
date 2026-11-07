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
import java.util.Map;
import org.json.JSONException;

/** Ponte entre a tela (JavaScript) e o serviço que envia em segundo plano. */
@CapacitorPlugin(name = "Estudio")
public class EstudioPlugin extends Plugin {
    private static volatile EstudioPlugin instance;
    private final EnvioService.Listener relay = new EnvioService.Listener() {
        @Override
        public void onEvent(String json) {
            try { notifyListeners("engine", new JSObject(json)); } catch (JSONException ignored) { /* evento malformado */ }
        }
    };

    @Override
    public void load() {
        instance = this;
        EnvioService.listener = relay;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        if (EnvioService.listener == relay) EnvioService.listener = null;
        super.handleOnDestroy();
    }

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4021);
        }
    }

    /* ---------- envio nativo ---------- */

    /** Começa um envio no serviço: { job: {type:"works"|"chapters", ...}, config: {site, token, session, ...} }. */
    @PluginMethod
    public void startJob(PluginCall call) {
        JSObject job = call.getObject("job");
        JSObject config = call.getObject("config");
        if (job == null || config == null) {
            call.reject("Faltam os dados do envio.");
            return;
        }
        askNotificationPermission();
        Intent intent = new Intent(getContext(), EnvioService.class);
        intent.setAction(EnvioService.ACTION_JOB);
        intent.putExtra("job", job.toString());
        intent.putExtra("config", config.toString());
        try {
            ContextCompat.startForegroundService(getContext(), intent);
            JSObject r = new JSObject();
            r.put("started", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("O Android não deixou começar o envio em segundo plano (" + e.getClass().getSimpleName() + ").");
        }
    }

    @PluginMethod
    public void stopJob(PluginCall call) {
        JSObject r = new JSObject();
        r.put("stopping", EnvioService.stopJob());
        call.resolve(r);
    }

    /** Eventos desde `since` + estado (rodando, trabalho guardado, sessão renovada). */
    @PluginMethod
    public void events(PluginCall call) {
        long since = (long) Math.max(0, call.getDouble("since", 0d));
        String json = EnvioStore.get(getContext()).eventsJson(since, EnvioService.engineRunning());
        try {
            call.resolve(new JSObject(json));
        } catch (JSONException e) {
            call.reject("Não foi possível ler o andamento do envio.");
        }
    }

    /** A tela renovou a sessão: o serviço passa a usar a nova (evita usar um token de renovação vencido). */
    @PluginMethod
    public void setSession(PluginCall call) {
        JSObject s = call.getObject("session");
        if (s != null) {
            try {
                Map<String, Object> m = Json.obj(Json.parse(s.toString()));
                if (m != null) {
                    EnvioStore.get(getContext()).saveSession(m);
                    EnvioService.updateSession(m);
                }
            } catch (Json.ParseError ignored) { /* sessão malformada */ }
        }
        call.resolve();
    }

    /** Pedido da tela à API da MediocreScan durante um envio (entra na fila de 1 por minuto do envio). */
    @PluginMethod
    public void mediocreGet(final PluginCall call) {
        final String path = call.getString("path", "");
        final String token = call.getString("token", "");
        if (path == null || !path.startsWith("/") || path.length() > 400 || path.contains("://") || path.matches(".*\\s.*")) {
            call.reject("Endereço inválido.");
            return;
        }
        final Context context = getContext();
        // Thread própria: a espera pela vez pode levar até 1 minuto e não pode travar os outros plugins.
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    EnvioEngine.Response r = EnvioService.uiGet(context, path, token);
                    JSObject o = new JSObject();
                    o.put("status", r.status);
                    o.put("body", r.body);
                    call.resolve(o);
                } catch (Exception e) {
                    call.reject("Sem conexão com a MediocreScan. Confira a internet do celular.");
                }
            }
        }, "estudio-tela-api").start();
    }

    /* ---------- modo antigo (a tela envia; o serviço só mostra a notificação) ---------- */

    @PluginMethod
    public void start(PluginCall call) {
        if (EnvioService.engineRunning()) {
            call.resolve();
            return;
        }
        askNotificationPermission();
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
        if (!EnvioService.running || !EnvioService.jsMode) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(getContext(), EnvioService.class);
        intent.setAction(EnvioService.ACTION_UPDATE);
        intent.putExtra("title", call.getString("title", "Enviando obras"));
        intent.putExtra("text", call.getString("text", ""));
        intent.putExtra("progress", call.getInt("progress", -1));
        intent.putExtra("max", call.getInt("max", 0));
        try {
            getContext().startService(intent);
        } catch (Exception ignored) {
            // A notificação só deixa de atualizar; o envio continua.
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        // Nunca derruba o motor nativo: só encerra a notificação do modo antigo.
        if (!EnvioService.engineRunning() && EnvioService.jsMode) {
            getContext().stopService(new Intent(getContext(), EnvioService.class));
        }
        call.resolve();
    }

    /* ---------- bateria ---------- */

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

    /** Abre a tela de bateria do app (Samsung: "Sem restrições"). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível abrir as configurações do app.");
        }
    }

    /** Botão "Parar" da notificação no modo antigo. */
    static void emitStop() {
        EstudioPlugin p = instance;
        if (p != null) p.notifyListeners("stopRequested", new JSObject());
    }
}
