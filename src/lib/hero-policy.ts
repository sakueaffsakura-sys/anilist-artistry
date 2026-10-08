/** Never substitute unselected catalog rows for administrator-selected highlights. */
export function selectHeroItems<T extends { in_slider: boolean }>(items: T[]): T[] {
  return items.filter((item) => item.in_slider);
}