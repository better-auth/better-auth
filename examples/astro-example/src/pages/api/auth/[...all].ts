import type { APIRoute } from "astro";
import { auth } from "../../../auth";

export const GET: APIRoute = async (ctx) => {
	return auth.handler(ctx.request);
};

export const ALL: APIRoute = async (ctx) => {
	return auth.handler(ctx.request);
};
