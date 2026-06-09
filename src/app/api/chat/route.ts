import { NextRequest, NextResponse } from 'next/server';
import { extractFromAllChunks, Message } from '@/lib/huggingface';
import { queryGroq, chatWithGroq, extractFromAllChunksWithGroq } from '@/lib/groq';

export const runtime = 'nodejs';
export const maxDuration = 120; // chunked processing can take longer

// Benefits analysis detection — if the question contains this signature
const BENEFITS_SIGNATURE = 'Analyze this document and identify the top benefits';

// Extraction prompt sent to Mistral for each chunk during benefits analysis
const CHUNK_EXTRACTION_PROMPT = `Extract ALL benefits, obligations, and key clauses from this contract section for EACH party involved.
For each item found, provide:
- The party name (e.g., Landlord, Tenant, Buyer, Seller)
- A brief description of the benefit or obligation
- The exact clause text or section reference
- A significance score from 1-10

Format each finding as a line like: PARTY | BENEFIT_DESCRIPTION | CLAUSE_REFERENCE | SCORE
If this section contains no relevant benefits or obligations, respond with NO_RELEVANT_INFO.`;

export async function POST(req: NextRequest) {
  try {
    const { docText, history, question, apiKey: clientHfKey, groqApiKey: clientGroqKey } = await req.json();

    if (!docText || !question) {
      return NextResponse.json({ error: 'Missing docText or question' }, { status: 400 });
    }

    // Use server-side keys as default, fall back to client-provided keys
    const hfApiKey = process.env.HF_API_KEY || clientHfKey;
    const groqApiKey = process.env.GROQ_API_KEY || clientGroqKey;

    if (!groqApiKey) {
      return NextResponse.json({ error: 'No Groq API key configured. Set GROQ_API_KEY in .env or provide one in the UI.' }, { status: 400 });
    }

    const isBenefitsAnalysis = question.includes(BENEFITS_SIGNATURE);

    if (isBenefitsAnalysis) {
      // ─── BENEFITS PIPELINE: Chunk → Extract → Synthesize (Groq) ───
      let chunkResults: string[];

      if (hfApiKey) {
        try {
          console.log('Attempting chunk extraction using HuggingFace (Mistral)...');
          chunkResults = await extractFromAllChunks(
            docText,
            CHUNK_EXTRACTION_PROMPT,
            hfApiKey,
            2 // conservative concurrency for free tier
          );
        } catch (hfError: any) {
          console.warn('HuggingFace chunk extraction failed, falling back to Groq:', hfError.message || hfError);
          chunkResults = await extractFromAllChunksWithGroq(
            docText,
            CHUNK_EXTRACTION_PROMPT,
            groqApiKey,
            1 // sequential processing to avoid rate limits
          );
        }
      } else {
        console.log('No HuggingFace API key provided. Using Groq for chunk extraction...');
        chunkResults = await extractFromAllChunksWithGroq(
          docText,
          CHUNK_EXTRACTION_PROMPT,
          groqApiKey,
          1 // sequential processing to avoid rate limits
        );
      }

      // Step 2: Aggregate and send to Groq for final synthesis
      const aggregatedExtractions = chunkResults.join('\n\n---\n\n');

      const synthesisPrompt = `You have received raw extracted benefits and obligations from multiple sections of a legal contract. 
Your job is to synthesize these into a clean, deduplicated JSON array.

Here are the raw extractions from the document analysis:

${aggregatedExtractions}

Now produce the final output as a JSON array with the following format (and nothing else before or after the JSON):
[
  {"party": "Party A (use actual name from document)", "benefit": "Brief benefit description", "clause": "The exact clause text or section reference", "score": 8},
  {"party": "Party B (use actual name from document)", "benefit": "Brief benefit description", "clause": "The exact clause text or section reference", "score": 7}
]

Rules:
- Include 3-5 benefits per party
- Deduplicate similar benefits across chunks
- Use actual party names from the document
- Score should be 1-10 indicating significance
- Each item MUST use the exact key "benefit" (do NOT use keys like "obligation" or "description" for the description field; put all findings under the "benefit" key)
- Ensure the JSON is valid and parseable`;

      const answer = await queryGroq(
        'You are a legal contract analyst. Produce only valid JSON output.',
        synthesisPrompt,
        groqApiKey,
        { temperature: 0.2, maxTokens: 2048 }
      );

      let normalizedAnswer = answer;
      try {
        const jsonMatch = answer.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            const normalized = parsed.map((item: any) => ({
              party: item.party || '',
              benefit: item.benefit || item.obligation || item.description || item.finding || '',
              clause: item.clause || item.clause_reference || item.reference || '',
              score: typeof item.score === 'number' ? item.score : parseInt(String(item.score || 0), 10) || 5
            }));
            normalizedAnswer = JSON.stringify(normalized, null, 2);
          }
        }
      } catch (e) {
        console.warn('Failed to parse or normalize synthesized answer on backend:', e);
      }

      return NextResponse.json({ answer: normalizedAnswer });

    } else {
      // ─── GENERAL CHAT: Direct Q&A via Groq (128k context) ───
      const answer = await chatWithGroq(
        docText,
        (history as Message[]) || [],
        question,
        groqApiKey
      );

      return NextResponse.json({ answer });
    }

  } catch (err: unknown) {
    console.error('Error in chat API:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
