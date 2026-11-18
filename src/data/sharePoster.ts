// The share poster: a result as a Stories-size image in the homepage poster's look (Barlow Condensed in capitals, the score in the
// poster's red, the two clubs' colours washed over the slate), for the phone's share sheet. Text and colour only: no crests or logos,
// which are the clubs' marks, not ours. posterLayout is plain data so it can be tested; drawPoster paints it on a canvas.
export const POSTER = { width: 1080, height: 1920 } as const;
const MARGIN = 80;
const SLATE = "#6f7e98", INK = "#1b1c20", RED = "#c4302a";
const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const SANS = '"Instrument Sans", system-ui, -apple-system, sans-serif';

export interface PosterGame { league: string; home: string; away: string; score: [number, number] | null; meta: string; homeColour: string | null; awayColour: string | null }
export type PosterOp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; colour: string; alpha: number }
  | { kind: "text"; text: string; x: number; y: number; size: number; font: string; colour: string; alpha: number };
/** The width of `text` set at `px` pixels in `family` (canvas measureText in the browser). */
export type Measure = (text: string, px: number, family: string) => number;

export function posterLayout(g: PosterGame, measure: Measure): PosterOp[] {
  const { width: W, height: H } = POSTER;
  const room = W - 2 * MARGIN;
  // the largest size up to `max` at which the line fits the margins: a long name gets smaller, never broken
  const fit = (text: string, max: number, family: string) => Math.min(max, Math.floor((room / Math.max(measure(text, 100, family), 1)) * 100 * 1000) / 1000);
  const text = (t: string, y: number, max: number, colour: string, opts: { weight?: number; family?: string; alpha?: number } = {}): PosterOp => {
    const family = opts.family ?? DISPLAY, size = fit(t, max, family);
    return { kind: "text", text: t, x: W / 2, y, size, font: `${opts.weight ?? 800} ${size}px ${family}`, colour, alpha: opts.alpha ?? 1 };
  };
  const ops: PosterOp[] = [{ kind: "rect", x: 0, y: 0, w: W, h: H, colour: SLATE, alpha: 1 }];
  // as on the homepage, each club's colour over its own half, at the poster's share (--club-share: 32%)
  if (g.homeColour) ops.push({ kind: "rect", x: 0, y: 0, w: W, h: H / 2, colour: g.homeColour, alpha: 0.32 });
  if (g.awayColour) ops.push({ kind: "rect", x: 0, y: H / 2, w: W, h: H / 2, colour: g.awayColour, alpha: 0.32 });
  ops.push(
    text(g.league.toUpperCase(), 360, 210, RED),
    text(g.home.toUpperCase(), 820, 170, INK),
    text(g.score ? `${g.score[0]}–${g.score[1]}` : "V", 1220, 440, RED),
    text(g.away.toUpperCase(), 1440, 170, INK),
    text(g.meta, 1620, 48, INK, { weight: 600, family: SANS, alpha: 0.8 }),
    text("golboard", 1820, 60, INK, { alpha: 0.6 }),
  );
  return ops;
}

/** Paints the poster on a canvas and returns it as a PNG, or null where the browser has no canvas. */
export async function drawPoster(g: PosterGame, doc: Document = document): Promise<Blob | null> {
  const canvas = doc.createElement("canvas");
  canvas.width = POSTER.width;
  canvas.height = POSTER.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    await Promise.all([doc.fonts?.load(`800 100px ${DISPLAY}`), doc.fonts?.load(`600 48px ${SANS}`)]); // the site's own fonts, not a fallback
  } catch { /* drawn in the fallback face */ }
  const measure: Measure = (t, px, family) => {
    ctx.font = `${family === SANS ? 600 : 800} ${px}px ${family}`;
    return ctx.measureText(t).width;
  };
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const op of posterLayout(g, measure)) {
    ctx.globalAlpha = op.alpha;
    ctx.fillStyle = op.colour;
    if (op.kind === "rect") ctx.fillRect(op.x, op.y, op.w, op.h);
    else {
      ctx.font = op.font;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  ctx.globalAlpha = 1;
  return new Promise((done) => canvas.toBlob((b) => done(b), "image/png"));
}

interface ShareNav { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title: string }) => Promise<void> }
interface LinkDoc { createElement(tag: "a"): { download: string; href: string; click(): void } }

/** The share sheet where the phone can share an image; otherwise the image is downloaded. */
export async function sharePoster(blob: Blob, name: string, title: string, nav: ShareNav = navigator as ShareNav, doc: LinkDoc = document as unknown as LinkDoc):
  Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: "image/png" });
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelled";
      // a share sheet that refuses the file: fall through to the download
    }
  }
  const a = doc.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
