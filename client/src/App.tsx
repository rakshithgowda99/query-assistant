import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Pages
import Home from "@/pages/Home";
import ArticleView from "@/pages/ArticleView";
import CreateArticle from "@/pages/CreateArticle";
import EditArticle from "@/pages/EditArticle";
import ArticleHistory from "@/pages/ArticleHistory";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/new" component={CreateArticle} />
      <Route path="/article/:id" component={ArticleView} />
      <Route path="/edit/:id" component={EditArticle} />
      <Route path="/article/:id/versions" component={ArticleHistory} />
      
      {/* Fallback routes for demo sidebar links */}
      <Route path="/favorites" component={Home} />
      <Route path="/tags" component={Home} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
