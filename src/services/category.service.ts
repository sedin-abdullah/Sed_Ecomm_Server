import { Category, ICategory } from '../models/Category';
import { Product } from '../models/Product';
import { AppError } from '../utils/AppError';
import { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

interface CategoryTreeNode {
  children: CategoryTreeNode[];
  [key: string]: unknown;
}

function buildTree(categories: Record<string, unknown>[]): CategoryTreeNode[] {
  const map = new Map<string, CategoryTreeNode>();
  categories.forEach((c) => map.set(String(c._id), { ...c, children: [] }));

  const roots: CategoryTreeNode[] = [];
  categories.forEach((c) => {
    const node = map.get(String(c._id)) as CategoryTreeNode;
    const parent = c.parent as { _id: string } | string | null | undefined;
    const parentId = parent ? String(typeof parent === 'object' ? parent._id : parent) : null;

    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export async function listCategories(tree = false) {
  const categories = (await Category.find().sort({ name: 1 }).populate('parent', 'name slug').lean()).map((c) => ({
    ...c,
    id: String(c._id),
  }));
  return tree ? buildTree(categories) : categories;
}

export async function getCategoryBySlug(slug: string): Promise<ICategory> {
  const category = await Category.findOne({ slug }).populate('parent', 'name slug');
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  return category;
}

export async function createCategory(input: CreateCategoryInput): Promise<ICategory> {
  if (input.parent) {
    const parentExists = await Category.exists({ _id: input.parent });
    if (!parentExists) {
      throw new AppError('Parent category not found', 400);
    }
  }

  return Category.create({
    name: input.name,
    parent: input.parent ?? null,
    image: input.image,
  });
}

export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<ICategory> {
  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Category not found', 404);
  }

  if (input.parent !== undefined) {
    if (input.parent === id) {
      throw new AppError('A category cannot be its own parent', 400);
    }
    if (input.parent) {
      const parentExists = await Category.exists({ _id: input.parent });
      if (!parentExists) {
        throw new AppError('Parent category not found', 400);
      }
    }
    category.parent = input.parent ? (input.parent as unknown as ICategory['parent']) : undefined;
  }

  if (input.name !== undefined) category.name = input.name;
  if (input.image !== undefined) category.image = input.image;

  await category.save();
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Category not found', 404);
  }

  const [hasChildren, hasProducts] = await Promise.all([
    Category.exists({ parent: id }),
    Product.exists({ category: id }),
  ]);

  if (hasChildren) {
    throw new AppError('Cannot delete a category that has child categories', 409);
  }
  if (hasProducts) {
    throw new AppError('Cannot delete a category that still has products', 409);
  }

  await category.deleteOne();
}
