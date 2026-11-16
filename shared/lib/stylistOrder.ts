type StylistRank = { role?: string; isGoldStylist?: boolean; is_gold_stylist?: boolean; title?: string };

export function stylistRank(person: StylistRank): number {
  if (person.role?.toLowerCase() === 'shop_manager' || /店长/.test(person.title || '')) return 0;
  if (person.isGoldStylist === true || person.is_gold_stylist === true || /金牌/.test(person.title || '')) return 1;
  return 2;
}

export function sortStylistsByRank<T extends StylistRank>(people: readonly T[]): T[] {
  return [...people].sort((left, right) => stylistRank(left) - stylistRank(right));
}
