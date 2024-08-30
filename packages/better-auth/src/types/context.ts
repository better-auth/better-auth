import type { ContextTools } from "better-call";
import type { AuthContext } from "../init";

export type GenericEndpointContext = ContextTools & {
	context: AuthContext;
} & {
	body: any;
	request: Request;
	headers: Headers;
	params?: Record<string, string> | undefined;
	query: any;
	method: "*";
};
