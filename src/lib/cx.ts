/** Joins truthy class names with a space. A five-line stand-in for clsx/classnames —
 * not worth a new dependency for what every component here needs is "skip falsy
 * values and join the rest". */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter((c): c is string => Boolean(c)).join(' ');
}
