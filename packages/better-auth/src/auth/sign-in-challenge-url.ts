import type { SignInChallenge } from "@better-auth/core";

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function kindSpecificParams(
	challenge: SignInChallenge,
): Array<[string, string]> {
	const entries: Array<[string, string]> = [];
	if (challenge.kind === "two-factor") {
		entries.push(["methods", challenge.availableMethods.join(",")]);
	}
	return entries;
}

/**
 * Appends a paused sign-in challenge to a redirect target so the landing page
 * can resume the flow. Preserves relative targets and fragments.
 *
 * Writes `?challenge=<kind>&<kind-specific>` where kind-specific params are
 * determined by the challenge kind (e.g. `methods=<list>` for `two-factor`).
 * The `attemptId` is intentionally omitted: query params leak through Referer
 * headers and reverse-proxy access logs. Browsers read it from the signed
 * `better-auth.two_factor` cookie; native callers read it from the response
 * body and send it back as `body.attemptId`.
 */
export function appendSignInChallengeToURL(
	redirectTarget: string,
	challenge: SignInChallenge,
): string {
	const params: Array<[string, string]> = [
		["challenge", challenge.kind],
		...kindSpecificParams(challenge),
	];

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
