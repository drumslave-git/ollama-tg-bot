/** File extensions that indicate a directly downloadable media asset. */
export const MEDIA_EXTENSIONS = [
  ".mp4",
  ".m4v",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".flv",
  ".m3u8",
  ".ts",
  ".mpd",
  ".mp3",
  ".m4a",
  ".ogg",
  ".wav",
];

/** Content-type prefixes that indicate streamed/served media. */
const MEDIA_CONTENT_TYPES = [
  "video/",
  "audio/",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/dash+xml",
];

/** True when a URL's path ends in a known media file extension. */
export function isLikelyMediaUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    path = url.toLowerCase().split("?")[0]!;
  }
  // Tube sites serve files like ".../5943.mp4/?token" — drop trailing slashes so
  // the extension is still the path ending. A ".mp4.jpg" thumbnail stays excluded.
  path = path.replace(/\/+$/, "");
  return MEDIA_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/** True when a response content-type header denotes media. */
export function isMediaContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const value = contentType.toLowerCase();
  return MEDIA_CONTENT_TYPES.some((prefix) => value.includes(prefix));
}
