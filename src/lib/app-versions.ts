import { z } from "zod";

export const appReleaseSchema = z.object({
  version_name: z.string().trim().min(1).max(40),
  version_code: z.number().int().positive().max(2147483647),
  minimum_version_code: z.number().int().positive().max(2147483647),
  notes: z.string().max(5000),
  published: z.boolean(),
}).refine((value) => value.minimum_version_code <= value.version_code, {
  message: "A versão mínima não pode superar a nova versão.", path: ["minimum_version_code"],
});

export function requiresAppUpdate(installed: number, minimum: number) {
  return installed < minimum;
}

/** Há uma versão publicada mais nova que a instalada: o app mostra o aviso opcional "Nova versão disponível". */
export function hasAppUpdate(installed: number, latest: number) {
  return latest > installed;
}

/** Quantas versões, no máximo, o app recebe para o "O que mudou desde a sua versão". */
export const APP_CHANGES_LIMIT = 5;

/** As versões publicadas depois da instalada, da mais nova para a mais antiga. */
export function releasesSince<T extends { version_code: number }>(rows: readonly T[], installed: number, limit = APP_CHANGES_LIMIT): T[] {
  return rows.filter((row) => row.version_code > installed)
    .sort((a, b) => b.version_code - a.version_code)
    .slice(0, Math.max(0, limit));
}

export const appMinimumSchema = z.object({
  version_code: z.number().int().positive().max(2147483647),
  minimum_version_code: z.number().int().positive().max(2147483647),
}).refine((value) => value.minimum_version_code <= value.version_code, {
  message: "A versão mínima não pode superar a versão do APK.", path: ["minimum_version_code"],
});

export function validateApk(file: { name: string; size: number }) {
  if (!/\.apk$/i.test(file.name) || file.size <= 0) throw new Error("Escolha um arquivo APK válido.");
  if (file.size > 1024 ** 3) throw new Error("O APK deve ter até 1 GB.");
}