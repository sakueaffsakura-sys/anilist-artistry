import { expect, test } from "bun:test";
import { MAINTENANCE_PUBLIC_FUNCTIONS, canEnterMaintenance, maintenanceExemptPath } from "../src/lib/maintenance-policy";
test("maintenance exempts only status and verified admin checks from the RPC gate", () => {
  expect(MAINTENANCE_PUBLIC_FUNCTIONS.includes("verifyMaintenanceAdmin")).toBe(true);
  expect(MAINTENANCE_PUBLIC_FUNCTIONS.includes("getMaintenanceStatus")).toBe(true);
  expect(MAINTENANCE_PUBLIC_FUNCTIONS.includes("saveMaintenanceSettings")).toBe(false);
  expect(MAINTENANCE_PUBLIC_FUNCTIONS.includes("getWorkDetail")).toBe(false);
});
test("maintenance permits only admins", () => {
  expect(canEnterMaintenance(true, false)).toBe(false);
  expect(canEnterMaintenance(true, true)).toBe(true);
});
test("normal mode permits visitors", () => {
  expect(canEnterMaintenance(false, false)).toBe(true);
});
test("only recovery and admin pages bypass document redirect", () => {
  expect(maintenanceExemptPath("/api/public/version")).toBe(true);
  expect(maintenanceExemptPath("/manutencao")).toBe(true);
  expect(maintenanceExemptPath("/api/public/maintenance")).toBe(true);
  expect(maintenanceExemptPath("/api/public/maintenance/private")).toBe(false);
  expect(maintenanceExemptPath("/api/version")).toBe(true);
  expect(maintenanceExemptPath("/auth")).toBe(true);
  expect(maintenanceExemptPath("/admin/manutencao")).toBe(true);
  expect(maintenanceExemptPath("/obra/shadow-slave/0")).toBe(false);
  expect(maintenanceExemptPath("/administrator")).toBe(false);
});