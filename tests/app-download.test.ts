import { expect, test } from "bun:test";
import { APP_PROMPT_SNOOZE_MS, shouldOfferApp } from "../src/lib/app-download";
const A = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile";
const base = { userAgent: A, path: "/", inApp: false, dismissedAt: null, now: 1e12 };
test("Android vê o aviso", () => expect(shouldOfferApp(base)).toBe(true));
test("iPhone não vê", () => expect(shouldOfferApp({ ...base, userAgent: "iPhone OS 17" })).toBe(false));
test("computador não vê", () => expect(shouldOfferApp({ ...base, userAgent: "Windows NT 10.0" })).toBe(false));
test("dentro do app não vê", () => expect(shouldOfferApp({ ...base, inApp: true })).toBe(false));
test("painel não vê", () => expect(shouldOfferApp({ ...base, path: "/admin/app" })).toBe(false));
test("fechado some por 7 dias", () => {
  expect(shouldOfferApp({ ...base, dismissedAt: base.now - APP_PROMPT_SNOOZE_MS + 1 })).toBe(false);
  expect(shouldOfferApp({ ...base, dismissedAt: base.now - APP_PROMPT_SNOOZE_MS })).toBe(true);
});
