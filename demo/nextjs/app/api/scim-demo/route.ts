import { isSCIMDemoEnabled } from "@/lib/scim-demo";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
	return Response.json(
		{ error: message },
		{
			status,
			headers: {
				"cache-control": "private, no-store",
				"referrer-policy": "no-referrer",
			},
		},
	);
}

export function GET() {
	if (!isSCIMDemoEnabled()) return jsonError("SCIM demo not found", 404);
	return jsonError(
		"Use an organization-scoped SCIM demo connection endpoint",
		410,
	);
}

export function POST() {
	if (!isSCIMDemoEnabled()) return jsonError("SCIM demo not found", 404);
	return jsonError(
		"Server-originated SCIM demo mutations are no longer available",
		410,
	);
}
