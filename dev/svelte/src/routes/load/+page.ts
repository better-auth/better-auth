import { auth } from "$lib/auth";

export async function load(request: Request) {
	const session = await auth.api.getSession({
		headers: request.headers,
	});
	if (!session) {
		return {
			status: 401,
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				error: "Unauthorized",
			}),
		};
	}
	return session;
}
