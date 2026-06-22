/**
 * Generic contract for a stateless bot feature module.
 *
 * - `TInput` — per-invocation payload (no Telegram/DB types).
 * - `TConfig` — provider and feature settings supplied by the host.
 * - `TOutput` — structured result returned to the host.
 */
export interface ModuleDefinition<TInput, TConfig, TOutput> {
  readonly id: string;
  run(input: TInput, config: TConfig): Promise<TOutput>;
}

export type ModuleRun<TInput, TConfig, TOutput> = (
  input: TInput,
  config: TConfig,
) => Promise<TOutput>;
