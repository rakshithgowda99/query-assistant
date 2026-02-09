import { Link, useRoute, useLocation } from "wouter";
import { useArticle, useDeleteArticle } from "@/hooks/use-articles";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, ArrowLeft, Calendar, Tag, Edit, Trash2, History } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function ArticleView() {
  const [, params] = useRoute("/article/:id");
  const [, setLocation] = useLocation();
  const id = params?.id || "";
  
  const { data: article, isLoading, error } = useArticle(id);
  const deleteMutation = useDeleteArticle();
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Article deleted" });
      setLocation("/");
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <h2 className="text-xl font-semibold">Article not found</h2>
          <Link href="/">
            <Button variant="outline">Back to Library</Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 p-4 md:p-12 overflow-y-auto max-h-screen">
        <div className="max-w-4xl mx-auto">
          {/* Header Navigation */}
          <div className="flex items-center justify-between mb-8">
            <Link href="/">
              <Button variant="ghost" className="gap-2 pl-0 hover:pl-2 transition-all text-muted-foreground hover:text-primary">
                <ArrowLeft className="w-4 h-4" /> Back to Library
              </Button>
            </Link>
            
            <div className="flex items-center gap-2">
              <Link href={`/article/${id}/versions`}>
                <Button variant="ghost" size="sm" className="gap-2">
                  <History className="w-4 h-4" /> History
                </Button>
              </Link>
              <Link href={`/edit/${id}`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Edit className="w-4 h-4" /> Edit
                </Button>
              </Link>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this article?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the article
                      "{article.title}" and remove it from our servers.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Article Header */}
          <header className="mb-10 pb-8 border-b border-border/50">
            <div className="flex flex-wrap gap-3 mb-6">
              {article.tags.map(tag => (
                <span key={tag} className="px-2.5 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs font-medium flex items-center gap-1">
                  <Tag className="w-3 h-3 opacity-50" /> {tag}
                </span>
              ))}
            </div>
            
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-6 leading-tight">
              {article.title}
            </h1>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground font-medium">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Updated {format(new Date(article.updatedAt), 'MMMM d, yyyy')}
              </span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Created {format(new Date(article.createdAt), 'MMM d, yyyy')}</span>
            </div>
          </header>

          {/* Article Content */}
          <article className="prose-content min-h-[400px]">
            <ReactMarkdown>{article.content}</ReactMarkdown>
          </article>
        </div>
      </main>
    </div>
  );
}
