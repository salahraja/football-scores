// Temporary (Salah, 2026-11-18): a Light / Dark / Auto switch, to compare the reds without changing the phone's setting.
// It turns the stylesheets' dark-mode rules always on ("all"), always off ("not all") or back to the phone's setting.
// To remove: delete this file, its tag in src/layouts/Page.astro and in scripts/api/pages.mjs, and tests/theme-toggle.test.ts.
(() => {
  const KEY = "golboard.theme";
  const NEXT = { auto: "light", light: "dark", dark: "auto" };
  const LABEL = { auto: "◐ Auto", light: "☀︎ Light", dark: "☾ Dark" };
  const original = new WeakMap();
  let mode = "auto";
  try { mode = NEXT[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : "auto"; } catch { /* private mode: start on auto */ }

  function darkRules(list, out) {
    for (const rule of list) {
      if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) {
        if (/prefers-color-scheme:\s*dark/.test(original.get(rule) ?? rule.media.mediaText)) out.push(rule);
        darkRules(rule.cssRules, out);
      }
    }
    return out;
  }

  function apply() {
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch { continue; }
      for (const rule of darkRules(list, [])) {
        if (!original.has(rule)) original.set(rule, rule.media.mediaText);
        rule.media.mediaText = mode === "auto" ? original.get(rule) : mode === "dark" ? "all" : "not all";
      }
    }
    document.documentElement.style.colorScheme = mode === "auto" ? "" : mode;
    const button = document.querySelector("button.theme-toggle");
    if (button) button.textContent = LABEL[mode];
  }

  function start() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.setAttribute("aria-label", "Light or dark (temporary)");
    button.style.cssText = "position:fixed;left:12px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:1000;padding:8px 12px;"
      + "border:0;border-radius:999px;font:700 0.8125rem system-ui,sans-serif;background:rgb(27 28 32 / 78%);color:#fff;cursor:pointer;";
    button.addEventListener("click", () => {
      mode = NEXT[mode];
      try { localStorage.setItem(KEY, mode); } catch { /* not kept: fine */ }
      apply();
    });
    document.body.append(button);
    apply();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  window.addEventListener("load", apply);  // stylesheets that finished after the page was parsed
})();
