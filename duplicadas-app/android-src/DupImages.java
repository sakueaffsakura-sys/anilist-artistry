package __PKG__;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Abre uma capa no Android em tamanho reduzido e mede: largura e altura reais, variação de brilho (std, 0–128) e o
 * hash da imagem (dHash 9×8 em 16 hexadecimais). Usado pelo plugin (app aberto) e pelo motor em segundo plano.
 */
final class DupImages implements DupEngine.Images {
    @Override
    public Map<String, Object> measure(byte[] bytes) {
        return measureBytes(bytes);
    }

    static Map<String, Object> measureBytes(byte[] bytes) {
        Map<String, Object> o = new LinkedHashMap<>();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        int w = bounds.outWidth, h = bounds.outHeight;
        if (w <= 0 || h <= 0) { o.put("ok", false); return o; }
        o.put("w", (long) w);
        o.put("h", (long) h);
        int sample = 1;
        while (Math.min(w, h) / (sample * 2) >= 64) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bm = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        if (bm == null) { o.put("ok", false); return o; }
        try {
            Bitmap s9 = Bitmap.createScaledBitmap(bm, 9, 8, true);
            StringBuilder hex = new StringBuilder();
            for (int y = 0; y < 8; y++) {
                int b = 0;
                for (int x = 0; x < 8; x++) b = (b << 1) | (lum(s9.getPixel(x, y)) > lum(s9.getPixel(x + 1, y)) ? 1 : 0);
                hex.append(String.format("%02x", b));
            }
            if (s9 != bm) s9.recycle();
            Bitmap s16 = Bitmap.createScaledBitmap(bm, 16, 16, true);
            double sum = 0, sq = 0;
            for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) { double l = lum(s16.getPixel(x, y)); sum += l; sq += l * l; }
            if (s16 != bm) s16.recycle();
            double mean = sum / 256.0;
            o.put("std", Math.sqrt(Math.max(0, sq / 256.0 - mean * mean)));
            o.put("hash", hex.toString());
            o.put("ok", true);
        } finally {
            bm.recycle();
        }
        return o;
    }

    /** Brilho do pixel (transparente conta como branco). */
    static double lum(int px) {
        double a = ((px >>> 24) & 0xff) / 255.0;
        double l = ((px >> 16) & 0xff) * 0.299 + ((px >> 8) & 0xff) * 0.587 + (px & 0xff) * 0.114;
        return a * l + (1 - a) * 255;
    }
}
