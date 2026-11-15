// Bracket pick'em (Salah, 2026-11-15): rank every group, pick the best thirds, then a winner in every game round by round to the final.
// No money, no odds, no account: the picks stay on the device (localStorage). data/api/pickem.json holds the formats and the brackets.
// The functions below are plain and self-contained: pickemScript() copies their source into /leagues/pickem.js, so the page and the
// tests run the same code.
// A bracket here is { groups: { A: [codes] }, rounds: [{ name, matches: [{ id, a, b }] }], format: { advance, thirds, thirdsVs, table } }.
// Picks are { groups: { A: [codes in finishing order] }, thirds: [group letters], ko: { matchId: code } }.

/** For a set of groups whose thirds go through: which group's third meets each of thirdsVs ({ "3vs1A": "C", ... }), or null. */
export function thirdsFor(format, letters) {
  if (!format.thirds || letters.length !== format.thirds) return null;
  const row = format.table[letters.slice().sort().join("")];
  if (!row) return null;
  const out = {};
  format.thirdsVs.forEach((w, i) => { out[`3vs${w}`] = row[i]; });
  return out;
}

/** A knockout side's name before its team is known: "1st A", "2nd C", "3rd C/D/E" (every group whose third can land there). */
export function sideLabel(format, ref) {
  if (ref.indexOf("3vs") === 0) {
    const col = format.thirdsVs.indexOf(ref.slice(3));
    const seen = {};
    Object.keys(format.table).forEach((k) => { seen[format.table[k][col]] = true; });
    return `3rd ${Object.keys(seen).sort().join("/")}`;
  }
  return `${{ 1: "1st", 2: "2nd", 3: "3rd", 4: "4th" }[ref[0]] || ref[0]} ${ref.slice(1)}`;
}

/** A group is finished when every team in it has a place. */
export function finished(bracket, picks, g) {
  const order = (picks.groups || {})[g] || [];
  return order.length > 0 && order.length === bracket.groups[g].length;
}

/** Every round with each game's two sides ({ ref, label, team or null }) and the pick, worked out from the picks so far. */
export function resolve(bracket, picks) {
  const fmt = bracket.format;
  const all = Object.keys(bracket.groups);
  const done = all.every((g) => finished(bracket, picks, g));
  const thirds = done ? thirdsFor(fmt, picks.thirds || []) : null;
  const winners = {}, names = {};
  bracket.rounds.forEach((r) => r.matches.forEach((m, i) => { names[m.id] = `${r.name} game ${i + 1}`; }));
  const side = (ref) => {
    if (ref.indexOf("W:") === 0) return { ref, label: `Winner, ${names[ref.slice(2)]}`, team: winners[ref.slice(2)] || null };
    if (ref.indexOf("3vs") === 0) {
      const g = thirds && thirds[ref];
      return { ref, label: sideLabel(fmt, ref), team: g && finished(bracket, picks, g) ? picks.groups[g][2] : null };
    }
    const g = ref.slice(1), place = Number(ref[0]);
    return { ref, label: sideLabel(fmt, ref), team: finished(bracket, picks, g) ? picks.groups[g][place - 1] : null };
  };
  return bracket.rounds.map((r) => ({ name: r.name, matches: r.matches.map((m) => {
    const a = side(m.a), b = side(m.b);
    const pick = (picks.ko || {})[m.id];
    const ok = pick && (pick === a.team || pick === b.team) ? pick : null;
    if (ok) winners[m.id] = ok;
    return { id: m.id, a, b, pick: ok };
  }) }));
}

/** The picks with anything no longer possible taken out: unknown teams, thirds from unfinished groups (at most the format's number),
 *  and knockout picks whose team is not in that game any more, with everything that hung on them. */
export function clean(bracket, picks) {
  const groups = {};
  Object.keys(bracket.groups).forEach((g) => {
    const order = ((picks && picks.groups) || {})[g] || [];
    const seen = {};
    groups[g] = order.filter((t) => bracket.groups[g].indexOf(t) >= 0 && !seen[t] && (seen[t] = true));
  });
  const next = { groups, thirds: [], ko: {} };
  const want = (picks && picks.thirds) || [];
  next.thirds = want.filter((g, i) => want.indexOf(g) === i && bracket.groups[g] && finished(bracket, next, g)).slice(0, bracket.format.thirds || 0);
  next.ko = (picks && picks.ko) || {};
  const kept = {};
  resolve(bracket, next).forEach((r) => r.matches.forEach((m) => { if (m.pick) kept[m.id] = m.pick; }));
  next.ko = kept;
  return next;
}

