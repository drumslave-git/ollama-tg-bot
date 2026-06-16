export type ModuleEventFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ModuleLogging {
  logEvent?: (event: string, fields?: ModuleEventFields) => void;
  logEventError?: (event: string, err: unknown, fields?: ModuleEventFields) => void;
}

export const noopModuleLogging: ModuleLogging = {
  logEvent: () => {},
  logEventError: () => {},
};
