import { prisma } from '../config/prisma';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { toApi } from '../utils/serialize';
import { assertUuid } from '../utils/uuid';
import { ListCustomersQuery } from '../validators/admin.validator';

function toNum(decimal: unknown): number {
  if (decimal === null || decimal === undefined) return 0;
  return typeof decimal === 'number' ? decimal : Number((decimal as { toString(): string }).toString());
}

export async function getDashboardSummary() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [revenueAgg, todayAgg, monthAgg, statusGroups, totalOrders, totalCustomers] = await Promise.all([
    prisma.order.aggregate({ where: { paymentStatus: 'success' }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { paymentStatus: 'success', createdAt: { gte: startOfDay } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { paymentStatus: 'success', createdAt: { gte: startOfMonth } }, _sum: { total: true } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.count(),
    prisma.user.count({ where: { role: 'customer' } }),
  ]);

  const totalRevenue = toNum(revenueAgg._sum.total);
  const dailySales = toNum(todayAgg._sum.total);
  const monthlySales = toNum(monthAgg._sum.total);

  const countByStatus = (status: string) => statusGroups.find((s) => s.status === status)?._count._all ?? 0;

  return {
    totalSales: totalRevenue,
    dailySales,
    monthlySales,
    totalRevenue,
    totalOrders,
    totalCustomers,
    pendingOrders: countByStatus('pending'),
    deliveredOrders: countByStatus('delivered'),
    cancelledOrders: countByStatus('cancelled'),
  };
}

export interface BestSellerRow {
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    images: { id: string; url: string }[];
  };
  unitsSold: number;
  revenue: number;
}

export async function getBestSellers(limit = 10): Promise<BestSellerRow[]> {
  // Revenue needs price*qty per line, which groupBy can't sum — aggregate in JS.
  const items = await prisma.orderItem.findMany({
    where: { order: { paymentStatus: 'success' }, productId: { not: null } },
    select: { productId: true, qty: true, price: true },
  });

  const byProduct = new Map<string, { unitsSold: number; revenue: number }>();
  for (const it of items) {
    const pid = it.productId as string;
    const agg = byProduct.get(pid) ?? { unitsSold: 0, revenue: 0 };
    agg.unitsSold += it.qty;
    agg.revenue += toNum(it.price) * it.qty;
    byProduct.set(pid, agg);
  }

  const top = [...byProduct.entries()].sort((a, b) => b[1].unitsSold - a[1].unitsSold).slice(0, limit);

  const products = await prisma.product.findMany({
    where: { id: { in: top.map(([pid]) => pid) } },
    select: { id: true, name: true, slug: true, price: true, images: true },
  });
  const pmap = new Map(products.map((p) => [p.id, p]));

  return top
    .filter(([pid]) => pmap.has(pid))
    .map(([pid, agg]) => {
      const p = pmap.get(pid)!;
      return {
        product: {
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: toNum(p.price),
          images: [{ id: '0', url: p.images[0] }],
        },
        unitsSold: agg.unitsSold,
        revenue: agg.revenue,
      };
    });
}

export async function listCustomers(query: ListCustomersQuery) {
  const { page, limit, skip } = parsePagination(query);
  const where = {
    role: 'customer' as const,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.user.count({ where }),
  ]);

  return { customers: customers.map((c) => toApi(c)), pagination: buildPaginationMeta(page, limit, total) };
}

export async function getCustomer(id: string) {
  assertUuid(id);
  const customer = await prisma.user.findFirst({ where: { id, role: 'customer' } });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }
  return toApi(customer);
}

export async function setCustomerStatus(id: string, isActive: boolean) {
  assertUuid(id);
  const customer = await prisma.user.findFirst({ where: { id, role: 'customer' }, select: { id: true } });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }
  const updated = await prisma.user.update({ where: { id }, data: { isActive } });
  return toApi(updated);
}
