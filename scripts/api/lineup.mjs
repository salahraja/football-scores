// Both lineups on one pitch in their formations (the goal, Salah 2026-11-28: FotMob, SofaScore and OneFootball all draw them). ESPN gives
// each starter a position ("CD-L", "LB", "AM-R", "F") and each side a formation ("4-3-3"): the rows come from the formation, the order
// from how deep each position plays, and left to right from the position's L or R. It is our reading of ESPN's labels, said on the page.
import { lines } from "./gamepage.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const L = 105, W = 68;

/** How deep a position plays: 0 the goalkeeper, then defence, defensive midfield, midfield, attacking midfield, wide forwards, forwards. */
function depth(pos) {
  const p = String(pos ?? "").toUpperCase();
  if (p === "G" || p === "GK") return 0;
  if (/^(CD|CB|SW|D)(-|$)|^(LB|RB)$/.test(p)) return 1;
  if (/^(LWB|RWB)$/.test(p)) return 2.5;
  if (/^DM/.test(p)) return 2;
  if (/^(CM|LM|RM|M)(-|$)/.test(p)) return 3;
  if (/^AM/.test(p)) return 4;
  if (/^(LW|RW)$/.test(p)) return 4.5;
  return 5;  // F, CF, CF-L, LF, RF, ST and anything unknown: up front
}
/** Across the pitch from the team's own left: 0 a wide left player (LB, LWB, LM, LW, LF), 1 left of centre ("-L"), 2 central, 3 right of
 *  centre ("-R"), 4 wide right. */
const side = (pos) => { const p = String(pos ?? "").toUpperCase();
  return /^L(B|WB|M|W|F)$/.test(p) ? 0 : /-L$/.test(p) ? 1 : /-R$/.test(p) ? 3 : /^R(B|WB|M|W|F)$/.test(p) ? 4 : 2; };

/** A side's starters in rows: [goalkeeper], then one row per number of the formation from the back, each left to right. Null when the
 *  formation is missing or its numbers do not add up to the outfield starters. */
export function lineupRows(starters, formation) {
  const counts = String(formation ?? "").split("-").map(Number).filter((n) => n > 0);
  const keeper = starters.filter((p) => depth(p.position) === 0);
  const outfield = starters.filter((p) => depth(p.position) > 0).sort((a, b) => depth(a.position) - depth(b.position) || side(a.position) - side(b.position) || (a.number ?? 99) - (b.number ?? 99));
  if (!counts.length || keeper.length !== 1 || counts.reduce((a, b) => a + b, 0) !== outfield.length) return null;
  const rows = [keeper];
  let at = 0;
  for (const n of counts) { rows.push(outfield.slice(at, at + n).sort((a, b) => side(a.position) - side(b.position) || (a.number ?? 99) - (b.number ?? 99))); at += n; }
  return rows;
}

/** Both starting elevens on one pitch: home on the left half attacking right, away on the right half attacking left. Empty when either
 *  side cannot be drawn. */
export function lineupPitch(game, names) {
  const sides = ["home", "away"].map((s) => lineupRows(game.players.filter((p) => p.side === s && p.starter), game[s]?.formation));
  if (sides.some((r) => !r)) return "";
  const men = sides.flatMap((rows, k) => {
    const s = k ? "away" : "home";
    return rows.flatMap((row, r) => row.map((p, i) => {
      // the keeper on the line; the outfield from 17 m to 44 m, or 47 m for a four-line shape so its rows are 10 m apart
      const span = rows.length - 1 >= 4 ? 30 : 27;
      const depthX = r === 0 ? 3.5 : 17 + ((r - 1) * span) / Math.max(1, rows.length - 2);
      const x = s === "home" ? depthX : L - depthX;
      const along = ((i + 1) * W) / (row.length + 1);  // the team's left first: the top for home (attacking right), the bottom for away
      const y = s === "home" ? along : W - along;
      const surname = p.name.split(/\s+/).slice(-1)[0];
      return `<g class="man ${s}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><title>${esc(`${p.name}${p.number !== null ? `, ${p.number}` : ""}${p.position ? `, ${p.position}` : ""}`)}</title>`
        + `<circle r="2.7"/><text class="num" y="1">${p.number ?? ""}</text><text class="nm" y="5.6">${esc(surname)}</text></g>`;
    }));
  });
  const said = `${names.home} ${game.home.formation} against ${names.away} ${game.away.formation}`;
  return `<svg class="pitch lineup" viewBox="-7 -2 ${L + 14} ${W + 4}" role="img" aria-labelledby="lineup-t"><title id="lineup-t">${esc(said)}</title>${lines()}${men.join("")}</svg>`;
}
