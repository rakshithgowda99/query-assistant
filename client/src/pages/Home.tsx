import { useState } from "react";
import { useArticles } from "@/hooks/use-articles";
import { Sidebar } from "@/components/Sidebar";
import { ArticleCard } from "@/components/ArticleCard";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Frown } from "lucide-react";

export default function Home() {
  const [search, setSearch] = useState("");
  const { data: articles, isLoading, error } = useArticles({ q: search });

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-h-screen">
        <div className="max-w-6xl mx-auto space-y-8">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-display font-bold text-foreground">Library</h2>
              <p className="text-muted-foreground mt-1">Manage your personal knowledge base</p>
            </div>

            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search articles..."
                className="pl-10 bg-white shadow-sm border-border focus:border-primary/50 transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p>Loading your knowledge...</p>
            </div>
          ) : error ? (
             <div className="h-64 flex flex-col items-center justify-center text-destructive gap-4 bg-destructive/5 rounded-2xl border border-destructive/20">
              <Frown className="w-8 h-8" />
              <p>Failed to load articles. Please try again.</p>
            </div>
          ) : articles?.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground gap-4 border-2 border-dashed border-border rounded-2xl bg-secondary/20">
              <Search className="w-8 h-8 opacity-20" />
              <p>No articles found matching your criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles?.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
