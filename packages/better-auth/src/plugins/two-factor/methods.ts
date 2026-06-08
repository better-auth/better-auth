import type { GenericEndpointContext } from "@better-auth/core";
import { countUnusedRecoveryCodes } from "./recovery-codes";
import type {
	TwoFactorMethod,
	TwoFactorMethodDescriptor,
	TwoFactorMethodKind,
	TwoFactorTotpSecret,
} from "./types";
import { TWO_FACTOR_METHOD_KIND } from "./types";

export function isInteractiveMethodKind(kind: TwoFactorMethodKind): boolean {
	return kind !== TWO_FACTOR_METHOD_KIND.RECOVERY_CODE;
}

export function isVerifiedMethod(
	method: Pick<TwoFactorMethod, "verifiedAt">,
): boolean {
	return method.verifiedAt instanceof Date;
}

export function toMethodDescriptor(
	method: Pick<TwoFactorMethod, "id" | "kind" | "label">,
): TwoFactorMethodDescriptor {
	return {
		id: method.id,
		kind: method.kind,
		label: method.label ?? null,
	};
}

export async function listTwoFactorMethods(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<TwoFactorMethod[]> {
	return ctx.context.adapter.findMany<TwoFactorMethod>({
		model: "twoFactorMethod",
		where: [{ field: "userId", value: userId }],
		sortBy: {
			field: "createdAt",
			direction: "asc",
		},
	});
}

export async function findUserTwoFactorMethod(
	ctx: GenericEndpointContext,
	userId: string,
	methodId: string,
): Promise<TwoFactorMethod | null> {
	return ctx.context.adapter.findOne<TwoFactorMethod>({
		model: "twoFactorMethod",
		where: [
			{ field: "id", value: methodId },
			{ field: "userId", value: userId },
		],
	});
}

export async function listChallengeMethodDescriptors(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<TwoFactorMethodDescriptor[]> {
	const methods = await listTwoFactorMethods(ctx, userId);
	const verifiedInteractiveMethods = methods.filter(
		(method) =>
			isInteractiveMethodKind(method.kind) && isVerifiedMethod(method),
	);

	if (verifiedInteractiveMethods.length === 0) {
		return [];
	}

	const descriptors = verifiedInteractiveMethods.map(toMethodDescriptor);
	const recoveryMethod = methods.find(
		(method) =>
			method.kind === TWO_FACTOR_METHOD_KIND.RECOVERY_CODE &&
			isVerifiedMethod(method),
	);

	if (!recoveryMethod) {
		return descriptors;
	}

	const unusedRecoveryCodeCount = await countUnusedRecoveryCodes(
		ctx,
		recoveryMethod.id,
	);
	if (unusedRecoveryCodeCount === 0) {
		return descriptors;
	}

	return [...descriptors, toMethodDescriptor(recoveryMethod)];
}

async function createTwoFactorMethod(
	ctx: GenericEndpointContext,
	data: {
		userId: string;
		kind: TwoFactorMethodKind;
		label?: string | null;
		verifiedAt?: Date | null;
	},
): Promise<TwoFactorMethod> {
	return ctx.context.adapter.create({
		model: "twoFactorMethod",
		data: {
			userId: data.userId,
			kind: data.kind,
			label: data.label ?? null,
			verifiedAt: data.verifiedAt ?? null,
			lastUsedAt: null,
		},
	}) as Promise<TwoFactorMethod>;
}

export async function createTotpMethod(
	ctx: GenericEndpointContext,
	data: {
		userId: string;
		label?: string | null;
		secret: string;
		verifiedAt?: Date | null;
	},
): Promise<TwoFactorMethod> {
	const pendingTotpMethods =
		await ctx.context.adapter.findMany<TwoFactorMethod>({
			model: "twoFactorMethod",
			where: [
				{ field: "userId", value: data.userId },
				{ field: "kind", value: TWO_FACTOR_METHOD_KIND.TOTP },
				{ field: "verifiedAt", value: null },
			],
		});

	for (const method of pendingTotpMethods) {
		await ctx.context.adapter.delete({
			model: "twoFactorMethod",
			where: [{ field: "id", value: method.id }],
		});
	}

	const method = await createTwoFactorMethod(ctx, {
		userId: data.userId,
		kind: TWO_FACTOR_METHOD_KIND.TOTP,
		label: data.label,
		verifiedAt: data.verifiedAt,
	});

	await ctx.context.adapter.create({
		model: "twoFactorTotp",
		data: {
			methodId: method.id,
			secret: data.secret,
		},
	});

	return method;
}

export async function ensureOtpMethod(
	ctx: GenericEndpointContext,
	data: {
		userId: string;
		label?: string | null;
		verifiedAt?: Date | null;
	},
): Promise<TwoFactorMethod> {
	const existing = await ctx.context.adapter.findOne<TwoFactorMethod>({
		model: "twoFactorMethod",
		where: [
			{ field: "userId", value: data.userId },
			{ field: "kind", value: TWO_FACTOR_METHOD_KIND.OTP },
		],
	});

	if (!existing) {
		return createTwoFactorMethod(ctx, {
			userId: data.userId,
			kind: TWO_FACTOR_METHOD_KIND.OTP,
			label: data.label,
			verifiedAt: data.verifiedAt,
		});
	}

	if (data.label != null || data.verifiedAt instanceof Date) {
		const updated = await ctx.context.adapter.update({
			model: "twoFactorMethod",
			where: [{ field: "id", value: existing.id }],
			update: {
				label: data.label ?? existing.label ?? null,
				verifiedAt: data.verifiedAt ?? existing.verifiedAt ?? null,
			},
		});
		return (updated ?? existing) as TwoFactorMethod;
	}

	return existing;
}

export async function ensureRecoveryMethod(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<{ method: TwoFactorMethod; created: boolean }> {
	const existing = await ctx.context.adapter.findOne<TwoFactorMethod>({
		model: "twoFactorMethod",
		where: [
			{ field: "userId", value: userId },
			{ field: "kind", value: TWO_FACTOR_METHOD_KIND.RECOVERY_CODE },
		],
	});

	if (existing) {
		return { method: existing, created: false };
	}

	const method = await createTwoFactorMethod(ctx, {
		userId,
		kind: TWO_FACTOR_METHOD_KIND.RECOVERY_CODE,
		verifiedAt: new Date(),
	});
	return { method, created: true };
}

export async function getTotpMaterial(
	ctx: GenericEndpointContext,
	methodId: string,
): Promise<TwoFactorTotpSecret | null> {
	return ctx.context.adapter.findOne<TwoFactorTotpSecret>({
		model: "twoFactorTotp",
		where: [{ field: "methodId", value: methodId }],
	});
}

export async function markMethodVerified(
	ctx: GenericEndpointContext,
	methodId: string,
): Promise<void> {
	await ctx.context.adapter.update({
		model: "twoFactorMethod",
		where: [{ field: "id", value: methodId }],
		update: {
			verifiedAt: new Date(),
		},
	});
}

export async function touchMethodUsage(
	ctx: GenericEndpointContext,
	methodId: string,
): Promise<void> {
	await ctx.context.adapter.update({
		model: "twoFactorMethod",
		where: [{ field: "id", value: methodId }],
		update: {
			lastUsedAt: new Date(),
		},
	});
}

export async function deleteMethod(
	ctx: GenericEndpointContext,
	methodId: string,
): Promise<void> {
	await ctx.context.adapter.delete({
		model: "twoFactorMethod",
		where: [{ field: "id", value: methodId }],
	});
}

export async function deleteAllMethodsForUser(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<void> {
	await ctx.context.adapter.deleteMany({
		model: "twoFactorMethod",
		where: [{ field: "userId", value: userId }],
	});
}
