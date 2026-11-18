// Hide scores (Salah, 2026-11-14: "spoiler-free mode (scores hidden until tapped, per team)"). The homepage reads the same two lists
// as the league pages' script (scripts/api/pages.mjs, hideScript): the clubs whose scores are hidden, kept on the device, and the
// games and headlines shown this visit, kept for the tab. A league page writes a game shown as "home away date", the homepage as
// "home away" (it does not always know the day), and either counts for both.
export const HIDE = "golboard.hideScores";
export const SHOWN = "golboard.shown";

function store(kind: "localStorage" | "sessionStorage"): Storage | null {
  try { return window[kind]; } catch { return null; }
}
function list(kind: "localStorage" | "sessionStorage", key: string): string[] {
  try {
    const v: unknown = JSON.parse(store(kind)?.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const loadHidden = () => list("localStorage", HIDE);
export const loadShown = () => list("sessionStorage", SHOWN);
export function saveShown(shown: string[]) {
  try { store("sessionStorage")?.setItem(SHOWN, JSON.stringify(shown)); } catch { /* shown for this page only */ }
}

export const gameKey = (home: string, away: string) => `${home} ${away}`;
export const storyKey = (url: string) => `story ${url}`;

/** Whether a game's score gives way to a Show button: one of its clubs is hidden, it has a score or a state to give away (a kick-off
 *  time is no secret), and it was not shown this visit, on this page or a league page. */
export function covered(hidden: string[], shown: string[], home: string, away: string, givesAway: boolean): boolean {
  if (!givesAway || !(hidden.includes(home) || hidden.includes(away))) return false;
  return !shown.some((k) => {
    const [h, a] = k.split(" ");
    return h === home && a === away;
  });
}

/** Whether a headline is covered: it names a hidden club and was not shown this visit. */
export function storyCovered(hidden: string[], shown: string[], clubs: string[], url: string): boolean {
  return clubs.some((c) => hidden.includes(c)) && !shown.includes(storyKey(url));
}

/** Run in the page's head, before anything is drawn (Page.astro): a device that hides any club gets the "hiding" mark, and the
 *  homepage keeps its scores and headlines out of sight until it has read which clubs (base.css). Allowed by its hash (scripts/csp.mjs). */
export const HIDE_GUARD = `try{var h=JSON.parse(localStorage.getItem("${HIDE}")||"[]");if(Array.isArray(h)&&h.length)document.documentElement.classList.add("hiding")}catch(e){}`;
