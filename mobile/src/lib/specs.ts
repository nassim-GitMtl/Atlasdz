import type { ProductSpecKey } from '@/lib/types';

// Every key of the API contract must be listed (the type checker enforces it), in display order.
const ALL: Record<ProductSpecKey, true> = {
  brand: true,
  model: true,
  material: true,
  color: true,
  size: true,
  dimensions: true,
  weight: true,
  capacity: true,
  power: true,
  warranty: true,
  origin: true,
};

/** Characteristics a seller may state. */
export const SPEC_KEYS = Object.keys(ALL) as ProductSpecKey[];
