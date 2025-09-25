import { ProvideLinksToolSchema } from '@/lib/inkeep-schema';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { convertToModelMessages, streamText } from 'ai';

export const runtime = 'edge';

const openai = createOpenAICompatible({
  name: 'chonkie',
  apiKey: "chnk_yajrrbiDfsfrwpubnQPYIdGcYnOlhrSfSljFsweEOPNKavhQBLiderwLCgtSbJjC",
  baseURL: 'https://labs.chonkie.ai/api/v1',
});

export async function POST(req: Request) {
  try {
    const reqJson = await req.json();

    // Validate that we have messages
    const messages = reqJson.messages || [];
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "No messages provided" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending request to Chonkie with messages:', messages);

    const result = streamText({
      model: openai('better-auth-builder'),
      tools: {
        provideLinks: {
          inputSchema: ProvideLinksToolSchema,
        },
      },
      messages: convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
      }),
      toolChoice: 'auto',
    });
    const content = await result.content;
    console.log("Content", content);
    console.log('StreamText result created, returning response...');
    return result.toUIMessageStreamResponse();

  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error instanceof Error && error.message.includes('Invalid input')) {
      return new Response(
        JSON.stringify({
          error: "The AI provider returned an unexpected response format. Please try again.",
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        error: `API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}