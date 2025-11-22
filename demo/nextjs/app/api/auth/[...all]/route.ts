import { toNextJsHandler } from "better-auth/next-js";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

// Add CORS headers to responses
const addCorsHeaders = (response: Response) => {
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set(
		"Access-Control-Allow-Methods",
		"GET, POST, PUT, DELETE, OPTIONS",
	);
	response.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization",
	);
	return response;
};

export async function GET(request: NextRequest) {
	const response = await handlers.GET(request);
	return addCorsHeaders(response);
}

export async function POST(request: NextRequest) {
	const response = await handlers.POST(request);
	return addCorsHeaders(response);
}

export async function OPTIONS() {
	return addCorsHeaders(
		new Response(null, {
			status: 204,
		}),
	);
}
