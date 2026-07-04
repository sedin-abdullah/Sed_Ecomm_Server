import { Order } from '../models/Order';
import { IUser, User } from '../models/User';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { ListCustomersQuery } from '../validators/admin.validator';

interface SalesFacetResult {
  sum: number;
  count: number;
}

interface SalesAggregation {
  totalRevenue: SalesFacetResult[];
  today: SalesFacetResult[];
  month: SalesFacetResult[];
}

export async function getDashboardSummary() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [salesAgg, statusCounts, totalOrders, totalCustomers] = await Promise.all([
    Order.aggregate<SalesAggregation>([
      { $match: { paymentStatus: 'success' } },
      {
        $facet: {
          totalRevenue: [{ $group: { _id: null, sum: { $sum: '$total' }, count: { $sum: 1 } } }],
          today: [
            { $match: { createdAt: { $gte: startOfDay } } },
            { $group: { _id: null, sum: { $sum: '$total' }, count: { $sum: 1 } } },
          ],
          month: [
            { $match: { createdAt: { $gte: startOfMonth } } },
            { $group: { _id: null, sum: { $sum: '$total' }, count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    Order.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.countDocuments({}),
    User.countDocuments({ role: 'customer' }),
  ]);

  const facet = salesAgg[0] ?? { totalRevenue: [], today: [], month: [] };
  const totalRevenue = facet.totalRevenue[0]?.sum ?? 0;
  const dailySales = facet.today[0]?.sum ?? 0;
  const monthlySales = facet.month[0]?.sum ?? 0;

  const countByStatus = (status: string) => statusCounts.find((s) => s._id === status)?.count ?? 0;

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
  return Order.aggregate<BestSellerRow>([
    { $match: { paymentStatus: 'success' } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        unitsSold: { $sum: '$items.qty' },
        revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
      },
    },
    { $sort: { unitsSold: -1 } },
    { $limit: limit },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    {
      $project: {
        _id: 0,
        unitsSold: 1,
        revenue: 1,
        product: {
          id: { $toString: '$_id' },
          name: '$product.name',
          slug: '$product.slug',
          price: '$product.price',
          images: [{ id: '0', url: { $arrayElemAt: ['$product.images', 0] } }],
        },
      },
    },
  ]);
}

export async function listCustomers(query: ListCustomersQuery) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { role: 'customer' };
  if (query.search) {
    filter.$or = [
      { name: new RegExp(query.search, 'i') },
      { email: new RegExp(query.search, 'i') },
    ];
  }

  const [customers, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return { customers, pagination: buildPaginationMeta(page, limit, total) };
}

export async function getCustomer(id: string): Promise<IUser> {
  const customer = await User.findOne({ _id: id, role: 'customer' });
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }
  return customer;
}

export async function setCustomerStatus(id: string, isActive: boolean): Promise<IUser> {
  const customer = await getCustomer(id);
  customer.isActive = isActive;
  await customer.save();
  return customer;
}
