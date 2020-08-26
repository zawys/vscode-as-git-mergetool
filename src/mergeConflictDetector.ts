export const mergeConflictIndicatorRE = /^(>{7}|<{7}|\|{7}|={7})/m;

export function containsMergeConflictIndicators(text: string): boolean {
  return mergeConflictIndicatorRE.test(text);
}
