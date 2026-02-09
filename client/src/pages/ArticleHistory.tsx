import { Link, useRoute } from "wouter";
import { useArticle, useArticleVersions } from "@/hooks/use-articles";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Clock, FileText } from "lucide-react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ArticleHistory() {
  const [, params] = useRoute("/article/:id/versions");
  const id = params?.id || "";
  
  const { data: article } = useArticle(id);
  const { data: versions, isLoading } = useArticleVersions(id);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 p-4 md:p-12 overflow-y-auto h-screen">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href={`/article/${id}`}>
              <Button variant="ghost" className="gap-2 pl-0 mb-4 text-muted-foreground hover:text-primary">
                <ArrowLeft className="w-4 h-4" /> Back to Article
              </Button>
            </Link>
            
            <h1 className="text-3xl font-display font-bold text-foreground">
              Version History
            </h1>
            <p className="text-muted-foreground mt-2">
              History for <span className="font-semibold text-foreground">{article?.title}</span>
            </p>
          </div>

          <div className="relative border-l-2 border-border ml-4 space-y-8 pb-10">
            {versions?.map((version, index) => (
              <div key={version.id} className="relative pl-8 group">
                {/* Timeline dot */}
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-background border-2 border-muted-foreground group-hover:border-primary group-hover:scale-110 transition-all" />
                
                <div className="bg-card p-6 rounded-xl border border-border shadow-sm group-hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
                      <Clock className="w-4 h-4" />
                      {format(new Date(version.updatedAt), 'MMM d, yyyy @ h:mm a')}
                    </div>
                    {index === 0 && (
                      <span className="bg-accent/10 text-accent-foreground px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">
                        Current
                      </span>
                    )}
                  </div>
                  
                  <div className="bg-secondary/30 p-4 rounded-lg text-sm font-mono text-muted-foreground max-h-32 overflow-hidden relative">
                    {version.content}
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-secondary/30 to-transparent" />
                  </div>
                  
                  {/* Future enhancement: Add restore button */}
                  {/* <div className="mt-4 pt-4 border-t border-border/50 flex justify-end">
                    <Button variant="outline" size="sm">Restore this version</Button>
                  </div> */}
                </div>
              </div>
            ))}

            {(!versions || versions.length === 0) && (
              <div className="pl-8 text-muted-foreground italic">No history available for this article yet.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
