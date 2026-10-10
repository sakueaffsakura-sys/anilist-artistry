export const MAINTENANCE_PUBLIC_FUNCTIONS = ["getMaintenanceStatus", "verifyMaintenanceAdmin"];
export function canEnterMaintenance(enabled: boolean, isAdmin: boolean) {
  return !enabled || isAdmin;
}
export function maintenanceExemptPath(path: string) {
  return path === "/manutencao" || path === "/auth" || path === "/admin" || path.startsWith("/admin/") || path === "/api/version" || path === "/api/public/version";
}