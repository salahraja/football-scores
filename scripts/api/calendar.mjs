// A calendar feed per team (Salah, 2026-11-14): /api/v1/calendar/<team>.ics, every game the team plays in every competition we carry.
// Subscribed with webcal://, a phone re-reads it on its own. Kick-offs are written in UTC so each phone shows its own time. Titles never
// carry a score: a calendar says when, and people who watch later should not meet the result there.

const CRLF = "\r\n";
const HOURS = 2;  // a game and its half-time, near enough to block out the time

/** RFC 5545 text: backslash, semicolon, comma and newline escaped. */
const text = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Fold a content line at 75 octets, continuation lines starting with one space, never splitting a character. */
function fold(line) {
  const out = [];
  let cur = "", size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (size + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; size = 0; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join(`${CRLF} `);
}

const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function event(m, competition, teams, now, site) {
  const lines = ["BEGIN:VEVENT", `UID:${m.id}@golboard`, `DTSTAMP:${stamp(new Date(now))}`];
  if (m.kickoff) {
    const start = new Date(m.kickoff);
    lines.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(new Date(start.getTime() + HOURS * 3_600_000))}`);
  } else {
    const day = m.date.replace(/-/g, "");
    const next = new Date(Date.parse(`${m.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
    lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`);
  }
  lines.push(`SUMMARY:${text(`${teams[m.home] ?? m.home} v ${teams[m.away] ?? m.away}`)}`,
    `DESCRIPTION:${text(`${competition}${m.round ? ` · ${/^\d+$/.test(m.round) ? `matchday ${m.round}` : m.round}` : ""}${m.kickoff ? "" : " · time not set yet"}`)}`,
    `URL:${site}/`, "END:VEVENT");
  return lines;
}

/**
 * @param {{ current: Map<string, { matches: any[], teams: Record<string, string> }>, names: Record<string, string>, now: string, site: string }} input
 * @returns {Map<string, string>} path -> the .ics text
 */
export function teamCalendars({ current, names, now, site }) {
  const games = new Map();  // team id -> [{ m, competition, teams }]
  const named = new Map();  // team id -> name
  for (const [id, { matches, teams }] of current) {
    for (const m of matches) {
      for (const side of [m.home, m.away]) {
        if (!teams[side]) continue;
        named.set(side, teams[side]);
        if (!games.has(side)) games.set(side, []);
        games.get(side).push({ m, competition: names[id] ?? id, teams });
      }
    }
  }
  const files = new Map();
  for (const [team, list] of [...games].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => (a.m.kickoff ? new Date(a.m.kickoff).toISOString() : a.m.date).localeCompare(b.m.kickoff ? new Date(b.m.kickoff).toISOString() : b.m.date));
    const name = named.get(team).replace(/,\s*FC$/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//golboard//team calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      `X-WR-CALNAME:${text(`${name} · golboard`)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
      ...list.flatMap(({ m, competition, teams }) => event(m, competition, teams, now, site)), "END:VCALENDAR"];
    files.set(`api/v1/calendar/${team}.ics`, lines.map(fold).join(CRLF) + CRLF);
  }
  return files;
}
