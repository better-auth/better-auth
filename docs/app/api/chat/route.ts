import { ProvideLinksToolSchema } from '@/lib/inkeep-schema';
import { createOpenAI } from '@ai-sdk/openai';
import { convertToModelMessages, streamText } from 'ai';

export const runtime = 'edge';

const chonkieProvider = createOpenAI({
  apiKey: process.env.CHONKIE_API_KEY,
  baseURL: 'https://labs.chonkie.ai/api/v1',
});

export async function POST(req: Request) {
  const reqJson = await req.json();

  const result = streamText({
    model: chonkieProvider('better-auth-builder'),
    tools: {
      provideLinks: {
        inputSchema: ProvideLinksToolSchema,
      },
    },
    messages: convertToModelMessages(reqJson.messages, {
      ignoreIncompleteToolCalls: true,
    }),
    toolChoice: 'auto',
  });

  return result.toUIMessageStreamResponse();
}