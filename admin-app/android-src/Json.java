package __PKG__;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JSON mínimo e sem dependências para o motor de envio (Java puro, roda no Android e nos testes):
 * objetos viram LinkedHashMap, listas ArrayList, inteiros Long e decimais Double.
 */
final class Json {
    private Json() { }

    private static final java.util.regex.Pattern NUMERIC = java.util.regex.Pattern.compile("^-?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$");

    static final class ParseError extends Exception {
        ParseError(String message) { super(message); }
    }

    static Object parse(String text) throws ParseError {
        if (text == null) throw new ParseError("vazio");
        Parser p = new Parser(text);
        p.ws();
        Object v = p.value(0);
        p.ws();
        if (p.i != text.length()) throw new ParseError("conteúdo depois do fim");
        return v;
    }

    private static final class Parser {
        final String s;
        final int n;
        int i = 0;

        Parser(String s) { this.s = s; this.n = s.length(); }

        void ws() {
            while (i < n) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t' || c == '﻿') i++;
                else break;
            }
        }

        Object value(int depth) throws ParseError {
            if (depth > 256) throw new ParseError("aninhado demais");
            if (i >= n) throw new ParseError("fim inesperado");
            char c = s.charAt(i);
            switch (c) {
                case '{': return object(depth);
                case '[': return array(depth);
                case '"': return string();
                case 't': literal("true"); return Boolean.TRUE;
                case 'f': literal("false"); return Boolean.FALSE;
                case 'n': literal("null"); return null;
                default: return number();
            }
        }

        void literal(String word) throws ParseError {
            if (!s.startsWith(word, i)) throw new ParseError("valor inválido na posição " + i);
            i += word.length();
        }

        Map<String, Object> object(int depth) throws ParseError {
            Map<String, Object> m = new LinkedHashMap<>();
            i++;
            ws();
            if (i < n && s.charAt(i) == '}') { i++; return m; }
            for (;;) {
                ws();
                if (i >= n || s.charAt(i) != '"') throw new ParseError("chave esperada na posição " + i);
                String key = string();
                ws();
                if (i >= n || s.charAt(i) != ':') throw new ParseError("':' esperado na posição " + i);
                i++;
                ws();
                m.put(key, value(depth + 1));
                ws();
                if (i >= n) throw new ParseError("objeto sem fim");
                char c = s.charAt(i++);
                if (c == '}') return m;
                if (c != ',') throw new ParseError("',' esperado na posição " + (i - 1));
            }
        }

        List<Object> array(int depth) throws ParseError {
            List<Object> a = new ArrayList<>();
            i++;
            ws();
            if (i < n && s.charAt(i) == ']') { i++; return a; }
            for (;;) {
                ws();
                a.add(value(depth + 1));
                ws();
                if (i >= n) throw new ParseError("lista sem fim");
                char c = s.charAt(i++);
                if (c == ']') return a;
                if (c != ',') throw new ParseError("',' esperado na posição " + (i - 1));
            }
        }

