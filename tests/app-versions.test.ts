import { expect, test } from "bun:test";
import { appReleaseSchema, requiresAppUpdate, validateApk } from "../src/lib/app-versions";

test("old Android releases require an update and current releases remain usable", () => {
  expect(requiresAppUpdate(1, 2)).toBe(true);
  expect(requiresAppUpdate(2, 2)).toBe(false);
  expect(requiresAppUpdate(3, 2)).toBe(false);
});
test("minimum release cannot exceed the downloadable release", () => {
  expect(appReleaseSchema.safeParse({ version_name: "2.0", version_code: 2, minimum_version_code: 3, notes: "", published: true }).success).toBe(false);
});
test("only nonempty APK files within the bucket limit are accepted", () => {
  expect(() => validateApk({ name: "app.txt", size: 10 })).toThrow();
  expect(() => validateApk({ name: "app.apk", size: 0 })).toThrow();
  expect(() => validateApk({ name: "app.apk", size: 1024 ** 3 + 1 })).toThrow();
  expect(() => validateApk({ name: "app.apk", size: 1024 ** 3 })).not.toThrow();
});