import { IWishlist, Wishlist } from '../models/Wishlist';
import { Product } from '../models/Product';
import { AppError } from '../utils/AppError';

const PRODUCT_POPULATE = 'name slug images price discountPrice stock rating numReviews';

async function getOrCreateWishlist(userId: string): Promise<IWishlist> {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, products: [] });
  }
  return wishlist;
}

export async function getWishlist(userId: string): Promise<IWishlist> {
  const wishlist = await getOrCreateWishlist(userId);
  return wishlist.populate('products', PRODUCT_POPULATE);
}

export async function addProduct(userId: string, productId: string): Promise<IWishlist> {
  const productExists = await Product.exists({ _id: productId });
  if (!productExists) {
    throw new AppError('Product not found', 404);
  }

  const wishlist = await getOrCreateWishlist(userId);
  const alreadyIn = wishlist.products.some((id) => String(id) === productId);
  if (!alreadyIn) {
    wishlist.products.push(productExists._id);
    await wishlist.save();
  }

  return wishlist.populate('products', PRODUCT_POPULATE);
}

export async function removeProduct(userId: string, productId: string): Promise<IWishlist> {
  const wishlist = await getOrCreateWishlist(userId);
  wishlist.products = wishlist.products.filter((id) => String(id) !== productId) as typeof wishlist.products;
  await wishlist.save();
  return wishlist.populate('products', PRODUCT_POPULATE);
}
