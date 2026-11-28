// One game in detail (api/v1/<league>/<season>/games/*.json, from ESPN's feeds): the body of its page, with a shot map and touch maps
// drawn as inline SVG when the page is built. No script; colours come from CSS classes, so the dark theme works; each map has a title,
// a description, and the numbers in text beside it. Lengths are metres on a 105 x 68 pitch. Node only, no dependencies.
import { ZONES } from "./espn.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const L = 105, W = 68;
const f = (n) => Number(n.toFixed(2));
// a side's position (percent, its own team attacking toward x = 100, y = 0 its right touchline) on a pitch drawn with home attacking
// right: facing right, a team's right touchline is the bottom edge; the away side is turned round
const at = (side, x, y) => (side === "home" ? [f((x / 100) * L), f(W - (y / 100) * W)] : [f(L - (x / 100) * L), f((y / 100) * W)]);

/** The pitch's lines: touchlines, halfway, centre circle, both boxes, six-yard boxes, spots and goals. */
export function lines() {
  const box = (x0, d, w) => `<rect x="${x0}" y="${f((W - w) / 2)}" width="${d}" height="${w}"/>`;
  return `<g class="pl"><rect x="0" y="0" width="${L}" height="${W}"/><line x1="${L / 2}" y1="0" x2="${L / 2}" y2="${W}"/>`
    + `<circle cx="${L / 2}" cy="${W / 2}" r="9.15"/>${box(0, 16.5, 40.32)}${box(L - 16.5, 16.5, 40.32)}${box(0, 5.5, 18.32)}${box(L - 5.5, 5.5, 18.32)}`
    + `<rect x="-1.5" y="${f(W / 2 - 3.66)}" width="1.5" height="7.32"/><rect x="${L}" y="${f(W / 2 - 3.66)}" width="1.5" height="7.32"/>`
    + `<circle class="spot" cx="11" cy="${W / 2}" r="0.3"/><circle class="spot" cx="${L - 11}" cy="${W / 2}" r="0.3"/></g>`;
}

const WORDS = { goal: "goal", saved: "saved", off: "off target", blocked: "blocked", post: "hit the woodwork" };
const xgText = (xg) => (xg === null ? "" : `, xG ${xg.toFixed(2)}`);

/** Every shot of the game on one pitch, home attacking right; a circle's area grows with its xG. */
export function shotMap(game, names, who) {
  const shots = [...game.shots].sort((a, b) => (b.xg ?? 0.05) - (a.xg ?? 0.05));  // big chances first, so small ones stay on top
  const dots = shots.map((s) => {
    const [cx, cy] = at(s.side, s.x, s.y);
    return `<circle class="shot ${s.side} ${s.outcome}" cx="${cx}" cy="${cy}" r="${f(0.9 + 3.4 * Math.sqrt(s.xg ?? 0.05))}"><title>${esc(`${s.minute} ${who(s.player)}: ${s.penalty ? "penalty, " : ""}${WORDS[s.outcome]}${xgText(s.xg)}`)}</title></circle>`;
  }).join("");
  const count = (side) => game.shots.filter((s) => s.side === side).length;
  return `<svg class="pitch shots" viewBox="-3 -6 111 80" role="img" aria-labelledby="shots-t shots-d"><title id="shots-t">Shots</title>`
    + `<desc id="shots-d">${esc(`${names.home} ${count("home")} shots, attacking right; ${names.away} ${count("away")}, attacking left. Each circle is a shot from where it was taken; bigger is a better chance.`)}</desc>`
    + `${lines()}<text class="end" x="${L}" y="-2" text-anchor="end">${esc(names.home)} →</text><text class="end" x="0" y="-2">← ${esc(names.away)}</text>${dots}</svg>`;
}

const AREA = [];
for (let c = 0; c < 6; c++) for (let r = 0; r < 5; r++)
  AREA.push(((ZONES.x[c + 1] - ZONES.x[c]) / 100) * L * ((ZONES.y[r + 1] - ZONES.y[r]) / 100) * W);

/** Touches by zone on a pitch attacking right: colour by touches per square metre against the map's busiest zone (five steps), the
 *  count printed in each zone. `id` keeps the title's id unique on the page. */
