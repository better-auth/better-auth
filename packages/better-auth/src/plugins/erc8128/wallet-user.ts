import type { GenericEndpointContext } from "@better-auth/core";
import type { Session } from "@better-auth/core/db";
import type { VerifyResult } from "@slicekit/erc8128";
import type { User } from "../../types";
import { getOrigin } from "../../utils/url";
import type { ENSLookupArgs, ENSLookupResult, WalletAddress } from "./types";

interface FindOrCreateWalletUserOptions {
	walletAddress: string;
	chainId: number;
	email?: string | undefined;
	anonymous?: boolean | undefined;
	emailDomainName?: string | undefined;
	ensLookup?:
		| ((args: ENSLookupArgs) => Promise<ENSLookupResult>)
		| undefined;
}

/**
 * Request verification yields wallet identity, but Better Auth still needs a
 * concrete user/account pair. This helper keeps that multi-step lookup/create
 * flow out of the main request handler.
 */
export async function findOrCreateWalletUser(
	ctx: GenericEndpointContext,
	options: FindOrCreateWalletUserOptions,
): Promise<User | null> {
	const { walletAddress, chainId, email } = options;

	// 1. Exact match: address + chainId
	const existingWallet: WalletAddress | null = await ctx.context.adapter.findOne({
		model: "walletAddress",
		where: [
			{ field: "address", operator: "eq", value: walletAddress },
			{ field: "chainId", operator: "eq", value: chainId },
		],
	});

	if (existingWallet) {
		const user = await ctx.context.adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", operator: "eq", value: existingWallet.userId }],
		});
		if (user) {
			return user;
		}
	}

	// 2. Same address on another chain: reuse that user.
	const anyWallet: WalletAddress | null = await ctx.context.adapter.findOne({
		model: "walletAddress",
		where: [{ field: "address", operator: "eq", value: walletAddress }],
	});

	let user: User | null = null;
	if (anyWallet) {
		user = await ctx.context.adapter.findOne({
			model: "user",
			where: [{ field: "id", operator: "eq", value: anyWallet.userId }],
		});
	}

	// 3. No existing user: create one and attach the primary wallet.
	if (!user) {
		const isAnonymous = options.anonymous ?? true;
		if (!isAnonymous && !email) {
			return null;
		}

		const domain = options.emailDomainName ?? getOrigin(ctx.context.baseURL);
		const userEmail = !isAnonymous && email ? email : `${walletAddress}@${domain}`;
		const { name, avatar } =
			(await options.ensLookup?.({ walletAddress })) ?? {};

		user = await ctx.context.internalAdapter.createUser({
			name: name ?? walletAddress,
			email: userEmail,
			image: avatar ?? "",
		});

		await ctx.context.adapter.create({
			model: "walletAddress",
			data: {
				userId: user.id,
				address: walletAddress,
				chainId,
				isPrimary: true,
				createdAt: new Date(),
			},
		});

		await ctx.context.internalAdapter.createAccount({
			userId: user.id,
			providerId: "erc8128",
			accountId: `${walletAddress}:${chainId}`,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		return user;
	}

	// 4. Existing user, new chain: attach the extra wallet/account.
	if (!existingWallet) {
		await ctx.context.adapter.create({
			model: "walletAddress",
			data: {
				userId: user.id,
				address: walletAddress,
				chainId,
				isPrimary: false,
				createdAt: new Date(),
			},
		});

		await ctx.context.internalAdapter.createAccount({
			userId: user.id,
			providerId: "erc8128",
			accountId: `${walletAddress}:${chainId}`,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	}

	return user;
}

export function createEphemeralSignatureSession(
	user: User,
	result: Extract<VerifyResult, { ok: true }>,
	request?: Request,
): {
	session: Session;
	user: User;
} {
	const keyId = result.params.keyid.toLowerCase();
	const createdAt = new Date(result.params.created * 1000);
	const expiresAt = new Date(result.params.expires * 1000);
	const token = `erc8128:${keyId}:${result.params.created}:${result.params.expires}`;

	return {
		user,
		session: {
			id: token,
			userId: user.id,
			token,
			expiresAt,
			createdAt,
			updatedAt: createdAt,
			ipAddress: null,
			userAgent: request?.headers.get("user-agent") ?? null,
		},
	};
}