/** One step per group ranked, one for the thirds, one per game picked. */
export function progress(bracket, picks) {
  const groups = Object.keys(bracket.groups);
  const games = bracket.rounds.reduce((n, r) => n + r.matches.length, 0);
  const hasThirds = bracket.format.thirds ? 1 : 0;
  const ranked = groups.filter((g) => finished(bracket, picks, g)).length;
  const thirdsDone = hasThirds && (picks.thirds || []).length === bracket.format.thirds ? 1 : 0;
  const picked = resolve(bracket, picks).reduce((n, r) => n + r.matches.filter((m) => m.pick).length, 0);
  return { done: ranked + thirdsDone + picked, total: groups.length + hasThirds + games };
}

/** The browser script (/leagues/pickem.js): draws the bracket from the page's data block, keeps the picks on the device. */
export function pickemScript() {
  return `(function () {
  var root = document.getElementById("bracket"), data = document.getElementById("bracket-data");
  if (!root || !data) return;
  var B = JSON.parse(data.textContent);
  var KEY = "golboard.pickem." + B.id;
  var thirdsFor = ${thirdsFor.toString()};
  var sideLabel = ${sideLabel.toString()};
  var finished = ${finished.toString()};
  var resolve = ${resolve.toString()};
  var clean = ${clean.toString()};
  var progress = ${progress.toString()};
  function read() { try { return JSON.parse(window.localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function save() { try { window.localStorage.setItem(KEY, JSON.stringify(picks)); } catch (e) {} }
  var picks = clean(B, read() || {}), tab = 0, armed = false;
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var name = function (t) { return B.names[t] || t; };
  var groups = Object.keys(B.groups);
  var TABS = ["Groups"].concat(B.rounds.map(function (r) { return r.name; }));
  function groupsDone() { return groups.every(function (g) { return finished(B, picks, g); }); }
  function tabCount(i, rounds) {
    if (i === 0) return groups.filter(function (g) { return finished(B, picks, g); }).length + " of " + groups.length;
    var ms = rounds[i - 1].matches, n = ms.filter(function (m) { return m.pick; }).length;
    return n ? n + " of " + ms.length : "\\u2014";
  }
  function groupCard(g) {
    var order = picks.groups[g] || [], all = B.groups[g];
    var rest = all.filter(function (t) { return order.indexOf(t) < 0; });
    var note = finished(B, picks, g) ? "Done" : order.length ? "Next: who finishes " + ["1st", "2nd", "3rd", "4th"][order.length] + "?" : "Tap the teams in finishing order";
    var rows = order.concat(rest).map(function (t) {
      var at = order.indexOf(t), place = at + 1;
      var state = at < 0 ? "" : place <= B.format.advance ? "through" : place === 3 && B.format.thirds ? "third" : "out";
      var word = { through: "Through", third: "Maybe", out: "Out" }[state] || "";
      return '<button type="button" class="pick ' + state + '" data-team="' + esc(t) + '"' + (at >= 0 ? ' data-rank="' + place + '"' : "") + ">"
        + '<span class="rank">' + (at >= 0 ? place : "") + '</span><span class="code">' + esc(t) + "</span><span class=\\"name\\">" + esc(name(t)) + '</span><span class="st">' + word + "</span></button>";
    }).join("");
    return '<div class="card" data-group="' + esc(g) + '"><h3>Group ' + esc(g) + "<span>" + note + "</span></h3>" + rows + "</div>";
  }
  function thirdsCard() {
    if (!B.format.thirds) return "";
    if (!groupsDone()) return '<p class="note">Rank every group, then pick the ' + B.format.thirds + " best third-placed teams.</p>";
    var rows = groups.map(function (g) {
      var t = picks.groups[g][2], on = picks.thirds.indexOf(g) >= 0;
      return '<button type="button" class="pick' + (on ? " through" : "") + '" data-third="' + esc(g) + '" aria-pressed="' + on + '"><span class="rank">' + (on ? "\\u2713" : "")
        + '</span><span class="code">' + esc(t) + '</span><span class="name">' + esc(name(t)) + '</span><span class="st">3rd in ' + esc(g) + "</span></button>";
    }).join("");
    return '<div class="card" id="thirds"><h3>Best third places<span>' + picks.thirds.length + " of " + B.format.thirds + "</span></h3>" + rows + "</div>";
  }
  function matchCard(m) {
    var open = m.a.team && m.b.team;
    var row = function (s) {
      if (!s.team) return '<div class="pick tbd"><span class="name">' + esc(s.label) + "</span></div>";
      var state = m.pick ? (m.pick === s.team ? "through" : "out") : "";
      return '<button type="button" class="pick ' + state + '" data-team="' + esc(s.team) + '"><span class="code">' + esc(s.team) + '</span><span class="name">' + esc(name(s.team))
        + '</span><span class="st">' + (m.pick === s.team ? "Your pick" : esc(s.label)) + "</span></button>";
    };
    return '<div class="card" data-match="' + esc(m.id) + '"><h3>' + esc(m.title) + "<span>" + (m.pick ? "" : open ? "Tap a team" : "Waiting on earlier picks") + "</span></h3>" + row(m.a) + row(m.b) + "</div>";
  }
  function render() {
    var rounds = resolve(B, picks), p = progress(B, picks);
    var tabs = TABS.map(function (t, i) {
      return '<button type="button" data-tab="' + i + '" aria-pressed="' + (i === tab) + '">' + esc(t) + "<small>" + tabCount(i, rounds) + "</small></button>";
    }).join("");
    var body;
    if (tab === 0) body = groups.map(groupCard).join("") + thirdsCard();
    else body = rounds[tab - 1].matches.map(function (m, i) { m.title = rounds[tab - 1].name + " \\u00b7 game " + (i + 1); return matchCard(m); }).join("");
    var fin = rounds[rounds.length - 1].matches[0];
    var champ = fin && fin.pick ? '<p id="champion">\\u2605 Your champion: ' + esc(name(fin.pick)) + "</p>" : "";
    var nextTab = tab < TABS.length - 1 ? '<button type="button" class="cta" data-tab="' + (tab + 1) + '">Next: ' + esc(TABS[tab + 1]) + " \\u2192</button>" : "";
    root.innerHTML = '<div class="tabs" role="group" aria-label="Rounds">' + tabs + "</div>"
      + '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + p.total + '" aria-valuenow="' + p.done + '"><i style="width: ' + Math.round((p.done / p.total) * 100) + '%"></i></div>'
      + champ + body
      + '<div class="foot"><span class="note">' + p.done + " of " + p.total + " picked</span>" + nextTab + "</div>"
      + '<button type="button" id="start-over" class="quiet">' + (armed ? "Tap again to clear every pick" : "Start over") + "</button>";
  }
  function set(next) { picks = clean(B, next); save(); render(); }
  root.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("button") : null;
    if (!el || !root.contains(el)) return;
    if (el.id === "start-over") {
      if (armed) { armed = false; set({ groups: {}, thirds: [], ko: {} }); } else { armed = true; render(); }
      return;
    }
    armed = false;
    if (el.hasAttribute("data-tab")) { tab = Number(el.getAttribute("data-tab")); render(); if (root.scrollIntoView && el.className === "cta") root.scrollIntoView(); return; }
    var next = JSON.parse(JSON.stringify(picks));
    var card = el.closest("[data-group],[data-match]");
    if (el.hasAttribute("data-third")) {
      var g = el.getAttribute("data-third"), at = next.thirds.indexOf(g);
      if (at >= 0) next.thirds.splice(at, 1); else if (next.thirds.length < B.format.thirds) next.thirds.push(g);
    } else if (card && card.hasAttribute("data-group")) {
      var grp = card.getAttribute("data-group"), t = el.getAttribute("data-team"), order = next.groups[grp] || [];
      var i = order.indexOf(t);
      if (i >= 0) order = order.slice(0, i);
      else {
        order = order.concat([t]);
        var left = B.groups[grp].filter(function (x) { return order.indexOf(x) < 0; });
        if (left.length === 1) order.push(left[0]);
      }
      next.groups[grp] = order;
    } else if (card && card.hasAttribute("data-match")) {
      var id = card.getAttribute("data-match"), team = el.getAttribute("data-team");
      if (next.ko[id] === team) delete next.ko[id]; else next.ko[id] = team;
    } else return;
    set(next);
  });
  render();
})();
`;
}
