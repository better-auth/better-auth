import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "../../api";
import type { AuthContext } from "../../types";
import type { GenericOAuthConfig } from ".";

export async function getClientIdAndSecret(
	config: GenericOAuthConfig,
	ctx: AuthContext,
): Promise<{
	clientId: string;
	clientSecret: string | undefined;
}> {
	if ("dynamicRegistration" in config) {
		const registrationConfig = config.dynamicRegistration;
		const client_uri =
			registrationConfig.clientUri || ctx.baseURL
				? new URL(ctx.baseURL).origin
				: undefined;

		// Check if the database already has a registration for this provider.
		const registration = await ctx.adapter.findOne<{
			clientId: string;
			clientSecret: string;
			providerId: string;
		}>({
			model: "oauthRegistration",
			where: [
				{
					field: "providerId",
					value: config.providerId,
				},
			],
		});

		if (registration) {
			return {
				clientId: registration.clientId,
				clientSecret: registration.clientSecret,
			};
		}

		// If no registration is found, we need to register the client.
		const body = {
			client_name: registrationConfig.clientName,
			client_uri,
			redirect_uris: [`${ctx.baseURL}/oauth2/callback/${config.providerId}`],
			scope: config.scopes?.join(" ") || "openid profile email",
			token_endpoint_auth_method: "client_secret_basic",
			response_types: ["code"],
			grant_types: ["authorization_code"],
		};

		const response = await betterFetch<{
			client_id: string;
			client_secret: string;
		}>(registrationConfig.registrationEndpoint, {
			method: "POST",
			body,
		});

		// If the registration failed or doesn't contain the right information, we need to throw an error.
		if (response.error) {
			ctx.logger.error(
				`[GenericOAuth] Failed to dynamically register client for provider ${config.providerId}`,
				response.error,
				{
					endpoint: registrationConfig.registrationEndpoint,
					body,
				},
			);
			throw new APIError("BAD_REQUEST", {
				message: "Failed to register client",
				code: "FAILED_TO_REGISTER_CLIENT",
			});
		}
		if (!response.data.client_id || !response.data.client_secret) {
			ctx.logger.error(
				`[GenericOAuth] Failed to dynamically register client for provider ${config.providerId}`,
				response.error,
				{
					endpoint: registrationConfig.registrationEndpoint,
					body,
				},
			);
			throw new APIError("BAD_REQUEST", {
				message:
					"Failed to register client. No client_id or client_secret found from registration response.",
				code: "FAILED_TO_REGISTER_CLIENT",
			});
		}

		// If the registration was successful, we need to save the clientId and clientSecret to the database.
		await ctx.adapter.create({
			model: "oauthRegistration",
			data: {
				providerId: config.providerId,
				clientId: response.data.client_id,
				clientSecret: response.data.client_secret,
			},
		});

		return {
			clientId: response.data.client_id,
			clientSecret: response.data.client_secret,
		};
	}
	return {
		clientId: config.clientId,
		clientSecret: config.clientSecret,
	};
}
