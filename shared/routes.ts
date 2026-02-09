import { z } from 'zod';
import { insertArticleSchema, articleSchema, articleVersionSchema, searchParamsSchema } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  articles: {
    list: {
      method: 'GET' as const,
      path: '/api/articles' as const,
      input: searchParamsSchema,
      responses: {
        200: z.array(articleSchema),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/articles/:id' as const,
      responses: {
        200: articleSchema,
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/articles' as const,
      input: insertArticleSchema,
      responses: {
        201: articleSchema,
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/articles/:id' as const,
      input: insertArticleSchema.partial(),
      responses: {
        200: articleSchema,
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/articles/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  versions: {
    list: {
      method: 'GET' as const,
      path: '/api/articles/:id/versions' as const,
      responses: {
        200: z.array(articleVersionSchema),
        404: errorSchemas.notFound,
      },
    },
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
