import { z } from "zod";

// Article Types
export const insertArticleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
});

export const articleSchema = insertArticleSchema.extend({
  id: z.string(),
  createdAt: z.string(), // ISO string from date
  updatedAt: z.string(), // ISO string from date
});

export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = z.infer<typeof articleSchema>;

// Version Types
export const articleVersionSchema = z.object({
  id: z.string(),
  articleId: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});

export type ArticleVersion = z.infer<typeof articleVersionSchema>;

// Search Types
export const searchParamsSchema = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
});

export type SearchParams = z.infer<typeof searchParamsSchema>;
