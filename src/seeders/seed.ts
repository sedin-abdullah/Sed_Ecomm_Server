/**
 * Database seeder — wipes catalog/transactional collections and populates
 * realistic demo data: category tree, ~110 products, sample coupons, an
 * admin user, and a demo customer (with one saved address).
 *
 * Run with `npm run seed`.
 */
import { connectDB } from '../config/db';
import { prisma } from '../config/prisma';
import { hashPassword } from '../services/user.service';
import { slugify } from '../utils/slug';
import { NOUN_IMAGES } from './productImages';

const ADMIN_EMAIL = 'admin@sedecomm.com';
const DEMO_EMAIL = 'demo@sedecomm.com';

interface SubCategorySpec {
  name: string;
  noun: string;
  priceRange: [number, number];
  brands: string[];
  sizes?: string[];
  colors: string[];
}

const SIZES_APPAREL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZES_SHOES = ['6', '7', '8', '9', '10', '11'];
const COLORS_GENERIC = ['Black', 'White', 'Navy', 'Gray', 'Olive', 'Beige'];

const CATEGORY_TREE: Record<string, SubCategorySpec[]> = {
  Fashion: [
    { name: 'T-Shirts', noun: 'T-Shirt', priceRange: [12, 35], brands: ['Urban Edge', 'Coastal Co.', 'Nova Wear', 'Everyday Basics'], sizes: SIZES_APPAREL, colors: COLORS_GENERIC },
    { name: 'Shirts', noun: 'Shirt', priceRange: [22, 55], brands: ['Urban Edge', 'Vantage', 'Nova Wear', 'Heritage Line'], sizes: SIZES_APPAREL, colors: COLORS_GENERIC },
    { name: 'Jeans', noun: 'Jeans', priceRange: [30, 85], brands: ['Denim Co.', 'Urban Edge', 'Vantage', 'Blue Rivet'], sizes: SIZES_APPAREL, colors: ['Indigo', 'Black', 'Light Wash', 'Gray'] },
    { name: 'Hoodies', noun: 'Hoodie', priceRange: [28, 65], brands: ['Nova Wear', 'Coastal Co.', 'Streetform', 'Urban Edge'], sizes: SIZES_APPAREL, colors: COLORS_GENERIC },
    { name: 'Jackets', noun: 'Jacket', priceRange: [45, 140], brands: ['Vantage', 'Heritage Line', 'Streetform', 'Nova Wear'], sizes: SIZES_APPAREL, colors: COLORS_GENERIC },
  ],
  Footwear: [
    { name: 'Shoes', noun: 'Shoes', priceRange: [35, 110], brands: ['Strydon', 'Pacefoot', 'Northwalk', 'Urban Edge'], sizes: SIZES_SHOES, colors: COLORS_GENERIC },
    { name: 'Sneakers', noun: 'Sneakers', priceRange: [40, 150], brands: ['Strydon', 'Pacefoot', 'Boltline', 'Northwalk'], sizes: SIZES_SHOES, colors: COLORS_GENERIC },
    { name: 'Sandals', noun: 'Sandals', priceRange: [15, 45], brands: ['Coastal Co.', 'Northwalk', 'Pacefoot'], sizes: SIZES_SHOES, colors: COLORS_GENERIC },
    { name: 'Slippers', noun: 'Slippers', priceRange: [10, 28], brands: ['Coastal Co.', 'Homeglow', 'Northwalk'], sizes: SIZES_SHOES, colors: COLORS_GENERIC },
  ],
  Accessories: [
    { name: 'Watches', noun: 'Watch', priceRange: [45, 320], brands: ['Chronotime', 'Vantage', 'Heritage Line', 'Zenith'], colors: ['Black', 'Silver', 'Gold', 'Brown'] },
    { name: 'Wallets', noun: 'Wallet', priceRange: [18, 65], brands: ['Heritage Line', 'Vantage', 'Craftmark'], colors: ['Black', 'Brown', 'Tan'] },
    { name: 'Sunglasses', noun: 'Sunglasses', priceRange: [20, 95], brands: ['Solstice', 'Coastal Co.', 'Vantage'], colors: ['Black', 'Tortoise', 'Gray'] },
    { name: 'Caps', noun: 'Cap', priceRange: [12, 30], brands: ['Streetform', 'Urban Edge', 'Nova Wear'], colors: COLORS_GENERIC },
  ],
  Electronics: [
    { name: 'Earbuds', noun: 'Earbuds', priceRange: [25, 160], brands: ['Sonik', 'Pulseware', 'Nimbus Tech', 'Boltline'], colors: ['Black', 'White'] },
    { name: 'Headphones', noun: 'Headphones', priceRange: [35, 220], brands: ['Sonik', 'Pulseware', 'Nimbus Tech'], colors: ['Black', 'White', 'Blue'] },
    { name: 'Smart Watches', noun: 'Smartwatch', priceRange: [50, 280], brands: ['Chronotime', 'Nimbus Tech', 'Pulseware'], colors: ['Black', 'Silver'] },
    { name: 'Power Banks', noun: 'Power Bank', priceRange: [18, 60], brands: ['Voltcell', 'Nimbus Tech', 'Boltline'], colors: ['Black', 'White'] },
  ],
  Home: [
    { name: 'Water Bottles', noun: 'Water Bottle', priceRange: [10, 35], brands: ['Homeglow', 'Coastal Co.', 'Everyday Basics'], colors: COLORS_GENERIC },
    { name: 'Bags', noun: 'Bag', priceRange: [22, 90], brands: ['Craftmark', 'Vantage', 'Urban Edge'], colors: ['Black', 'Brown', 'Navy'] },
    { name: 'Office Accessories', noun: 'Desk Organizer', priceRange: [12, 48], brands: ['Homeglow', 'Craftmark', 'Everyday Basics'], colors: ['Black', 'Wood', 'Gray'] },
  ],
  Beauty: [
    { name: 'Perfume', noun: 'Perfume', priceRange: [25, 120], brands: ['Solstice', 'Aroura', 'Heritage Line'], colors: [] },
    { name: 'Skin Care', noun: 'Face Cream', priceRange: [12, 55], brands: ['Aroura', 'Homeglow', 'Everyday Basics'], colors: [] },
  ],
};

