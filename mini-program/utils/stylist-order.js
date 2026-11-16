export function sortStylistsByRank(people) {
  const rank = (person) => String(person.role || '').toLowerCase() === 'shop_manager' || /店长/.test(person.title || '') ? 0 : person.isGoldStylist === true || person.is_gold_stylist === true || /金牌/.test(person.title || '') ? 1 : 2;
  return [...people].sort((left, right) => rank(left) - rank(right));
}
