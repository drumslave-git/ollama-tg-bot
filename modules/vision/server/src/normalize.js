import sharp from "sharp";
const MAX_BYTES = 900_000;
/** Strip data-URI prefix and whitespace from base64. */
function parseBase64(input) {
    const trimmed = input.trim().replace(/\s/g, "");
    const raw = trimmed.includes(",")
        ? trimmed.slice(trimmed.indexOf(",") + 1)
        : trimmed;
    const buf = Buffer.from(raw, "base64");
    if (buf.length < 16) {
        throw new Error("Image data is too small or corrupt");
    }
    return buf;
}
function isJpeg(buf) {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
/**
 * Convert any Telegram image (WebP stickers, JPEG photos, etc.) to JPEG
 * so OpenAI-compatible vision endpoints accept it reliably.
 */
export async function normalizeImageForChat(base64, maxDimension) {
    const buf = parseBase64(base64);
    if (isJpeg(buf) && buf.length <= MAX_BYTES) {
        const meta = await sharp(buf).metadata();
        if ((meta.width ?? 0) <= maxDimension &&
            (meta.height ?? 0) <= maxDimension) {
            return buf.toString("base64");
        }
    }
    const pipeline = sharp(buf, { failOn: "error" })
        .rotate()
        .resize(maxDimension, maxDimension, {
        fit: "inside",
        withoutEnlargement: true,
    });
    let output = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    if (output.length > MAX_BYTES) {
        output = await sharp(output)
            .resize(512, 512, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 72, mozjpeg: true })
            .toBuffer();
    }
    if (output.length > MAX_BYTES) {
        throw new Error("Image is too large after compression");
    }
    return output.toString("base64");
}
