import { Request, Response } from 'express';
import * as productService from '../services/product.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { gate } from '../utils/approvalGate';
import { saveUploadedFile } from '../utils/saveUpload';
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
    // Resolve uploaded files to URLs once, so the payload is file-free and both
    // the manager-apply and admin-enqueue paths use identical data.
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const uploaded = files.map((f) => saveUploadedFile(f, 'products'));
    const payload = { ...req.body, images: [...(req.body.images ?? []), ...uploaded] };
    await gate(
      req,
      res,
      { module: 'product', action: 'create', targetLabel: req.body.name, payload, appliedStatus: 201, appliedMessage: 'Product created successfully' },
      () => productService.createProduct(payload),
    );
  },
);

export const update = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateProductInput>, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const uploaded = files.map((f) => saveUploadedFile(f, 'products'));
    const payload = uploaded.length
      ? { ...req.body, images: [...(req.body.images ?? []), ...uploaded] }
      : { ...req.body };
    await gate(
      req,
      res,
      { module: 'product', action: 'update', targetId: req.params.id, targetLabel: req.body.name, payload, appliedMessage: 'Product updated successfully' },
      () => productService.updateProduct(req.params.id, payload),
    );
  },
);

export const remove = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await gate(
    req,
    res,
    { module: 'product', action: 'delete', targetId: req.params.id, appliedMessage: 'Product deleted successfully' },
    () => productService.deleteProduct(req.params.id),
  );
});

export const addImages = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || !files.length) {
    throw new AppError('At least one image file is required', 400);
  }
  const product = await productService.addProductImages(req.params.id, files);
  sendResponse(res, 200, { data: product, message: 'Images added successfully' });
});
