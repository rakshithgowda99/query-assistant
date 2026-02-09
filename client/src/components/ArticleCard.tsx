import { Link } from "wouter";
import { format } from "date-fns";
import { Tag as TagIcon, Clock, ChevronRight } from "lucide-react";
import { type Article } from "@shared/schema";

interface ArticleCardProps {
  article: Article;
}

export function ArticleCard({ article }: ArticleCardProps) {
  return (
    <Link href={`/article/${article.id}`} className="group block">
      <div className="
        h-full bg-card p-6 rounded-2xl border border-border/50
        shadow-sm hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5
        hover:border-primary/20 transition-all duration-300
      ">
        <div className="flex flex-col h-full gap-4">
          <div className="space-y-2">
            <h3 className="font-display font-bold text-xl text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {article.title}
            </h3>
            <p className="text-muted-foreground text-sm line-clamp-3 leading-relaxed">
              {article.content.slice(0, 150)}...
            </p>
          </div>

          <div className="mt-auto pt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {format(new Date(article.updatedAt), 'MMM d, yyyy')}
              </span>
              {article.tags.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <TagIcon className="w-3.5 h-3.5" />
                  {article.tags[0]}
                  {article.tags.length > 1 && ` +${article.tags.length - 1}`}
                </span>
              )}
            </div>
            
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary flex items-center font-medium">
              Read <ChevronRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
