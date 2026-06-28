export type FeatureEventFields = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface FeatureLogging {
  logEvent?: (event: string, fields?: FeatureEventFields) => void;
  logEventError?: (event: string, err: unknown, fields?: FeatureEventFields) => void;
}

export const noopFeatureLogging: FeatureLogging = {
  logEvent: () => {},
  logEventError: () => {},
};
