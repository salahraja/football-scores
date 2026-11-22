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
  "bologna fc": "bologna", "cagliari calcio": "cagliari", "ac monza": "monza", "frosinone calcio": "frosinone", "atalanta bc": "atalanta",
  // the live feed's and the press's names for clubs outside Serie A (looked up after the noise words are dropped)
  "stade rennais": "rennes", "az alkmaar": "az", "twente enschede": "twente", "bayern munchen": "bayern munich", "psv": "psv eindhoven",
  "man united": "manchester united", "man utd": "manchester united", "man city": "manchester city", "spurs": "tottenham hotspur",
  "wolves": "wolverhampton wanderers", "psg": "paris saint germain", "atletico de madrid": "atletico madrid", "athletic club": "athletic bilbao",
  "olympique lyonnais": "lyon", "olympique de marseille": "marseille", "brighton": "brighton hove albion", "west brom": "west bromwich albion",
  "qpr": "queens park rangers", "sheffield utd": "sheffield united", "newcastle": "newcastle united", "tottenham": "tottenham hotspur" };

// Words that only say what kind of club it is ("FC", "SV", "Calcio") and years or numbers ("1907", "1.", "05"): the live feed and the
// API spell the same club with different ones ("1. FSV Mainz 05" and "Mainz 05"), so both sides drop them before looking up.
const NOISE = new Set(["fc", "cf", "afc", "sc", "sco", "sv", "fsv", "tsg", "ca", "ac", "as", "ss", "ssc", "us", "acf", "bc", "cfc", "calcio",
  "rc", "ogc", "losc", "cd", "rcd", "ud", "sd", "sad"]);

function key(name: string): string {
  const plain = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (ALIASES[plain]) return ALIASES[plain];
  const bare = plain.split(" ").filter((w) => !NOISE.has(w) && !/^\d+$/.test(w)).join(" ");
  return ALIASES[bare] ?? bare;
}

