import { expect, test } from "bun:test";
import { appMinimumSchema, appReleaseSchema, requiresAppUpdate, validateApk } from "../src/lib/app-versions";

test("old Android releases require an update and current releases remain usable", () => {
  expect(requiresAppUpdate(1, 2)).toBe(true);
  expect(requiresAppUpdate(2, 2)).toBe(false);
  expect(requiresAppUpdate(3, 2)).toBe(false);
});
test("minimum release cannot exceed the downloadable release", () => {
  expect(appReleaseSchema.safeParse({ version_name: "2.0", version_code: 2, minimum_version_code: 3, notes: "", published: true }).success).toBe(false);
});
test("editing release 19 permits minimum 1 but rejects minimum above the APK", () => {
  expect(appMinimumSchema.safeParse({ version_code: 19, minimum_version_code: 1 }).success).toBe(true);
  expect(appMinimumSchema.safeParse({ version_code: 19, minimum_version_code: 20 }).success).toBe(false);
  expect(appMinimumSchema.safeParse({ version_code: 19, minimum_version_code: 0 }).success).toBe(false);
  expect(appMinimumSchema.safeParse({ version_code: 19, minimum_version_code: 1.5 }).success).toBe(false);
});
test("release 19 with minimum 1 does not force installed version 18 to update", () => {
  expect(requiresAppUpdate(18, 1)).toBe(false);
  expect(requiresAppUpdate(18, 19)).toBe(true);
});
test("only nonempty APK files within the bucket limit are accepted", () => {
  expect(() => validateApk({ name: "app.txt", size: 10 })).toThrow();
  expect(() => validateApk({ name: "app.apk", size: 0 })).toThrow();
  expect(() => validateApk({ name: "app.apk", size: 1024 ** 3 + 1 })).toThrow();
  expect(() => validateApk({ name: "app.apk", size: 1024 ** 3 })).not.toThrow();
});