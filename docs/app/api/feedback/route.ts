import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { getClientIP } from "@/lib/ai-chat/rate-limit";
import type { FeedbackRecord } from "@/lib/feedback";
import {
	FEEDBACK_DESCRIPTOR,
	feedbackSchema,
	notifySlack,
	sanitizeReferer,
	sanitizeUserAgent,
	storeFeedback,
} from "@/lib/feedback";

// Agents may call this from any origin, including a browser context.
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

let _ratelimit: Ratelimit | null = null;
function getRatelimit(): Ratelimit {
	if (!_ratelimit) {
		const redis = new Redis({
			url: process.env.UPSTASH_REDIS_REST_URL!,
			token: process.env.UPSTASH_REDIS_REST_TOKEN!,
		});
		_ratelimit = new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(10, "1 h"),
			prefix: "agent-feedback",
		});
	}
	return _ratelimit;
}

/**
 * Self-describing discovery response, so an agent that finds the URL can learn
 * the payload shape without reading the docs.
 *
 * `endpoint` is derived from the request rather than taken from the constant,
 * so preview and self-hosted deployments describe the host that actually
 * served the response instead of pointing back at production.
 */
export function GET(request: Request) {
	return NextResponse.json(
		{
			...FEEDBACK_DESCRIPTOR,
			endpoint: new URL("/api/feedback", request.url).toString(),
		},
		{ headers: CORS_HEADERS },
	);
}

export function OPTIONS() {
	return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json(
			{ message: "Invalid JSON body", schema: FEEDBACK_DESCRIPTOR.fields },
			{ status: 400, headers: CORS_HEADERS },
		);
	}

	try {
		if (process.env.NODE_ENV === "production") {
			const { success } = await getRatelimit().limit(getClientIP(request));
			if (!success) {
				return NextResponse.json(
					{ message: "Too many requests. Please try again later." },
					{ status: 429, headers: CORS_HEADERS },
				);
			}
		}

		const parsed = feedbackSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json(
				{
					message: "Invalid feedback payload",
					issues: parsed.error.issues.map((issue) => ({
						field: issue.path.join(".") || "(root)",
						message: issue.message,
					})),
					schema: FEEDBACK_DESCRIPTOR.fields,
				},
				{ status: 422, headers: CORS_HEADERS },
			);
		}

		const record: FeedbackRecord = {
			...parsed.data,
			id: crypto.randomUUID(),
			receivedAt: new Date().toISOString(),
			userAgent: sanitizeUserAgent(request.headers.get("user-agent")),
			referer: sanitizeReferer(request.headers.get("referer")),
		};

		const stored = await storeFeedback(record);
		if (!stored) {
			if (process.env.NODE_ENV === "production") {
				console.error("Feedback storage unavailable: Upstash not configured");
				return NextResponse.json(
					{ message: "Feedback could not be stored. Please try again later." },
					{ status: 503, headers: CORS_HEADERS },
				);
			}
			console.info("Feedback received (not stored, no Upstash config)", record);
		}

		// Never fail the submission because a notification failed.
		try {
			await notifySlack(record);
		} catch (e) {
			console.error("Slack feedback notification failed", e);
		}

		return NextResponse.json(
			{ id: record.id, message: "Feedback received. Thank you." },
			{ status: 201, headers: CORS_HEADERS },
		);
	} catch (e) {
		console.error("Feedback submission error", e);
		return NextResponse.json(
			{ message: "Something went wrong. Please try again." },
			{ status: 500, headers: CORS_HEADERS },
		);
	}
}
