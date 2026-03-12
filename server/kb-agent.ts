import { createHash } from 'crypto';
import kbData from './kb-data.json';

export type AgentState = 'IDLE' | 'PARSING_QUERY' | 'SEARCHING' | 'RANKING' | 'GENERATING' | 'COMPLETE' | 'ERROR';

export interface KBArticle {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

export interface RankedResult {
  article: KBArticle;
  score: number;
  matchedTerms: string[];
  titleScore: number;
  tagScore: number;
  contentScore: number;
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  timestamp: string;
  durationMs: number;
}

export interface StateTransition {
  from: AgentState;
  event: string;
  to: AgentState;
  timestamp: string;
}

export interface AgentRun {
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

export interface RunMetrics {
  totalDocuments: number;
  documentsSearched: number;
  retrievalTimeMs: number;
  topScore: number;
  avgScore: number;
  precision: number;
  recall: number;
  mrr: number;
}

export interface QueryInput {
  query: string;
  seed: number;
  topK?: number;
  maxSteps?: number;
  articles?: KBArticle[];
}

const TOOL_ALLOWLIST = ['parse_query', 'search_json_store', 'rank_results', 'generate_answer'];
const MAX_STEPS = 10;

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateRunId(seed: number, query: string): string {
  const hash = createHash('md5').update(`${seed}:${query}`).digest('hex');
  return `run_${hash.substring(0, 8)}`;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}

function computeTFIDF(term: string, doc: string, allDocs: string[]): number {
  const tokens = tokenize(doc);
  const tf = tokens.filter(t => t === term).length / Math.max(tokens.length, 1);
  const docsWithTerm = allDocs.filter(d => tokenize(d).includes(term)).length;
  const idf = Math.log((allDocs.length + 1) / (docsWithTerm + 1)) + 1;
  return tf * idf;
}

function tool_parse_query(query: string): { terms: string[]; normalized: string } {
  const normalized = query.toLowerCase().trim();
  const terms = tokenize(normalized);
  return { terms, normalized };
}

function tool_search_json_store(terms: string[], articles: KBArticle[]): KBArticle[] {
  if (terms.length === 0) return articles;
  return articles.filter(article => {
    const text = `${article.title} ${article.tags.join(' ')} ${article.content}`.toLowerCase();
    return terms.some(term => text.includes(term));
  });
}

function tool_rank_results(
  terms: string[],
  candidates: KBArticle[],
  allArticles: KBArticle[],
  rand: () => number
): RankedResult[] {
  const allContentCorpus = allArticles.map(a => `${a.title} ${a.content}`);

  return candidates
    .map(article => {
      const titleTokens = tokenize(article.title);
      const tagTokens = article.tags.flatMap(t => tokenize(t));
      const contentText = `${article.title} ${article.content}`;

      let titleScore = 0;
      let tagScore = 0;
      let contentScore = 0;
      const matchedTerms: string[] = [];

      for (const term of terms) {
        if (titleTokens.includes(term)) {
          titleScore += 2.5;
          if (!matchedTerms.includes(term)) matchedTerms.push(term);
        }
        if (tagTokens.includes(term)) {
          tagScore += 2.0;
          if (!matchedTerms.includes(term)) matchedTerms.push(term);
        }
        const tfidf = computeTFIDF(term, contentText, allContentCorpus);
        contentScore += tfidf;
        if (tfidf > 0.01 && !matchedTerms.includes(term)) matchedTerms.push(term);
      }

      const noise = (rand() - 0.5) * 0.001;
      const score = parseFloat((titleScore + tagScore + contentScore + noise).toFixed(4));

      return { article, score, matchedTerms, titleScore, tagScore, contentScore };
    })
    .sort((a, b) => b.score - a.score);
}

// Primary: Pollinations.ai — always free, no API key required
async function generateWithPollinations(query: string, results: RankedResult[], allArticles: KBArticle[]): Promise<string> {
  const context = results.slice(0, 3).map((r, i) =>
    `[${i + 1}] Title: "${r.article.title}" | Tags: ${r.article.tags.join(', ')}\n${r.article.content}`
  ).join('\n\n');

  const systemPrompt = `You are a helpful knowledge base assistant. Answer user queries based on retrieved articles. Be concise (2-4 sentences), accurate, and reference article titles when relevant. If the articles don't answer the query, say so honestly.`;

  const topicHints = allArticles.slice(0, 10).map(a => `"${a.title}"`).join(', ');
  const userPrompt = results.length > 0
    ? `User asked: "${query}"\n\nRetrieved articles:\n${context}\n\nPlease answer the user's query based on the above articles.`
    : `User asked: "${query}"\n\nNo articles were found in the knowledge base for this query. The knowledge base currently contains articles on topics like: ${topicHints}${allArticles.length > 10 ? ', and more' : ''}.\n\nLet the user know no results were found and suggest they try a different search term or browse the wiki directly.`;

  const body = JSON.stringify({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    model: 'openai',
    seed: 42,
    private: true,
  });

  // Retry up to 3 times on transient errors (502, 503, 429)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(25000),
    });

