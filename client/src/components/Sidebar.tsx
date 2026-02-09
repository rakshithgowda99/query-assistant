import { Link, useLocation } from "wouter";
import { BookOpen, Search, Star, Tag, Plus, Library } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { icon: Library, label: "All Articles", href: "/" },
    { icon: Star, label: "Favorites", href: "/favorites" }, // Placeholder for favorite functionality
    { icon: Tag, label: "Tags", href: "/tags" },
  ];

  return (
    <aside className="w-64 border-r border-border h-screen sticky top-0 bg-secondary/20 hidden md:flex flex-col p-6 gap-8">
      <div className="flex items-center gap-3 px-2">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
          <BookOpen className="w-5 h-5" />
        </div>
        <h1 className="font-display font-bold text-xl tracking-tight text-primary">WikiBase</h1>
      </div>

      <div className="space-y-2">
        <Link href="/new">
          <Button className="w-full justify-start gap-2 shadow-lg shadow-primary/10 hover:shadow-primary/20 transition-all font-medium">
            <Plus className="w-4 h-4" />
            New Article
          </Button>
        </Link>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive 
                ? "bg-white text-primary shadow-sm border border-border/50" 
                : "text-muted-foreground hover:bg-black/5 hover:text-foreground"
            )}>
              <item.icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-muted-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 bg-card rounded-xl border border-border/50 shadow-sm">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pro Tip</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Use markdown shortcuts like # for headers and * for lists to format faster.
        </p>
      </div>
    </aside>
  );
}
