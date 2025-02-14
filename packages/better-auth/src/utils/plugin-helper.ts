import { APIError } from "better-call";

export const getEndpointResponse = async <T>(ctx: {
	context: {
		returned?: unknown;
	};
}) => {
	const returned = ctx.context.returned;
	if (!returned) {
		return null;
	}
	if (returned instanceof Response) {
		if (returned.status !== 200) {
			return null;
		}
		return (await returned.clone().json()) as T;
	}
	if (returned instanceof APIError) {
		return null;
	}
	return returned as T;
};
