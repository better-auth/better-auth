import type { GenericEndpointContext, OAuth2Tokens, User } from "better-auth";
import type { SSOOptions, SSOProvider } from "../types";
import { domainMatches, parseProviderDomains } from "../utils";
import type { NormalizedSSOProfile } from "./types";

export interface OrganizationProvisioningOptions {
	disabled?: boolean;
	defaultRole?: string;
	getRole?: (data: {
		user: User & Record<string, any>;
		userInfo: Record<string, any>;
		token?: OAuth2Tokens;
		provider: SSOProvider<SSOOptions>;
	}) => Promise<string>;
}

export interface AssignOrganizationFromProviderOptions {
	user: User;
	profile: NormalizedSSOProfile;
	provider: SSOProvider<SSOOptions>;
	token?: OAuth2Tokens;
	provisioningOptions?: OrganizationProvisioningOptions;
}

export interface AssignOrganizationByDomainOptions {
	user: User;
	provisioningOptions?: OrganizationProvisioningOptions;
	domainVerification?: {
		enabled?: boolean;
	};
}

type OrganizationAssignmentOptions =
	| ({
			reason: "provider-bound";
	  } & AssignOrganizationFromProviderOptions)
	| ({
			reason: "verified-domain";
	  } & AssignOrganizationByDomainOptions);

type OrganizationAssignmentResult =
	| "assigned"
	| "already-member"
	| "ambiguous-target"
	| "ineligible-source"
	| "invitation-pending"
	| "no-target"
	| "provisioning-disabled"
	| "unverified-identity";

const VERIFIED_PROVIDER_PAGE_SIZE = 100;

function getEmailDomain(email: string): string | null {
	const normalizedEmail = email.trim().toLowerCase();
	const parts = normalizedEmail.split("@");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return null;
	}
	const domain = parts[1];
	if (domain.includes("/") || domain.includes("\\") || domain.includes(":")) {
		return null;
	}
	const normalizedDomains = parseProviderDomains(domain);
	if (!normalizedDomains || normalizedDomains.length !== 1) {
		return null;
	}
	return normalizedDomains[0] ?? null;
}

async function findVerifiedDomainProviders(
	ctx: GenericEndpointContext,
	domain: string,
): Promise<SSOProvider<SSOOptions>[]> {
	const matchingProviders: SSOProvider<SSOOptions>[] = [];
	let offset = 0;

	while (true) {
		const page = await ctx.context.adapter.findMany<SSOProvider<SSOOptions>>({
			model: "ssoProvider",
			where: [{ field: "domainVerified", value: true }],
			limit: VERIFIED_PROVIDER_PAGE_SIZE,
			offset,
			sortBy: { field: "providerId", direction: "asc" },
		});
		matchingProviders.push(
			...page.filter((provider) => domainMatches(domain, provider.domain)),
		);
		if (page.length < VERIFIED_PROVIDER_PAGE_SIZE) {
			return matchingProviders;
		}
		offset += page.length;
	}
}

async function assignOrganization(
	ctx: GenericEndpointContext,
	options: OrganizationAssignmentOptions,
): Promise<OrganizationAssignmentResult> {
	if (options.provisioningOptions?.disabled) {
		return "provisioning-disabled";
	}
	if (!ctx.context.hasPlugin("organization")) {
		return "ineligible-source";
	}

	let user: User;
	let provider: SSOProvider<SSOOptions>;
	let organizationId: string;
	let userInfo: Record<string, unknown>;
	let token: OAuth2Tokens | undefined;

	if (options.reason === "provider-bound") {
		if (!options.provider.organizationId) {
			return "no-target";
		}
		user = options.user;
		provider = options.provider;
		organizationId = options.provider.organizationId;
		userInfo = options.profile.rawAttributes || {};
		token = options.token;
	} else {
		if (!options.domainVerification?.enabled) {
			return "provisioning-disabled";
		}
		const canonicalUser = await ctx.context.internalAdapter.findUserById(
			options.user.id,
		);
		if (!canonicalUser) {
			ctx.context.logger.error(
				"Unable to assign SSO organization membership because the canonical user was not found",
				{ userId: options.user.id },
			);
			return "ineligible-source";
		}
		if (!canonicalUser.emailVerified) {
			return "unverified-identity";
		}
		const domain = getEmailDomain(canonicalUser.email);
		if (!domain) {
			return "unverified-identity";
		}
		const matchingProviders = (
			await findVerifiedDomainProviders(ctx, domain)
		).filter(
			(
				matchingProvider,
			): matchingProvider is SSOProvider<SSOOptions> & {
				organizationId: string;
			} => Boolean(matchingProvider.organizationId),
		);
		const organizationIds = new Set(
			matchingProviders.map(
				(matchingProvider) => matchingProvider.organizationId,
			),
		);
		if (organizationIds.size > 1) {
			ctx.context.logger.warn(
				"Skipped SSO organization provisioning because a verified domain maps to multiple organizations",
				{ domain, userId: canonicalUser.id },
			);
			return "ambiguous-target";
		}
		if (matchingProviders.length === 0) {
			return "no-target";
		}
		matchingProviders.sort((left, right) =>
			left.providerId.localeCompare(right.providerId),
		);
		const selectedProvider = matchingProviders[0];
		if (!selectedProvider) {
			return "no-target";
		}
		user = canonicalUser;
		provider = selectedProvider;
		organizationId = selectedProvider.organizationId;
		userInfo = {};
		token = undefined;
	}

	const isAlreadyMember = await ctx.context.adapter.findOne({
		model: "member",
		where: [
			{ field: "organizationId", value: organizationId },
			{ field: "userId", value: user.id },
		],
	});
	if (isAlreadyMember) {
		return "already-member";
	}

	const pendingInvitation = await ctx.context.adapter.findOne({
		model: "invitation",
		where: [
			{ field: "organizationId", value: organizationId },
			{ field: "email", value: user.email.toLowerCase() },
			{ field: "status", value: "pending" },
			{ field: "expiresAt", value: new Date(), operator: "gt" },
		],
	});
	if (pendingInvitation) {
		return "invitation-pending";
	}

	const role = options.provisioningOptions?.getRole
		? await options.provisioningOptions.getRole({
				user,
				userInfo,
				token,
				provider,
			})
		: options.provisioningOptions?.defaultRole || "member";

	// FIXME(sso-membership-policy): route automatic SSO membership through the
	// organization plugin's limits, hooks, additional fields, and atomic guard.
	await ctx.context.adapter.create({
		model: "member",
		data: {
			organizationId,
			userId: user.id,
			role,
			createdAt: new Date(),
		},
	});
	return "assigned";
}

/**
 * Assigns a user to the organization explicitly bound to an SSO provider.
 */
export async function assignOrganizationFromProvider(
	ctx: GenericEndpointContext,
	options: AssignOrganizationFromProviderOptions,
): Promise<void> {
	await assignOrganization(ctx, {
		reason: "provider-bound",
		...options,
	});
}

/**
 * Assigns a verified user to the organization for their verified email domain.
 */
export async function assignOrganizationByDomain(
	ctx: GenericEndpointContext,
	options: AssignOrganizationByDomainOptions,
): Promise<void> {
	await assignOrganization(ctx, {
		reason: "verified-domain",
		...options,
	});
}
