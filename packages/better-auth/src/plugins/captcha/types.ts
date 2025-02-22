import type { Providers } from "./constants";
export type Provider = (typeof Providers)[keyof typeof Providers];

export type TurnstileSiteVerifyResponse = {
	success: boolean;
	"error-codes"?: string[];
	challenge_ts?: string;
	hostname?: string;
	action?: string;
	cdata?: string;
	metadata?: {
		interactive: boolean;
	};
	messages?: string[];
};

export type GoogleReCAPTCHASiteVerifyResponse = {
	success: boolean;
	challenge_ts: string;
	hostname: string;
	"error-codes":
		| Array<
				| "missing-input-secret"
				| "invalid-input-secret"
				| "missing-input-response"
				| "invalid-input-response"
				| "bad-request"
				| "timeout-or-duplicate"
		  >
		| undefined;
};
