import { ArticleModel, VersionModel } from './models';
import type { InsertArticle, Article, ArticleVersion, SearchParams } from '@shared/schema';

export interface IStorage {
  getArticles(params?: SearchParams): Promise<Article[]>;
  getArticle(id: string): Promise<Article | undefined>;
  createArticle(article: InsertArticle): Promise<Article>;
  updateArticle(id: string, article: Partial<InsertArticle>): Promise<Article | undefined>;
  deleteArticle(id: string): Promise<void>;
  getArticleVersions(articleId: string): Promise<ArticleVersion[]>;
}

export class MongoStorage implements IStorage {
  async getArticles(params?: SearchParams): Promise<Article[]> {
    const query: any = {};
    if (params?.q) {
      query.$or = [
        { title: { $regex: params.q, $options: 'i' } },
        { content: { $regex: params.q, $options: 'i' } },
      ];
    }
    if (params?.tag) {
      query.tags = params.tag;
    }
    
    // @ts-ignore - mongoose types mismatch with zod types sometimes
    const articles = await ArticleModel.find(query).sort({ updatedAt: -1 });
    return articles as unknown as Article[];
  }

  async getArticle(id: string): Promise<Article | undefined> {
    try {
      const article = await ArticleModel.findById(id);
      return article ? (article as unknown as Article) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  async createArticle(insertArticle: InsertArticle): Promise<Article> {
    const article = await ArticleModel.create(insertArticle);
    // Create initial version
    await VersionModel.create({
      articleId: article._id,
      content: article.content,
    });
    return article as unknown as Article;
  }

  async updateArticle(id: string, updates: Partial<InsertArticle>): Promise<Article | undefined> {
    try {
      const article = await ArticleModel.findByIdAndUpdate(id, updates, { new: true });
      if (article && updates.content) {
        // Create new version if content changed
        await VersionModel.create({
          articleId: article._id,
          content: updates.content,
        });
      }
      return article ? (article as unknown as Article) : undefined;
    } catch (e) {
      return undefined;
    }
  }

  async deleteArticle(id: string): Promise<void> {
    try {
      await ArticleModel.findByIdAndDelete(id);
      await VersionModel.deleteMany({ articleId: id });
    } catch (e) {
      // ignore
    }
  }

  async getArticleVersions(articleId: string): Promise<ArticleVersion[]> {
    try {
      const versions = await VersionModel.find({ articleId }).sort({ createdAt: -1 });
      return versions as unknown as ArticleVersion[];
    } catch (e) {
      return [];
    }
  }
}

export const storage = new MongoStorage();