// The other leagues on Home (Salah, 2026-11-22: "Only Serie A still only does the gradient"), by the API's names: each club's
// home-shirt colour, or the darker colour of its kit where the shirt is white, so the names stay readable. A club we could not
// confirm is left out (tests/club-colours.test.ts, UNSURE) and keeps the slate.
const OTHERS: Record<string, string> = {
  // Premier League
  Arsenal: "#ef0107", "Aston Villa": "#670e36", Bournemouth: "#da291c", Brentford: "#e30613", "Brighton & Hove Albion": "#0057b8",
  Chelsea: "#034694", "Coventry City": "#59cbe8", "Crystal Palace": "#1b458f", Everton: "#003399", Fulham: "#1a1a1a", "Hull City": "#f5a12d",
  "Ipswich Town": "#0044a9", "Leeds United": "#1d428a", Liverpool: "#c8102e", "Manchester City": "#6cabdd", "Manchester United": "#da291c",
  "Newcastle United": "#241f20", "Nottingham Forest": "#dd0000", Sunderland: "#eb172b", "Tottenham Hotspur": "#132257",
  // LaLiga
  "Alavés": "#0761af", "Athletic Bilbao": "#ee2523", "Atlético Madrid": "#cb3524", Barcelona: "#a50044", "Celta Vigo": "#8ac3ee",
  "Deportivo A Coruña": "#1b4b9b", Elche: "#05642c", Espanyol: "#007fc8", Getafe: "#005999", Levante: "#b4053f", "Málaga": "#00529f",
  Osasuna: "#d91a21", "Racing Santander": "#00843d", "Rayo Vallecano": "#e53027", "Real Betis": "#00954c", "Real Madrid": "#00529f",
  "Real Sociedad": "#0067b1", Sevilla: "#d81920", Valencia: "#ee8707", Villarreal: "#f5d200",
  // Bundesliga
  "1. FC Köln": "#ed1c24", "Bayer Leverkusen": "#e32221", "Bayern Munich": "#dc052d", "Borussia Dortmund": "#f9dc00",
  "Borussia Mönchengladbach": "#00a650", "Eintracht Frankfurt": "#e1000f", "FC Augsburg": "#ba3733", "Hamburger SV": "#0a3f86",
  "Mainz 05": "#c3141e", "RB Leipzig": "#dd0741", "SC Freiburg": "#e2001a", "SC Paderborn": "#005ca9", "SV Elversberg": "#1a1a1a",
  "Schalke 04": "#004d9d", "TSG Hoffenheim": "#1c63b7", "Union Berlin": "#eb1923", "VfB Stuttgart": "#e32219", "Werder Bremen": "#1d9053",
  // Ligue 1
  Angers: "#1a1a1a", Auxerre: "#0054a6", Brest: "#e30613", "Le Havre": "#87c8ee", "Le Mans": "#e30613", Lens: "#f5c300", Lille: "#e01e13",
  Lorient: "#f37021", Lyon: "#1d3c8f", Marseille: "#2faee0", Monaco: "#e7192b", Nice: "#c8102e", "Paris FC": "#002f6c",
  "Paris Saint-Germain": "#004170", Rennes: "#e13327", Strasbourg: "#009fe3", Toulouse: "#6a3c97", Troyes: "#1d4f91",
  // Eredivisie
  "ADO Den Haag": "#00813d", AZ: "#db0021", Ajax: "#d2122e", Cambuur: "#f5c400", Excelsior: "#e30613", Feyenoord: "#d90000",
  "Fortuna Sittard": "#f6c900", "Go Ahead Eagles": "#c8102e", Groningen: "#00843d", Heerenveen: "#0067b1", NEC: "#d6001c",
  "PEC Zwolle": "#0055a5", "PSV Eindhoven": "#e30613", "Sparta Rotterdam": "#d80027", Twente: "#e30613", Utrecht: "#e30613",
  "Willem II": "#c8102e",
  // Primeira Liga
  Arouca: "#f5c400", Benfica: "#e83030", Braga: "#e30613", "Casa Pia": "#1a1a1a", "Estoril Praia": "#f5c400",
  "Estrela da Amadora": "#e30613", "Famalicão": "#0055a4", "Gil Vicente": "#e30613", "Marítimo": "#00843d", Moreirense: "#00843d",
  Nacional: "#1a1a1a", Porto: "#003f87", "Rio Ave": "#00843d", "Santa Clara": "#e30613", "Sporting CP": "#008057",
  "Vitória de Guimarães": "#1a1a1a",
  // Championship
  "Birmingham City": "#1d4c9b", "Blackburn Rovers": "#009ee0", "Bolton Wanderers": "#263c7e", "Bristol City": "#e21b23", Burnley: "#6c1d45",
  "Cardiff City": "#0070b5", "Charlton Athletic": "#d4021d", "Derby County": "#1a1a1a", "Lincoln City": "#e30613", Middlesbrough: "#e11b22",
  Millwall: "#001d5e", "Norwich City": "#00a650", Portsmouth: "#001489", "Preston North End": "#13274f", "Queens Park Rangers": "#1d5ba4",
  "Sheffield United": "#ee2737", Southampton: "#d71920", "Stoke City": "#e03a3e", "Swansea City": "#1a1a1a", Watford: "#f5c400",
  "West Bromwich Albion": "#122f67", "West Ham United": "#7a263a", "Wolverhampton Wanderers": "#fdb913", Wrexham: "#d71920",
};

/** Every club we have a colour for, by the looked-up name. */
export const COLOURS: Record<string, string> = { ...SERIE_A, ...Object.fromEntries(Object.entries(OTHERS).map(([name, c]) => [key(name), c])) };

/** A club's colour, or null when we have none for it (the poster keeps its own slate there). */
export function clubColour(name: string | undefined | null): string | null {
  return name ? COLOURS[key(name)] ?? null : null;
}
