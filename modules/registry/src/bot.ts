/**
 * Bot integration contract for dynamically loaded feature modules.
 *
 * Commands and startup hooks only — message handling uses the pipeline.
 */

export interface BotHostLogging {
  logEvent: (event: string, fields?: Record<string, unknown>) => void;
  logEventError: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

export interface BotHostServices {
  api: unknown;
  botUsername: string;
  botToken: string;
  logging: BotHostLogging;
  getSettings: () => Record<string, unknown>;
  replyToUser: (ctx: unknown, text: string) => Promise<unknown>;
  extensions: Record<string, unknown>;
}

export interface BotCommandRegistration {
  command: string;
  description: string;
  handler: (ctx: unknown, services: BotHostServices) => Promise<void>;
}

export interface BotModuleHost {
  readonly id: string;
  readonly commands?: BotCommandRegistration[];
  onStart?(services: BotHostServices): Promise<void>;
}
