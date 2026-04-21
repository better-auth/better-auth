import type { SignInChallenge } from "@better-auth/core";

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

/**
 * Appends a paused sign-in challenge to a redirect target so the landing page
 * can resume the flow. Preserves relative targets and fragments.
 *
 * Writes `?challenge=<kind>` only. Challenge payload details such as the
 * `attemptId` or available methods are intentionally omitted: query params
 * leak through Referer headers and reverse-proxy access logs. Browsers recover
 * the pending challenge through the signed `better-auth.two_factor_challenge`
 * cookie;
 * native callers read the full challenge from the response body.
 */
export function appendSignInChallengeToURL(
	redirectTarget: string,
	challenge: SignInChallenge,
): string {
	const params: Array<[string, string]> = [["challenge", challenge.kind]];

	if (ABSOLUTE_URL_PATTERN.test(redirectTarget)) {
		const url = new URL(redirectTarget);
		for (const [key, value] of params) {
			url.searchParams.set(key, value);
		}
		return url.toString();
	}

	const hashIndex = redirectTarget.indexOf("#");
	const beforeHash =
		hashIndex === -1 ? redirectTarget : redirectTarget.slice(0, hashIndex);
	const hash = hashIndex === -1 ? "" : redirectTarget.slice(hashIndex);
	const separator = beforeHash.includes("?") ? "&" : "?";
	const encoded = params
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join("&");
	return `${beforeHash}${separator}${encoded}${hash}`;
}
