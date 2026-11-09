// Club colours for the poster (Salah, 2026-11-08: "the gradient in the background change based on the team colors of the 2 teams as you
// go past the different fixtures"). Serie A first. Each club's home-shirt colour; the poster mixes it with its own slate (CLUB_SHARE) so
// the names and score stay readable in light and dark (tests/club-colours.test.ts checks every club in both).
export const SERIE_A: Record<string, string> = {
  atalanta: "#1e71b8",
  bologna: "#a21c26",
  cagliari: "#a0001f",
  como: "#003da5",
  fiorentina: "#482e92",
  frosinone: "#f2c500",
  genoa: "#a6192e",
  inter: "#0068a8",
  juventus: "#111111",
  lazio: "#87c8ee",
  lecce: "#e8c400",
  milan: "#d8090b",
  monza: "#e4002b",
  napoli: "#12a0d7",
  parma: "#f0c400",
  roma: "#8e1f2f",
  sassuolo: "#00a752",
  torino: "#8a1e03",
  udinese: "#1a1a1a",
  venezia: "#f18a00",
};

// How much of the club's colour goes into the poster, by colour scheme: enough to read as the club, not so much the text gets lost.
export const CLUB_SHARE = { light: 0.32, dark: 0.5 } as const;

const ALIASES: Record<string, string> = { "internazionale": "inter", "ac milan": "milan", "as roma": "roma", "ssc napoli": "napoli",
  "acf fiorentina": "fiorentina", "ss lazio": "lazio", "us lecce": "lecce", "genoa cfc": "genoa", "parma calcio": "parma",
  "torino fc": "torino", "udinese calcio": "udinese", "venezia fc": "venezia", "como 1907": "como", "us sassuolo": "sassuolo",
  "bologna fc": "bologna", "cagliari calcio": "cagliari", "ac monza": "monza", "frosinone calcio": "frosinone", "atalanta bc": "atalanta" };

function key(name: string): string {
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (ALIASES[plain]) return ALIASES[plain];
  const bare = plain.replace(/^(ac|as|ss|ssc|us|acf|fc|bc|cfc) /, "").replace(/ (fc|calcio|bc|cfc|1907)$/, "");
  return ALIASES[bare] ?? bare;
}

/** A club's colour, or null when we have none for it (the poster keeps its own slate there). */
export function clubColour(name: string | undefined | null): string | null {
  return name ? SERIE_A[key(name)] ?? null : null;
}