    if (response.ok) {
      const text = await response.text();
      return text.trim();
    }

    if (attempt < 3 && (response.status === 502 || response.status === 503 || response.status === 429)) {
      // Wait 2s before retrying
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    throw new Error(`Pollinations API error: ${response.status} ${response.statusText}`);
  }

  throw new Error('Pollinations API failed after 3 attempts');
}

// Secondary fallback: Gemini (if user has a working API key)
async function generateWithGemini(query: string, results: RankedResult[], apiKey: string, allArticles: KBArticle[]): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const context = results.slice(0, 3).map((r, i) =>
    `[${i + 1}] Title: ${r.article.title}\nTags: ${r.article.tags.join(', ')}\nContent: ${r.article.content}`
  ).join('\n\n');

  const topicHints = allArticles.slice(0, 10).map(a => `"${a.title}"`).join(', ');
  const prompt = results.length > 0
    ? `You are a helpful knowledge base assistant. Based on the retrieved articles below, answer the user's query concisely (2-4 sentences). Reference article titles when relevant.\n\nUser Query: "${query}"\n\nRetrieved Articles:\n${context}`
    : `You are a helpful knowledge base assistant. The user asked: "${query}". No matching articles were found. The knowledge base contains articles on: ${topicHints}. Suggest a related topic or tell the user to try different keywords.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function runQueryAgent(input: QueryInput): Promise<AgentRun> {
  const { query, seed, topK = 5, maxSteps = MAX_STEPS } = input;
  const geminiKey = process.env.GEMINI_API_KEY;

  // Use provided articles (real wiki from MongoDB) or fall back to static JSON
  const articleSource: KBArticle[] = input.articles && input.articles.length > 0
    ? input.articles
    : (kbData as KBArticle[]);

  const runId = generateRunId(seed, query);
  const rand = seededRandom(seed);
  const startedAt = new Date().toISOString();

  const sourceLabel = input.articles ? 'Wiki (MongoDB)' : 'Static JSON';

  const run: AgentRun = {
    runId,
    seed,
    query,
    state: 'IDLE',
    transitions: [],
    toolCalls: [],
    messages: [],
    results: [],
    llmAnswer: null,
    llmModel: 'pollinations/openai',
    metrics: {
      totalDocuments: articleSource.length,
      documentsSearched: 0,
      retrievalTimeMs: 0,
      topScore: 0,
      avgScore: 0,
      precision: 0,
      recall: 0,
      mrr: 0,
    },
    startedAt,
  };

  function transition(event: string, to: AgentState) {
    run.transitions.push({ from: run.state, event, to, timestamp: new Date().toISOString() });
    run.state = to;
  }

  function logTool(toolName: string, inputData: Record<string, unknown>, output: Record<string, unknown>, durationMs: number) {
    if (!TOOL_ALLOWLIST.includes(toolName)) throw new Error(`Tool ${toolName} not in allowlist`);
    run.toolCalls.push({ tool: toolName, input: inputData, output, timestamp: new Date().toISOString(), durationMs });
  }

  let steps = 0;

  try {
    transition('START', 'PARSING_QUERY');
    run.messages.push(`Agent started. Run ID: ${runId}. Seed: ${seed}`);
    run.messages.push(`Received query: "${query}"`);
    run.messages.push(`Knowledge base source: ${sourceLabel} (${articleSource.length} articles).`);
    run.messages.push('AI answer generation enabled via Pollinations.ai (free).');
    if (steps++ >= maxSteps) throw new Error('Max steps exceeded');

    const parseStart = Date.now();
    const parsed = tool_parse_query(query);
    logTool('parse_query', { query, seed }, { terms: parsed.terms, normalized: parsed.normalized }, Date.now() - parseStart);
    run.messages.push(`Parsed ${parsed.terms.length} search terms: [${parsed.terms.join(', ')}]`);

    transition('QUERY_PARSED', 'SEARCHING');
    if (steps++ >= maxSteps) throw new Error('Max steps exceeded');

    const searchStart = Date.now();
    const candidates = tool_search_json_store(parsed.terms, articleSource);
    const searchMs = Date.now() - searchStart;
    logTool('search_json_store',
      { terms: parsed.terms, totalDocs: articleSource.length },
      { candidateIds: candidates.map(c => c.id), count: candidates.length },
      searchMs
    );
    run.metrics.documentsSearched = candidates.length;
    run.messages.push(`${sourceLabel} searched. Found ${candidates.length} candidate documents.`);

    transition('SEARCH_COMPLETE', 'RANKING');
    if (steps++ >= maxSteps) throw new Error('Max steps exceeded');

    const rankStart = Date.now();
    const allRanked = tool_rank_results(parsed.terms, candidates, articleSource, rand);
    run.results = allRanked.slice(0, topK);
    const rankMs = Date.now() - rankStart;
    logTool('rank_results',
      { terms: parsed.terms, candidateCount: candidates.length, topK },
      { ranked: run.results.map(r => ({ id: r.article.id, score: r.score })) },
      rankMs
    );

    const scores = run.results.map(r => r.score);
    const topScore = scores[0] ?? 0;
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const relevantCount = run.results.filter(r => r.score > 0.5).length;
    const totalRelevant = articleSource.filter(a =>
      parsed.terms.some(t => `${a.title} ${a.tags.join(' ')} ${a.content}`.toLowerCase().includes(t))
    ).length;
    let mrr = 0;
    for (let i = 0; i < run.results.length; i++) {
      if (run.results[i].score > 0.5) { mrr = 1 / (i + 1); break; }
    }

    run.metrics = {
      totalDocuments: articleSource.length,
      documentsSearched: candidates.length,
      retrievalTimeMs: searchMs + rankMs,
      topScore: parseFloat(topScore.toFixed(4)),
      avgScore: parseFloat(avgScore.toFixed(4)),
      precision: parseFloat((run.results.length > 0 ? relevantCount / run.results.length : 0).toFixed(4)),
      recall: parseFloat((totalRelevant > 0 ? Math.min(relevantCount / totalRelevant, 1) : 0).toFixed(4)),
      mrr: parseFloat(mrr.toFixed(4)),
    };

    run.messages.push(`Ranked ${run.results.length} results. Top score: ${topScore.toFixed(3)}.`);
    run.messages.push(`Best match: "${run.results[0]?.article.title ?? 'None'}" (score: ${(run.results[0]?.score ?? 0).toFixed(3)})`);

    transition('RANKING_COMPLETE', 'GENERATING');
    if (steps++ >= maxSteps) throw new Error('Max steps exceeded');
    run.messages.push('Generating AI answer...');

    const llmStart = Date.now();
    let llmAnswer = '';
    let modelUsed = 'pollinations/openai';

    // Try Gemini first if API key is available
    if (geminiKey) {
      try {
        llmAnswer = await generateWithGemini(query, run.results, geminiKey, articleSource);
        modelUsed = 'gemini-2.0-flash';
        run.llmModel = modelUsed;
        run.messages.push(`Gemini answered successfully.`);
      } catch {
        run.messages.push('Gemini unavailable, using Pollinations.ai...');
        llmAnswer = await generateWithPollinations(query, run.results, articleSource);
        modelUsed = 'pollinations/openai';
        run.llmModel = modelUsed;
      }
    } else {
      llmAnswer = await generateWithPollinations(query, run.results, articleSource);
      modelUsed = 'pollinations/openai';
      run.llmModel = modelUsed;
    }

    const llmMs = Date.now() - llmStart;
    logTool('generate_answer',
      { query, topResultCount: run.results.length, model: modelUsed },
      { answer: llmAnswer.substring(0, 150) + (llmAnswer.length > 150 ? '...' : ''), modelUsed, durationMs: llmMs },
      llmMs
    );

    run.llmAnswer = llmAnswer;
    run.messages.push(`AI answer generated (${llmAnswer.length} chars) via ${modelUsed}.`);

    transition('ANSWER_GENERATED', 'COMPLETE');
    run.messages.push(`Run complete. Precision: ${(run.metrics.precision * 100).toFixed(1)}%, Recall: ${(run.metrics.recall * 100).toFixed(1)}%, MRR: ${mrr.toFixed(3)}`);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    run.error = message;
    run.messages.push(`Error: ${message}`);
    transition('ERROR_OCCURRED', 'ERROR');
  }

  run.completedAt = new Date().toISOString();
  return run;
}

export interface Scenario {
  id: string;
  query: string;
  seed: number;
  expectedTopId: string;
  description: string;
}

export const TEST_SCENARIOS: Scenario[] = [
  { id: 'sc01', query: 'machine learning supervised training', seed: 42, expectedTopId: 'kb001', description: 'Basic ML query' },
  { id: 'sc02', query: 'neural network deep learning backpropagation', seed: 7, expectedTopId: 'kb002', description: 'Deep learning query' },
  { id: 'sc03', query: 'natural language processing text tokenization', seed: 13, expectedTopId: 'kb003', description: 'NLP basics' },
  { id: 'sc04', query: 'python programming beginner syntax', seed: 99, expectedTopId: 'kb004', description: 'Python guide' },
  { id: 'sc05', query: 'database sql schema normalization', seed: 55, expectedTopId: 'kb005', description: 'Database design' },
  { id: 'sc06', query: 'rest api http methods web design', seed: 21, expectedTopId: 'kb006', description: 'API design' },
  { id: 'sc07', query: 'cloud computing aws azure infrastructure', seed: 88, expectedTopId: 'kb007', description: 'Cloud fundamentals' },
  { id: 'sc08', query: 'cybersecurity encryption authentication firewall', seed: 33, expectedTopId: 'kb008', description: 'Security essentials' },
  { id: 'sc09', query: 'docker container kubernetes devops', seed: 17, expectedTopId: 'kb010', description: 'Containerization' },
  { id: 'sc10', query: 'reinforcement learning agent reward policy', seed: 64, expectedTopId: 'kb015', description: 'RL concepts' },
];

function runQueryAgentSync(input: QueryInput): AgentRun {
  const { query, seed, topK = 5 } = input;
  const rand = seededRandom(seed);
  const runId = generateRunId(seed, query);
  const startedAt = new Date().toISOString();

  const run: AgentRun = {
    runId, seed, query, state: 'IDLE', transitions: [], toolCalls: [], messages: [], results: [],
    llmAnswer: null, llmModel: 'pollinations/openai',
    metrics: { totalDocuments: kbData.length, documentsSearched: 0, retrievalTimeMs: 0, topScore: 0, avgScore: 0, precision: 0, recall: 0, mrr: 0 },
    startedAt,
  };

  function transition(event: string, to: AgentState) {
    run.transitions.push({ from: run.state, event, to, timestamp: new Date().toISOString() });
    run.state = to;
  }

  try {
    transition('START', 'PARSING_QUERY');
    const parsed = tool_parse_query(query);
    transition('QUERY_PARSED', 'SEARCHING');
    const candidates = tool_search_json_store(parsed.terms, kbData as KBArticle[]);
    run.metrics.documentsSearched = candidates.length;
    transition('SEARCH_COMPLETE', 'RANKING');
    const allRanked = tool_rank_results(parsed.terms, candidates, kbData as KBArticle[], rand);
    run.results = allRanked.slice(0, topK);
    const scores = run.results.map(r => r.score);
    const relevantCount = run.results.filter(r => r.score > 0.5).length;
    const totalRelevant = (kbData as KBArticle[]).filter(a =>
      parsed.terms.some(t => `${a.title} ${a.tags.join(' ')} ${a.content}`.toLowerCase().includes(t))
    ).length;
    let mrr = 0;
    for (let i = 0; i < run.results.length; i++) {
      if (run.results[i].score > 0.5) { mrr = 1 / (i + 1); break; }
    }
    run.metrics = {
      totalDocuments: kbData.length,
      documentsSearched: candidates.length,
      retrievalTimeMs: 0,
      topScore: parseFloat((scores[0] ?? 0).toFixed(4)),
      avgScore: parseFloat((scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0).toFixed(4)),
      precision: parseFloat((run.results.length > 0 ? relevantCount / run.results.length : 0).toFixed(4)),
      recall: parseFloat((totalRelevant > 0 ? Math.min(relevantCount / totalRelevant, 1) : 0).toFixed(4)),
      mrr: parseFloat(mrr.toFixed(4)),
    };
    transition('RANKING_COMPLETE', 'COMPLETE');
  } catch (err) {
    run.error = err instanceof Error ? err.message : String(err);
    transition('ERROR_OCCURRED', 'ERROR');
  }

  run.completedAt = new Date().toISOString();
  return run;
}

export function runEvaluation(): {
  results: { scenario: Scenario; run: AgentRun; hit: boolean }[];
  accuracy: number;
  avgMRR: number;
  avgPrecision: number;
} {
  const results = TEST_SCENARIOS.map(scenario => {
    const run = runQueryAgentSync({ query: scenario.query, seed: scenario.seed });
    const hit = run.results.length > 0 && run.results[0].article.id === scenario.expectedTopId;
    return { scenario, run, hit };
  });

  const accuracy = results.filter(r => r.hit).length / results.length;
  const avgMRR = results.reduce((acc, r) => acc + r.run.metrics.mrr, 0) / results.length;
  const avgPrecision = results.reduce((acc, r) => acc + r.run.metrics.precision, 0) / results.length;

  return {
    results,
    accuracy: parseFloat(accuracy.toFixed(4)),
    avgMRR: parseFloat(avgMRR.toFixed(4)),
    avgPrecision: parseFloat(avgPrecision.toFixed(4)),
  };
}
