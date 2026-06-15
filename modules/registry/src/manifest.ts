export interface ModuleDashboardMeta {
  label: string;
  description?: string;
}

export interface ModuleManifest {
  id: string;
  name: string;
  description: string;
  serverPackage?: string;
  dbPackage?: string;
  uiPackage?: string;
  /** Mount path under /api (legacy routes remain supported). */
  apiBasePath?: string;
  settingsKeys?: string[];
  dataTables?: string[];
  dashboard?: ModuleDashboardMeta | null;
}
