type StylistRank = { role?: string; isGoldStylist?: boolean };

export function stylistRank(person: StylistRank): number {
  if (person.role === 'shop_manager') return 0;
  if (person.isGoldStylist === true) return 1;
  return 2;
}

export function sortStylistsByRank<T extends StylistRank>(people: readonly T[]): T[] {
  return [...people].sort((left, right) => stylistRank(left) - stylistRank(right));
}
