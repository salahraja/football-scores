import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const draw = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
const share = vi.fn(async () => "shared");
vi.mock("../src/data/sharePoster", () => ({ drawPoster: draw, sharePoster: share }));
const { default: HomeView } = await import("../src/views/HomeView.vue");

afterEach(() => vi.unstubAllGlobals());

// The poster's Share button (Salah, 2026-11-18): the result on the poster as a picture, through the share sheet.
describe("the homepage's share button", () => {
  it("draws the poster's game and hands it to the share sheet with a readable name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));
    const w = mount(HomeView, { global: { stubs: { RouterLink: RouterLinkStub } } });
    await flushPromises();
    const button = w.get('[data-test="share"]');
    expect(button.text()).toBe("Share");
    await button.trigger("click");
    await flushPromises();
    const g = (draw.mock.calls[0] as unknown[])[0] as { league: string; home: string; away: string };
    expect(g.league).toBe("Serie A");
    expect(w.get('[data-test="hero"]').text()).toContain(g.home);
    const [, name, title] = share.mock.calls[0] as unknown as [Blob, string, string];
    expect(name).toMatch(/^[a-z0-9-]+\.png$/);
    expect(title).toContain(g.home);
    expect(title).toContain(g.away);
  });
});
