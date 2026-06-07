// HuggingFace Inference API helper using the modern OpenAI-compatible router
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const MODEL_NAME = 'Qwen/Qwen2.5-7B-Instruct'; // Excellent open/un-gated model

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

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
