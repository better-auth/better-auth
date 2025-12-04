import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { logEventToAnalytics } from "@/lib/inkeep-analytics";

export const runtime = "edge";

export async function POST(req: NextRequest) {
	try {
		const { type, entityType, messageId, conversationId } = await req.json();

		if (!type || !entityType) {
			return NextResponse.json(
				{ error: "type and entityType are required" },
				{ status: 400 },
			);
		}

		if (entityType !== "message" && entityType !== "conversation") {
			return NextResponse.json(
				{ error: "entityType must be 'message' or 'conversation'" },
				{ status: 400 },
			);
		}

		const result = await logEventToAnalytics({
			type,
			entityType,
			messageId,
			conversationId,
		});

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
	}
}
