export interface Article {
  title: string;
  summary: string | null;
  url: string;
  source: string;
  published: string;
  image: string | null;
  tags?: string[];
  clubs?: string[];
}
export interface Terms { phrases: string[]; without: string[] }
export const FEEDS: { name: string; url: string }[];
export function unescapeEntities(text: string): string;
export function plain(html: string): string;
export function normalize(text: string): string;
export function parseRss(xml: string, source: string): Article[];
export function clubTerms(clubs: { id: string; name: string }[]): Map<string, Terms>;
export function mentions(article: { title: string; summary?: string | null; tags?: string[] }, terms: Terms): boolean;
export function merge(lists: Article[][], limit?: number): Article[];
export function fetchFeeds(options?: {
  raw?: string;
  fetch?: (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
}): Promise<{ saved: string[]; kept: string[] }>;
export function buildNews(options?: { api?: string; raw?: string; now?: string }): { articles: number };
export function guardianFeeds(): Record<string, string>;
export function fetchClubFeeds(options?: {
  raw?: string;
  feeds?: Record<string, string>;
  pool?: number;
  gap?: number;
  fetch?: (url: string, init: { headers: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;
}): Promise<{ saved: number; kept: number }>;
