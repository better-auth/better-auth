import type { Endpoint } from "better-call";
import type { BetterAuthPluginDBSchema } from "../db";
import type { BetterAuthPluginV2 } from "../types";
import type { RawError } from "./error-codes";

export function createPlugin<
	ID extends string,
	Endpoints extends Record<string, Endpoint> = {},
	ERROR_CODES extends Record<string, RawError> = {},
	Schema extends BetterAuthPluginDBSchema = {},
	Options extends object = {},
>(
	plugin: BetterAuthPluginV2<ID, Endpoints, Schema, ERROR_CODES, Options>,
): BetterAuthPluginV2<ID, Endpoints, Schema, ERROR_CODES, Options> {
	return plugin;
}
