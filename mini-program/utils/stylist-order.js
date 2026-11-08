export function sortStylistsByRank(people) {
  const rank = (person) => person.role === 'shop_manager' ? 0 : person.isGoldStylist === true ? 1 : 2;
  return [...people].sort((left, right) => rank(left) - rank(right));
}
