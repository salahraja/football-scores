// League leaders from the "Season statistics" section of an English Wikipedia season page (CC BY-SA 4.0): the top scorers and, where
// the page has one, the goalkeepers' clean sheets. Each list is a wikitable:
//   ! Rank ! Player ! Club ! Goals                      the heads (on one line each, or with !!), in any order
//   |rowspan="5"|5                                      a tie: the rank and the count span the tied rows; the club may span rows too
//   |align="left"|{{#invoke:flag|icon|NED}} [[Donyell Malen]]
// with an {{updated|matches played 23 November 2026}} line above it (or none, or one with the date left blank). A table that is not what
// we expect gives no list rather than a wrong one; a closing row that spans columns ("Six players") names no one and is left out.
// Node only, no dependencies.

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** The page's "== Season statistics ==" (or "== Statistics ==") section up to the next level-two heading; "" when there is none. */
export function statsSection(text) {
  const start = text.match(/^==\s*(?:Season )?[Ss]tatistics\s*==[ \t]*$/m);
  if (!start) return "";
  const rest = text.slice(start.index + start[0].length);
  const end = rest.match(/^==[^=]/m);
  return text.slice(start.index, start.index + start[0].length + (end ? end.index : rest.length));
}

/** "2026-11-23" from an {{updated|...}} line's first value ("23 November 2026", "matches played 23 November 2026"); null without one. */
function updated(text) {
  const value = text.match(/\{\{\s*[Uu]pdated\s*\|([^|}]*)/)?.[1];
  if (value === undefined) return undefined;
  const m = value.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) : -1;
  return month < 0 ? null : `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Split at each top-level `sep` (not inside [[ ]] or {{ }}). */
function splitTop(text, sep) {
  const out = [];
  let depth = 0, from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("[[", i) || text.startsWith("{{", i)) { depth++; i++; continue; }
    if (text.startsWith("]]", i) || text.startsWith("}}", i)) { depth--; i++; continue; }
    if (depth === 0 && text.startsWith(sep, i)) { out.push(text.slice(from, i)); from = i + sep.length; i += sep.length - 1; }
  }
  out.push(text.slice(from));
  return out;
}

/** A cell's text and rowspan: `align="left" rowspan="2"| AC Milan` -> { text: "AC Milan", rowspan: 2 }. */
function cell(raw) {
  const parts = splitTop(raw, "|");
  const attrs = parts.length > 1 && !/\[\[|\{\{/.test(parts[0]) ? parts.shift() : "";
  return { text: clean(parts.join("|")), rowspan: Number(attrs.match(/rowspan\s*=\s*"?(\d+)/)?.[1] ?? 1),
    colspan: Number(attrs.match(/colspan\s*=\s*"?(\d+)/)?.[1] ?? 1) };
}

/** Plain text: flags and other templates off, links to their text, tags and bold off. */
export function clean(text) {
  let t = text.replace(/\{\{\s*(?:nobreak|nowrap|nobr)\s*\|([^{}|]*)\}\}/gi, "$1")
    .replace(/\{\{\s*sortname\s*\|([^{}|]*)\|([^{}|]*)[^{}]*\}\}/gi, "$1 $2");
  while (/\{\{[^{}]*\}\}/.test(t)) t = t.replace(/\{\{[^{}]*\}\}/g, "");
  return t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/<sup[^>]*>.*?<\/sup>/gi, "").replace(/<[^>]*>/g, " ")
    .replace(/'''?/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** The first wikitable in `text` as heads and rows of plain text, with rowspans filled in. */
function table(text) {
  const start = text.indexOf("{|");
  const end = text.indexOf("\n|}", start);
  if (start < 0 || end < 0) return null;
  const heads = [], rows = [];
  let current = null;
  for (const line of text.slice(start, end).split("\n").slice(1)) {
    if (line.startsWith("|-")) { current = null; continue; }
    if (line.startsWith("|+")) continue;
    if (line.startsWith("!")) { heads.push(...line.slice(1).split("!!").map((h) => cell(h).text)); continue; }
    if (line.startsWith("|")) {
      if (!current) rows.push((current = []));
      current.push(...splitTop(line.slice(1), "||").map(cell));
    } else if (current && line.trim()) current[current.length - 1].text = clean(`${current.at(-1).text} ${line}`);
  }
  // fill in each column a rowspan carries down
  // a row with a cell across columns sums up the rest ("8 | Six players | 2"): it names no one, so it is left out
  const carry = [];
  const grid = rows.filter((cells) => cells.every((c) => c.colspan === 1)).map((cells) => {
    const out = [];
    for (let col = 0; col < heads.length; col++) {
      if (carry[col]?.left > 0) { out.push(carry[col].text); carry[col].left--; continue; }
      const c = cells.shift();
      if (!c) break;
      out.push(c.text);
      if (c.rowspan > 1) carry[col] = { text: c.text, left: c.rowspan - 1 };
    }
    return out;
  });
  return { heads, grid };
}

/** One list ({ asOf, rows: [{ rank, player, club, value }] }) from a subsection, or null when its table is not a leaders table. */
function list(body, value, asOfAbove) {
  const own = updated(body.slice(0, Math.max(0, body.indexOf("{|"))));
  const t = table(body.replace(/<!--[\s\S]*?-->/g, "").replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, ""));
  if (!t) return null;
  const col = (re) => t.heads.findIndex((h) => re.test(h));
  const at = { rank: col(/^(rank|pos)/i), player: col(/player|name/i), club: col(/club|team/i), value: col(value) };
  if (Object.values(at).some((i) => i < 0) || !t.grid.length) return null;
  const rows = [];
  for (const r of t.grid) {
    const row = { rank: Number(r[at.rank]), player: r[at.player] ?? "", club: r[at.club] ?? "", value: Number(r[at.value]) };
    if (!Number.isInteger(row.rank) || !Number.isInteger(row.value) || row.rank < 1 || row.value < 0 || !row.player || !row.club) return null;
    rows.push(row);
  }
  return { asOf: own === undefined ? asOfAbove : own, rows };
}

/** { goals, cleanSheets }: each a list or null, from a page's statistics section (statsSection). */
export function parseLeaders(section) {
  const parts = section.split(/^===\s*([^=\n]+?)\s*===[ \t]*$/m);
  const asOf = updated(parts[0]) ?? null;
  const out = { goals: null, cleanSheets: null };
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i], body = parts[i + 1];
    if (!out.goals && /top (goal)?scorers/i.test(heading)) out.goals = list(body, /goals/i, asOf);
    if (!out.cleanSheets && /clean sheets/i.test(heading)) out.cleanSheets = list(body, /clean/i, asOf);
  }
  return out;
}
