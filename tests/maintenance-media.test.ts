import { expect, test } from "bun:test";
import { MAINTENANCE_MEDIA_MAX_BYTES, validateMaintenanceMedia } from "../src/lib/maintenance-media";

test("maintenance accepts MP4 and images up to exactly 1 GiB", () => {
  expect(MAINTENANCE_MEDIA_MAX_BYTES).toBe(1073741824);
  for (const [name, type] of [["video.mp4", "video/mp4"], ["fundo.png", "image/png"]]) {
    expect(validateMaintenanceMedia({ name, type, size: 1073741824 }).mime).toBe(type);
    expect(() => validateMaintenanceMedia({ name, type, size: 1073741825 })).toThrow();
  }
});
test("MP4 with missing browser MIME is inferred safely", () => {
  expect(validateMaintenanceMedia({ name: "Video.MP4", type: "", size: 60000000 }).mime).toBe("video/mp4");
});
test("unsupported, empty and mismatched files are rejected", () => {
  expect(() => validateMaintenanceMedia({ name: "video.mov", type: "video/quicktime", size: 50 })).toThrow();
  expect(() => validateMaintenanceMedia({ name: "video.mp4", type: "text/plain", size: 50 })).toThrow();
  expect(() => validateMaintenanceMedia({ name: "video.mp4", type: "video/mp4", size: 0 })).toThrow();
});