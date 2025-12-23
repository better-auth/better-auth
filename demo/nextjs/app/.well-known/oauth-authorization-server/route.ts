import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(): Promise<NextResponse> {
	const config = await auth.api.getOAuthServerConfig();
	const headers = new Headers();
	if (process.env.NODE_ENV === "development") {
		headers.set("Access-Control-Allow-Methods", "GET");
		headers.set("Access-Control-Allow-Origin", "*");
		headers.set(
			"Cache-Control",
			"public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
		);
	}
	return NextResponse.json(config, {
		headers,
	});
}
