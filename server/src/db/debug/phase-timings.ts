import type { SqlDatabase } from "../../contracts/index.js";

let db: SqlDatabase | null = null;

/** Timings older than this are pruned at startup — enough for week-over-week comparison. */
const RETENTION_DAYS = 30;

export async function bindPhaseTimingsDatabase(
  database: SqlDatabase,
): Promise<void> {
  db = database;
  await db.query(`
    CREATE TABLE IF NOT EXISTS phase_timings (
      id BIGSERIAL PRIMARY KEY,
      phase_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS phase_timings_phase_created
      ON phase_timings (phase_id, created_at);
  `);
  await db.query(
    `DELETE FROM phase_timings WHERE created_at < now() - make_interval(days => $1)`,
    [RETENTION_DAYS],
  );
}

/**
 * Record one phase duration. Fire-and-forget by design: a lost timing must
 * never slow down or fail the turn that produced it, so errors are swallowed
 * and callers do not await.
 */
export function recordPhaseTiming(phaseId: string, durationMs: number): void {
  if (!db) return;
  void db
    .query(`INSERT INTO phase_timings (phase_id, duration_ms) VALUES ($1, $2)`, [
      phaseId,
      Math.max(0, Math.round(durationMs)),
    ])
    .catch(() => {});
}

export interface PhaseTimingStat {
  phaseId: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  maxMs: number;
}

/** Per-phase latency distribution over the last `days` days, slowest p95 first. */
export async function getPhaseTimingStats(
  days: number,
): Promise<PhaseTimingStat[]> {
  if (!db) return [];
  const { rows } = await db.query<{
    phase_id: string;
    count: number;
    p50: string | number;
    p95: string | number;
    avg: string | number;
    max: number;
  }>(
    `SELECT phase_id,
            COUNT(*)::int AS count,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
            AVG(duration_ms) AS avg,
            MAX(duration_ms) AS max
       FROM phase_timings
      WHERE created_at >= now() - make_interval(days => $1)
      GROUP BY phase_id
      ORDER BY p95 DESC`,
    [days],
  );
  return rows.map((row) => ({
    phaseId: row.phase_id,
    count: row.count,
    p50Ms: Math.round(Number(row.p50)),
    p95Ms: Math.round(Number(row.p95)),
    avgMs: Math.round(Number(row.avg)),
    maxMs: Number(row.max),
  }));
}
