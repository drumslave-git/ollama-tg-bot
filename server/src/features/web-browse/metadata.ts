import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export interface MediaMetadata {
  title: string;
  /** Free-text description; source URL is appended into the comment tag. */
  description: string;
  sourcePage: string;
  sourceUrl: string;
  /** ISO date (YYYY-MM-DD) the file was downloaded. */
  date: string;
}

function buildTags(meta: MediaMetadata): Record<string, string> {
  const commentParts = [meta.description, meta.sourcePage || meta.sourceUrl]
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    title: meta.title,
    comment: commentParts.join("\n"),
    date: meta.date,
    ...(meta.sourcePage || meta.sourceUrl
      ? { source: meta.sourcePage || meta.sourceUrl }
      : {}),
  };
}

/**
 * Bake metadata tags into a media container in place using ffmpeg (`-c copy`,
 * so it remuxes without re-encoding — fast, lossless). Returns false when
 * ffmpeg is not installed or the remux fails (the original file is left intact).
 */
export async function embedMetadata(
  filePath: string,
  meta: MediaMetadata,
): Promise<boolean> {
  const ext = path.extname(filePath);
  const tmp = `${filePath.slice(0, -ext.length || undefined)}.tagged${ext}`;
  const args = ["-y", "-i", filePath, "-map", "0", "-c", "copy", "-map_metadata", "0"];
  for (const [key, value] of Object.entries(buildTags(meta))) {
    if (value) args.push("-metadata", `${key}=${value}`);
  }
  args.push(tmp);

  const ok = await new Promise<boolean>((resolve) => {
    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    proc.on("error", () => resolve(false)); // ffmpeg not installed
    proc.on("close", (code) => resolve(code === 0));
  });

  if (!ok) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    return false;
  }
  try {
    await fs.rm(filePath, { force: true });
    await fs.rename(tmp, filePath);
    return true;
  } catch {
    await fs.rm(tmp, { force: true }).catch(() => {});
    return false;
  }
}
