import { useLocation } from "wouter";
import { useCreateArticle } from "@/hooks/use-articles";
import { Sidebar } from "@/components/Sidebar";
import { ArticleEditor } from "@/components/ArticleEditor";
import { type InsertArticle } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function CreateArticle() {
  const [, setLocation] = useLocation();
  const createMutation = useCreateArticle();
  const { toast } = useToast();

  const handleSubmit = async (data: InsertArticle) => {
    const newArticle = await createMutation.mutateAsync(data);
    toast({
      title: "Success",
      description: "Article created successfully",
    });
    setLocation(`/article/${newArticle.id}`);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full h-full">
           <div className="mb-6">
             <h1 className="text-2xl font-display font-bold text-foreground">Create New Article</h1>
             <p className="text-muted-foreground text-sm">Draft a new piece of knowledge</p>
           </div>
           
           <div className="flex-1 h-[calc(100vh-140px)]">
             <ArticleEditor 
               onSubmit={handleSubmit} 
               isSubmitting={createMutation.isPending}
               onCancel={() => setLocation("/")}
             />
           </div>
        </div>
      </main>
    </div>
  );
}
