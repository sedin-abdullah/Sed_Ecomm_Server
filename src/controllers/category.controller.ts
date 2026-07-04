import { Request, Response } from 'express';
import * as categoryService from '../services/category.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const tree = req.query.tree === 'true';
  const categories = await categoryService.listCategories(tree);
  sendResponse(res, 200, { data: categories });
});

export const getBySlug = asyncHandler(async (req: Request<{ slug: string }>, res: Response) => {
  const category = await categoryService.getCategoryBySlug(req.params.slug);
  sendResponse(res, 200, { data: category });
});

export const create = asyncHandler(
  async (req: Request<unknown, unknown, CreateCategoryInput>, res: Response) => {
    const category = await categoryService.createCategory(req.body);
    sendResponse(res, 201, { data: category, message: 'Category created successfully' });
  },
);

export const update = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateCategoryInput>, res: Response) => {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    sendResponse(res, 200, { data: category, message: 'Category updated successfully' });
  },
);

export const remove = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await categoryService.deleteCategory(req.params.id);
  sendResponse(res, 200, { message: 'Category deleted successfully' });
});
