import 'dotenv/config';
import mongoose from 'mongoose';

type Doc = Record<string, any>;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;
  const load = (c: string): Promise<Doc[]> => db.collection(c).find().toArray();

  const [users, addresses, categories, products, carts, wishlists, orders, payments, coupons, emaillogs, changerequests] =
    await Promise.all(['users', 'addresses', 'categories', 'products', 'carts', 'wishlists', 'orders', 'payments', 'coupons', 'emaillogs', 'changerequests'].map(load));

  const ids = (docs: Doc[]) => new Set(docs.map((d) => String(d._id)));
  const U = ids(users), A = ids(addresses), C = ids(categories), P = ids(products), O = ids(orders);

  console.log('\n--- Broken references (point to a deleted document) ---');
  const missing = (label: string, values: unknown[], set: Set<string>) => {
    const bad = values.filter((v) => v && !set.has(String(v)));
    console.log(label.padEnd(40), bad.length ? `❌ ${bad.length} missing` : '✅ OK');
  };
  missing('addresses.user → users', addresses.map((a) => a.user), U);
  missing('categories.parent → categories', categories.map((c) => c.parent), C);
  missing('products.category → categories', products.map((p) => p.category), C);
  missing('carts.user → users', carts.map((c) => c.user), U);
  missing('carts.items.product → products', carts.flatMap((c) => (c.items ?? []).map((i: Doc) => i.product)), P);
  missing('wishlists.user → users', wishlists.map((w) => w.user), U);
  missing('orders.user → users', orders.map((o) => o.user), U);
  missing('orders.shippingAddress → addresses', orders.map((o) => o.shippingAddress), A);
  missing('orders.billingAddress → addresses', orders.map((o) => o.billingAddress), A);
  missing('orders.items.product → products', orders.flatMap((o) => (o.items ?? []).map((i: Doc) => i.product)), P);
  missing('payments.order → orders', payments.map((p) => p.order), O);
  missing('payments.user → users', payments.map((p) => p.user), U);
  missing('emaillogs.order → orders', emaillogs.map((e) => e.order), O);
  missing('changerequests.actor → users', changerequests.map((c) => c.actor), U);
  missing('changerequests.reviewer → users', changerequests.map((c) => c.reviewer), U);

  console.log('\n--- Duplicates on fields that must be UNIQUE in Postgres ---');
  const dup = (label: string, values: unknown[]) => {
    const seen = new Set<string>(); let count = 0;
    for (const v of values) { if (v == null) continue; const k = String(v).toLowerCase(); if (seen.has(k)) count++; seen.add(k); }
    console.log(label.padEnd(40), count ? `❌ ${count} duplicates` : '✅ OK');
  };
  dup('users.email', users.map((u) => u.email));
  dup('categories.name', categories.map((c) => c.name));
  dup('categories.slug', categories.map((c) => c.slug));
  dup('products.slug', products.map((p) => p.slug));
  dup('coupons.code', coupons.map((c) => c.code));
  dup('payments.transactionRef', payments.map((p) => p.transactionRef));

  console.log('\n--- Empty values in fields that are NOT NULL in Postgres ---');
  const empty = (label: string, values: unknown[]) => {
    const n = values.filter((v) => v == null || v === '').length;
    console.log(label.padEnd(40), n ? `❌ ${n} empty` : '✅ OK');
  };
  empty('products.slug', products.map((p) => p.slug));
  empty('categories.slug', categories.map((c) => c.slug));
  empty('orders.shippingAddress', orders.map((o) => o.shippingAddress));
  empty('orders.paymentMethod', orders.map((o) => o.paymentMethod));
  empty('order items: image', orders.flatMap((o) => (o.items ?? []).map((i: Doc) => i.image)));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
