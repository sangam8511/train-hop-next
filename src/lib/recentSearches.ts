import type { SearchParams } from "@/types/train";

const KEY = "rrf:recent-searches";
const MAX = 6;

export interface StoredSearch {
  from: string;
  to: string;
  stops: string[];
  date: string; // ISO
  class: string;
}

export function loadRecentSearches(): StoredSearch[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX);
  } catch {
    return [];
  }
}

export function saveRecentSearch(p: SearchParams) {
  try {
    const entry: StoredSearch = {
      from: p.from,
      to: p.to,
      stops: p.stops,
      date: p.date.toISOString(),
      class: p.class,
    };
    const existing = loadRecentSearches().filter(
      (s) =>
        !(
          s.from === entry.from &&
          s.to === entry.to &&
          s.class === entry.class &&
          JSON.stringify(s.stops) === JSON.stringify(entry.stops)
        )
    );
    const next = [entry, ...existing].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function toSearchParams(s: StoredSearch): SearchParams {
  return {
    from: s.from,
    to: s.to,
    stops: s.stops,
    date: new Date(s.date),
    class: s.class,
  };
}