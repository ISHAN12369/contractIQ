import { NextRequest, NextResponse } from 'next/server';
import { queryHuggingFace, Message } from '@/lib/huggingface';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { docText, history, question, apiKey } = await req.json();

    if (!docText || !question) {
      return NextResponse.json({ error: 'Missing docText or question' }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'No HuggingFace API key provided.' }, { status: 400 });
    }

    const answer = await queryHuggingFace(
      docText,
      (history as Message[]) || [],
      question,
      apiKey
    );

    return NextResponse.json({ answer });
  } catch (err: unknown) {
    console.error('Error in chat API:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
