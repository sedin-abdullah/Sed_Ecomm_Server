/**
 * Slug generation ported from the Mongoose `pre('validate')` hooks on Product
 * and Category. `uniqueSlug` appends `-2`, `-3`, … until the slug is free,
 * exactly as the old hook did (suffix starts at 1, first collision → `-2`).
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export async function uniqueSlug(
  name: string,
  taken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;

  // eslint-disable-next-line no-await-in-loop
  while (await taken(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

export default uniqueSlug;
