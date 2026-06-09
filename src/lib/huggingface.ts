// HuggingFace Inference API helper — Mistral-7B-Instruct for chunk-level extraction
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const MODEL_NAME = 'mistralai/Mistral-7B-Instruct-v0.3';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Split document text into overlapping chunks for processing.
 * Each chunk is small enough for Mistral's context window.
 */
export function chunkText(
  text: string,
  chunkSize: number = 4000,
  overlap: number = 600
): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Extract structured insights from a single document chunk using Mistral.
 * Returns raw text analysis for later synthesis by the generation model.
 */
export async function extractFromChunk(
  chunk: string,
  chunkIndex: number,
  totalChunks: number,
  extractionPrompt: string,
  apiKey: string
): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: `You are a legal document analyst specialized in extracting structured information from contract sections. 
You are analyzing chunk ${chunkIndex + 1} of ${totalChunks} from a larger document.
Extract the requested information from this section only. If the section doesn't contain relevant information, respond with "NO_RELEVANT_INFO".`
    },
    {
      role: 'user',
      content: `${extractionPrompt}

--- DOCUMENT CHUNK ${chunkIndex + 1}/${totalChunks} ---
${chunk}
--- END CHUNK ---`
    }
  ];

  const response = await fetch(HF_ROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      temperature: 0.2,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 503) {
      throw new Error('Mistral model is loading, please wait ~20 seconds and try again.');
    }
    if (response.status === 401) {
      throw new Error('Invalid HuggingFace API key.');
    }
    throw new Error(err?.error || `HuggingFace API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`No response from Mistral for chunk ${chunkIndex + 1}.`);
  return text.trim();
}

/**
 * Legal keyword-based chunk filtering to stay within API rate limits on massive documents.
 */
export function filterTopLegalChunks(
  chunks: string[],
  limit: number = 8
): { chunk: string; index: number }[] {
  if (chunks.length <= limit) {
    return chunks.map((chunk, index) => ({ chunk, index }));
  }

  const legalKeywords = [
    'benefit', 'obligation', 'right', 'payment', 'fee', 'terminate', 
    'liability', 'indemnity', 'warrant', 'breach', 'covenant', 'remedy',
    'agree', 'shall', 'must', 'responsible', 'penalty', 'compensation'
  ];

  const scored = chunks.map((chunk, index) => {
    const lower = chunk.toLowerCase();
    let score = 0;
    for (const word of legalKeywords) {
      const regex = new RegExp(word, 'g');
      const matches = lower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    return { chunk, index, score };
  });

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  // Take top chunks up to limit
  const top = scored.slice(0, limit);

  // Re-sort by original index to keep reading order
  top.sort((a, b) => a.index - b.index);

  return top.map(item => ({ chunk: item.chunk, index: item.index }));
}

/**
 * Process selected chunks in parallel (with concurrency limit) and return aggregated extraction results.
 * Filters chunks to stay within API limits on large documents.
 */
export async function extractFromAllChunks(
  docText: string,
  extractionPrompt: string,
  apiKey: string,
  maxConcurrency: number = 3
): Promise<string[]> {
  const allChunks = chunkText(docText);
  const selectedChunks = filterTopLegalChunks(allChunks, 3);
  const results: string[] = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < selectedChunks.length; i += maxConcurrency) {
    const batch = selectedChunks.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map((item, batchIdx) =>
        extractFromChunk(item.chunk, i + batchIdx, selectedChunks.length, extractionPrompt, apiKey)
      )
    );
    results.push(...batchResults);
  }

  // Filter out chunks that had no relevant info
  return results.filter(r => !r.includes('NO_RELEVANT_INFO'));
}

/**
 * Legacy direct query — kept for backward compatibility.
 * Now uses Mistral-7B-Instruct instead of Qwen.
 */
export async function queryHuggingFace(
  docText: string,
  history: Message[],
  question: string,
  apiKey: string
): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: `You are a legal document analyst. Your job is to help users understand terms and conditions, contracts, and agreements in plain English.

You have been given this document to analyze:

--- DOCUMENT START ---
${docText.slice(0, 15000)}
--- DOCUMENT END ---

Rules:
- Answer ONLY based on the document above
- Use plain, simple language — no legalese
- When relevant, mention which section/clause you're referencing
- If asked what happens if someone does X, explain the consequences clearly
- If asked who benefits, compare both parties fairly
- Flag any unfair, one-sided, or risky clauses when relevant
- If the document doesn't cover something, say so clearly`
    },
    ...history.slice(-8).map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    {
      role: 'user',
      content: question
    }
  ];

  const response = await fetch(HF_ROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: messages,
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 503) {
      throw new Error('Model is loading, please wait ~20 seconds and try again.');
    }
    if (response.status === 401) {
      throw new Error('Invalid HuggingFace API key.');
    }
    throw new Error(err?.error || `HuggingFace API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response from model.');
  return text.trim();
}
