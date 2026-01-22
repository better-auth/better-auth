import type { GenericEndpointContext, OAuth2Tokens, User } from "better-auth";
import type { SSOOptions, SSOProvider } from "../types";
import { domainMatches } from "../utils";
import type { NormalizedSSOProfile } from "./types";

export interface OrganizationProvisioningOptions {
	disabled?: boolean;
	defaultRole?: "member" | "admin";
	getRole?: (data: {
		user: User & Record<string, any>;
		userInfo: Record<string, any>;
		token?: OAuth2Tokens;
		provider: SSOProvider<SSOOptions>;
	}) => Promise<"member" | "admin">;
}

export interface AssignOrganizationFromProviderOptions {
	user: User;
	profile: NormalizedSSOProfile;
	provider: SSOProvider<SSOOptions>;
	token?: OAuth2Tokens;
	provisioningOptions?: OrganizationProvisioningOptions;
}

/**
 * Assigns a user to an organization based on the SSO provider's organizationId.
 * Used in SSO flows (OIDC, SAML) where the provider is already linked to an org.
 */
export async function assignOrganizationFromProvider(
	ctx: GenericEndpointContext,
	options: AssignOrganizationFromProviderOptions,
): Promise<void> {
	const { user, profile, provider, token, provisioningOptions } = options;

	if (!provider.organizationId) {
		return;
	}

	if (provisioningOptions?.disabled) {
		return;
	}

	if (!ctx.context.hasPlugin("organization")) {
		return;
	}

	const isAlreadyMember = await ctx.context.adapter.findOne({
		model: "member",
		where: [
			{ field: "organizationId", value: provider.organizationId },
			{ field: "userId", value: user.id },
		],
	});

	if (isAlreadyMember) {
		return;
	}

	const role = provisioningOptions?.getRole
		? await provisioningOptions.getRole({
				user,
				userInfo: profile.rawAttributes || {},
				token,
				provider,
			})
		: provisioningOptions?.defaultRole || "member";

	await ctx.context.adapter.create({
		model: "member",
		data: {
			organizationId: provider.organizationId,
			userId: user.id,
			role,
			createdAt: new Date(),
		},
	});
}

export interface AssignOrganizationByDomainOptions {
	user: User;
	provisioningOptions?: OrganizationProvisioningOptions;
	domainVerification?: {
		enabled?: boolean;
	};
}

/**
 * Assigns a user to an organization based on their email domain.
 * Looks up SSO providers that match the user's email domain and assigns
 * the user to the associated organization.
 *
 * This enables domain-based org assignment for non-SSO sign-in methods
 * (e.g., Google OAuth with @acme.com email gets added to Acme's org).
 */
export async function assignOrganizationByDomain(
	ctx: GenericEndpointContext,
	options: AssignOrganizationByDomainOptions,
): Promise<void> {
	const { user, provisioningOptions, domainVerification } = options;

	if (provisioningOptions?.disabled) {
		return;
	}

	if (!ctx.context.hasPlugin("organization")) {
		return;
	}

	const domain = user.email.split("@")[1];
	if (!domain) {
		return;
	}

	// Support comma-separated domains for multi-domain SSO
	// First try exact match (fast path)
	const whereClause: { field: string; value: string | boolean }[] = [
		{ field: "domain", value: domain },
	];

	if (domainVerification?.enabled) {
		whereClause.push({ field: "domainVerified", value: true });
	}

	let ssoProvider = await ctx.context.adapter.findOne<SSOProvider<SSOOptions>>({
		model: "ssoProvider",
		where: whereClause,
	});

	// If not found, search all providers for comma-separated domain match
	if (!ssoProvider) {
		const allProviders = await ctx.context.adapter.findMany<
			SSOProvider<SSOOptions>
		>({
			model: "ssoProvider",
			where: domainVerification?.enabled
				? [{ field: "domainVerified", value: true }]
				: [],
		});
		ssoProvider =
			allProviders.find((p) => domainMatches(domain, p.domain)) ?? null;
	}

	if (!ssoProvider || !ssoProvider.organizationId) {
		return;
	}

	const isAlreadyMember = await ctx.context.adapter.findOne({
		model: "member",
		where: [
			{ field: "organizationId", value: ssoProvider.organizationId },
			{ field: "userId", value: user.id },
		],
	});

	if (isAlreadyMember) {
		return;
	}

	const role = provisioningOptions?.getRole
		? await provisioningOptions.getRole({
				user,
				userInfo: {},
				provider: ssoProvider,
			})
		: provisioningOptions?.defaultRole || "member";

	await ctx.context.adapter.create({
		model: "member",
		data: {
			organizationId: ssoProvider.organizationId,
			userId: user.id,
			role,
			createdAt: new Date(),
		},
	});
}
