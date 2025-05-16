import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";

export const GET = async (req: Request) => {
	const res = await auth.api.getMCPOAuthConfig();
	return new NextResponse(JSON.stringify(res), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
			"Access-Control-Max-Age": "86400",
		},
	});
};
