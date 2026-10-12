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