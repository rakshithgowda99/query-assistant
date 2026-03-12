import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { connectDB } from "./db";
import { z } from "zod";
import { runQueryAgent, runEvaluation, TEST_SCENARIOS } from "./kb-agent";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await connectDB();

  app.get(api.articles.list.path, async (req, res) => {
    const params = api.articles.list.input.parse(req.query);
    const articles = await storage.getArticles(params);
    res.json(articles);
  });

  app.get(api.articles.get.path, async (req, res) => {
    const article = await storage.getArticle(req.params.id);
    if (!article) {
      return res.status(404).json({ message: 'Article not found' });
    }
    res.json(article);
  });

  app.post(api.articles.create.path, async (req, res) => {
    try {
      const input = api.articles.create.input.parse(req.body);
      const article = await storage.createArticle(input);
      res.status(201).json(article);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.articles.update.path, async (req, res) => {
    try {
      const input = api.articles.update.input.parse(req.body);
      const article = await storage.updateArticle(req.params.id, input);
      if (!article) {
        return res.status(404).json({ message: 'Article not found' });
      }
      res.json(article);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.delete(api.articles.delete.path, async (req, res) => {
    await storage.deleteArticle(req.params.id);
    res.status(204).end();
  });

  app.get(api.versions.list.path, async (req, res) => {
    const versions = await storage.getArticleVersions(req.params.id);
    res.json(versions);
  });

  app.post('/api/kb/query', async (req, res) => {
    try {
      const schema = z.object({
        query: z.string().min(1).max(500),
        seed: z.number().int().min(0).max(999999),
        topK: z.number().int().min(1).max(10).optional(),
      });
      const input = schema.parse(req.body);

      // Fetch real wiki articles from MongoDB and convert to KBArticle format
      const wikiArticles = await storage.getArticles();
      const articles = wikiArticles.map(a => ({
        id: a.id,
        title: a.title,
        tags: a.tags ?? [],
        content: a.content,
      }));

      const run = await runQueryAgent({ ...input, articles });
      res.json(run);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ message });
    }
  });

  app.get('/api/kb/scenarios', (_req, res) => {
    res.json(TEST_SCENARIOS);
  });

  app.get('/api/kb/evaluate', (_req, res) => {
    const evaluation = runEvaluation();
    res.json(evaluation);
  });

  app.get('/api/kb/articles', async (_req, res) => {
    const wikiArticles = await storage.getArticles();
    res.json(wikiArticles.map(a => ({
      id: a.id,
      title: a.title,
      tags: a.tags ?? [],
      content: a.content,
    })));
  });

  return httpServer;
}
