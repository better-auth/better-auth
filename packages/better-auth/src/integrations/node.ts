import { toNodeHandler as toNode } from "better-call/node";
import type { Auth } from "../auth";
import type { IncomingHttpHeaders } from "http";

export const toNodeHandler = (
	auth:
		| {
				handler: Auth["handler"];
		  }
		| Auth["handler"],
) => {
	return "handler" in auth ? toNode(auth.handler) : toNode(auth);
};

export function fromNodeHeaders(nodeHeaders: IncomingHttpHeaders): Headers {
	const webHeaders = new Headers();
	for (const [key, value] of Object.entries(nodeHeaders)) {
		if (value !== undefined) {
			if (Array.isArray(value)) {
				value.forEach((v) => webHeaders.append(key, v));
			} else {
				webHeaders.set(key, value);
			}
		}
	}
	return webHeaders;
}
