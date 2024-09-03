import type { Auth } from "../auth";
import { NextRequest, NextResponse } from "next/server";
export function toNextJsHandler(auth: Auth | Auth["handler"]) {
	const handler = async (request: Request) => {
		return "handler" in auth ? auth.handler(request) : auth(request);
	};
	return {
		GET: handler,
		POST: handler,
	};
}
