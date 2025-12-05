export function toSolidStartHandler(
	auth:
		| {
				handler: (request: Request) => Promise<Response>;
		  }
		| ((request: Request) => Promise<Response>),
) {
	const handler = async (event: { request: Request }) => {
		return "handler" in auth
			? auth.handler(event.request)
			: auth(event.request);
	};
	return {
		GET: handler,
		POST: handler,
		PATCH: handler,
		PUT: handler,
		DELETE: handler,
	};
}
