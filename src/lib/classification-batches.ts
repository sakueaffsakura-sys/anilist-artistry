/** Each finished group becomes reviewable without waiting for slower peers. */
export async function deliverClassificationBatches<T, R>(
  groups: T[][],
  analyze: (group: T[]) => Promise<R>,
  deliver: (group: T[], result: R) => void,
): Promise<void> {
  await Promise.all(groups.map(async (group) => {
    const result = await analyze(group);
    deliver(group, result);
  }));
}