/**
 * In-place migration: re-point every product's images at the corrected,
 * category-matched pools in `productImages.ts` — WITHOUT wiping any data.
 *
 * Unlike `seed.ts` (which deletes products/orders/carts and recreates them),
 * this only updates the `images` array of existing products, so orders,
 * carts, wishlists and product IDs are all preserved.
 *
 * Run against the target DB:  MONGODB_URI=<uri> npm run fix-images
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { NOUN_IMAGES } from './productImages';

const IMAGES_PER_PRODUCT = 4;

/** Same rotating slice the seeder uses, so images stay varied but in-category. */
function imagesForNoun(noun: string, offset: number): string[] {
  const pool = NOUN_IMAGES[noun] ?? [];
  if (pool.length === 0) return [];
  const count = Math.min(IMAGES_PER_PRODUCT, pool.length);
  return Array.from({ length: count }, (_, k) => pool[(offset + k) % pool.length]);
}

/** Product names are `"<Adjective> <Noun>"` with a single-word adjective, so
 *  everything after the first word is the noun key (e.g. "Deluxe Power Bank"
 *  → "Power Bank", "Classic T-Shirt" → "T-Shirt"). */
function nounFromName(name: string): string {
  return name.split(' ').slice(1).join(' ').trim();
}

async function run() {
  await connectDB();
  const products = await Product.find();
  let updated = 0;
  const skipped: string[] = [];

  for (let i = 0; i < products.length; i += 1) {
    const p = products[i];
    const noun = nounFromName(p.name);
    const images = imagesForNoun(noun, i);
    if (images.length === 0) {
      skipped.push(`${p.name} (noun="${noun}")`);
      continue;
    }
    p.images = images;
    await p.save();
    updated += 1;
  }

  console.log(`\n✅ Product images fixed: ${updated} updated, ${skipped.length} skipped.`);
  if (skipped.length) console.log('   Skipped (no matching noun pool):', skipped.join(', '));
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('fix-images failed:', err);
  process.exit(1);
});
