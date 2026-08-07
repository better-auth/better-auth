import {
	defineRequestState,
	type RequestState,
} from "@better-auth/core/context";

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

let state: RequestState<OAuthState | null> | undefined;

function getOAuthRequestState() {
	state ??= defineRequestState<OAuthState | null>(() => null);
	return state;
}

const getOAuthState = () => getOAuthRequestState().get();
/**
 * @internal This is unsafe to be used directly. Use setOAuthState instead.
 */
const setOAuthState = (value: OAuthState | null) =>
	getOAuthRequestState().set(value);

export { getOAuthState, setOAuthState };
