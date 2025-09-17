import type { EndpointDefinition } from "./shared";
import { type EndpointOptions } from "better-call";
import { createAuthEndpoint } from "../api";

export function implEndpoint<
	Path extends string,
	Options extends EndpointOptions,
>(
	definition: EndpointDefinition<Path, Options>,
	handler: Parameters<typeof createAuthEndpoint>[2],
) {
	return createAuthEndpoint(definition.path, definition.options, handler);
}
