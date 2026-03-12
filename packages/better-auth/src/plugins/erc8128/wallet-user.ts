import type { GenericEndpointContext } from "@better-auth/core";
import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { Session } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
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
	ensLookup?: ((args: ENSLookupArgs) => Promise<ENSLookupResult>) | undefined;
}

type WalletLookupAdapter = Pick<DBAdapter, "findOne" | "create">;

const duplicateCodes = new Set([
	"11000",
	"23505",
	"E11000",
	"ER_DUP_ENTRY",
	"P2002",
	"SQLITE_CONSTRAINT",
]);

function isDuplicateKeyError(error: unknown): boolean {
	const seen = new Set<unknown>();
	const queue = [error];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || seen.has(current) || typeof current !== "object") {
			continue;
		}
		seen.add(current);

		const candidate = current as {
			code?: string | number;
			message?: string;
			cause?: unknown;
		};
		const code = candidate.code == null ? "" : String(candidate.code);
		if (duplicateCodes.has(code)) {
			return true;
		}
		if (
			typeof candidate.message === "string" &&
			/(duplicate key|duplicate entry|already exists|unique constraint|violates unique|SQLITE_CONSTRAINT)/i.test(
				candidate.message,
			)
		) {
			return true;
		}
		if ("cause" in candidate) {
			queue.push(candidate.cause);
		}
	}

	return false;
}

async function findWalletUser(
	adapter: WalletLookupAdapter,
	walletAddress: string,
	chainId: number,
): Promise<{
	existingWallet: WalletAddress | null;
	user: User | null;
}> {
	const existingWallet: WalletAddress | null = await adapter.findOne({
		model: "walletAddress",
		where: [
			{ field: "address", operator: "eq", value: walletAddress },
			{ field: "chainId", operator: "eq", value: chainId },
		],
	});

	if (existingWallet) {
		const user = await adapter.findOne<User>({
			model: "user",
			where: [{ field: "id", operator: "eq", value: existingWallet.userId }],
		});
		if (user) {
			return { existingWallet, user };
		}
	}

	const anyWallet: WalletAddress | null = await adapter.findOne({
		model: "walletAddress",
		where: [{ field: "address", operator: "eq", value: walletAddress }],
	});

	if (!anyWallet) {
		return {
			existingWallet,
			user: null,
		};
	}

	const user = await adapter.findOne<User>({
		model: "user",
		where: [{ field: "id", operator: "eq", value: anyWallet.userId }],
	});

	return {
		existingWallet,
		user,
	};
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
	const initialLookup = await findWalletUser(
		ctx.context.adapter,
		walletAddress,
		chainId,
	);
	if (initialLookup.existingWallet && initialLookup.user) {
		return initialLookup.user;
	}

	const isAnonymous = options.anonymous ?? true;
	if (!isAnonymous && !email) {
		return null;
	}

	const domain = options.emailDomainName ?? getOrigin(ctx.context.baseURL);
	const userEmail =
		!isAnonymous && email ? email : `${walletAddress}@${domain}`;
	const { name, avatar } = (await options.ensLookup?.({ walletAddress })) ?? {};

	return runWithTransaction(ctx.context.adapter, async () => {
		const adapter = await getCurrentAdapter(ctx.context.adapter);
		const { existingWallet, user: existingUser } = await findWalletUser(
			adapter,
			walletAddress,
			chainId,
		);
		if (existingWallet && existingUser) {
			return existingUser;
		}

		let user = existingUser;
		if (!user) {
			try {
				user = await ctx.context.internalAdapter.createUser({
					name: name ?? walletAddress,
					email: userEmail,
					image: avatar ?? "",
				});
			} catch (error) {
				if (!isDuplicateKeyError(error)) {
					throw error;
				}
				user =
					(
						await ctx.context.internalAdapter.findUserByEmail(userEmail, {
							includeAccounts: false,
						})
					)?.user ?? null;
				if (!user) {
					throw error;
				}
			}
		}

		if (!existingWallet) {
			await adapter.create({
				model: "walletAddress",
				data: {
					userId: user.id,
					address: walletAddress,
					chainId,
					isPrimary: existingUser ? false : true,
					createdAt: new Date(),
				},
			});
		}

		const accountId = `${walletAddress}:${chainId}`;
		const existingAccount =
			await ctx.context.internalAdapter.findAccountByProviderId(
				accountId,
				"erc8128",
			);
		if (!existingAccount) {
			await ctx.context.internalAdapter.createAccount({
				userId: user.id,
				providerId: "erc8128",
				accountId,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		return user;
	});
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
