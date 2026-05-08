import { z } from "zod";

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export function paginatedResponse<T>(data: T[], params: PaginationParams): PaginatedResponse<T> {
  const hasMore = data.length > params.limit;
  const items = hasMore ? data.slice(0, params.limit) : data;
  return {
    data: items,
    pagination: {
      limit: params.limit,
      offset: params.offset,
      hasMore,
    },
  };
}
