// Shared priority ranking, used to sort every queue (Pharmacy, Laboratory,
// Radiology, Blood Bank, Ambulance) so the most urgent item is always on
// top -- not just whichever arrived first. This is the same principle
// already proven in the Emergency Triage Board (sorted by acuity), applied
// consistently everywhere a priority field exists.
const PRIORITY_RANK: Record<string, number> = {
  STAT: 0,
  Emergency: 0,
  Critical: 0,
  Urgent: 1,
  Routine: 2,
};

export function priorityRank(priority: string | null | undefined): number {
  return PRIORITY_RANK[priority ?? ''] ?? 3;
}

export function sortByPriorityThenTime<T extends { priority?: string; created_at?: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const rankDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (rankDiff !== 0) return rankDiff;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });
}
