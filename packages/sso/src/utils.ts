import type { GenericEndpointContext } from "better-auth";
import type { SSOOptions, SSOProvider } from "./types";

export const validateEmailDomain = (email: string, domain: string) => {
	const emailDomain = email.split("@")[1]?.toLowerCase();
	const providerDomain = domain.toLowerCase();
	if (!emailDomain || !providerDomain) {
		return false;
	}
	return (
		emailDomain === providerDomain || emailDomain.endsWith(`.${providerDomain}`)
	);
};

/**
 * Determines whether an SSO provider can auto-link to an existing user
 * based on the configured trust policy.
 *
 * This function implements a unified trust model for all SSO paths (OIDC and SAML).
 * For SSO, both "trusted_providers_only" and "verified_email_trusted" modes still require
 * a trust signal (trusted provider OR domain-verified + domain match). The "relaxed"
 * behavior of "verified_email_trusted" only applies in core handleOAuthUserInfo for non-SSO
 * flows where emailVerified can be used as a trust signal.
 *
 * @param ctx - The endpoint context with auth options
 * @param options - Object containing providerId, userEmail, and provider info
 * @returns true if auto-linking is allowed, false otherwise
 */
export function canAutoLinkExistingUser(
	ctx: GenericEndpointContext,
	{
		providerId,
		userEmail,
		provider,
	}: {
		providerId: string;
		userEmail: string;
		provider: SSOProvider<SSOOptions>;
	},
): boolean {
	const accountLinking = ctx.context.options.account?.accountLinking;

	if (accountLinking?.enabled === false) {
		return false;
	}

	// SSO defaults to "trusted_providers_only" (stricter than core's "verified_email_trusted")
	// because enterprise SSO providers should prove domain ownership or be explicitly
	// trusted before auto-linking to existing accounts.
	const linkingPolicy =
		accountLinking?.linkingPolicy ?? "trusted_providers_only";

	if (linkingPolicy === "never") {
		return false;
	}

	// For SSO, both "trusted_providers_only" and "verified_email_trusted" still require
	// a provider/domain trust signal. The "relaxed" behavior of "verified_email_trusted"
	// (allowing emailVerified as trust) only applies in core handleOAuthUserInfo.
	const trustedProviders = accountLinking?.trustedProviders;
	if (trustedProviders?.includes(providerId)) {
		return true;
	}

	if (
		"domainVerified" in provider &&
		provider.domainVerified &&
		provider.domain &&
		validateEmailDomain(userEmail, provider.domain)
	) {
		return true;
	}

	return false;
}
