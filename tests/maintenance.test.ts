import { expect, test } from "bun:test";
import { canEnterMaintenance, maintenanceExemptPath } from "../src/lib/maintenance-policy";
test("maintenance permits only admins", () => {
  expect(canEnterMaintenance(true, false)).toBe(false);
  expect(canEnterMaintenance(true, true)).toBe(true);
});
test("normal mode permits visitors", () => {
  expect(canEnterMaintenance(false, false)).toBe(true);
});
test("only recovery and admin pages bypass document redirect", () => {
  expect(maintenanceExemptPath("/api/public/version")).toBe(true);
  expect(maintenanceExemptPath("/api/version")).toBe(true);
  expect(maintenanceExemptPath("/auth")).toBe(true);
  expect(maintenanceExemptPath("/admin/manutencao")).toBe(true);
  expect(maintenanceExemptPath("/obra/shadow-slave/0")).toBe(false);
  expect(maintenanceExemptPath("/administrator")).toBe(false);
});