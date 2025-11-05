import type { PasskeyOptions } from "./types";

export function getRpID(options: PasskeyOptions, baseURL?: string | undefined) {
	return (
		options.rpID || (baseURL ? new URL(baseURL).hostname : "localhost") // default rpID
	);
}
