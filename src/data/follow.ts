// Following clubs, and the football headlines, for the homepage. The clubs followed are kept on the device (localStorage, a list of the API's team ids), under
// the same keys the generated pages use (/leagues/follow.js), so a star on the homepage, a league table or /following/ is the same star. Every read of the
// store is allowed to fail (a private window, blocked site data): the page then simply starts with nothing followed.
export const FOLLOWING = "golboard.following";
export const SCOPE = "golboard.newsScope";

export type Scope = "all" | "following";
export interface Article { title: string; summary: string | null; url: string; source: string; published: string; clubs: string[] }

function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* the choice just is not remembered */ }
}

export function loadFollowing(): string[] {
  try {
    const v: unknown = JSON.parse(read(FOLLOWING) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export const saveFollowing = (ids: string[]) => write(FOLLOWING, JSON.stringify(ids));

export const loadScope = (): Scope => (read(SCOPE) === "following" ? "following" : "all");
export const saveScope = (scope: Scope) => write(SCOPE, scope);

/** The headlines, newest first, from the site's own API (api/v1/news.json, see docs/api.md). */
export async function news(): Promise<Article[]> {
  const reply = await fetch("/api/v1/news.json");
  if (!reply.ok) throw new Error(`news.json: ${reply.status}`);
  return ((await reply.json()) as { articles: Article[] }).articles;
}

/** One club's own stories (api/v1/news/<id>.json: the general headlines that name it plus the Guardian's feed for that club). A club with no file, or a
 *  file that cannot be read, simply has none, so it never hides another club's stories. */
export async function clubNews(id: string): Promise<Article[]> {
  try {
    const reply = await fetch(`/api/v1/news/${encodeURIComponent(id)}.json`);
    return reply.ok ? ((await reply.json()) as { articles: Article[] }).articles : [];
  } catch {
    return [];
  }
}

/** Newest first, one entry per story (the same link with or without tracking parameters is one story). */
export function mergeStories(lists: Article[][]): Article[] {
  const seen = new Set<string>();
  return lists
    .flat()
    .map((a, i) => ({ a, i, t: Date.parse(a.published) || 0 }))
    .sort((x, y) => y.t - x.t || x.i - y.i)
    .map(({ a }) => a)
    .filter((a) => {
      const key = a.url.split("#")[0].split("?")[0];
      return seen.has(key) ? false : (seen.add(key), true);
    });
}

// The setup (src/components/Onboarding.vue, Salah 2026-11-25): the leagues and cups chosen, the players followed, and whether the setup
// was finished or skipped. Clubs and national teams go in FOLLOWING with the stars. All on the device, every read allowed to fail.
export const LEAGUES = "golboard.leagues";
export const PLAYERS = "golboard.players";
export const SETUP = "golboard.setup";
export interface FollowedPlayer { id: string; name: string; team: string; league: string; club: string }

function list<T>(key: string, ok: (x: unknown) => x is T): T[] {
  try {
    const v: unknown = JSON.parse(read(key) ?? "[]");
    return Array.isArray(v) ? v.filter(ok) : [];
  } catch {
    return [];
  }
}
export const loadLeagues = () => list(LEAGUES, (x): x is string => typeof x === "string");
export const saveLeagues = (ids: string[]) => write(LEAGUES, JSON.stringify(ids));
export const loadPlayers = () => list(PLAYERS, (x): x is FollowedPlayer => !!x && typeof (x as FollowedPlayer).id === "string" && typeof (x as FollowedPlayer).name === "string");
export const savePlayers = (players: FollowedPlayer[]) => write(PLAYERS, JSON.stringify(players));
export const setupDone = () => read(SETUP) === "done" || read(SETUP) === "skipped";
export const markSetup = (how: "done" | "skipped") => write(SETUP, how);
