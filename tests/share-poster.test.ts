import { describe, expect, it, vi } from "vitest";
import { posterLayout, sharePoster, POSTER } from "../src/data/sharePoster";

// The share poster: a result as a Stories-size image (1080 x 1920) in the homepage poster's look (Barlow Condensed, the red score, the
// clubs' colours), shared through the phone's share sheet, or downloaded where there is none. Text and colour only: no crests or logos.
const measure = (text: string, px: number) => text.length * px * 0.5; // a stand-in for canvas measureText: half an em per letter
const game = { league: "Serie A", home: "Juventus", away: "Internazionale Milano", score: [2, 2] as [number, number], meta: "Full time", homeColour: "#111111", awayColour: "#0068a8" };

describe("posterLayout", () => {
  const ops = posterLayout(game, measure);
  const texts = ops.filter((o) => o.kind === "text");

  it("is Stories size", () => {
    expect(POSTER).toEqual({ width: 1080, height: 1920 });
  });

  it("sets the league, both clubs and the score in capitals, top to bottom, with the score in the poster's red", () => {
    expect(texts.map((t) => t.text)).toEqual(["SERIE A", "JUVENTUS", "2–2", "INTERNAZIONALE MILANO", "Full time", "golboard"]);
    const ys = texts.map((t) => t.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(texts.find((t) => t.text === "2–2")!.colour).toBe("#c4302a");
    expect(texts.find((t) => t.text === "SERIE A")!.font).toContain("Barlow Condensed");
  });

  it("fits every line inside the margins, shrinking a long name rather than breaking it", () => {
    for (const t of texts) expect(measure(t.text, t.size)).toBeLessThanOrEqual(POSTER.width - 2 * 80 + 0.5);
    const home = texts.find((t) => t.text === "JUVENTUS")!, away = texts.find((t) => t.text === "INTERNAZIONALE MILANO")!;
    expect(away.size).toBeLessThan(home.size);
  });

  it("paints the clubs' colours and nothing but text and colour (no images)", () => {
    const fills = ops.filter((o) => o.kind === "rect").map((o) => o.colour);
    expect(fills).toContain("#111111");
    expect(fills).toContain("#0068a8");
    expect(ops.every((o) => o.kind === "text" || o.kind === "rect")).toBe(true);
  });

  it("shows 'v' for a game not yet started, and leaves out a colour it does not know", () => {
    const later = posterLayout({ ...game, score: null, homeColour: null, awayColour: null }, measure);
    expect(later.some((o) => o.kind === "text" && o.text === "V")).toBe(true);
    expect(later.filter((o) => o.kind === "rect")).toHaveLength(1); // the slate ground only
  });
});

describe("sharePoster", () => {
  const blob = new Blob(["png"], { type: "image/png" });

  it("opens the share sheet with the image where the phone can share files", async () => {
    const share = vi.fn(async () => {});
    const nav = { canShare: () => true, share };
    expect(await sharePoster(blob, "juventus-2-2-inter.png", "Juventus 2–2 Inter", nav)).toBe("shared");
    const arg = (share.mock.calls[0] as unknown[])[0] as { files: File[]; title: string };
    expect(arg.files[0].name).toBe("juventus-2-2-inter.png");
    expect(arg.files[0].type).toBe("image/png");
    expect(arg.title).toBe("Juventus 2–2 Inter");
  });

  it("downloads the image where there is no share sheet", async () => {
    const click = vi.fn();
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:poster"), revokeObjectURL: vi.fn() }); // happy-dom has neither
    const made: { download?: string; href?: string }[] = [];
    const doc = { createElement: () => { const a = { download: "", href: "", click }; made.push(a); return a; } };
    expect(await sharePoster(blob, "x.png", "x", {}, doc as never)).toBe("downloaded");
    expect(made[0].download).toBe("x.png");
    expect(made[0].href).toBe("blob:poster");
    expect(click).toHaveBeenCalled();
  });

  it("says cancelled, not failed, when the person closes the share sheet", async () => {
    const nav = { canShare: () => true, share: vi.fn(async () => { throw Object.assign(new Error("closed"), { name: "AbortError" }); }) };
    expect(await sharePoster(blob, "x.png", "x", nav)).toBe("cancelled");
  });
});
