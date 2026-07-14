import { auth } from "@/lib/auth";
import {
	getSCIMDemoBaseURL,
	getSCIMDemoFailure,
	isSCIMDemoEnabled,
	runSCIMDemoWorkflow,
} from "@/lib/scim-demo";
import type { SCIMDemoStreamEvent } from "@/lib/scim-demo-types";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
	return Response.json(
		{ error: message },
		{
			status,
			headers: { "cache-control": "no-store" },
		},
	);
}

export async function POST(request: Request) {
	if (!isSCIMDemoEnabled()) {
		return jsonError("SCIM demo not found", 404);
	}

	const baseURL = getSCIMDemoBaseURL();
	const origin = request.headers.get("origin");
	if (origin !== new URL(baseURL).origin) {
		return jsonError("Cross-origin workflow requests are not allowed", 403);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) {
		return jsonError("Authentication required", 401);
	}

	const encoder = new TextEncoder();
	const context = await auth.$context;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: SCIMDemoStreamEvent) => {
				controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
			};

			try {
				await runSCIMDemoWorkflow({
					baseURL,
					database: context.adapter,
					onCheckpoint(checkpoint) {
						send({ type: "checkpoint", checkpoint });
					},
				});
				send({ type: "complete" });
			} catch (error) {
				send({ type: "error", error: getSCIMDemoFailure(error) });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"cache-control": "no-store",
			"content-type": "application/x-ndjson; charset=utf-8",
			"x-content-type-options": "nosniff",
		},
	});
}
