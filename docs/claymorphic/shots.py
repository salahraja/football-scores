"""Screenshot the built site (npm run preview on :4173) and check WCAG AA contrast.

Run: /Users/salahuddin/job-auto-apply/.venv/bin/python docs/claymorphic/shots.py
"""
import pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).parent
BASE = "http://127.0.0.1:4173"
PAGES = {"home": "/", "table": "/standings", "results": "/results"}

JS = """() => {
  const parse = c => c.match(/[\\d.]+/g).map(Number);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const bgOf = el => { for (; el; el = el.parentElement) {
    const c = parse(getComputedStyle(el).backgroundColor);
    if (c.length < 4 || c[3] > 0.99) return c; } return [255, 255, 255]; };
  const out = [];
  const seen = new Set();
  document.querySelectorAll('body *').forEach(el => {
    const t = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!t) return;
    const fg = parse(getComputedStyle(el).color), bg = bgOf(el);
    const a = L(fg), b = L(bg), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const fs = parseFloat(getComputedStyle(el).fontSize), bold = +getComputedStyle(el).fontWeight >= 700;
    const need = fs >= 24 || (fs >= 18.66 && bold) ? 3 : 4.5;
    const key = el.tagName + el.className + r.toFixed(2);
    if (!seen.has(key)) { seen.add(key); out.push([el.tagName + '.' + el.className, +r.toFixed(2), need, r >= need]); }
  });
  return out;
}"""

fails = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for scheme in ("light", "dark"):
        for w in (390, 1280):
            ctx = b.new_context(viewport={"width": w, "height": 800}, color_scheme=scheme)
            page = ctx.new_page()
            for name, path in PAGES.items():
                page.goto(BASE + path)
                page.wait_for_load_state("networkidle")
                sw = page.evaluate("document.documentElement.scrollWidth")
                if sw > w:
                    print(f"HSCROLL {scheme} {w} {name}: {sw}")
                    fails += 1
                page.screenshot(path=str(OUT / f"{name}-{w}-{scheme}.png"), full_page=True)
                for sel, ratio, need, ok in page.evaluate(JS):
                    if not ok:
                        print(f"LOW CONTRAST {scheme} {name} {sel}: {ratio} < {need}")
                        fails += 1
            ctx.close()
    b.close()
print("problems:", fails)
