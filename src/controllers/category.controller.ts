import { Request, Response } from 'express';
import * as categoryService from '../services/category.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendResponse } from '../utils/sendResponse';
import { gate } from '../utils/approvalGate';
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
    await gate(
      req,
      res,
      { module: 'category', action: 'create', targetLabel: req.body.name, payload: req.body, appliedStatus: 201, appliedMessage: 'Category created successfully' },
      () => categoryService.createCategory(req.body),
    );
  },
);

export const update = asyncHandler(
  async (req: Request<{ id: string }, unknown, UpdateCategoryInput>, res: Response) => {
    await gate(
      req,
      res,
      { module: 'category', action: 'update', targetId: req.params.id, targetLabel: req.body.name, payload: req.body, appliedMessage: 'Category updated successfully' },
      () => categoryService.updateCategory(req.params.id, req.body),
    );
  },
);

export const remove = asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
  await gate(
    req,
    res,
    { module: 'category', action: 'delete', targetId: req.params.id, appliedMessage: 'Category deleted successfully' },
    () => categoryService.deleteCategory(req.params.id),
  );
});
