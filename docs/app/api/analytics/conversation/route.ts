import {
	logConversationToAnalytics,
	type InkeepMessage,
} from "@/lib/inkeep-analytics";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
	try {
		const { messages }: { messages: InkeepMessage[] } = await req.json();

		if (!messages || !Array.isArray(messages)) {
			return NextResponse.json(
				{ error: "Messages array is required" },
				{ status: 400 },
			);
		}

		const result = await logConversationToAnalytics({
			type: "openai",
			messages,
			properties: {
				source: "better-auth-docs",
				timestamp: new Date().toISOString(),
			},
		});

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to log conversation" },
			{ status: 500 },
		);
	}
}
