import { betterAuth } from "better-auth";

const auth = betterAuth({
	basePath: "/auth",
	organization: {
		enabled: true,
	},
});

export type IUser = typeof auth.$inferredTypes.User;
const res = await auth.api.getCurrentSession();
res.user.orgId;

const CORS_HEADERS = {
	headers: {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "OPTIONS, POST",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
	},
};

Bun.serve({
	fetch: async (req) => {
		if (req.method === "OPTIONS") {
			console.log("OPTIONS");
			const res = new Response("Departed", CORS_HEADERS);
			return res;
		}
		const res = await auth.handler(req);
		return new Response(res.body, {
			...res,
			headers: {
				...res.headers,
				...CORS_HEADERS.headers,
			},
		});
	},
});
