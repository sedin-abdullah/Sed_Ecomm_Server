import { Request, Response } from 'express';
import * as productService from '../services/product.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from '../validators/product.validator';

export const list = asyncHandler(
  async (req: Request<unknown, unknown, unknown, ListProductsQuery>, res: Response) => {
    const { products, pagination } = await productService.listProducts(req.query);
    sendResponse(res, 200, { data: products, pagination });
  },
);

export const suggest = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const suggestions = await productService.suggestProducts(q);
  sendResponse(res, 200, { data: suggestions });
});

export const facets = asyncHandler(async (_req: Request, res: Response) => {
  const data = await productService.getProductFilterFacets();
  sendResponse(res, 200, { data });
});

export const getBySlug = asyncHandler(async (req: Request<{ slug: string }>, res: Response) => {
  const product = await productService.getProductBySlug(req.params.slug);
  sendResponse(res, 200, { data: product });
});

export const related = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const products = await productService.getRelatedProducts(req.params.id);
  sendResponse(res, 200, { data: products });
});

export const create = asyncHandler(
  async (req: Request<unknown, unknown, CreateProductInput>, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const product = await productService.createProduct(req.body, files);
    sendResponse(res, 201, { data: product, message: 'Product created successfully' });
  },
);

export const update = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateProductInput>, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const product = await productService.updateProduct(req.params.id, req.body, files);
    sendResponse(res, 200, { data: product, message: 'Product updated successfully' });
  },
);

export const remove = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await productService.deleteProduct(req.params.id);
  sendResponse(res, 200, { message: 'Product deleted successfully' });
});

export const addImages = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || !files.length) {
    throw new AppError('At least one image file is required', 400);
  }
  const product = await productService.addProductImages(req.params.id, files);
  sendResponse(res, 200, { data: product, message: 'Images added successfully' });
});
