import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const GET = async (req: Request) => {
	return auth.handler(req);
};

export const POST = async (req: Request) => {
	const response = await auth.handler(req);

	const res = response.clone();
	res.headers.set("Access-Control-Allow-Origin", "*");
	res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.headers.set(
		"Access-Control-Allow-Headers",
		"Content-Type, Authorization",
	);
	res.headers.set("Access-Control-Max-Age", "86400");
	return res;
};

export async function OPTIONS() {
	return new NextResponse(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
			"Access-Control-Max-Age": "86400",
		},
	});
}
