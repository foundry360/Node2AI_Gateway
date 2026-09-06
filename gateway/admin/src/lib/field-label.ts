/** Turn snake_case / SCREAMING_SNAKE codes into Title Case labels. */
export function formatFieldLabel(value: string | undefined | null): string {
  if (!value) return value ?? '';
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
