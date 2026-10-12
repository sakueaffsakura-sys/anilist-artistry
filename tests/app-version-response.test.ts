import { expect, mock, test } from "bun:test";

const release = { version_code: 217, version_name: "2.17", minimum_version_code: 217, apk_path: "releases/test.apk", notes: "" };
const signedCalls: Array<[string, number]> = [];
let publicStorageCalls = 0;
mock.module("../src/lib/maintenance.server", () => ({ maintenanceClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [release], error: null }) }) }) }),
  storage: { from: () => { publicStorageCalls += 1; throw new Error("Public signing forbidden"); } },
}) }));
mock.module("../src/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  storage: { from: (bucket: string) => {
    expect(bucket).toBe("app-releases");
    return { createSignedUrl: async (path: string, seconds: number) => {
      signedCalls.push([path, seconds]);
      return { data: { signedUrl: "https://storage.example.test/storage/v1/object/sign/app-releases/releases/test.apk?token=test-only" }, error: null };
    } };
  } },
} }));

test("published APK uses privileged signing, preserving minimum and no-store", async () => {
  const previous = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = "https://browser.example.test";
  try {
    const { appVersionResponse } = await import("../src/lib/app-version.server");
    const response = await appVersionResponse(new Request("https://example.test/api/public/version?version_code=216"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.update_required).toBe(true);
    expect(body.min_apk_version).toBe(217);
    expect(body.latest_apk_version).toBe(217);
    expect(new URL(body.apk_download_url).hostname).toBe("browser.example.test");
    expect(signedCalls).toEqual([["releases/test.apk", 3600]]);
    expect(publicStorageCalls).toBe(0);
  } finally {
    if (previous === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = previous;
  }
});