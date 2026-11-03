export type BannerSlot = "top" | "grid" | "sidebar" | "bottom";

export const BANNER_SLOT_LABELS: Record<BannerSlot, string> = {
  top: "top strip",
  grid: "homepage grid",
  sidebar: "sidebar",
  bottom: "bottom billboard",
};

const GIF_HEADERS = ["GIF87a", "GIF89a"];

/** Pixel dimensions from PNG/GIF/JPEG/WebP headers; null when unparseable. */
export function imageSize(data: Buffer): [number, number] | null {
  if (
    data.length >= 24 &&
    data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
    data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a
  ) {
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  if (data.length >= 10 && GIF_HEADERS.includes(data.subarray(0, 6).toString("latin1"))) {
    return [data.readUInt16LE(6), data.readUInt16LE(8)];
  }
  if (
    data.length >= 30 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    const fourcc = data.subarray(12, 16).toString("latin1");
    if (fourcc === "VP8X") return [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1];
    if (fourcc === "VP8 ") return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
    if (fourcc === "VP8L") {
      const b0 = data.readUInt8(21);
      const b1 = data.readUInt8(22);
      const b2 = data.readUInt8(23);
      const b3 = data.readUInt8(24);
      return [(b0 | ((b1 & 0x3f) << 8)) + 1, ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1];
    }
  }
  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    // JPEG: scan for a SOF marker (skip C4/C8/CC).
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = data[i + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const segLen = data.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [data.readUInt16BE(i + 7), data.readUInt16BE(i + 5)];
      }
      i += 2 + segLen;
    }
  }
  return null;
}

/** Homepage placement from the creative's shape: wide strips (aspect >= 3)
 * render top — 900 px or wider goes to the bottom billboard strip — tall
 * units (< 3:4) go to the sticky sidebar, everything else to the mid grid. */
export function bannerSlot(width: number | null | undefined, height: number | null | undefined): BannerSlot {
  if (!width || !height) return "grid";
  const aspect = width / height;
  if (aspect >= 3) return width >= 900 ? "bottom" : "top";
  if (aspect < 0.75) return "sidebar";
  return "grid";
}

/** Effective slot: the admin's manual choice, else derived from shape. */
export function bannerSlotOf(b: { slot: string | null; width: number | null; height: number | null }): BannerSlot {
  if (b.slot && b.slot in BANNER_SLOT_LABELS) return b.slot as BannerSlot;
  return bannerSlot(b.width, b.height);
}
