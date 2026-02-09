import type { GenericEndpointContext } from "better-auth";
import { logger, parseState } from "better-auth";

type MinimalUser = {
	id: string;
	email: string;
	name: string;
};

export const getUserByEmail = async (
	email: string,
	ctx: GenericEndpointContext,
) => {
	let user;

	try {
		user = await ctx.context.adapter.findOne<MinimalUser>({
			model: "user",
			select: ["id", "name", "email"],
			where: [
				{
					field: "email",
					value: email,
				},
			],
		});
	} catch (error) {
		// ignore error
		logger.debug("Error fetching user info: ", error);
	}

	return user;
};

export async function getUserById(userId: string, ctx: GenericEndpointContext) {
	let user;

	try {
		user = await ctx.context.adapter.findOne<MinimalUser>({
			model: "user",
			select: ["id", "name", "email"],
			where: [{ field: "id", value: userId }],
		});
	} catch {
		// Silently fail if user not found
	}

	return user;
}

export const getUserByIdToken = async (
	providerId: string,
	idToken: any,
	ctx: GenericEndpointContext,
) => {
	const provider = ctx.context.socialProviders.find((p) => p.id === providerId);

	let user;

	if (provider) {
		try {
			user = await provider.getUserInfo(idToken);
		} catch (error) {
			// ignore error
			logger.debug("Error fetching user info: ", error);
		}
	}

	return user;
};

export const getUserByAuthorizationCode = async (
	providerId: string,
	ctx: GenericEndpointContext,
) => {
	let userInfo;

	const provider = ctx.context.socialProviders.find((p) => p.id === providerId);

	if (provider) {
		try {
			const state = await parseState(ctx);
			const codeVerifier = state.codeVerifier;

			const { code, device_id } = ctx.query ?? {};
			const tokens = await provider.validateAuthorizationCode({
				code: code,
				codeVerifier,
				deviceId: device_id,
				redirectURI: `${ctx.context.baseURL}/callback/${provider.id}`,
			});

			userInfo = await provider
				.getUserInfo({ ...tokens })
				.then((res) => res?.user);
		} catch (error) {
			// ignore error
			logger.debug("Error fetching user info: ", error);
		}
	}

	return userInfo;
};
