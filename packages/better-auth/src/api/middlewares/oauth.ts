import {
	defineRequestState,
	getCurrentAuthContext,
} from "@better-auth/core/context";
import { APIError } from "better-call";
import * as z from "zod";

type OAuthState = {
	callbackURL: string;
	codeVerifier: string;
	errorURL?: string;
	newUserURL?: string;
	link?: {
		email: string;
		userId: string;
	};
	expiresAt: number;
	requestSignUp?: boolean;
	[key: string]: any;
};

const {
	get: getOAuthState,
	/**
	 * @internal This is unsafe to be used directly. Use setOAuthState instead.
	 */
	set: setOAuthState,
} = defineRequestState<OAuthState>();

export { getOAuthState, setOAuthState };
