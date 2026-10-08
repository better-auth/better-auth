import type { GenericEndpointContext } from "../types";
import { getCurrentAdapter } from "./transaction";

const userLockSymbol = Symbol.for("better-auth:user-auth-locks");

function getUserLocks(): Map<string, Promise<unknown>> {
	const g = globalThis as unknown as Record<
		symbol,
		Map<string, Promise<unknown>>
	>;
	let map = g[userLockSymbol];
	if (!map) {
		map = new Map<string, Promise<unknown>>();
		g[userLockSymbol] = map;
	}
	return map;
}

/**
 * Serializes critical auth method mutations (such as deleting a passkey or unlinking an account)
 * on a per-user basis to prevent concurrent race conditions from leaving an account with no sign-in methods.
 */
export async function withUserAuthLock<T>(
	userId: string | undefined | null,
	fn: () => Promise<T>,
): Promise<T> {
	if (!userId) {
		return await fn();
	}

	const locks = getUserLocks();
	const prev = locks.get(userId) ?? Promise.resolve();

	let release!: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});

	const next = prev.catch(() => {}).then(() => current);
	locks.set(userId, next);

	await prev.catch(() => {});

	try {
		return await fn();
	} finally {
		release();
		if (locks.get(userId) === next) {
			locks.delete(userId);
		}
	}
}

/**
 * Checks if a persisted account represents an enabled, working sign-in method.
 */
export async function isWorkingAccount(
	acc: { providerId: string; password?: string | null },
	ctx: GenericEndpointContext,
	adapter?: Awaited<ReturnType<typeof getCurrentAdapter>>,
): Promise<boolean> {
	if (acc.providerId === "credential") {
		return (
			ctx.context.options.emailAndPassword?.enabled === true &&
			Boolean(acc.password)
		);
	}
	if (ctx.context.socialProviders?.some((p) => p.id === acc.providerId)) {
		return true;
	}
	if (ctx.context.hasPlugin("sso") || "ssoProvider" in ctx.context.tables) {
		const ssoPlugin = ctx.context.getPlugin("sso") as {
			options?: {
				modelName?: string;
				schema?: { ssoProvider?: { modelName?: string } };
				defaultSSO?: Array<{ providerId: string }>;
			};
		} | null;
		if (
			ssoPlugin?.options?.defaultSSO?.some(
				(p) => p.providerId === acc.providerId,
			)
		) {
			return true;
		}
		const ssoModel =
			ssoPlugin?.options?.modelName ??
			ssoPlugin?.options?.schema?.ssoProvider?.modelName ??
			"ssoProvider";
		if (ssoModel in ctx.context.tables) {
			const dbAdapter =
				adapter ?? (await getCurrentAdapter(ctx.context.adapter));
			const ssoProvider = await dbAdapter.findOne({
				model: ssoModel,
				where: [{ field: "providerId", value: acc.providerId }],
			});
			if (ssoProvider) {
				return true;
			}
		}
	}
	if (ctx.context.hasPlugin("siwe") && acc.providerId === "siwe") {
		return true;
	}
	if (ctx.context.hasPlugin(acc.providerId)) {
		return true;
	}
	return false;
}

/**
 * Checks if the current user has any enabled passwordless sign-in methods
 * that do not require an account row (e.g., magic-link, email-otp, phone-number).
 */
export async function hasPasswordlessAuthMethod(
	ctx: GenericEndpointContext,
	adapter?: Awaited<ReturnType<typeof getCurrentAdapter>>,
): Promise<boolean> {
	const userId = ctx.context.session?.user?.id;
	if (!userId) {
		return false;
	}

	const dbAdapter = adapter ?? (await getCurrentAdapter(ctx.context.adapter));
	const user = await dbAdapter.findOne<{
		id: string;
		emailVerified?: boolean;
		phoneNumberVerified?: boolean;
	}>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});

	const isEmailVerified = Boolean(
		user?.emailVerified ?? ctx.context.session?.user?.emailVerified,
	);
	const isPhoneVerified = Boolean(
		user?.phoneNumberVerified ??
			(ctx.context.session?.user as { phoneNumberVerified?: boolean })
				?.phoneNumberVerified,
	);

	const hasPasswordlessEmailAuth =
		isEmailVerified &&
		(ctx.context.hasPlugin("magic-link") || ctx.context.hasPlugin("email-otp"));
	const hasPasswordlessPhoneAuth =
		isPhoneVerified && ctx.context.hasPlugin("phone-number");

	return hasPasswordlessEmailAuth || hasPasswordlessPhoneAuth;
}