        String string() throws ParseError {
            i++;
            StringBuilder b = null;
            int start = i;
            for (;;) {
                if (i >= n) throw new ParseError("texto sem fim");
                char c = s.charAt(i);
                if (c == '"') {
                    String out = b == null ? s.substring(start, i) : b.append(s, start, i).toString();
                    i++;
                    return out;
                }
                if (c == '\\') {
                    if (b == null) b = new StringBuilder();
                    b.append(s, start, i);
                    i++;
                    if (i >= n) throw new ParseError("escape sem fim");
                    char e = s.charAt(i++);
                    switch (e) {
                        case '"': b.append('"'); break;
                        case '\\': b.append('\\'); break;
                        case '/': b.append('/'); break;
                        case 'b': b.append('\b'); break;
                        case 'f': b.append('\f'); break;
                        case 'n': b.append('\n'); break;
                        case 'r': b.append('\r'); break;
                        case 't': b.append('\t'); break;
                        case 'u':
                            if (i + 4 > n) throw new ParseError("escape \\u incompleto");
                            try { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); }
                            catch (NumberFormatException ex) { throw new ParseError("escape \\u inválido"); }
                            i += 4;
                            break;
                        default: throw new ParseError("escape inválido");
                    }
                    start = i;
                    continue;
                }
                if (c < 0x20) throw new ParseError("caractere de controle dentro do texto");
                i++;
            }
        }

        Object number() throws ParseError {
            int start = i;
            boolean decimal = false;
            if (i < n && s.charAt(i) == '-') i++;
            int digits = i;
            while (i < n && Character.isDigit(s.charAt(i))) i++;
            if (i == digits) throw new ParseError("valor inválido na posição " + start);
            if (i < n && s.charAt(i) == '.') {
                decimal = true;
                i++;
                int frac = i;
                while (i < n && Character.isDigit(s.charAt(i))) i++;
                if (i == frac) throw new ParseError("número inválido na posição " + start);
            }
            if (i < n && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                decimal = true;
                i++;
                if (i < n && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                int exp = i;
                while (i < n && Character.isDigit(s.charAt(i))) i++;
                if (i == exp) throw new ParseError("número inválido na posição " + start);
            }
            String t = s.substring(start, i);
            if (!decimal) {
                try { return Long.parseLong(t); } catch (NumberFormatException ignored) { /* grande demais: vira decimal */ }
            }
            try { return Double.parseDouble(t); } catch (NumberFormatException ex) { throw new ParseError("número inválido"); }
        }
    }

    static String stringify(Object v) {
        StringBuilder b = new StringBuilder();
        write(b, v);
        return b.toString();
    }

    @SuppressWarnings("unchecked")
    static void write(StringBuilder b, Object v) {
        if (v == null) { b.append("null"); return; }
        if (v instanceof String) { quote(b, (String) v); return; }
        if (v instanceof Boolean) { b.append(((Boolean) v) ? "true" : "false"); return; }
        if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) b.append("null");
            else if (d == Math.rint(d) && Math.abs(d) < 1e15) b.append((long) d);
            else b.append(Double.toString(d));
            return;
        }
        if (v instanceof Number) { b.append(v.toString()); return; }
        if (v instanceof Map) {
            b.append('{');
            boolean first = true;
            for (Map.Entry<Object, Object> e : ((Map<Object, Object>) v).entrySet()) {
                if (!first) b.append(',');
                first = false;
                quote(b, String.valueOf(e.getKey()));
                b.append(':');
                write(b, e.getValue());
            }
            b.append('}');
            return;
        }
        if (v instanceof Collection) {
            b.append('[');
            boolean first = true;
            for (Object o : (Collection<Object>) v) {
                if (!first) b.append(',');
                first = false;
                write(b, o);
            }
            b.append(']');
            return;
        }
        if (v instanceof Object[]) {
            b.append('[');
            Object[] a = (Object[]) v;
            for (int k = 0; k < a.length; k++) {
                if (k > 0) b.append(',');
                write(b, a[k]);
            }
            b.append(']');
            return;
        }
        quote(b, v.toString());
    }

    static void quote(StringBuilder b, String s) {
        b.append('"');
        for (int k = 0; k < s.length(); k++) {
            char c = s.charAt(k);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                case '\b': b.append("\\b"); break;
                case '\f': b.append("\\f"); break;
                default:
                    if (c < 0x20 || c == ' ' || c == ' ') {
                        String hex = Integer.toHexString(c);
                        b.append("\\u");
                        for (int p = hex.length(); p < 4; p++) b.append('0');
                        b.append(hex);
                    } else {
                        b.append(c);
                    }
            }
        }
        b.append('"');
    }

    /* ---------- leitura segura de valores ---------- */

    @SuppressWarnings("unchecked")
    static Map<String, Object> obj(Object v) {
        return v instanceof Map ? (Map<String, Object>) v : null;
    }

    @SuppressWarnings("unchecked")
    static List<Object> arr(Object v) {
        return v instanceof List ? (List<Object>) v : null;
    }

    static String str(Object v) {
        return v instanceof String ? (String) v : null;
    }

    /** Número inteiro (aceita decimal sem fração e texto com dígitos, como o Number() do JavaScript). */
    static Long whole(Object v) {
        Double d = num(v);
        if (d == null || d != Math.rint(d) || Math.abs(d) > 9007199254740991d) return null;
        return d.longValue();
    }

    /** Número como o Number() do JavaScript faz com números e textos numéricos; null se não for número. */
    static Double num(Object v) {
        if (v instanceof Number) {
            double d = ((Number) v).doubleValue();
            return Double.isNaN(d) || Double.isInfinite(d) ? null : d;
        }
        if (v instanceof String) {
            String t = ((String) v).trim();
            if (!NUMERIC.matcher(t).matches()) return null;
            try {
                double d = Double.parseDouble(t);
                return Double.isNaN(d) || Double.isInfinite(d) ? null : d;
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    static boolean truthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean) return (Boolean) v;
        if (v instanceof Number) return ((Number) v).doubleValue() != 0;
        if (v instanceof String) return !((String) v).isEmpty();
        return true;
    }

    /** Monta um mapa a partir de pares chave/valor. */
    static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int k = 0; k + 1 < kv.length; k += 2) m.put(String.valueOf(kv[k]), kv[k + 1]);
        return m;
    }
}
