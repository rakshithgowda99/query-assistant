import { useLocation, useRoute } from "wouter";
import { useArticle, useUpdateArticle } from "@/hooks/use-articles";
import { Sidebar } from "@/components/Sidebar";
import { ArticleEditor } from "@/components/ArticleEditor";
import { type InsertArticle } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function EditArticle() {
  const [, params] = useRoute("/edit/:id");
  const [, setLocation] = useLocation();
  const id = params?.id || "";
  
  const { data: article, isLoading } = useArticle(id);
  const updateMutation = useUpdateArticle();
  const { toast } = useToast();

  const handleSubmit = async (data: InsertArticle) => {
    await updateMutation.mutateAsync({ id, ...data });
    toast({
      title: "Success",
      description: "Article updated successfully",
    });
    setLocation(`/article/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!article) return <div>Article not found</div>;

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full h-full">
           <div className="mb-6">
             <h1 className="text-2xl font-display font-bold text-foreground">Edit Article</h1>
             <p className="text-muted-foreground text-sm">Update your content</p>
           </div>
           
           <div className="flex-1 h-[calc(100vh-140px)]">
             <ArticleEditor 
               initialData={article}
               onSubmit={handleSubmit} 
               isSubmitting={updateMutation.isPending}
               onCancel={() => setLocation(`/article/${id}`)}
             />
           </div>
        </div>
      </main>
    </div>
  );
}
