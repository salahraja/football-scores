// The poster font: the font of the big red display text (league names, kick-off times, scores, GOLBOARD). Salah, 2026-11-26:
// "Let's do 5, with 2, 3, 4 and Premitive as onboarding options": Neloich by default, Taller, Raceday, Chalerist or Primate if
// picked in the setup (src/components/Onboarding.vue), remembered on the device ("golboard.posterFont").
// The font files are personal-use only, so they are never committed (.gitignore: /public/fonts/poster/). A font whose file does not
// load is not offered, and with no file at all nothing changes: the site stays in Barlow Condensed.
// One rule for any font, measured in the browser, so no font needs its own numbers: every red text in the display font gets
//   - boldness: thickened toward a stroke of TARGET of its letter height, never closing KEEP_GAP of its tightest inner gap (H, O, 0);
//   - size: grown back to the width it had in Barlow, at most MAX_GROW times (a league page's name fills its poster under CAP px);
//   - numbers keep today's size and weight (Salah, 2026-11-26: "The numbers should stay the same"): a poster font is registered
//     without digits, the colon and dashes, and draws them in Chalerist instead ("Actually make the numbers Chalerist"), from the same
//     file registered for those characters only. The Chalerist demo has no digits, so until a full version is added they fall back
//     to Barlow digit by digit, as today.
(function () {
  "use strict";
  if (window.golboardPosterFont) return;
  var KEY = "golboard.posterFont", DIR = "/fonts/poster/", RED = "rgb(196, 48, 42)";
  var TARGET = 0.12, KEEP_GAP = 0.25, MAX_GROW = 1.6, CAP = 180;
  var FONTS = [
    { id: "neloich", name: "Neloich", file: "neloich.ttf", spacing: true },
    { id: "taller", name: "Taller", file: "taller.otf", spacing: true },
    { id: "raceday", name: "Raceday", file: "raceday.otf", spacing: true },
    { id: "chalerist", name: "Chalerist", file: "chalerist.ttf", spacing: true },
    // Primate's look is its joined letters, which any letter spacing switches off
    { id: "primate", name: "Primate", file: "primate.otf", spacing: false },
  ];
  var byId = {}; FONTS.forEach(function (f) { byId[f.id] = f; });
  var family = function (f) { return "golboard-poster-" + f.id; };
  // every character but the digits, the colon, the hyphen and the en and em dashes (U+2D, U+30-3A, U+2013-2014)
  var LETTERS = "U+0-2C, U+2E-2F, U+3B-2012, U+2015-10FFFF";
  // the numbers font: Chalerist's digits, colon and dashes (U+2D, U+30-3A, U+2013-2014)
  var NUMBERS = { family: "golboard-numbers", file: "chalerist.ttf", range: "U+2D, U+30-3A, U+2013-2014" }, numbersLoaded = null;
  function loadNumbers() {
    if (!numbersLoaded) {
      var face = new FontFace(NUMBERS.family, "url(" + DIR + NUMBERS.file + ")", { unicodeRange: NUMBERS.range });
      numbersLoaded = face.load().then(function () { document.fonts.add(face); }, function () { numbersLoaded = null; });
    }
    return numbersLoaded;
  }
  function numberFamily(was) { return '"' + NUMBERS.family + '", ' + was; }
  function isNumber(t) { return /\d/.test(t) && /^[\d\s:\u002d\u2013\u2014]+$/.test(t.trim()); }

  function read() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { window.localStorage.setItem(KEY, v); } catch (e) { /* not remembered */ } }
  function current() { var v = read(); return v && byId[v] ? v : FONTS[0].id; }

  var loaded = {};
  function load(f) {
    if (!loaded[f.id]) {
      var face = new FontFace(family(f), "url(" + DIR + f.file + ")", { unicodeRange: LETTERS });
      // only a load that worked is kept: a missing file is asked for again next time
      loaded[f.id] = face.load().then(function () { document.fonts.add(face); return true; }, function () { delete loaded[f.id]; return false; });
    }
    return loaded[f.id];
  }
  function available() {
    return Promise.all(FONTS.map(load)).then(function (ok) { return FONTS.filter(function (f, i) { return ok[i]; }).map(function (f) { return f.id; }); });
  }

  // ---- the rule's two numbers, kept pure so they can be tested
  function strokeFor(stem, cap, gap) { return Math.max(0, Math.min(TARGET * cap - stem, KEEP_GAP * gap)) / 200; }
  function growFor(before, after, most) { return after ? Math.min(most, before / after) : 1; }

  // ---- measuring a font with a canvas (a 200px letter): its capital height, its stroke, and the gap inside H, O and 0
  function ink(fam, ch) {
    var c = document.createElement("canvas"); c.width = 400; c.height = 400; var x = c.getContext && c.getContext("2d");
    if (!x) return null;
    x.font = "200px " + fam; x.fillText(ch, 100, 300);
    var d = x.getImageData(0, 0, 400, 400).data, top = 400, bot = 0, i, j;
    var on = function (i, j) { return d[(j * 400 + i) * 4 + 3] > 128; };
    for (j = 0; j < 400; j++) for (i = 0; i < 400; i++) if (on(i, j)) { if (j < top) top = j; if (j > bot) bot = j; }
    var mid = Math.round(top + (bot - top) * 0.3), runs = [], s = -1;
    for (i = 0; i <= 400; i++) { var o = i < 400 && on(i, mid); if (o && s < 0) s = i; if (!o && s >= 0) { runs.push([s, i]); s = -1; } }
    return { cap: bot - top, runs: runs };
  }
  function measure(f) {
    var fam = '"' + family(f) + '"', I = ink(fam, "I");
    if (!I || !I.runs.length) return null;
    var stem = I.runs[0][1] - I.runs[0][0];
    var gap = Math.min.apply(null, ["H", "O", "0"].map(function (ch) { var r = ink(fam, ch).runs; return r.length > 1 ? r[1][0] - r[0][1] : stem; }));
    var c = document.createElement("canvas").getContext("2d");
    var w = function (font, t) { c.font = font; return c.measureText(t).width; };
    var sample = "SERIE A PREMIER LEAGUE 15:00 2-1";
    return {
      stroke: strokeFor(stem, I.cap, gap),
      grow: Math.min(MAX_GROW, Math.max(1, w('800 100px "Barlow Condensed"', sample) / w("400 100px " + fam, sample))),
    };
  }

  // ---- applying it to the page, and undoing it when the pick changes
  var active = null, observer = null;
  function ownText(el) { for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; }
  function fitTitle(h) {
    var text = h.textContent.trim(), words = text.split(/\s+/);
    h.style.lineHeight = "0.78";
    var layout = function (lines) { h.textContent = ""; lines.forEach(function (w) { var s = document.createElement("span"); s.textContent = w;
      s.style.cssText = "display:block;white-space:nowrap;width:max-content;margin:0 auto"; h.appendChild(s); }); };
    var fit = function (lines) { layout(lines); var W = h.clientWidth, lo = 10, hi = 400;
      for (var i = 0; i < 22; i++) { var m = (lo + hi) / 2; h.style.fontSize = m + "px";
        var w = Math.max.apply(null, [].map.call(h.children, function (s) { return s.getBoundingClientRect().width; }));
        if (w <= W && h.getBoundingClientRect().height <= CAP) lo = m; else hi = m; }
      return lo; };
    var best = null; [[text], words.length > 1 ? words : null].filter(Boolean).forEach(function (o) { var m = fit(o); if (!best || m > best.m * 1.15) best = { o: o, m: m }; });
    layout(best.o); h.style.fontSize = best.m + "px";
  }
  // a score or time: the numbers font in front of what it had; inside a restyled name (a match page's "Bologna 1-1 Udinese") its
  // size, weight and spacing are put back too
  function pin(el, was, nested) {
    el.setAttribute("data-pf", "number"); el.setAttribute("data-pf-style", el.getAttribute("style") || "");
    el.style.fontFamily = numberFamily(was.family);
    if (nested) { el.style.fontWeight = was.weight; el.style.fontSize = was.size; el.style.letterSpacing = was.spacing; el.style.webkitTextStroke = "0"; }
  }
  function style(el, cs) {
    var f = active.font, m = active.m, size = parseFloat(cs.fontSize);
    el.setAttribute("data-pf", f.id); el.setAttribute("data-pf-style", el.getAttribute("style") || "");
    var r = document.createRange(); r.selectNodeContents(el); var before = r.getBoundingClientRect().width;
    el.style.fontFamily = '"' + family(f) + '", ' + numberFamily(cs.fontFamily); el.style.fontWeight = "400";
    el.style.webkitTextStroke = m.stroke + "em currentColor"; el.style.paintOrder = "stroke fill";
    el.style.letterSpacing = f.spacing ? m.stroke + "em" : "normal";
    if (el.matches(".titlebar h1")) { el.setAttribute("data-pf-html", el.innerHTML); fitTitle(el); return; }
    el.style.fontSize = size * growFor(before, r.getBoundingClientRect().width, m.grow) + "px";
  }
  function apply() {
    if (!active) return;
    // first note what every red display text looks like now, then change the names; a number keeps what it had
    var all = document.body.querySelectorAll("*"), todo = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      // data-pf-skip: text that shows a font on purpose, such as the setup's font names
      if (el.hasAttribute("data-pf") || !ownText(el) || el.closest("[data-pf-skip]")) continue;
      var cs = getComputedStyle(el);
      if (cs.color === RED && /Barlow/.test(cs.fontFamily))
        todo.push({ el: el, cs: cs, was: { family: cs.fontFamily, weight: cs.fontWeight, size: cs.fontSize, spacing: cs.letterSpacing } });
    }
    var numbers = todo.filter(function (t) { return isNumber(t.el.textContent); });
    todo.forEach(function (t) { if (numbers.indexOf(t) < 0) style(t.el, t.cs); });
    numbers.forEach(function (t) { var up = t.el.parentElement && t.el.parentElement.closest("[data-pf]"); pin(t.el, t.was, !!(up && up.getAttribute("data-pf") !== "number")); });
  }
  function undo() {
    var done = document.querySelectorAll("[data-pf]");
    for (var i = 0; i < done.length; i++) {
      var el = done[i], s = el.getAttribute("data-pf-style"), html = el.getAttribute("data-pf-html");
      if (html !== null) el.innerHTML = html;
      if (s) el.setAttribute("style", s); else el.removeAttribute("style");
      el.removeAttribute("data-pf"); el.removeAttribute("data-pf-style"); el.removeAttribute("data-pf-html");
    }
  }
  function use(id) {
    var f = byId[id] || FONTS[0];
    loadNumbers();
    return load(f).then(function (ok) {
      if (!ok) return;
      var m = measure(f); if (!m) return;
      undo(); active = { font: f, m: m }; apply();
      if (!observer && window.MutationObserver) {
        var t; observer = new MutationObserver(function () { clearTimeout(t); t = setTimeout(apply, 150); });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    });
  }
  function set(id) { if (!byId[id]) return Promise.resolve(); write(id); return use(id); }

  window.golboardPosterFont = { fonts: FONTS, current: current, set: set, available: available, family: family, rule: { strokeFor: strokeFor, growFor: growFor, isNumber: isNumber, numberFamily: numberFamily } };
  var start = function () { use(current()); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
