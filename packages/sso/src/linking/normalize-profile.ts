import type { OIDCConfig, SAMLConfig } from "../types";
import type { NormalizedSSOProfile, SSOAccountData } from "./types";

export interface OIDCUserInfo {
	id?: string;
	email?: string;
	name?: string;
	image?: string;
	emailVerified?: boolean;
	[key: string]: unknown;
}

export interface SAMLExtract {
	nameID?: string;
	attributes?: Record<string, unknown>;
	sessionIndex?: Record<string, unknown>;
	conditions?: Record<string, unknown>;
}

export function normalizeOIDCProfile(
	userInfo: OIDCUserInfo,
	providerId: string,
	options?: { trustEmailVerified?: boolean },
): NormalizedSSOProfile {
	return {
		providerType: "oidc",
		providerId,
		accountId: String(userInfo.id || ""),
		email: String(userInfo.email || ""),
		emailVerified: options?.trustEmailVerified
			? Boolean(userInfo.emailVerified)
			: false,
		name: userInfo.name || undefined,
		image: userInfo.image || undefined,
		rawAttributes: userInfo,
	};
}

export function normalizeOIDCProfileFromToken(
	idToken: Record<string, unknown>,
	providerId: string,
	config: OIDCConfig,
	options?: { trustEmailVerified?: boolean },
): NormalizedSSOProfile {
	const mapping = config.mapping || {};

	const extraFields = Object.fromEntries(
		Object.entries(mapping.extraFields || {}).map(([key, value]) => [
			key,
			idToken[value],
		]),
	);

	return {
		providerType: "oidc",
		providerId,
		accountId: String(idToken[mapping.id || "sub"] || ""),
		email: String(idToken[mapping.email || "email"] || ""),
		emailVerified: options?.trustEmailVerified
			? Boolean(idToken[mapping.emailVerified || "email_verified"])
			: false,
		name: idToken[mapping.name || "name"] as string | undefined,
		image: idToken[mapping.image || "picture"] as string | undefined,
		rawAttributes: { ...idToken, ...extraFields },
	};
}

export function normalizeSAMLProfile(
	extract: SAMLExtract,
	providerId: string,
	config: SAMLConfig,
	options?: { trustEmailVerified?: boolean },
): NormalizedSSOProfile {
	const attributes = extract.attributes || {};
	const mapping = config.mapping || {};

	const extraFields = Object.fromEntries(
		Object.entries(mapping.extraFields || {}).map(([key, value]) => [
			key,
			attributes[value as string],
		]),
	);

	const id = String(attributes[mapping.id || "nameID"] || extract.nameID || "");
	const email = String(
		attributes[mapping.email || "email"] || extract.nameID || "",
	);

	const firstName = attributes[mapping.firstName || "givenName"] as
		| string
		| undefined;
	const lastName = attributes[mapping.lastName || "surname"] as
		| string
		| undefined;
	const displayName = attributes[mapping.name || "displayName"] as
		| string
		| undefined;

	const name =
		[firstName, lastName].filter(Boolean).join(" ") ||
		displayName ||
		extract.nameID ||
		undefined;

	const emailVerified =
		options?.trustEmailVerified && mapping.emailVerified
			? Boolean(attributes[mapping.emailVerified])
			: false;

	return {
		providerType: "saml",
		providerId,
		accountId: id,
		email,
		emailVerified,
		name,
		rawAttributes: { ...attributes, ...extraFields },
	};
}

export function createOIDCAccountData(
	profile: NormalizedSSOProfile,
	tokens: {
		accessToken?: string;
		refreshToken?: string;
		idToken?: string;
		accessTokenExpiresAt?: Date;
		refreshTokenExpiresAt?: Date;
		scopes?: string[];
	},
): SSOAccountData {
	return {
		providerId: profile.providerId,
		accountId: profile.accountId,
		accessToken: tokens.accessToken,
		refreshToken: tokens.refreshToken,
		idToken: tokens.idToken,
		accessTokenExpiresAt: tokens.accessTokenExpiresAt,
		refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
		scope: tokens.scopes?.join(","),
	};
}

export function createSAMLAccountData(
	profile: NormalizedSSOProfile,
): SSOAccountData {
	return {
		providerId: profile.providerId,
		accountId: profile.accountId,
		accessToken: "",
		refreshToken: "",
	};
}
