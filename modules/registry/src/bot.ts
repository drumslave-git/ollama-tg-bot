/**
 * Bot integration contract for dynamically loaded feature modules.
 *
 * Each module package may export `botHost` with commands, middleware, and
 * startup hooks. The Telegram host discovers modules via manifest.json.
 */

export interface BotHostLogging {
  logEvent: (event: string, fields?: Record<string, unknown>) => void;
  logEventError: (
    event: string,
    err: unknown,
    fields?: Record<string, unknown>,
  ) => void;
}

export interface BotHostCallbacks {
  resolveConversationKey?: (ctx: unknown) => string | null;
  isMaintenanceBlocked?: (ctx: unknown) => boolean;
  isSlashCommandMessage?: (ctx: unknown) => boolean;
  enrichTextWithUserMentions?: (
    text: string,
    message: unknown,
    options: {
      botId?: number;
      botUsername?: string;
      senderId?: number;
      senderUsername?: string;
    },
  ) => string;
  loadVisionFromMessage?: (
    botToken: string,
    message: unknown,
  ) => Promise<{
    images: unknown[];
    unavailableText?: string;
    visionHint?: string;
    sourceSticker?: unknown;
  }>;
  messageHasVisionMedia?: (message: unknown) => boolean;
  describeVisionImages?: (
    images: unknown[],
    msgLog: Record<string, unknown>,
    visionHint?: string,
  ) => Promise<string>;
  stickerPackEmoji?: (sticker: unknown) => string | null;
  replyToUser?: (ctx: unknown, text: string) => Promise<unknown>;
}

export interface BotHostServices {
  api: unknown;
  botUsername: string;
  botToken: string;
  logging: BotHostLogging;
  getSettings: () => Record<string, unknown>;
  callbacks: BotHostCallbacks;
}

export interface BotCommandRegistration {
  command: string;
  description: string;
  handler: (ctx: unknown, services: BotHostServices) => Promise<void>;
}

export interface BotMiddlewareRegistration {
  order: number;
  handler: (
    ctx: unknown,
    next: () => Promise<void>,
    services: BotHostServices,
  ) => Promise<void>;
}

export interface BotModuleHost {
  readonly id: string;
  readonly commands?: BotCommandRegistration[];
  readonly middlewares?: BotMiddlewareRegistration[];
  onStart?(services: BotHostServices): Promise<void>;
}
