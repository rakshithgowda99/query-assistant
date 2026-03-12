import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Play,
  RotateCcw,
  Zap,
  Search,
  BarChart3,
  List,
  Terminal,
  GitBranch,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  Sparkles,
} from "lucide-react";

type AgentState = "IDLE" | "PARSING_QUERY" | "SEARCHING" | "RANKING" | "GENERATING" | "COMPLETE" | "ERROR";

interface StateTransition {
  from: AgentState;
  event: string;
  to: AgentState;
  timestamp: string;
}

interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: string;
  durationMs: number;
}

interface RankedResult {
  article: { id: string; title: string; tags: string[]; content: string };
  score: number;
  matchedTerms: string[];
  titleScore: number;
  tagScore: number;
  contentScore: number;
}

interface RunMetrics {
  totalDocuments: number;
  documentsSearched: number;
  retrievalTimeMs: number;
  topScore: number;
  avgScore: number;
  precision: number;
  recall: number;
  mrr: number;
}

interface AgentRun {
  runId: string;
  seed: number;
  query: string;
  state: AgentState;
  transitions: StateTransition[];
  toolCalls: ToolCall[];
  messages: string[];
  results: RankedResult[];
  llmAnswer: string | null;
  llmModel: string;
  metrics: RunMetrics;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

interface Scenario {
  id: string;
  query: string;
  seed: number;
  expectedTopId: string;
  description: string;
}

interface EvalResult {
  scenario: Scenario;
  run: AgentRun;
  hit: boolean;
}

interface EvalReport {
  results: EvalResult[];
  accuracy: number;
  avgMRR: number;
  avgPrecision: number;
}

const STATE_COLORS: Record<AgentState, string> = {
  IDLE: "bg-gray-100 text-gray-700 border-gray-300",
  PARSING_QUERY: "bg-blue-100 text-blue-700 border-blue-300",
  SEARCHING: "bg-yellow-100 text-yellow-700 border-yellow-300",
  RANKING: "bg-purple-100 text-purple-700 border-purple-300",
  GENERATING: "bg-orange-100 text-orange-700 border-orange-300",
  COMPLETE: "bg-green-100 text-green-700 border-green-300",
  ERROR: "bg-red-100 text-red-700 border-red-300",
};

const STATE_FLOW: AgentState[] = ["IDLE", "PARSING_QUERY", "SEARCHING", "RANKING", "GENERATING", "COMPLETE"];

function StateMachineViz({ currentState, transitions }: { currentState: AgentState; transitions: StateTransition[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 flex-wrap">
        {STATE_FLOW.map((state, idx) => (
          <div key={state} className="flex items-center gap-1">
            <div
              className={`px-2.5 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                currentState === state
                  ? STATE_COLORS[state] + " ring-2 ring-offset-1 ring-current scale-105"
                  : "bg-gray-50 text-gray-400 border-gray-200"
              }`}
              data-testid={`state-${state.toLowerCase()}`}
            >
              {state.replace(/_/g, " ")}
            </div>
            {idx < STATE_FLOW.length - 1 && (
              <ChevronRight className="w-3 h-3 text-gray-400" />
            )}
          </div>
        ))}
        {currentState === "ERROR" && (
          <div className={`px-2.5 py-1.5 rounded-full border text-xs font-semibold ${STATE_COLORS.ERROR} ring-2 ring-offset-1 ring-current scale-105`}>
            ERROR
          </div>
        )}
      </div>

      {transitions.length > 0 && (
        <div className="space-y-1 mt-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Transition History</p>
          <ScrollArea className="h-28">
            <div className="space-y-1 pr-2">
              {transitions.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600 font-mono bg-gray-50 rounded px-2 py-1">
                  <span className="text-gray-400">{new Date(t.timestamp).toLocaleTimeString()}</span>
                  <span className="font-semibold text-gray-700">{t.from}</span>
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                  <span className="text-blue-600 text-[10px] italic">[{t.event}]</span>
                  <ChevronRight className="w-3 h-3 text-gray-400" />
                  <span className="font-semibold text-green-700">{t.to}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

function AIAnswerPanel({ answer, query, llmModel }: { answer: string | null; query: string; llmModel: string }) {
  if (!answer) return null;

  const modelLabel = llmModel?.includes('gemini') ? 'Gemini 2.0 Flash' : 'AI (Pollinations)';
  const modelColor = llmModel?.includes('gemini')
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-purple-100 text-purple-700 border-purple-200';

  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-1.5">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold text-gray-800">AI Answer</span>
        <Badge variant="secondary" className={`text-[10px] ${modelColor}`}>{modelLabel}</Badge>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap" data-testid="text-llm-answer">
        {answer}
      </p>
      <p className="text-[11px] text-gray-400 italic">Based on query: "{query}"</p>
    </div>
  );
}

function ToolCallPanel({ toolCalls }: { toolCalls: ToolCall[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (toolCalls.length === 0) {
    return <p className="text-sm text-gray-400 italic">No tool calls yet.</p>;
  }
  const toolColors: Record<string, string> = {
    parse_query: "text-blue-600",
    search_json_store: "text-yellow-600",
    rank_results: "text-purple-600",
    generate_answer: "text-orange-600",
  };
  return (
    <ScrollArea className="h-64">
      <div className="space-y-2 pr-2">
        {toolCalls.map((tc, i) => (
          <div key={i} className="border rounded-lg overflow-hidden" data-testid={`tool-call-${i}`}>
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left"
            >
              <div className="flex items-center gap-2">
                <Terminal className={`w-3.5 h-3.5 ${toolColors[tc.tool] ?? "text-gray-500"}`} />
                <span className={`text-xs font-semibold font-mono ${toolColors[tc.tool] ?? "text-gray-700"}`}>{tc.tool}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0">{tc.durationMs}ms</Badge>
                {tc.tool === "generate_answer" && (
                  <Badge className="text-[10px] px-1 py-0 bg-orange-100 text-orange-700 border-orange-200">Gemini</Badge>
                )}
              </div>
              <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${expanded === i ? "rotate-90" : ""}`} />
            </button>
            {expanded === i && (
              <div className="grid grid-cols-2 gap-2 p-2 bg-white text-[11px] font-mono">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-400 mb-1">INPUT</p>
                  <pre className="bg-blue-50 text-blue-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(tc.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-400 mb-1">OUTPUT</p>
                  <pre className="bg-green-50 text-green-800 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {JSON.stringify(tc.output, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function MetricsPanel({ metrics, state }: { metrics: RunMetrics | null; state: AgentState }) {
  if (!metrics || state === "IDLE") {
    return <p className="text-sm text-gray-400 italic">Run the agent to see metrics.</p>;
  }
  const items = [
    { label: "Precision", value: `${(metrics.precision * 100).toFixed(1)}%`, icon: Target, color: "text-blue-600" },
    { label: "Recall", value: `${(metrics.recall * 100).toFixed(1)}%`, icon: Search, color: "text-purple-600" },
    { label: "MRR", value: metrics.mrr.toFixed(3), icon: BarChart3, color: "text-green-600" },
    { label: "Top Score", value: metrics.topScore.toFixed(3), icon: Zap, color: "text-yellow-600" },
    { label: "Avg Score", value: metrics.avgScore.toFixed(3), icon: BarChart3, color: "text-orange-600" },
    { label: "Retrieval Time", value: `${metrics.retrievalTimeMs}ms`, icon: Clock, color: "text-gray-600" },
    { label: "Docs Searched", value: `${metrics.documentsSearched}/${metrics.totalDocuments}`, icon: List, color: "text-indigo-600" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-gray-50 rounded-lg p-3 flex flex-col gap-1" data-testid={`metric-${label.toLowerCase().replace(" ", "-")}`}>
          <div className="flex items-center gap-1.5">
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <span className="text-[11px] text-gray-500 font-medium">{label}</span>
          </div>
          <span className={`text-lg font-bold ${color}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function ResultsPanel({ results, state, llmAnswer, query, llmModel }: {
  results: RankedResult[];
  state: AgentState;
  llmAnswer: string | null;
  query: string;
  llmModel: string;
}) {
  const isPending = state === "IDLE" || state === "PARSING_QUERY" || state === "SEARCHING";
  return (
    <div className="space-y-4">
      <AIAnswerPanel answer={llmAnswer} query={query} llmModel={llmModel} />

      {isPending ? (
        <p className="text-sm text-gray-400 italic">Results will appear after ranking completes.</p>
      ) : results.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-500">
          <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="font-medium">No matching documents found</p>
          <p className="text-xs text-gray-400 mt-1">Try a different search term. The knowledge base covers ML, AI, Python, Docker, APIs, and more.</p>
        </div>
      ) : (
        <ScrollArea className="h-64">
          <div className="space-y-3 pr-2">
            {results.map((r, i) => (
              <div key={r.article.id}
                className={`border rounded-lg p-3 ${i === 0 ? "border-blue-200 bg-blue-50/50" : "bg-white"}`}
                data-testid={`result-${r.article.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 ${i === 0 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"}`}>
                      {i + 1}
                    </span>
                    <h4 className="text-sm font-semibold text-gray-800">{r.article.title}</h4>
                  </div>
                  <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded shrink-0">
                    {r.score.toFixed(3)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.article.tags.map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
                <div className="mt-2 flex gap-3 text-[11px] text-gray-500">
                  <span>Title: <span className="font-semibold text-gray-700">{r.titleScore.toFixed(2)}</span></span>
                  <span>Tag: <span className="font-semibold text-gray-700">{r.tagScore.toFixed(2)}</span></span>
                  <span>Content: <span className="font-semibold text-gray-700">{r.contentScore.toFixed(3)}</span></span>
                </div>
                {r.matchedTerms.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.matchedTerms.map(t => (
                      <span key={t} className="text-[10px] bg-yellow-100 text-yellow-800 rounded px-1.5 py-0.5 font-mono">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function EvalPanel() {
  const { data, isLoading, refetch, isFetching } = useQuery<EvalReport>({
    queryKey: ["/api/kb/evaluate"],
    enabled: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Retrieval Accuracy Demo</h3>
          <p className="text-xs text-gray-500">Runs all 10 test scenarios and measures retrieval accuracy.</p>
        </div>
        <Button size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-run-evaluation">
          {isFetching ? "Running..." : "Run Evaluation"}
        </Button>
      </div>

      {isFetching ? (
        <div className="text-sm text-gray-400 italic">Running 10 scenarios...</div>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{(data.accuracy * 100).toFixed(0)}%</p>
              <p className="text-xs text-green-600 font-medium">Top-1 Accuracy</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{data.avgMRR.toFixed(3)}</p>
              <p className="text-xs text-blue-600 font-medium">Avg MRR</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-purple-700">{(data.avgPrecision * 100).toFixed(0)}%</p>
              <p className="text-xs text-purple-600 font-medium">Avg Precision</p>
            </div>
          </div>
          <ScrollArea className="h-72">
            <div className="space-y-2 pr-2">
              {data.results.map(({ scenario, run, hit }) => (
                <div key={scenario.id}
                  className={`border rounded-lg p-3 ${hit ? "border-green-200 bg-green-50/40" : "border-red-200 bg-red-50/40"}`}
                  data-testid={`eval-scenario-${scenario.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {hit
                        ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      }
                      <div>
                        <p className="text-xs font-semibold text-gray-700">{scenario.description}</p>
                        <p className="text-[11px] text-gray-500 font-mono">Seed: {scenario.seed} | Expected: {scenario.expectedTopId}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] font-mono text-gray-600">Got: {run.results[0]?.article.id ?? "none"}</p>
                      <p className="text-[10px] text-gray-400">P={( run.metrics.precision * 100).toFixed(0)}% MRR={run.metrics.mrr.toFixed(2)}</p>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] text-gray-500 italic">"{scenario.query}"</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">Click "Run Evaluation" to test all 10 scenarios.</p>
      )}
    </div>
  );
}

export default function QueryAssistant() {
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState(42);
  const [topK, setTopK] = useState(5);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [activeTab, setActiveTab] = useState("results");

  const { data: scenarios } = useQuery<Scenario[]>({ queryKey: ["/api/kb/scenarios"] });

  const queryMutation = useMutation({
    mutationFn: async (input: { query: string; seed: number; topK: number }) => {
      const res = await apiRequest("POST", "/api/kb/query", input);
      return res.json() as Promise<AgentRun>;
    },
    onSuccess: (data) => {
      setRun(data);
      setActiveTab("results");
    },
  });

  const handleRun = () => {
    if (!query.trim()) return;
    queryMutation.mutate({ query: query.trim(), seed, topK });
  };

  const handleReset = () => {
    setRun(null);
    setQuery("");
    setSeed(42);
    setTopK(5);
  };

  const handleScenario = (s: Scenario) => {
    setQuery(s.query);
    setSeed(s.seed);
    setTopK(5);
  };

  const currentState: AgentState = queryMutation.isPending ? "SEARCHING" : (run?.state ?? "IDLE");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b bg-white px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1" data-testid="link-back-to-wiki">
            <ArrowLeft className="w-4 h-4" />
            Wiki
          </Button>
        </Link>
        <Separator orientation="vertical" className="h-5" />
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-600" />
          <h1 className="font-semibold text-gray-800 text-sm">Knowledge Base Query Assistant</h1>
          <Badge className="text-[10px] bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 gap-1">
            <Sparkles className="w-2.5 h-2.5" />
            {run?.llmModel?.includes('gemini') ? 'Gemini AI' : 'AI Enabled'}
          </Badge>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {run && (
            <span className="text-[11px] font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded" data-testid="text-run-id">
              {run.runId}
            </span>
          )}
          <div className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${STATE_COLORS[currentState]}`}
            data-testid="status-current-state">
            {currentState}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-600" />
                  Run Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Query</label>
                  <Input
                    placeholder="e.g. machine learning neural network..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleRun()}
                    data-testid="input-query"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Seed</label>
                    <Input type="number" min={0} max={999999} value={seed}
                      onChange={e => setSeed(parseInt(e.target.value) || 0)}
                      data-testid="input-seed" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-600 mb-1 block">Top K Results</label>
                    <Input type="number" min={1} max={10} value={topK}
                      onChange={e => setTopK(parseInt(e.target.value) || 5)}
                      data-testid="input-topk" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleRun} disabled={!query.trim() || queryMutation.isPending}
                    className="gap-2" data-testid="button-run-query">
                    <Play className="w-4 h-4" />
                    {queryMutation.isPending ? "Running Agent..." : "Run Agent"}
                  </Button>
                  <Button variant="outline" onClick={handleReset} className="gap-2" data-testid="button-reset">
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </Button>
                </div>
                {queryMutation.isPending && (
                  <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 rounded-lg px-3 py-2">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    Agent running — searching knowledge base and querying Gemini...
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-600" />
                  State Machine
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StateMachineViz currentState={currentState} transitions={run?.transitions ?? []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-green-600" />
                  Run Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MetricsPanel metrics={run?.metrics ?? null} state={currentState} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <List className="w-4 h-4 text-gray-600" />
                  Test Scenarios
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-56">
                  <div className="space-y-1.5 pr-2">
                    {scenarios?.map(s => (
                      <button key={s.id} onClick={() => handleScenario(s)}
                        className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors"
                        data-testid={`scenario-${s.id}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-gray-700">{s.description}</span>
                          <span className="text-[10px] text-gray-400 font-mono shrink-0">s={s.seed}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-1 italic">"{s.query}"</p>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-gray-600" />
                  Agent Transcript
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-52">
                  <div className="space-y-1 pr-2 font-mono text-[11px]">
                    {run?.messages.length ? (
                      run.messages.map((msg, i) => (
                        <div key={i} className={`flex gap-2 ${msg.startsWith("Gemini") || msg.includes("Gemini") ? "text-purple-700" : "text-gray-600"}`}
                          data-testid={`msg-${i}`}>
                          <span className="text-gray-300 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                          <span>{msg}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-400 italic">Waiting for agent to run...</p>
                    )}
                    {run?.error && (
                      <div className="text-red-600 font-semibold flex gap-2">
                        <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {run.error}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-main">
            <TabsTrigger value="results" data-testid="tab-results">
              Results {run?.llmEnabled && <Sparkles className="w-3 h-3 ml-1 text-purple-500" />}
            </TabsTrigger>
            <TabsTrigger value="tools" data-testid="tab-tools">Tool Calls</TabsTrigger>
            <TabsTrigger value="evaluation" data-testid="tab-evaluation">Evaluation (10 Scenarios)</TabsTrigger>
          </TabsList>

          <TabsContent value="results">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Ranked Results & AI Answer</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultsPanel
                  results={run?.results ?? []}
                  state={currentState}
                  llmAnswer={run?.llmAnswer ?? null}
                  query={run?.query ?? query}
                  llmModel={run?.llmModel ?? 'pollinations/openai'}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tools">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Tool Call Log</CardTitle>
              </CardHeader>
              <CardContent>
                <ToolCallPanel toolCalls={run?.toolCalls ?? []} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="evaluation">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Evaluation Harness</CardTitle>
              </CardHeader>
              <CardContent>
                <EvalPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
