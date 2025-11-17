import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { submitFeedbackToAnalytics } from "@/lib/inkeep-analytics";

export const runtime = "edge";

export async function POST(req: NextRequest) {
	try {
		const { messageId, type, reasons } = await req.json();

		if (!messageId || !type) {
			return NextResponse.json(
				{ error: "messageId and type are required" },
				{ status: 400 },
			);
		}

		if (type !== "positive" && type !== "negative") {
			return NextResponse.json(
				{ error: "type must be 'positive' or 'negative'" },
				{ status: 400 },
			);
		}

		const result = await submitFeedbackToAnalytics({
			messageId,
			type,
			reasons,
		});

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to submit feedback" },
			{ status: 500 },
		);
	}
}
