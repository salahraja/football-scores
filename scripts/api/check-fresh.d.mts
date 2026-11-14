type Seasons = Record<string, Record<string, { overdue: number; lastResult: string | null }>>;
export function check(meta: { leagues: Seasons; tournaments?: Seasons }): string[];
