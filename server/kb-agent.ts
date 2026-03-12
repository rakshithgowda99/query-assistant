import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
  metrics: RunMetrics;
  startedAt: string;
  completedAt?: string;
  error?: string;
  llmEnabled: boolean;
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
}

const TOOL_ALLOWLIST = ['parse_query', 'search_json_store', 'rank_results', 'generate_answer'];
const MAX_STEPS = 10;
const TOOL_TIMEOUT_MS = 30000;

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

async function tool_generate_answer(
  query: string,
  results: RankedResult[],
  apiKey: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const context = results.slice(0, 3).map((r, i) =>
    `[${i + 1}] Title: ${r.article.title}\nTags: ${r.article.tags.join(', ')}\nContent: ${r.article.content}`
  ).join('\n\n');

  const prompt = results.length > 0
    ? `You are a helpful knowledge base assistant. Based on the following retrieved articles, answer the user's query concisely and accurately.

User Query: "${query}"

Retrieved Articles:
${context}

Instructions:
- Answer based only on the provided articles.
- Be concise but complete (2-4 sentences).
- Reference specific article titles when relevant.
- If the articles don't fully answer the query, say so honestly.`
    : `You are a helpful knowledge base assistant. The user asked: "${query}"

No matching articles were found in the knowledge base. The knowledge base covers topics like: Machine Learning, Deep Learning, NLP, Python, Databases, REST APIs, Cloud Computing, Cybersecurity, Agile, Docker, React, Git, Data Structures, Microservices, and Reinforcement Learning.

Please let the user know no results were found and suggest a related topic they could ask about.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function runQueryAgent(input: QueryInput): Promise<AgentRun> {
  const { query, seed, topK = 5, maxSteps = MAX_STEPS } = input;
  const apiKey = process.env.GEMINI_API_KEY;
  const llmEnabled = !!apiKey;

  const runId = generateRunId(seed, query);
  const rand = seededRandom(seed);
  const startedAt = new Date().toISOString();

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
    metrics: {
      totalDocuments: kbData.length,
      documentsSearched: 0,
      retrievalTimeMs: 0,
      topScore: 0,
      avgScore: 0,
      precision: 0,
      recall: 0,
      mrr: 0,
    },
    startedAt,
    llmEnabled,
  };

  function transition(event: string, to: AgentState) {
    run.transitions.push({ from: run.state, event, to, timestamp: new Date().toISOString() });
    run.state = to;
  }

  function callTool(
    toolName: string,
    inputData: Record<string, unknown>,
    fn: () => Record<string, unknown>
  ): Record<string, unknown> {
    if (!TOOL_ALLOWLIST.includes(toolName)) throw new Error(`Tool ${toolName} not allowed`);
    const start = Date.now();
    const output = fn();
    const durationMs = Date.now() - start;
    run.toolCalls.push({ tool: toolName, input: inputData, output, timestamp: new Date().toISOString(), durationMs });
    return output;
  }

  async function callAsyncTool(
    toolName: string,
    inputData: Record<string, unknown>,
    fn: () => Promise<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    if (!TOOL_ALLOWLIST.includes(toolName)) throw new Error(`Tool ${toolName} not allowed`);
    const start = Date.now();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool ${toolName} timed out`)), TOOL_TIMEOUT_MS)
    );
    const output = await Promise.race([fn(), timeoutPromise]);
    const durationMs = Date.now() - start;
    run.toolCalls.push({ tool: toolName, input: inputData, output, timestamp: new Date().toISOString(), durationMs });
    return output;
  }

  let steps = 0;

  try {
    transition('START', 'PARSING_QUERY');
    run.messages.push(`Agent started. Run ID: ${runId}. Seed: ${seed}`);
    run.messages.push(`Received query: "${query}"`);
    if (llmEnabled) run.messages.push('Gemini LLM enabled — will generate AI answer after retrieval.');

    if (steps++ >= maxSteps) throw new Error('Max steps exceeded');

    const parseOutput = callTool(
      'parse_query',
      { query, seed },
      () => tool_parse_query(query) as unknown as Record<string, unknown>
    ) as { terms: string[]; normalized: string };

    run.messages.push(`Parsed ${parseOutput.terms.length} search terms: [${parseOutput.terms.join(', ')}]`);

    transition('QUERY_PARSED', 'SEARCHING');
    if (steps++ >= maxSteps) throw new Error('Max steps exceeded');

    const searchStart = Date.now();
    const searchOutput = callTool(
      'search_json_store',
      { terms: parseOutput.terms, totalDocs: kbData.length },
      () => {
        const candidates = tool_search_json_store(parseOutput.terms, kbData as KBArticle[]);
        return { candidateIds: candidates.map(c => c.id), count: candidates.length } as unknown as Record<string, unknown>;
      }
    ) as { candidateIds: string[]; count: number };

    const candidates = (kbData as KBArticle[]).filter(a => searchOutput.candidateIds.includes(a.id));
    run.metrics.documentsSearched = candidates.length;
    run.messages.push(`JSON store searched. Found ${candidates.length} candidate documents.`);

    transition('SEARCH_COMPLETE', 'RANKING');
    if (steps++ >= maxSteps) throw new Error('Max steps exceeded');

    const rankOutput = callTool(
      'rank_results',
      { terms: parseOutput.terms, candidateCount: candidates.length, topK },
      () => {
        const ranked = tool_rank_results(parseOutput.terms, candidates, kbData as KBArticle[], rand);
        return {
          ranked: ranked.slice(0, topK).map(r => ({ id: r.article.id, score: r.score, matchedTerms: r.matchedTerms })),
        } as unknown as Record<string, unknown>;
      }
    ) as { ranked: { id: string; score: number; matchedTerms: string[] }[] };

    const allRanked = tool_rank_results(parseOutput.terms, candidates, kbData as KBArticle[], seededRandom(seed));
    run.results = allRanked.slice(0, topK);

    const retrievalTimeMs = Date.now() - searchStart;
    const scores = run.results.map(r => r.score);
    const topScore = scores[0] ?? 0;
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const relevantCount = run.results.filter(r => r.score > 0.5).length;
    const precision = run.results.length > 0 ? relevantCount / run.results.length : 0;
    const totalRelevant = (kbData as KBArticle[]).filter(a =>
      parseOutput.terms.some(t => `${a.title} ${a.tags.join(' ')} ${a.content}`.toLowerCase().includes(t))
    ).length;
    const recall = totalRelevant > 0 ? Math.min(relevantCount / totalRelevant, 1) : 0;

    let mrr = 0;
    for (let i = 0; i < run.results.length; i++) {
      if (run.results[i].score > 0.5) { mrr = 1 / (i + 1); break; }
    }

    run.metrics = {
      totalDocuments: kbData.length,
      documentsSearched: candidates.length,
      retrievalTimeMs,
      topScore: parseFloat(topScore.toFixed(4)),
      avgScore: parseFloat(avgScore.toFixed(4)),
      precision: parseFloat(precision.toFixed(4)),
      recall: parseFloat(recall.toFixed(4)),
      mrr: parseFloat(mrr.toFixed(4)),
    };

    run.messages.push(`Ranked ${run.results.length} results. Top score: ${topScore.toFixed(3)}.`);
    run.messages.push(`Best match: "${run.results[0]?.article.title ?? 'None'}" (score: ${(run.results[0]?.score ?? 0).toFixed(3)})`);

    if (llmEnabled && apiKey) {
      transition('RANKING_COMPLETE', 'GENERATING');
      run.messages.push('Sending context to Gemini for answer generation...');
      if (steps++ >= maxSteps) throw new Error('Max steps exceeded');

      const llmOutput = await callAsyncTool(
        'generate_answer',
        { query, topResultCount: run.results.length, model: 'gemini-1.5-flash' },
        async () => {
          const answer = await tool_generate_answer(query, run.results, apiKey);
          return { answer, modelUsed: 'gemini-1.5-flash' };
        }
      ) as { answer: string; modelUsed: string };

      run.llmAnswer = llmOutput.answer;
      run.messages.push(`Gemini answer generated (${llmOutput.answer.length} chars).`);
      transition('ANSWER_GENERATED', 'COMPLETE');
    } else {
      transition('RANKING_COMPLETE', 'COMPLETE');
    }

    run.messages.push(`Run complete. Precision: ${(precision * 100).toFixed(1)}%, Recall: ${(recall * 100).toFixed(1)}%, MRR: ${mrr.toFixed(3)}`);
    if (!llmEnabled) {
      run.messages.push('Note: Set GEMINI_API_KEY to enable AI-generated answers.');
    }
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

function runQueryAgentSync(input: QueryInput): AgentRun {
  const { query, seed, topK = 5 } = input;
  const rand = seededRandom(seed);
  const runId = generateRunId(seed, query);
  const startedAt = new Date().toISOString();

  const run: AgentRun = {
    runId, seed, query, state: 'IDLE', transitions: [], toolCalls: [], messages: [], results: [],
    llmAnswer: null, llmEnabled: false,
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
