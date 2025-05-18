import { betterFetch } from "@better-fetch/fetch";
import type { BetterAuthClientPlugin } from "better-auth";

//TODO: Make client
export const x402Client = () => {
	return {
		id: "x402",
	} satisfies BetterAuthClientPlugin;
};

export const x402Middleware = async ({
	full_url,
	headers,
}: { full_url: string; headers: Headers }) => {
	const { data, error } = await betterFetch<{
		responseHeader: string;
	}>("/api/auth/x402/middleware", {
		baseURL: new URL(full_url).origin,
		headers,
	});

	return { error, responseHeader: data?.responseHeader || null };
};
