import { env } from '../config/env';

export interface ClientProductImage {
  id: string;
  url: string;
}

/**
 * The client expects images as `{id, url}` objects; they're stored as plain
 * URL strings. Locally-uploaded images are stored as a server-relative path
 * (e.g. `/uploads/products/x.png`) — those need the server's own origin
 * prefixed, or the browser resolves them against the client's origin instead.
 * Seeded/external image URLs are already absolute and pass through.
 *
 * (Ported from the Mongoose Product model's `toJSON` transform.)
 */
export function toClientImages(images: string[]): ClientProductImage[] {
  return images.map((url, index) => ({
    id: String(index),
    url: url.startsWith('/') ? `${env.PUBLIC_URL}${url}` : url,
  }));
}

export default toClientImages;
