import type { User } from "@grammyjs/types";
import type { SqlDatabase } from "../../contracts/index.js";

let db: SqlDatabase;

export interface KnownUserRecord {
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export async function bindKnownUsersDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS known_users (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      updated_at BIGINT NOT NULL DEFAULT extract(epoch from now())::bigint
    );
  `);
  await db.query(
    `CREATE INDEX IF NOT EXISTS idx_known_users_username
       ON known_users (username);`,
  );
}

function rowToRecord(row: {
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
}): KnownUserRecord {
  return {
    userId: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
  };
}

export function formatKnownUserLabel(record: KnownUserRecord): string {
  const name = [record.firstName, record.lastName].filter(Boolean).join(" ");
  if (name && record.username) return `${name} (@${record.username})`;
  if (name) return name;
  if (record.username) return `@${record.username}`;
  return `User ${record.userId}`;
}

export async function rememberTelegramUser(
  user: User | undefined,
): Promise<void> {
  if (!user?.id) return;

  await db.query(
    `INSERT INTO known_users (user_id, username, first_name, last_name, updated_at)
     VALUES ($1, $2, $3, $4, extract(epoch from now())::bigint)
     ON CONFLICT (user_id) DO UPDATE SET
       username = excluded.username,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       updated_at = extract(epoch from now())::bigint`,
    [
      String(user.id),
      user.username?.toLowerCase() ?? null,
      user.first_name ?? null,
      user.last_name ?? null,
    ],
  );
}

type KnownUserRow = {
  user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

export async function getKnownUserById(
  userId: string,
): Promise<KnownUserRecord | null> {
  const { rows } = await db.query<KnownUserRow>(
    `SELECT user_id, username, first_name, last_name
       FROM known_users WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function getKnownUsersByIds(
  userIds: string[],
): Promise<KnownUserRecord[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const { rows } = await db.query<KnownUserRow>(
    `SELECT user_id, username, first_name, last_name
       FROM known_users WHERE user_id = ANY($1)`,
    [unique],
  );

  return rows.map(rowToRecord);
}

export async function findKnownUserByUsername(
  username: string,
): Promise<KnownUserRecord | null> {
  const normalized = username.trim().replace(/^@/, "").toLowerCase();
  if (!normalized) return null;

  const { rows } = await db.query<KnownUserRow>(
    `SELECT user_id, username, first_name, last_name
       FROM known_users
       WHERE lower(username) = $1
       ORDER BY updated_at DESC
       LIMIT 1`,
    [normalized],
  );

  return rows[0] ? rowToRecord(rows[0]) : null;
}

const MIN_NAME_MATCH_LEN = 3;
const KNOWN_USER_SCAN_LIMIT = 500;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameSearchTerms(record: KnownUserRecord): string[] {
  const terms: string[] = [];
  const first = record.firstName?.trim();
  const last = record.lastName?.trim();
  if (first && first.length >= MIN_NAME_MATCH_LEN) terms.push(first);
  if (last && last.length >= MIN_NAME_MATCH_LEN) terms.push(last);
  if (first && last) {
    const full = `${first} ${last}`;
    if (full.length >= MIN_NAME_MATCH_LEN) terms.push(full);
  }
  return terms;
}

/** Find known users referenced by @username or by first/last name in plain text. */
export async function findKnownUsersMentionedInText(
  text: string,
  options: {
    excludeUserIds?: string[];
    botUsername?: string;
  } = {},
): Promise<KnownUserRecord[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const exclude = new Set(options.excludeUserIds ?? []);
  const botUser = options.botUsername?.toLowerCase();
  const found = new Map<string, KnownUserRecord>();

  for (const match of trimmed.matchAll(/@([a-zA-Z0-9_]{4,32})/g)) {
    const username = match[1]?.toLowerCase();
    if (!username || (botUser && username === botUser)) continue;
    const known = await findKnownUserByUsername(username);
    if (!known || exclude.has(known.userId)) continue;
    found.set(known.userId, known);
  }

  const { rows } = await db.query<KnownUserRow>(
    `SELECT user_id, username, first_name, last_name
       FROM known_users
       ORDER BY updated_at DESC
       LIMIT $1`,
    [KNOWN_USER_SCAN_LIMIT],
  );

  const candidates = rows
    .map(rowToRecord)
    .filter((u) => !exclude.has(u.userId))
    .filter((u) => !botUser || u.username?.toLowerCase() !== botUser);

  const nameChecks: Array<{ record: KnownUserRecord; term: string }> = [];
  for (const record of candidates) {
    for (const term of nameSearchTerms(record)) {
      nameChecks.push({ record, term });
    }
  }
  nameChecks.sort((a, b) => b.term.length - a.term.length);

  for (const { record, term } of nameChecks) {
    if (found.has(record.userId)) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    if (pattern.test(trimmed)) {
      found.set(record.userId, record);
    }
  }

  return [...found.values()];
}