const ADJECTIVES = [
  'Classic', 'Premium', 'Everyday', 'Urban', 'Comfort', 'Essential', 'Signature', 'Active', 'Deluxe', 'Minimalist',
];

const PRODUCTS_PER_SUBCATEGORY = 5;

function lerp(min: number, max: number, t: number): number {
  return Math.round((min + (max - min) * t) * 100) / 100;
}

const IMAGES_PER_PRODUCT = 4;

/**
 * Picks a rotating, deduplicated slice of a product-type's real image pool so
 * every product shows genuinely matching photos (a sneaker shows sneakers)
 * while adjacent products of the same type differ. Falls back to the whole
 * pool if it's smaller than the requested count.
 */
function imagesForNoun(noun: string, offset: number): string[] {
  const pool = NOUN_IMAGES[noun] ?? [];
  if (pool.length === 0) return [];
  const count = Math.min(IMAGES_PER_PRODUCT, pool.length);
  return Array.from({ length: count }, (_, k) => pool[(offset + k) % pool.length]);
}

async function seed(): Promise<void> {
  await connectDB();

  // In-memory slug allocator: names can collide across the catalog, and both
  // Category.slug and Product.slug are UNIQUE. Mirrors uniqueSlug's `-2`, `-3`
  // suffixing without a DB round-trip per product (the catalog is freshly wiped).
  const takenSlugs = new Set<string>();
  const nextSlug = (name: string): string => {
    const base = slugify(name);
    let candidate = base;
    let suffix = 1;
    while (takenSlugs.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    takenSlugs.add(candidate);
    return candidate;
  };

  console.log('[seed] Wiping catalog and transactional data...');
  // Delete children before parents so Restrict FKs (payment→order, product→
  // category) don't block. Cascades clear order items, tracking events, review
  // likes, cart/wishlist items automatically.
  await prisma.payment.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.review.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.product.deleteMany();
  // Self-referencing tree: remove child categories before parents.
  await prisma.category.deleteMany({ where: { parentId: { not: null } } });
  await prisma.category.deleteMany();
  await prisma.coupon.deleteMany();
  // Only the two demo accounts are recreated; other users are preserved.
  // Their addresses cascade on user delete.
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, DEMO_EMAIL] } } });

  console.log('[seed] Creating categories...');
  let productCounter = 0;
  let productsCreated = 0;
  const now = new Date();

  for (const [parentName, subcategories] of Object.entries(CATEGORY_TREE)) {
    const parent = await prisma.category.create({
      data: {
        name: parentName,
        slug: nextSlug(parentName),
        // Represent the parent with its first subcategory's real product image.
        image: NOUN_IMAGES[subcategories[0].noun]?.[0],
      },
    });

    for (const spec of subcategories) {
      const child = await prisma.category.create({
        data: {
          name: spec.name,
          slug: nextSlug(spec.name),
          parentId: parent.id,
          image: NOUN_IMAGES[spec.noun]?.[0],
        },
      });

      for (let i = 0; i < PRODUCTS_PER_SUBCATEGORY; i += 1) {
        const adjective = ADJECTIVES[(i + productCounter) % ADJECTIVES.length];
        const brand = spec.brands[i % spec.brands.length];
        const name = `${adjective} ${spec.noun}`;
        const price = lerp(spec.priceRange[0], spec.priceRange[1], i / (PRODUCTS_PER_SUBCATEGORY - 1));
        const hasDiscount = productCounter % 3 === 0;
        const discountPrice = hasDiscount ? Math.round(price * 0.85 * 100) / 100 : undefined;
        const stock = 20 + ((productCounter * 7) % 80);

        const images = imagesForNoun(spec.noun, productCounter);

        const isFeatured = productCounter % 4 === 0;
        const isFlashSale = productCounter % 7 === 0;
        const isNewArrival = productCounter % 5 === 0;
        const isBestSeller = productCounter % 6 === 0;

        await prisma.product.create({
          data: {
            name,
            slug: nextSlug(name),
            description: `${adjective} ${spec.noun.toLowerCase()} from ${brand}, designed for everyday comfort, durability, and style. A great addition to your ${parentName.toLowerCase()} collection.`,
            categoryId: child.id,
            brand,
            price,
            discountPrice,
            images,
            // Mongoose embedded `variants` → flat Postgres array columns.
            sizes: spec.sizes ?? [],
            colors: spec.colors,
            stock,
            tags: [parentName.toLowerCase(), spec.name.toLowerCase(), brand.toLowerCase()],
            isFeatured,
            isFlashSale,
            flashSaleEndsAt: isFlashSale ? new Date(now.getTime() + 48 * 60 * 60 * 1000) : null,
            isNewArrival,
            isBestSeller,
          },
        });

        productCounter += 1;
        productsCreated += 1;
      }
    }
  }

  console.log('[seed] Creating coupons...');
  await prisma.coupon.createMany({
    data: [
    {
      code: 'WELCOME10',
      type: 'percentage',
      value: 10,
      minOrderValue: 20,
      maxDiscount: 15,
      expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      usageLimit: 1000,
      isActive: true,
    },
    {
      code: 'FLASH20',
      type: 'percentage',
      value: 20,
      minOrderValue: 40,
      maxDiscount: 40,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      usageLimit: 500,
      isActive: true,
    },
    {
      code: 'SAVE20',
      type: 'percentage',
      value: 20,
      minOrderValue: 50,
      maxDiscount: 50,
      expiresAt: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
      usageLimit: 500,
      isActive: true,
    },
    {
      code: 'NEWUSER30',
      type: 'percentage',
      value: 30,
      minOrderValue: 30,
      maxDiscount: 60,
      expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      usageLimit: 1,
      isActive: true,
    },
    {
      // Modeled as a flat discount equal to a typical shipping fee — the
      // schema has no dedicated "free shipping" concept.
      code: 'FREESHIP',
      type: 'flat',
      value: 5,
      minOrderValue: 25,
      expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000),
      usageLimit: 1000,
      isActive: true,
    },
    {
      code: 'ADMIN50',
      type: 'percentage',
      value: 50,
      minOrderValue: 0,
      maxDiscount: 100,
      expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      usageLimit: 100,
      isActive: true,
    },
    ],
  });

  console.log('[seed] Creating admin and demo users...');
  const admin = await prisma.user.create({
    data: {
      name: 'Sed Ecomm Admin',
      email: ADMIN_EMAIL,
      password: await hashPassword('Admin@123'),
      role: 'admin',
      isEmailVerified: true,
    },
  });

  const demoCustomer = await prisma.user.create({
    data: {
      name: 'Demo Customer',
      email: DEMO_EMAIL,
      password: await hashPassword('Demo@123'),
      role: 'customer',
      isEmailVerified: true,
      // Addresses are a relation now — create the demo address inline so it's
      // linked by userId (the old User.addresses array no longer exists).
      addresses: {
        create: {
          fullName: 'Demo Customer',
          phone: '+1 555 0100',
          line1: '123 Market Street',
          line2: 'Apt 4B',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94103',
          country: 'United States',
          isDefault: true,
          type: 'shipping',
        },
      },
    },
  });

  const categoryCount = await prisma.category.count();
  const couponCount = await prisma.coupon.count();

  console.log('\n[seed] Done! Summary:');
  console.log(`  Categories:      ${categoryCount} (6 parent + ${categoryCount - 6} child)`);
  console.log(`  Products:        ${productsCreated}`);
  console.log(`  Coupons:         ${couponCount}`);
  console.log(`  Admin user:      ${admin.email} / Admin@123`);
  console.log(`  Demo customer:   ${demoCustomer.email} / Demo@123`);

  await prisma.$disconnect();
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[seed] Seeding failed:', error);
    process.exit(1);
  });
