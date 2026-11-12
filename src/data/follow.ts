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
