import type { Auth } from "../auth";

export function toSolidStartHandler(auth: Auth | Auth["handler"]) {
	const handler = async (event: {
		request: Request;
	}) => {
		return "handler" in auth
			? auth.handler(event.request)
			: auth(event.request);
	};
	return {
		GET: handler,
		POST: handler,
	};
}
