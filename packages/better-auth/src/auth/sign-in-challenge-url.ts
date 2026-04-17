import type { SignInChallenge } from "@better-auth/core";

const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

function kindSpecificParams(
	challenge: SignInChallenge,
): Array<[string, string]> {
	const entries: Array<[string, string]> = [["attemptId", challenge.attemptId]];
	if (challenge.type === "two-factor") {
		entries.push(["methods", challenge.availableMethods.join(",")]);
	}
	return entries;
}

/**
 * Appends a paused sign-in challenge to a redirect target so the landing page
 * can resume the flow. Preserves relative targets and fragments.
 *
 * Writes `?challenge=<type>&attemptId=<id>&<kind-specific>` where kind-specific
 * params are determined by the challenge type (e.g. `methods=<list>` for
 * `two-factor`).
 */
export function appendSignInChallengeToURL(
	target: string,
	challenge: SignInChallenge,
): string {
	const params: Array<[string, string]> = [
		["challenge", challenge.type],
		...kindSpecificParams(challenge),
	];

	if (ABSOLUTE_URL_PATTERN.test(target)) {
		const url = new URL(target);
		for (const [key, value] of params) {
			url.searchParams.set(key, value);
		}
		return url.toString();
	}

	const hashIndex = target.indexOf("#");
	const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
	const hash = hashIndex === -1 ? "" : target.slice(hashIndex);
	const separator = beforeHash.includes("?") ? "&" : "?";
	const encoded = params
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join("&");
	return `${beforeHash}${separator}${encoded}${hash}`;
}
