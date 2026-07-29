import type { BetterAuthDBSchema } from "@better-auth/core/db";
import type { betterAuth } from "better-auth";
import { betterAuth as betterAuth1625 } from "better-auth-1-6-25";
import { getMigrations as getMigrations1625 } from "better-auth-1-6-25/db/migration";
import { oidcProvider as oidcProvider1625 } from "better-auth-1-6-25/plugins";

export const PUBLISHED_FIXTURE_PASSWORD = "correct-horse-battery-staple";

export type MigrationDatabase = NonNullable<
	Parameters<typeof betterAuth>[0]["database"]
> &
	NonNullable<Parameters<typeof betterAuth1625>[0]["database"]>;

export interface PublishedOAuthProviderApi {
	registerOAuthApplication(input: {
		body: {
			client_name: string;
			redirect_uris: string[];
		};
	}): Promise<{
		client_id: string;
		client_secret?: string | undefined;
	}>;
}

export function clonePluginSchema<
	T extends {
		schema: BetterAuthDBSchema;
	},
>(plugin: T): T {
	return {
		...plugin,
		schema: Object.fromEntries(
			Object.entries(plugin.schema).map(([model, table]) => [
				model,
				{
					...table,
					fields: Object.fromEntries(
						Object.entries(table.fields).map(([fieldName, field]) => [
							fieldName,
							{
								...field,
								...(field.references
									? { references: { ...field.references } }
									: {}),
							},
						]),
					),
				},
			]),
		),
	} as T;
}

/**
 * Runs published 1.6.25 against `database` and leaves behind an owner account,
 * a registered OAuth client, one access token, and one consent row.
 */
export async function seedPublishedOAuthProviderData({
	configurePublishedPlugin,
	database,
	emailDomain,
	nameSuffix,
	storeClientSecret = "plain",
}: {
	configurePublishedPlugin?:
		| ((plugin: ReturnType<typeof oidcProvider1625>) => void)
		| undefined;
	database: MigrationDatabase;
	emailDomain: string;
	nameSuffix: string;
	storeClientSecret?: "encrypted" | "hashed" | "plain" | undefined;
}) {
	const publishedPlugin = clonePluginSchema(
		oidcProvider1625({
			allowDynamicClientRegistration: true,
			loginPage: "/login",
			storeClientSecret,
		}),
	);
	configurePublishedPlugin?.(publishedPlugin);
	const auth1625 = betterAuth1625({
		baseURL: "http://localhost:3000",
		database,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [publishedPlugin],
	});
	await (await getMigrations1625(auth1625.options)).runMigrations();
	const owner = await auth1625.api.signUpEmail({
		body: {
			email: `provider-owner@${emailDomain}`,
			name: `${nameSuffix} Provider Owner`,
			password: PUBLISHED_FIXTURE_PASSWORD,
		},
	});
	const publishedOAuthProviderApi =
		auth1625.api as unknown as PublishedOAuthProviderApi;
	const registeredClient =
		await publishedOAuthProviderApi.registerOAuthApplication({
			body: {
				client_name: `${nameSuffix} published migration client`,
				redirect_uris: [`https://${emailDomain}/callback`],
			},
		});
	const sourceContext = await auth1625.$context;
	const now = new Date();
	const legacyAccessToken = crypto.randomUUID();
	await sourceContext.adapter.create({
		model: "oauthAccessToken",
		data: {
			accessToken: legacyAccessToken,
			accessTokenExpiresAt: new Date(now.getTime() + 60_000),
			clientId: registeredClient.client_id,
			createdAt: now,
			refreshToken: crypto.randomUUID(),
			refreshTokenExpiresAt: new Date(now.getTime() + 120_000),
			scopes: "openid profile",
			updatedAt: now,
			userId: owner.user.id,
		},
	});
	await sourceContext.adapter.create({
		model: "oauthConsent",
		data: {
			clientId: registeredClient.client_id,
			consentGiven: true,
			createdAt: now,
			scopes: "openid profile",
			updatedAt: now,
			userId: owner.user.id,
		},
	});
	return { legacyAccessToken, owner, registeredClient };
}
