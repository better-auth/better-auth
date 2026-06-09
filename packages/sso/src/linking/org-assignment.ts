import type { GenericEndpointContext, OAuth2Tokens, User } from "better-auth";
import type {
	OrganizationProvisioningOptions,
	OrganizationRoleResolverData,
	SSOOptions,
	SSOProvider,
} from "../types";
import { domainMatches } from "../utils";
import type { NormalizedSSOProfile } from "./types";

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

	const existingMember = await ctx.context.adapter.findOne<{
		id: string;
		role: string;
	}>({
		model: "member",
		where: [
			{ field: "organizationId", value: provider.organizationId },
			{ field: "userId", value: user.id },
		],
	});

	if (existingMember) {
		if (!shouldSyncRoleOnLogin(provisioningOptions)) {
			return;
		}
		const role = await resolveOrganizationRole({
			provisioningOptions,
			user,
			userInfo: profile.rawAttributes || {},
			claims: profile.claims || profile.rawAttributes || {},
			token,
			provider,
		});
		if (existingMember.role === role) {
			return;
		}
		if (
			await wouldRemoveOnlyCreatorRole(ctx, {
				member: existingMember,
				organizationId: provider.organizationId,
				role,
			})
		) {
			return;
		}
		await ctx.context.adapter.update({
			model: "member",
			where: [{ field: "id", value: existingMember.id }],
			update: { role },
		});
		return;
	}

	const role = await resolveOrganizationRole({
		provisioningOptions,
		user,
		userInfo: profile.rawAttributes || {},
		claims: profile.claims || profile.rawAttributes || {},
		token,
		provider,
	});

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

	const role = await resolveOrganizationRole({
		provisioningOptions,
		user,
		userInfo: {},
		claims: {},
		provider: ssoProvider,
		useClaimsMapper: false,
	});

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

async function resolveOrganizationRole(
	data: OrganizationRoleResolverData & {
		provisioningOptions?: OrganizationProvisioningOptions;
		useClaimsMapper?: boolean;
	},
) {
	const { provisioningOptions, useClaimsMapper = true, ...resolverData } = data;
	if (useClaimsMapper && provisioningOptions?.mapClaimsToRoles) {
		return provisioningOptions.mapClaimsToRoles(resolverData);
	}
	if (provisioningOptions?.getRole) {
		return provisioningOptions.getRole(resolverData);
	}
	return provisioningOptions?.defaultRole || "member";
}

function shouldSyncRoleOnLogin(
	provisioningOptions?: OrganizationProvisioningOptions,
) {
	return (
		provisioningOptions?.syncRoleOnLogin ??
		Boolean(provisioningOptions?.mapClaimsToRoles)
	);
}

function roleIncludes(role: string, targetRole: string) {
	return role
		.split(",")
		.map((entry) => entry.trim())
		.includes(targetRole);
}

async function wouldRemoveOnlyCreatorRole(
	ctx: GenericEndpointContext,
	data: {
		member: { id: string; role: string };
		organizationId: string;
		role: string;
	},
) {
	const creatorRole =
		ctx.context.getPlugin("organization")?.options?.creatorRole || "owner";
	if (
		!roleIncludes(data.member.role, creatorRole) ||
		roleIncludes(data.role, creatorRole)
	) {
		return false;
	}
	const members = await ctx.context.adapter.findMany<{
		id: string;
		role: string;
	}>({
		model: "member",
		where: [
			{ field: "organizationId", value: data.organizationId },
			{ field: "role", value: creatorRole, operator: "contains" },
		],
	});
	return !members.some(
		(member) =>
			member.id !== data.member.id && roleIncludes(member.role, creatorRole),
	);
}
