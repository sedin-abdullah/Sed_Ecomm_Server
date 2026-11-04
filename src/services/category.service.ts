import { prisma } from '../config/prisma';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../utils/AppError';
import { toApi } from '../utils/serialize';
import { uniqueSlug } from '../utils/slug';
import { assertUuid } from '../utils/uuid';
import { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

// Summary of the related parent category as the client expects it.
const PARENT_SELECT = { select: { id: true, name: true, slug: true } } as const;

type CategoryNode = Record<string, unknown> & { children: CategoryNode[] };

/**
 * Shapes a Prisma category for the API, preserving the old contract: `_id`
 * mirrors `id` (added by toApi, including on the nested parent), and `parent`
 * is the populated object when included, otherwise the bare id string or null
 * (matching how create/update used to return an unpopulated parent).
 */
function serializeCategory(category: Record<string, unknown>): Record<string, unknown> {
  const api = toApi(category) as Record<string, unknown>;
  const { parentId, parent, ...rest } = api;

  return {
    ...rest,
    parent: parent !== undefined ? parent : (parentId ?? null),
  };
}

async function categorySlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const found = await prisma.category.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return found !== null;
}

function buildTree(rows: { id: string; parentId: string | null }[], nodes: Map<string, CategoryNode>): CategoryNode[] {
  const roots: CategoryNode[] = [];
  rows.forEach((row) => {
    const node = nodes.get(row.id)!;
    if (row.parentId && nodes.has(row.parentId)) {
      nodes.get(row.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export async function listCategories(tree = false) {
  const rows = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { parent: PARENT_SELECT },
  });

  if (!tree) {
    return rows.map(serializeCategory);
  }

  const nodes = new Map<string, CategoryNode>();
  rows.forEach((row) => {
    nodes.set(row.id, { ...serializeCategory(row), children: [] });
  });
  return buildTree(rows, nodes);
}

export async function getCategoryBySlug(slug: string) {
  const category = await prisma.category.findUnique({ where: { slug }, include: { parent: PARENT_SELECT } });
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  return serializeCategory(category);
}

export async function createCategory(input: CreateCategoryInput) {
  if (input.parent) {
    const parentExists = await prisma.category.findUnique({ where: { id: input.parent }, select: { id: true } });
    if (!parentExists) {
      throw new AppError('Parent category not found', 400);
    }
  }

  const slug = await uniqueSlug(input.name, (s) => categorySlugTaken(s));

  const category = await prisma.category.create({
    data: {
      name: input.name,
      slug,
      parentId: input.parent ?? null,
      image: input.image,
    },
  });

  return serializeCategory(category);
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  assertUuid(id);
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError('Category not found', 404);
  }

  const data: Prisma.CategoryUpdateInput = {};

  if (input.parent !== undefined) {
    if (input.parent === id) {
      throw new AppError('A category cannot be its own parent', 400);
    }
    if (input.parent) {
      const parentExists = await prisma.category.findUnique({ where: { id: input.parent }, select: { id: true } });
      if (!parentExists) {
        throw new AppError('Parent category not found', 400);
      }
      data.parent = { connect: { id: input.parent } };
    } else {
      data.parent = { disconnect: true };
    }
  }

  if (input.name !== undefined) {
    data.name = input.name;
    if (input.name !== existing.name) {
      data.slug = await uniqueSlug(input.name, (s) => categorySlugTaken(s, id));
    }
  }

  if (input.image !== undefined) data.image = input.image;

  const category = await prisma.category.update({ where: { id }, data });
  return serializeCategory(category);
}

export async function deleteCategory(id: string): Promise<void> {
  assertUuid(id);
  const existing = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    throw new AppError('Category not found', 404);
  }

  const [hasChildren, hasProducts] = await Promise.all([
    prisma.category.findFirst({ where: { parentId: id }, select: { id: true } }),
    prisma.product.findFirst({ where: { categoryId: id }, select: { id: true } }),
  ]);

  if (hasChildren) {
    throw new AppError('Cannot delete a category that has child categories', 409);
  }
  if (hasProducts) {
    throw new AppError('Cannot delete a category that still has products', 409);
  }

  await prisma.category.delete({ where: { id } });
}
