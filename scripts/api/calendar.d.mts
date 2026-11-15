export function teamCalendars(input: {
  current: Map<string, { matches: any[]; teams: Record<string, string> }>;
  names: Record<string, string>;
  now: string;
  site: string;
}): Map<string, string>;
