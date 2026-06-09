// Groq API helper — uses the OpenAI-compatible endpoint
import { chunkText, filterTopLegalChunks } from './huggingface';
// Model: LLaMA 3.1 8B Instant (free tier, 128k context, ~500 tok/s)
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Lightweight RAG: retrieve the most relevant sections of the contract based on keyword overlap
 * with the user's question, ensuring we stay under the TPM limits of Groq's free tier.
 */
export function retrieveRelevantContext(
  docText: string,
  question: string,
  maxChars: number = 12000
): string {
  if (docText.length <= maxChars) return docText;

  // Split into chunks of 3000 chars with 500 overlap
  const chunkSize = 3000;
  const overlap = 500;
  const chunks: string[] = [];
  let start = 0;
  while (start < docText.length) {
    const end = Math.min(start + chunkSize, docText.length);
    chunks.push(docText.slice(start, end));
    if (end >= docText.length) break;
    start += chunkSize - overlap;
  }

  // Common stop words to ignore during scoring
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 
    'be', 'been', 'being', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 
    'about', 'against', 'between', 'into', 'through', 'during', 'before', 
    'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out', 'off', 
    'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 
    'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 
    'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 
    'just', 'don', 'should', 'now', 'what', 'which', 'who', 'whom', 'this', 
    'that', 'these', 'those'
  ]);
  
  const keywords = question
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (keywords.length === 0) {
    // If no keywords found, just return the first few chunks
    return docText.slice(0, maxChars);
  }

  // Score chunks
  const scoredChunks = chunks.map((chunk, idx) => {
    const chunkLower = chunk.toLowerCase();
    let score = 0;
    
    // Count exact keyword matches
    for (const keyword of keywords) {
      // Escape keyword for regex
      const safeKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + safeKeyword + '\\b', 'g');
      const matches = chunkLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    
    return { chunk, idx, score };
  });

  // Sort by score descending, then by index ascending to keep order
  scoredChunks.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });

  // Take top chunks up to maxChars
  const selected: { chunk: string; idx: number }[] = [];
  let currentLength = 0;
  for (const item of scoredChunks) {
    if (currentLength + item.chunk.length > maxChars) {
      if (selected.length === 0) {
        selected.push(item);
      }
      break;
    }
    selected.push(item);
    currentLength += item.chunk.length;
  }

  // Re-sort selected chunks by original index to maintain readability
  selected.sort((a, b) => a.idx - b.idx);

  return selected.map(item => item.chunk).join('\n\n... [SECTION LIMIT] ...\n\n');
}

/**
 * Internal helper to query Groq without retries.
 */
async function rawQueryGroq(
  systemPrompt: string,
  userPrompt: string,
  groqApiKey: string,
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2048,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error('Invalid Groq API key.');
    }
    if (response.status === 429) {
      throw new Error('Groq rate limit hit. Please wait a moment and try again.');
    }
    throw new Error(err?.error?.message || `Groq API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response from Groq model.');
  return text.trim();
}

/**
 * Synthesize a final answer from pre-extracted chunk summaries using Groq.
 * Used as the "generation" step after Mistral chunking.
 * Includes rate-limit retries with exponential backoff.
 */
export async function queryGroq(
  systemPrompt: string,
  userPrompt: string,
  groqApiKey: string,
  options?: { temperature?: number; maxTokens?: number },
  maxRetries: number = 3,
  delayMs: number = 2500
): Promise<string> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await rawQueryGroq(systemPrompt, userPrompt, groqApiKey, options);
    } catch (err: any) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      
      const isRateLimit = err.message?.includes('Rate limit') || 
                          err.message?.includes('rate limit') || 
                          err.message?.includes('429') ||
                          err.message?.includes('too large') ||
                          err.message?.includes('TPM') ||
                          err.message?.includes('Limit');
                          
      if (isRateLimit) {
        console.warn(`Groq rate limit hit. Retrying attempt ${attempt}/${maxRetries} after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2; // exponential backoff
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed to query Groq after multiple retries.');
}

/**
 * Chat with Groq directly — used for general Q&A where the full document
 * fits within the 128k context window.
 */
export async function chatWithGroq(
  docText: string,
  history: { role: string; content: string }[],
  question: string,
  groqApiKey: string
): Promise<string> {
  // Prune document to relevant sections to fit within free tier TPM limits
  const context = retrieveRelevantContext(docText, question, 8000);

  const systemPrompt = `You are a legal document analyst. Your job is to help users understand terms and conditions, contracts, and agreements in plain English.

You have been given these relevant sections of the document to analyze:

--- DOCUMENT SECTIONS ---
${context}
--- END SECTIONS ---

Rules:
- Answer ONLY based on the document sections above
- Use plain, simple language — no legalese
- When relevant, mention which section/clause you're referencing
- If asked what happens if someone does X, explain the consequences clearly
- If asked who benefits, compare both parties fairly
- Flag any unfair, one-sided, or risky clauses when relevant
- If the document sections don't cover something, say so clearly`;

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-3).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: question },
  ];

  let attempt = 0;
  const maxRetries = 3;
  let delayMs = 2500;

  while (attempt < maxRetries) {
    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Invalid Groq API key.');
        }
        if (response.status === 429) {
          throw new Error('Groq rate limit hit. Please wait a moment and try again.');
        }
        throw new Error(err?.error?.message || `Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('No response from Groq model.');
      return text.trim();
    } catch (err: any) {
      attempt++;
      if (attempt >= maxRetries) {
        throw err;
      }
      
      const isRateLimit = err.message?.includes('Rate limit') || 
                          err.message?.includes('rate limit') || 
                          err.message?.includes('429') ||
                          err.message?.includes('too large') ||
                          err.message?.includes('TPM') ||
                          err.message?.includes('Limit');
                          
      if (isRateLimit) {
        console.warn(`Groq chat rate limit hit. Retrying attempt ${attempt}/${maxRetries} after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= 2;
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed to chat with Groq after multiple retries.');
}

/**
 * Extract structured insights from all document chunks in parallel using Groq.
 * Used as a fallback/alternative to HuggingFace.
 */
export async function extractFromAllChunksWithGroq(
  docText: string,
  extractionPrompt: string,
  groqApiKey: string,
  maxConcurrency: number = 3
): Promise<string[]> {
  const allChunks = chunkText(docText);
  // Filter chunks to stay within rate limits for large documents
  const selectedChunks = filterTopLegalChunks(allChunks, 3);
  const results: string[] = [];

  for (let i = 0; i < selectedChunks.length; i += maxConcurrency) {
    const batch = selectedChunks.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map(async (item, batchIdx) => {
        const chunkIndex = i + batchIdx;
        const systemPrompt = `You are a legal document analyst specialized in extracting structured information from contract sections. 
You are analyzing chunk ${chunkIndex + 1} of ${selectedChunks.length} from a larger document.
Extract the requested information from this section only. If the section doesn't contain relevant information, respond with "NO_RELEVANT_INFO".`;

        const userPrompt = `${extractionPrompt}

--- DOCUMENT CHUNK ${chunkIndex + 1}/${selectedChunks.length} ---
${item.chunk}
--- END CHUNK ---`;

        try {
          return await queryGroq(systemPrompt, userPrompt, groqApiKey, { temperature: 0.2, maxTokens: 800 });
        } catch (err) {
          console.error(`Error extracting from chunk ${item.index + 1} with Groq:`, err);
          return 'NO_RELEVANT_INFO';
        }
      })
    );
    results.push(...batchResults);
  }

  return results.filter(r => !r.includes('NO_RELEVANT_INFO'));
}
