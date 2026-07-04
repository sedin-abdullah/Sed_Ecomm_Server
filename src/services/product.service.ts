import { FilterQuery, Types } from 'mongoose';
import { Category } from '../models/Category';
import { IProduct, Product, toClientImages } from '../models/Product';
import { Review } from '../models/Review';
import { AppError } from '../utils/AppError';
import { buildPaginationMeta, parsePagination } from '../utils/pagination';
import { saveUploadedFile } from '../utils/saveUpload';
import { CreateProductInput, ListProductsQuery, UpdateProductInput } from '../validators/product.validator';

const SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  newest: { createdAt: -1 },
  popular: { numReviews: -1 },
  rating: { rating: -1 },
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolves a category slug or id to itself plus its direct children ids. */
async function resolveCategoryIds(categoryParam: string): Promise<string[]> {
  const category = Types.ObjectId.isValid(categoryParam)
    ? await Category.findById(categoryParam)
    : await Category.findOne({ slug: categoryParam });

  if (!category) return [];

  const children = await Category.find({ parent: category._id }).select('_id');
  return [String(category._id), ...children.map((c) => String(c._id))];
}

export async function listProducts(query: ListProductsQuery) {
  const filter: FilterQuery<IProduct> = {};

  if (query.category) {
    const ids = await resolveCategoryIds(query.category);
    // No matching category → force an empty result set rather than ignoring the filter.
    filter.category = { $in: ids.length ? ids : [new Types.ObjectId()] };
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = query.minPrice;
    if (query.maxPrice !== undefined) filter.price.$lte = query.maxPrice;
  }

  if (query.rating !== undefined) filter.rating = { $gte: query.rating };
  if (query.brand) filter.brand = new RegExp(`^${escapeRegex(query.brand)}$`, 'i');
  if (query.size) filter['variants.sizes'] = query.size;
  if (query.color) filter['variants.colors'] = new RegExp(`^${escapeRegex(query.color)}$`, 'i');
  if (query.featured) filter.isFeatured = true;
  if (query.flashSale) filter.isFlashSale = true;
  if (query.newArrival) filter.isNewArrival = true;
  if (query.bestSeller) filter.isBestSeller = true;
  if (query.inStock) filter.stock = { $gt: 0 };
  // A product is "on sale" when it has a positive discountPrice; the $gt check
  // also excludes docs where the field is absent (no discount).
  if (query.onSale) filter.discountPrice = { $gt: 0 };
  if (query.search) filter.$text = { $search: query.search };

  const { page, limit, skip } = parsePagination(query);

  let cursor = Product.find(filter, query.search ? { score: { $meta: 'textScore' } } : undefined);
  cursor = query.search && !query.sort
    ? cursor.sort({ score: { $meta: 'textScore' } })
    : cursor.sort(SORT_MAP[query.sort ?? 'newest']);

  const [products, total] = await Promise.all([
    cursor.skip(skip).limit(limit).populate('category', 'name slug').lean(),
    Product.countDocuments(filter),
  ]);

  return {
    products: products.map((p) => {
      const category = p.category as unknown as { _id: Types.ObjectId; name: string; slug: string };
      return {
        ...p,
        id: String(p._id),
        images: toClientImages(p.images),
        category: category ? { ...category, id: String(category._id) } : category,
      };
    }),
    pagination: buildPaginationMeta(page, limit, total),
  };
}

export async function getProductBySlug(slug: string): Promise<IProduct> {
  const product = await Product.findOne({ slug }).populate('category', 'name slug');
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  return product;
}

export async function getRelatedProducts(id: string, limit = 8) {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const related = await Product.find({ category: product.category, _id: { $ne: product._id } })
    .sort({ rating: -1, createdAt: -1 })
    .limit(limit)
    .populate('category', 'name slug')
    .lean();

  return related.map((p) => ({ ...p, id: String(p._id), images: toClientImages(p.images) }));
}