export function zoneMap(counts, label, id) {
  const total = counts.reduce((a, b) => a + b, 0);
  const density = counts.map((n, i) => n / AREA[i]);
  const top = Math.max(...density) || 1;
  // zones first, then the pitch's lines, then the counts on top (so a penalty spot never covers a number)
  const rects = [], numbers = [];
  counts.forEach((n, i) => {
    const c = Math.floor(i / 5), r = i % 5;
    const x0 = f((ZONES.x[c] / 100) * L), x1 = f((ZONES.x[c + 1] / 100) * L);
    const y0 = f(W - (ZONES.y[r + 1] / 100) * W), y1 = f(W - (ZONES.y[r] / 100) * W);
    const level = n ? Math.max(1, Math.ceil((5 * density[i]) / top)) : 0;
    rects.push(`<rect class="z${level}" x="${x0}" y="${y0}" width="${f(x1 - x0)}" height="${f(y1 - y0)}"/>`);
    if (n) numbers.push(`<text class="zt z${level}" x="${f((x0 + x1) / 2)}" y="${f((y0 + y1) / 2 + 1.5)}" text-anchor="middle">${n}</text>`);
  });
  const third = (a, b) => counts.slice(a * 5, b * 5).reduce((x, y) => x + y, 0);
  return `<svg class="pitch zones" viewBox="-3 -6 111 80" role="img" aria-labelledby="${id}-t ${id}-d"><title id="${id}-t">${esc(`${label}: ${total} touches`)}</title>`
    + `<desc id="${id}-d">${esc(`Attacking right. ${third(0, 2)} in their own third, ${third(2, 4)} in the middle third, ${third(4, 6)} in the final third.`)}</desc>`
    + `${rects.join("")}${lines()}${numbers.join("")}<text class="end" x="${L}" y="-2" text-anchor="end">Attack →</text></svg>`;
}

