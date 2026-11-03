import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

type Doc = Record<string, any>;
const DRY = process.argv.includes('--dry');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL }) });

// ---------- helpers ----------
const ids = new Map<string, string>(); // Mongo ObjectId -> Postgres UUID
const idOf = (oid: unknown): string | null => (oid ? ids.get(String(oid)) ?? null : null);
const json = (v: unknown) => (v == null ? undefined : JSON.parse(JSON.stringify(v)));
const num = (v: unknown) => (v == null ? undefined : Number(v));
const created = (d: Doc): Date => d.createdAt ?? d._id.getTimestamp();
const stamps = (d: Doc) => ({ createdAt: created(d), updatedAt: d.updatedAt ?? created(d) });
const notes: Record<string, number> = {};
const tally = (label: string) => { notes[label] = (notes[label] ?? 0) + 1; };
const drop = (label: string, d: Doc) => { tally(label); ids.delete(String(d._id)); };

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;
  const load = (c: string): Promise<Doc[]> => db.collection(c).find().toArray();
  const [users, addresses, categories, products, reviews, carts, wishlists, orders, payments, coupons, emaillogs, changerequests] =
    await Promise.all(['users', 'addresses', 'categories', 'products', 'reviews', 'carts', 'wishlists', 'orders', 'payments', 'coupons', 'emaillogs', 'changerequests'].map(load));

  // 1. Give every document a new UUID up front
  for (const docs of [users, addresses, categories, products, reviews, carts, wishlists, orders, payments, coupons, emaillogs, changerequests])
    for (const d of docs) ids.set(String(d._id), randomUUID());

  // 2. Transform (parents before children)
  const usersData = users.map((d) => ({
    id: idOf(d._id)!, name: d.name, email: String(d.email).toLowerCase(), password: d.password,
    role: d.role ?? 'customer', phone: d.phone, avatar: d.avatar,
    passwordResetToken: d.passwordResetToken, passwordResetExpires: d.passwordResetExpires,
    isEmailVerified: d.isEmailVerified ?? false, isActive: d.isActive ?? true, ...stamps(d),
  }));

  const addressesData = addresses.flatMap((d) => {
    const userId = idOf(d.user);
    if (!userId) { drop('address skipped: missing user', d); return []; }
    return [{ id: idOf(d._id)!, userId, fullName: d.fullName, phone: d.phone, line1: d.line1, line2: d.line2,
      city: d.city, state: d.state, postalCode: d.postalCode, country: d.country,
      isDefault: d.isDefault ?? false, type: d.type ?? 'shipping', ...stamps(d) }];
  });

  const categoriesData = categories.map((d) => ({ id: idOf(d._id)!, name: d.name, slug: d.slug, image: d.image, parentId: null, ...stamps(d) }));
  const categoryParents = categories.filter((d) => idOf(d.parent)).map((d) => ({ id: idOf(d._id)!, parentId: idOf(d.parent)! }));

  const productsData = products.flatMap((d) => {
    const categoryId = idOf(d.category);
    if (!categoryId) { drop('product skipped: missing category', d); return []; }
    return [{ id: idOf(d._id)!, name: d.name, slug: d.slug, description: d.description, categoryId, brand: d.brand,
      price: Number(d.price), discountPrice: num(d.discountPrice), images: d.images ?? [],
      sizes: d.variants?.sizes ?? [], colors: d.variants?.colors ?? [], stock: d.stock ?? 0,
      rating: d.rating ?? 0, numReviews: d.numReviews ?? 0, tags: d.tags ?? [],
      isFeatured: d.isFeatured ?? false, isFlashSale: d.isFlashSale ?? false, flashSaleEndsAt: d.flashSaleEndsAt,
      isNewArrival: d.isNewArrival ?? false, isBestSeller: d.isBestSeller ?? false,
      blockAddToCart: d.blockAddToCart ?? false, blockCheckout: d.blockCheckout ?? false,
      isActive: d.isActive ?? true, ...stamps(d) }];
  });

  const reviewsData = reviews.flatMap((d) => {
    const productId = idOf(d.product), userId = idOf(d.user);
    if (!productId || !userId) { drop('review skipped: missing product/user', d); return []; }
    return [{ id: idOf(d._id)!, productId, userId, rating: d.rating, comment: d.comment, images: d.images ?? [], ...stamps(d) }];
  });
  const reviewLikesData = reviews.flatMap((d) => {
    const reviewId = idOf(d._id);
    if (!reviewId) return [];
    return [...new Set<string>((d.likes ?? []).map(String))].flatMap((u) => {
      const userId = idOf(u);
      if (!userId) { tally('review like skipped: missing user'); return []; }
      return [{ reviewId, userId }];
    });
  });

  const cartsData = carts.flatMap((d) => {
    const userId = idOf(d.user);
    if (!userId) { drop('cart skipped: missing user', d); return []; }
    return [{ id: idOf(d._id)!, userId, couponCode: d.couponCode, ...stamps(d) }];
  });
  const cartItemsData = carts.flatMap((d) => {
    const cartId = idOf(d._id);
    if (!cartId) return [];
    return (d.items ?? []).flatMap((i: Doc) => {
      const productId = idOf(i.product);
      if (!productId) { tally('cart item skipped: missing product'); return []; }
      return [{ id: randomUUID(), cartId, productId, size: i.variant?.size, color: i.variant?.color,
        qty: i.qty ?? 1, savedForLater: i.savedForLater ?? false }];
    });
  });

  const wishlistsData = wishlists.flatMap((d) => {
    const userId = idOf(d.user);
    if (!userId) { drop('wishlist skipped: missing user', d); return []; }
    return [{ id: idOf(d._id)!, userId, ...stamps(d) }];
  });
  const wishlistItemsData = wishlists.flatMap((d) => {
    const wishlistId = idOf(d._id);
    if (!wishlistId) return [];
    return [...new Set<string>((d.products ?? []).map(String))].flatMap((p) => {
      const productId = idOf(p);
      if (!productId) { tally('wishlist item skipped: missing product'); return []; }
      return [{ wishlistId, productId }];
    });
  });

  const ordersData = orders.flatMap((d) => {
    const userId = idOf(d.user);
    if (!userId) { drop('order skipped: missing user', d); return []; }
    if (d.shippingAddress && !idOf(d.shippingAddress)) tally('order: shipping address set to NULL');
    return [{ id: idOf(d._id)!, userId, shippingAddressId: idOf(d.shippingAddress), billingAddressId: idOf(d.billingAddress),
      subtotal: Number(d.subtotal), discount: d.discount ?? 0, couponCode: d.couponCode,
      shippingFee: d.shippingFee ?? 0, tax: d.tax ?? 0, total: Number(d.total),
      paymentMethod: d.paymentMethod, paymentStatus: d.paymentStatus ?? 'pending', status: d.status ?? 'pending',
      refund: json(d.refund), cancelledBy: d.cancelledBy, cancellationReason: d.cancellationReason, ...stamps(d) }];
  });
  const orderItemsData = orders.flatMap((d) => {
    const orderId = idOf(d._id);
    if (!orderId) return [];
    return (d.items ?? []).map((i: Doc) => {
      const productId = idOf(i.product);
      if (!productId) tally('order item: product_id set to NULL');
      return { id: randomUUID(), orderId, productId, name: i.name, image: i.image, price: Number(i.price),
        qty: i.qty, size: i.variant?.size, color: i.variant?.color };
    });
  });
  const trackingData = orders.flatMap((d) => {
    const orderId = idOf(d._id);
    if (!orderId) return [];
    return (d.trackingTimeline ?? []).map((t: Doc) => ({ id: randomUUID(), orderId, status: t.status, timestamp: t.timestamp ?? created(d), note: t.note }));
  });

  const paymentsData = payments.flatMap((d) => {
    const orderId = idOf(d.order), userId = idOf(d.user);
    if (!orderId || !userId) { drop('payment skipped: missing order/user', d); return []; }
    return [{ id: idOf(d._id)!, orderId, userId, method: d.method, status: d.status ?? 'pending', amount: Number(d.amount),
      cardLast4: d.cardLast4, cardBrand: d.cardBrand, upiVpa: d.upiVpa, bankCode: d.bankCode, walletProvider: d.walletProvider,
      requiresOtp: d.requiresOtp ?? false, otpAttempts: d.otpAttempts ?? 0, forcedFailure: d.forcedFailure ?? false,
      transactionRef: d.transactionRef, ...stamps(d) }];
  });

  const couponsData = coupons.map((d) => ({ id: idOf(d._id)!, code: String(d.code).toUpperCase(), type: d.type, value: Number(d.value),
    minOrderValue: d.minOrderValue ?? 0, maxDiscount: num(d.maxDiscount), expiresAt: d.expiresAt,
    usageLimit: d.usageLimit ?? 1, usedCount: d.usedCount ?? 0, isActive: d.isActive ?? true, minItems: d.minItems ?? 0, ...stamps(d) }));

  const emailLogsData = emaillogs.map((d) => ({ id: idOf(d._id)!, orderId: idOf(d.order), to: d.to, subject: d.subject, body: d.body, createdAt: created(d) }));

  const changeRequestsData = changerequests.flatMap((d) => {
    const actorId = idOf(d.actor);
    if (!actorId) { drop('change request skipped: missing actor', d); return []; }
    return [{ id: idOf(d._id)!, actorId, actorName: d.actorName, actorRole: d.actorRole, module: d.module, action: d.action,
      targetId: d.targetId ? (idOf(d.targetId) ?? String(d.targetId)) : undefined, targetLabel: d.targetLabel, summary: d.summary,
      changes: json(d.changes) ?? [], payload: json(d.payload), before: json(d.before), status: d.status ?? 'applied',
      reviewerId: idOf(d.reviewer), reviewerName: d.reviewerName, reviewedAt: d.reviewedAt, note: d.note, ...stamps(d) }];
  });

  // 3. Show the plan
  const plan = {
    users: usersData.length, addresses: addressesData.length, categories: categoriesData.length, products: productsData.length,
    reviews: reviewsData.length, review_likes: reviewLikesData.length, carts: cartsData.length, cart_items: cartItemsData.length,
    wishlists: wishlistsData.length, wishlist_items: wishlistItemsData.length, orders: ordersData.length,
    order_items: orderItemsData.length, order_tracking_events: trackingData.length, payments: paymentsData.length,
    coupons: couponsData.length, email_logs: emailLogsData.length, change_requests: changeRequestsData.length,
  };
  console.log('\n--- Rows to insert ---'); console.table(plan);
  console.log('--- Data notes ---'); console.table(notes);
  await mongoose.disconnect();

  if (DRY) { console.log('\nDRY RUN: nothing was written to Postgres.'); return; }

  // 4. Safety: never insert twice
  if ((await prisma.user.count()) > 0) throw new Error('Postgres already has users. Aborting to avoid duplicates.');

  // 5. Insert everything in ONE transaction (all or nothing)
  await prisma.$transaction(async (tx) => {
    await tx.user.createMany({ data: usersData });
    await tx.address.createMany({ data: addressesData });
    await tx.category.createMany({ data: categoriesData });
    for (const c of categoryParents) await tx.category.update({ where: { id: c.id }, data: { parentId: c.parentId } });
    await tx.product.createMany({ data: productsData });
    await tx.review.createMany({ data: reviewsData });
    await tx.reviewLike.createMany({ data: reviewLikesData });
    await tx.cart.createMany({ data: cartsData });
    await tx.cartItem.createMany({ data: cartItemsData });
    await tx.wishlist.createMany({ data: wishlistsData });
    await tx.wishlistItem.createMany({ data: wishlistItemsData });
    await tx.order.createMany({ data: ordersData });
    await tx.orderItem.createMany({ data: orderItemsData });
    await tx.orderTrackingEvent.createMany({ data: trackingData });
    await tx.payment.createMany({ data: paymentsData });
    await tx.coupon.createMany({ data: couponsData });
    await tx.emailLog.createMany({ data: emailLogsData });
    await tx.changeRequest.createMany({ data: changeRequestsData });
  }, { maxWait: 20_000, timeout: 180_000 });

  writeFileSync('scripts/id-map.json', JSON.stringify(Object.fromEntries(ids), null, 2));
  console.log('\n✅ Migration committed. ObjectId→UUID map saved to scripts/id-map.json');
}

main()
  .catch((e) => { console.error('\n❌ Migration failed, nothing was written:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