export async function suggestProducts(q: string) {
  if (!q || !q.trim()) return [];

  const regex = new RegExp(escapeRegex(q.trim()), 'i');
  const suggestions = await Product.find({ name: regex }).select('name slug images').limit(8).lean();

  return suggestions.map((p) => ({
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    image: p.images[0],
  }));
}

/** Distinct filter facets present in the catalog, for building the shop filter UI. */
export async function getProductFilterFacets() {
  const [brands, sizes, colors] = await Promise.all([
    Product.distinct('brand'),
    Product.distinct('variants.sizes'),
    Product.distinct('variants.colors'),
  ]);

  const clean = (values: unknown[]) =>
    (values.filter((v) => typeof v === 'string' && v.trim() !== '') as string[]).sort((a, b) =>
      a.localeCompare(b),
    );

  return { brands: clean(brands), sizes: clean(sizes), colors: clean(colors) };
}

export async function createProduct(input: CreateProductInput, files?: Express.Multer.File[]): Promise<IProduct> {
  const category = await Category.exists({ _id: input.category });
  if (!category) {
    throw new AppError('Category not found', 400);
  }

  const uploadedImages = (files ?? []).map((f) => saveUploadedFile(f, 'products'));
  const images = [...(input.images ?? []), ...uploadedImages];

  return Product.create({
    name: input.name,
    description: input.description,
    category: input.category,
    brand: input.brand,
    price: input.price,
    discountPrice: input.discountPrice,
    stock: input.stock,
    images,
    variants: { sizes: input.sizes ?? [], colors: input.colors ?? [] },
    tags: input.tags ?? [],
    isFeatured: input.isFeatured ?? false,
    isFlashSale: input.isFlashSale ?? false,
    flashSaleEndsAt: input.flashSaleEndsAt,
    isNewArrival: input.isNewArrival ?? false,
    isBestSeller: input.isBestSeller ?? false,
  });
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  files?: Express.Multer.File[],
): Promise<IProduct> {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  if (input.category !== undefined) {
    const categoryExists = await Category.exists({ _id: input.category });
    if (!categoryExists) {
      throw new AppError('Category not found', 400);
    }
    product.category = input.category as unknown as IProduct['category'];
  }

  if (input.name !== undefined) product.name = input.name;
  if (input.description !== undefined) product.description = input.description;
  if (input.brand !== undefined) product.brand = input.brand;
  if (input.price !== undefined) product.price = input.price;
  if (input.discountPrice !== undefined) product.discountPrice = input.discountPrice;
  if (input.stock !== undefined) product.stock = input.stock;
  if (input.sizes !== undefined) product.variants.sizes = input.sizes;
  if (input.colors !== undefined) product.variants.colors = input.colors;
  if (input.tags !== undefined) product.tags = input.tags;
  if (input.isFeatured !== undefined) product.isFeatured = input.isFeatured;
  if (input.isFlashSale !== undefined) product.isFlashSale = input.isFlashSale;
  if (input.flashSaleEndsAt !== undefined) product.flashSaleEndsAt = input.flashSaleEndsAt;
  if (input.isNewArrival !== undefined) product.isNewArrival = input.isNewArrival;
  if (input.isBestSeller !== undefined) product.isBestSeller = input.isBestSeller;

  const uploadedImages = (files ?? []).map((f) => saveUploadedFile(f, 'products'));
  if (input.images !== undefined || uploadedImages.length) {
    product.images = [...(input.images ?? product.images), ...uploadedImages];
  }

  await product.save();
  return product;
}

export async function deleteProduct(id: string): Promise<void> {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  await Promise.all([product.deleteOne(), Review.deleteMany({ product: id })]);
}

export async function addProductImages(id: string, files: Express.Multer.File[]): Promise<IProduct> {
  if (!files.length) {
    throw new AppError('At least one image file is required', 400);
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  const uploaded = files.map((f) => saveUploadedFile(f, 'products'));
  product.images.push(...uploaded);
  await product.save();
  return product;
}