/** A minute as ESPN writes it ("23'", "45'+2'") as a number on the clock: 45 plus the added time. */
const minuteOf = (m) => { const [base, extra] = String(m ?? "").replace(/'/g, "").split("+"); return (Number(base) || 0) + (Number(extra) || 0); };

/** Match stats (2026-11-28, the goal: what FotMob and SofaScore show): ESPN's team stats as two-sided bars, each row said in words. */
function matchStats(stats, names) {
  if (!stats) return "";
  const pct = (h, a) => (h + a ? Math.round((100 * h) / (h + a)) : 50);
  const rows = [
    ["Possession", "possession", (v) => `${v}%`],
    ["Shots", "shots"], ["On target", "onTarget"], ["Corners", "corners"], ["Fouls", "fouls"], ["Offsides", "offsides"], ["Saves", "saves"],
    ["Passes completed", null, null, (s) => (s.passes === null || s.accuratePasses === null ? null : s.accuratePasses), (s) => `${s.accuratePasses} of ${s.passes}`],
    ["Tackles", "tackles"], ["Yellow cards", "yellow"], ["Red cards", "red"],
  ].map(([label, key, fmt = (v) => String(v), value, show]) => {
    const get = value ?? ((s) => s[key]);
    const h = get(stats.home), a = get(stats.away);
    if (h === null || h === undefined || a === null || a === undefined) return "";
    const text = show ?? ((s) => fmt(get(s)));
    const share = pct(h, a);
    return `<tr><td class="h">${esc(text(stats.home))}</td><th scope="row">${label}</th><td class="a">${esc(text(stats.away))}</td></tr>
<tr class="bar" aria-hidden="true"><td colspan="3"><div class="bars"><span class="b-home" style="width: ${share}%"></span><span class="b-away" style="width: ${100 - share}%"></span></div></td></tr>`;
  }).join("\n");
  return `<section class="glass" id="stats">
<h2>Match stats</h2>
<table class="standings sides matchstats"><caption>From ESPN's data.</caption>
<thead><tr><th scope="col">${esc(names.home)}</th><th scope="col"><span class="sr-only">Stat</span></th><th scope="col">${esc(names.away)}</th></tr></thead><tbody>
${rows}
</tbody></table>
</section>`;
}

/** The xG race: each side's expected goals added up shot by shot over the minutes, as two step lines, the goals marked on them. */
function xgRace(game, names) {
  const rated = game.shots.filter((x) => x.xg !== null), unrated = game.shots.length - rated.length;
  if (!rated.length) return "";
  const W = 100, H = 44, end = Math.max(90, ...game.shots.map((x) => minuteOf(x.minute)), ...game.events.map((e) => minuteOf(e.minute)));
  const steps = (s) => { let total = 0; const pts = [[0, 0]];
    for (const x of rated.filter((x) => x.side === s).sort((a, b) => minuteOf(a.minute) - minuteOf(b.minute))) { pts.push([minuteOf(x.minute), total]); total += x.xg; pts.push([minuteOf(x.minute), total]); }
    pts.push([end, total]); return { pts, total }; };
  const home = steps("home"), away = steps("away"), top = Math.max(1, home.total, away.total);
  const X = (m) => ((m / end) * W).toFixed(2), Y = (v) => (H - (v / top) * (H - 4)).toFixed(2);
  const path = (pts) => pts.map(([m, v], i) => `${i ? "L" : "M"}${X(m)} ${Y(v)}`).join(" ");
  const at = (pts, m) => { let v = 0; for (const [pm, pv] of pts) if (pm <= m) v = pv; return v; };
  const goals = game.events.filter((e) => ["goal", "penalty", "own-goal"].includes(e.kind) && (e.side === "home" || e.side === "away"))
    .map((e) => `<circle class="goalmark ${e.side}" cx="${X(minuteOf(e.minute))}" cy="${Y(at((e.side === "home" ? home : away).pts, minuteOf(e.minute)))}" r="1.3"><title>${esc(`${KIND[e.kind]}, ${e.minute} (${names[e.side]})`)}</title></circle>`).join("");
  const ticks = [45, 90].filter((m) => m <= end).map((m) => `<line class="tick" x1="${X(m)}" y1="0" x2="${X(m)}" y2="${H}"/><text class="end" x="${X(m)}" y="${H + 4}" text-anchor="middle">${m}'</text>`).join("");
  const said = `Expected goals race: ${names.home} ${home.total.toFixed(1)}, ${names.away} ${away.total.toFixed(1)}`;
  return `<section class="glass" id="race">
<h2>How the chances came</h2>
<p class="note">Each side's expected goals (ESPN's xG) added up shot by shot over the game; a dot is a goal. ${esc(names.home)} in red.</p>
<svg class="xgrace" viewBox="-2 -2 ${W + 4} ${H + 8}" role="img" aria-labelledby="race-t"><title id="race-t">${esc(said)}</title>${ticks}`
    + `<path class="race home" d="${path(home.pts)}"/><path class="race away" d="${path(away.pts)}"/>${goals}</svg>
<p class="note">${esc(names.home)} ${home.total.toFixed(1)} xG · ${esc(names.away)} ${away.total.toFixed(1)} xG${unrated ? ` · ${unrated === 1 ? "1 shot" : `${unrated} shots`} without an xG from ESPN not counted` : ""}</p>
import { lineupPitch } from "./lineup.mjs";

/** The two starting elevens on a pitch in their formations, and each bench (players who came on marked), or nothing when ESPN's
 *  positions and formations do not add up. */
function lineups(game, names) {
  const pitch = lineupPitch(game, names);
  if (!pitch) return "";
  const cameOn = new Set(game.events.filter((e) => e.kind === "sub" && e.player).map((e) => e.player));
  const bench = (s) => game.players.filter((p) => p.side === s && !p.starter).map((p) => `${p.number ?? ""} ${esc(p.name)}${cameOn.has(p.id) ? " ↑" : ""}`.trim());
  return `<section class="glass" id="lineups">
<h2>Lineups</h2>
${pitch}
<p class="note">${esc(names.home)} ${esc(game.home.formation)}, attacking right · ${esc(names.away)} ${esc(game.away.formation)}. Places are our reading of ESPN's positions.</p>
${["home", "away"].some((s) => bench(s).length) ? `<details><summary>Benches<span class="chev" aria-hidden="true">›</span></summary>
${["home", "away"].map((s) => (bench(s).length ? `<p class="note"><b>${esc(names[s])} bench:</b> ${bench(s).join(", ")}${bench(s).some((b) => b.endsWith("↑")) ? " (↑ came on)" : ""}</p>` : "")).join("\n")}
</details>` : ""}
</section>`;
}

const KIND = { goal: "Goal", penalty: "Penalty", "own-goal": "Own goal", yellow: "Yellow card", red: "Red card", sub: "Substitution" };

/** The page body below the poster: timeline, numbers, shot map, touch maps by side and by player. */
export function gameBody(game, names, { playerHref = () => null } = {}) {
  const byId = new Map(game.players.map((p) => [p.id, p]));
  const who = (id) => byId.get(id)?.name ?? "Unknown player";
  const timeline = game.events.map((e) => {
    const more = e.kind === "sub" ? ` on, ${esc(who(e.other))} off` : e.kind === "goal" && e.other ? ` <span class="note">(assist ${esc(who(e.other))})</span>` : "";
    return `<li class="ev ${e.side} ${e.kind}"><span class="min">${esc(e.minute)}</span><span><b>${KIND[e.kind]}</b> · ${esc(who(e.player))}${more}<span class="note"> · ${esc(names[e.side])}</span></span></li>`;
  }).join("\n");
  const side = (s, test = () => true) => game.shots.filter((x) => x.side === s && test(x));
  const onTarget = (x) => x.outcome === "goal" || x.outcome === "saved";
  const hasXg = game.shots.length && game.shots.every((x) => x.xg !== null);
  const xg = (s) => side(s).reduce((a, b) => a + b.xg, 0).toFixed(1);
  const row = (label, h, a) => `<tr><td>${h}</td><th scope="row">${label}</th><td>${a}</td></tr>`;
  const numbers = `<table class="standings sides"><caption>From ESPN's data.${hasXg ? " Expected goals (xG) are ESPN's." : ""}</caption>
<thead><tr><th scope="col">${esc(names.home)}</th><th scope="col"><span class="sr-only">Measure</span></th><th scope="col">${esc(names.away)}</th></tr></thead><tbody>
${row("Shots", side("home").length, side("away").length)}${row("On target", side("home", onTarget).length, side("away", onTarget).length)}${hasXg ? row("Expected goals", xg("home"), xg("away")) : ""}
</tbody></table>`;
  const shotRows = game.shots.map((s) => `<tr><td>${esc(s.minute)}</td><th scope="row" class="left">${esc(who(s.player))}<span class="club">${esc(names[s.side])}</span></th><td class="left">${s.penalty ? "Penalty, " : ""}${WORDS[s.outcome]}</td><td>${s.xg === null ? "–" : s.xg.toFixed(2)}</td></tr>`).join("\n");
  const sum = (ids) => Array.from({ length: 30 }, (_, i) => ids.reduce((a, id) => a + (game.touches[id]?.[i] ?? 0), 0));
  const ids = (s) => game.players.filter((p) => p.side === s && game.touches[p.id]).map((p) => p.id);
  const players = (s) => game.players.filter((p) => p.side === s && game.touches[p.id])
    .sort((a, b) => Number(b.starter) - Number(a.starter) || (a.number ?? 99) - (b.number ?? 99))
    .map((p) => { const n = game.touches[p.id].reduce((a, b) => a + b, 0);
      return `<details><summary>${p.number ?? ""} ${esc(p.name)} · ${p.position ? `${esc(p.position)} · ` : ""}${n} touches<span class="chev" aria-hidden="true">›</span></summary>${zoneMap(game.touches[p.id], p.name, `p${p.id}`)}${playerHref(p.id) ? `<p class="note"><a href="${playerHref(p.id)}">${esc(p.name)}'s season</a></p>` : ""}</details>`; }).join("\n");
  const positioned = game.positions ? `<section class="glass" id="shots">
<h2>Shots</h2>
${shotMap(game, names, who)}
<p class="note">Filled: goal. Thick ring: saved. Thin ring: off target. Dashed: blocked. Bigger circles were better chances.</p>
<details><summary>Every shot<span class="chev" aria-hidden="true">›</span></summary><table class="standings shotlist"><thead><tr><th scope="col">Min</th><th scope="col" class="left">Player</th><th scope="col" class="left">Result</th><th scope="col"><abbr title="Expected goals">xG</abbr></th></tr></thead><tbody>
${shotRows}
</tbody></table></details>
</section>
<section class="glass" id="touches">
<h2>Where they had the ball</h2>
<p class="note">On-ball touches counted in 30 zones of the pitch, each side attacking right. The more a zone stands out, the more touches it had per square metre; the number is the count.</p>
${["home", "away"].map((s) => `<h3>${esc(names[s])}</h3>
${zoneMap(sum(ids(s)), names[s], `t${s}`)}
${players(s)}`).join("\n")}
</section>` : `<section class="glass"><p class="note">ESPN has no positions for this game, so there is no shot map or touch map.</p></section>`;
  return `${lineups(game, names)}
<section class="glass" id="timeline">
<h2>Timeline</h2>
<ol class="timeline">
${timeline || '<li class="note">No goals or cards.</li>'}
</ol>
${numbers}
</section>
${matchStats(game.stats, names)}
${xgRace(game, names)}
${positioned}`;
}

/** The CSS these pages add to /leagues/site.css. */
export const GAME_CSS = `
.poster h1 .score { white-space: nowrap; }
.timeline { list-style: none; margin: 0 0 1rem; padding: 0; } .timeline li { display: grid; grid-template-columns: 3.2rem 1fr; gap: 0.5rem; padding: 7px 0; border-bottom: 1px solid var(--line); }
.timeline .min { font: 800 1.05rem var(--display); color: var(--muted); }
.sides { text-align: center; } .sides th[scope="row"] { color: var(--muted); font-weight: 600; text-align: center; }
.pitch { display: block; width: 100%; height: auto; margin: 0.5rem 0; }
.pitch .pl rect, .pitch .pl line, .pitch .pl circle { fill: none; stroke: var(--muted); stroke-width: 0.3; } .pitch .pl .spot { fill: var(--muted); }
.pitch .end { font: 600 3.6px var(--sans); fill: var(--muted); }
.matchstats td.h, .matchstats td.a { font-weight: 700; } .matchstats tr.bar td { padding: 0 0 6px; border: 0; }
.matchstats .bars { display: flex; gap: 3px; width: 100%; } .matchstats .b-home, .matchstats .b-away { display: block; height: 6px; border-radius: 3px; }
.matchstats .b-home { background: var(--accent); } .matchstats .b-away { background: var(--muted); }
.xgrace { width: 100%; height: auto; display: block; } .xgrace .race { fill: none; stroke-width: 0.8; stroke-linejoin: round; }
.xgrace .race.home { stroke: var(--accent); } .xgrace .race.away { stroke: var(--fg); } .xgrace .tick { stroke: var(--line); stroke-width: 0.3; stroke-dasharray: 1 1; }
.xgrace .goalmark.home { fill: var(--accent); } .xgrace .goalmark.away { fill: var(--fg); } .xgrace text.end { font: 600 3.4px var(--sans); fill: var(--muted); }
.lineup .man circle { stroke-width: 0.35; } .lineup .man.home circle { fill: var(--accent); stroke: #fff; } .lineup .man.away circle { fill: var(--fg); stroke: var(--bg); }
.lineup .man text { text-anchor: middle; font-family: var(--sans); } .lineup .num { font-size: 2.6px; font-weight: 800; dominant-baseline: middle; }
.lineup .man.home .num { fill: #fff; } .lineup .man.away .num { fill: var(--bg); } .lineup .nm { font-size: 2.25px; font-weight: 600; fill: var(--fg); }
.shot { stroke-width: 0.45; fill: none; } .shot.home { stroke: var(--accent); } .shot.away { stroke: var(--fg); }
.shot.goal.home { fill: var(--accent); } .shot.goal.away { fill: var(--fg); } .shot.saved { stroke-width: 1; } .shot.blocked { stroke-dasharray: 0.9 0.6; }
.pitch .z0 { fill: transparent; } .pitch .z1 { fill: #f8d9d4; } .pitch .z2 { fill: #f3aca2; } .pitch .z3 { fill: #e57669; } .pitch .z4 { fill: #ca382f; } .pitch .z5 { fill: #8a1714; }
.pitch text.zt { font: 700 4.2px var(--sans); fill: #1b1c20; stroke: none; } .pitch text.zt.z4, .pitch text.zt.z5 { fill: #fff; }
@media (prefers-color-scheme: dark) {
  .pitch .z1 { fill: #57322d; } .pitch .z2 { fill: #843c35; } .pitch .z3 { fill: #b9473d; } .pitch .z4 { fill: #ed7668; } .pitch .z5 { fill: #fcc0b8; }
  .pitch text.zt { fill: #eef0f3; } .pitch text.zt.z4, .pitch text.zt.z5 { fill: #1b1c20; }
}
#touches summary { font-weight: 600; }
.games .more { grid-column: 1 / -1; text-align: center; font-size: 0.8125rem; }
#my-players .player-last { display: block; color: var(--muted); font-size: 0.875rem; margin-top: 2px; }
`;
