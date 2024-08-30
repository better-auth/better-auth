import { auth } from "@/lib/auth";
import type { NextRequest } from "next/server";

const handler = auth.handler;

export const POST = async (req: NextRequest) => {
	return handler(req);
};

export { handler as GET };
