import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inspectCpanel } = require("../scripts/cpanel-runtime.cjs");
const { startCpanel } = require("../app.cjs");
const roots: string[] = [];
const originalEnv = { ...process.env };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cpanel-check-"));
  roots.push(root);
  mkdirSync(join(root, ".output/server"), { recursive: true });
  mkdirSync(join(root, ".output/public"), { recursive: true });
  writeFileSync(join(root, ".output/server/index.mjs"), "export const port = process.env.NITRO_PORT; export const mode = process.env.NODE_ENV;");
  return root;
}

afterEach(() => {
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }));
  for (const name of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "PORT", "NITRO_PORT", "NODE_ENV"]) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

describe("cPanel startup safeguards", () => {
  test("accepts complete Node output without demanding optional voice credentials", () => {
    const result = inspectCpanel(fixture(), { SUPABASE_URL: "https://database.example", SUPABASE_PUBLISHABLE_KEY: "public-test" }, "22.12.0");
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("rejects incomplete output and reports only missing variable names", () => {
    const root = fixture();
    rmSync(join(root, ".output/public"), { recursive: true });
    rmSync(join(root, ".output/server/index.mjs"));
    const result = inspectCpanel(root, {}, "22.12.0");
    expect(result.errors).toHaveLength(4);
  });

  test("uses the Node version required by the installed Vite toolchain", () => {
    const env = { SUPABASE_URL: "https://database.example", SUPABASE_PUBLISHABLE_KEY: "public-test" };
    const root = fixture();
    expect(inspectCpanel(root, env, "22.11.0").errors).toHaveLength(1);
    expect(inspectCpanel(root, env, "20.19.0").errors).toHaveLength(1);
    expect(inspectCpanel(root, env, "24.0.0").errors).toEqual([]);
  });

  test("loads an absolute entry and preserves the hosting port over a stale Nitro port", async () => {
    process.env.SUPABASE_URL = "https://database.example";
    process.env.SUPABASE_PUBLISHABLE_KEY = "public-test";
    process.env.PORT = "43127";
    process.env.NITRO_PORT = "3000";
    const loaded = await startCpanel(fixture());
    expect(loaded.port).toBe("43127");
    expect(loaded.mode).toBe("production");
  });
});