import type { GenericEndpointContext } from "@better-auth/core";
import { generateRandomString } from "../../crypto/random";
import type { RecoveryCodeOptions, TwoFactorRecoveryCode } from "./types";
import { defaultKeyHasher } from "./utils";

const DEFAULT_RECOVERY_CODE_AMOUNT = 10;
const DEFAULT_RECOVERY_CODE_LENGTH = 12;

function formatRecoveryCode(raw: string): string {
	return raw.match(/.{1,4}/g)?.join("-") ?? raw;
}

export function generateRecoveryCodes(
	options?: RecoveryCodeOptions | undefined,
): string[] {
	if (options?.customGenerate) {
		return options.customGenerate();
	}

	return Array.from({ length: options?.amount ?? DEFAULT_RECOVERY_CODE_AMOUNT })
		.fill(null)
		.map(() =>
			generateRandomString(
				options?.length ?? DEFAULT_RECOVERY_CODE_LENGTH,
				"a-z",
				"0-9",
				"A-Z",
			),
		)
		.map(formatRecoveryCode);
}

async function hashRecoveryCode(code: string): Promise<string> {
	return defaultKeyHasher(code);
}

export async function replaceRecoveryCodes(
	ctx: GenericEndpointContext,
	methodId: string,
	codes: string[],
): Promise<void> {
	await ctx.context.adapter.deleteMany({
		model: "twoFactorRecoveryCode",
		where: [{ field: "methodId", value: methodId }],
	});

	for (const code of codes) {
		await ctx.context.adapter.create({
			model: "twoFactorRecoveryCode",
			data: {
				methodId,
				codeHash: await hashRecoveryCode(code),
				usedAt: null,
			},
		});
	}
}

export async function countUnusedRecoveryCodes(
	ctx: GenericEndpointContext,
	methodId: string,
): Promise<number> {
	const records = await ctx.context.adapter.findMany<TwoFactorRecoveryCode>({
		model: "twoFactorRecoveryCode",
		where: [
			{ field: "methodId", value: methodId },
			{ field: "usedAt", value: null },
		],
	});
	return records.length;
}

export async function consumeRecoveryCode(
	ctx: GenericEndpointContext,
	methodId: string,
	code: string,
): Promise<boolean> {
	const codeHash = await hashRecoveryCode(code);
	const record = await ctx.context.adapter.findOne<TwoFactorRecoveryCode>({
		model: "twoFactorRecoveryCode",
		where: [
			{ field: "methodId", value: methodId },
			{ field: "codeHash", value: codeHash },
			{ field: "usedAt", value: null },
		],
	});

	if (!record) {
		return false;
	}

	const updated = await ctx.context.adapter.update({
		model: "twoFactorRecoveryCode",
		where: [
			{ field: "id", value: record.id },
			{ field: "usedAt", value: null },
		],
		update: {
			usedAt: new Date(),
		},
	});

	return Boolean(updated);
}
