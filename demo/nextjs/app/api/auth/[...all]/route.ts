import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

function addCorsHeaders(url: URL, headers: Headers) {
	if (
		process.env.NODE_ENV === "development" &&
		[
			"/api/auth/oauth2/token",
			"/api/auth/oauth2/userinfo",
			"/api/auth/oauth2/register",
		].includes(url.pathname)
	) {
		headers.set(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, PATCH, DELETE, OPTIONS",
		);
		headers.set("Access-Control-Allow-Origin", "*");
		headers.set("Access-Control-Allow-Headers", "authorization, content-type");
		headers.set(
			"Cache-Control",
			"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
		);
	}
}

// Define a CORS wrapper
function withCors(handler: Function) {
	return async (req: Request) => {
		const res = await handler(req);
		addCorsHeaders(new URL(req.url), res.headers);
		return res;
	};
}

const handler = toNextJsHandler(auth);

export const GET = withCors(handler.GET);
export const POST = withCors(handler.POST);
export const PUT = withCors(handler.PUT);
export const PATCH = withCors(handler.PATCH);
export const DELETE = withCors(handler.DELETE);

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
	const headers = new Headers();
	addCorsHeaders(new URL(req.url), headers);
	return new NextResponse(null, {
		headers,
	});
}
