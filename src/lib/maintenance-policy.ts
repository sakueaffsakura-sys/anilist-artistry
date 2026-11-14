import { isEmergencyPath } from "./emergency";

// Emergency functions serve the backup only while the database is down (they check it themselves).
export const MAINTENANCE_PUBLIC_FUNCTIONS = ["getMaintenanceStatus", "verifyMaintenanceAdmin", "getEmergencyState", "getEmergencyIndex", "getEmergencyWork", "getEmergencyChapter"];
export function canEnterMaintenance(enabled: boolean, isAdmin: boolean) {
  return !enabled || isAdmin;
}
export function maintenanceExemptPath(path: string) {
  return path === "/manutencao" || path === "/auth" || path === "/admin" || path.startsWith("/admin/") || path === "/api/version" || path === "/api/public/version" || path === "/api/public/maintenance" || path === "/api/public/backup-export" || isEmergencyPath(path);
}
/** Where a request goes when the database does not answer: pages to the emergency copy, APIs get 503. */
export function databaseDownTarget(pathname: string): "emergency" | "unavailable" {
  return pathname.startsWith("/api/") || pathname.startsWith("/_serverFn") ? "unavailable" : "emergency";
}
