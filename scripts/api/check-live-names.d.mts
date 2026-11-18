export const HIDDEN: RegExp;
export function unknownNames(names: string[], ours: Record<string, string>, idOf?: (name: string) => string, hidden?: RegExp): { name: string; id: string }[];
