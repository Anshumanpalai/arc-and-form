/**
 * Convert string to a clean URL-friendly slug.
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove invalid chars
    .replace(/[\s_-]+/g, '-') // Swap spaces and underscores for single dash
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing dashes
}

