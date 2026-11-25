import type {
	GenericEndpointContext,
	InternalAdapter,
} from "@better-auth/core";
import type { Verification } from "@better-auth/core/db";
import {
	encodeDeterministicId,
	isUniqueViolation,
} from "@better-auth/core/db/internal";
import { createHash } from "@better-auth/utils/hash";
import { createHMAC } from "@better-auth/utils/hmac";
import {
	getStorageOption,
	processIdentifier,
} from "./verification-token-storage";

/**
 * Creates a verification value, or returns the one a concurrent request stored
 * first. With the default or `"uuid"` id strategy, the id is derived from the
 * stored `identifier`, so the primary key keeps one row per identifier even
 * though the schema does not make `identifier` unique. Resolves to `null` when
 * a `verification.create.before` hook vetoes the create.
 */
export async function createOrFindVerification(
	ctx: GenericEndpointContext,
	data: Parameters<InternalAdapter["createVerificationValue"]>[0],
): Promise<Verification | null> {
	const { internalAdapter } = ctx.context;
	const id = await deriveVerificationId(ctx, data.identifier);
	return internalAdapter
		.createVerificationValue(id ? { ...data, id } : data)
		.catch(async (error: unknown) => {
			if (!isUniqueViolation(error)) throw error;
			const existing = await internalAdapter.findVerificationValue(
				data.identifier,
			);
			if (!existing) throw error;
			return existing;
		});
}

async function deriveVerificationId(
	ctx: GenericEndpointContext,
	identifier: string,
) {
	const { options } = ctx.context;
	const generateId = options.advanced?.database?.generateId;
	// Custom and database-generated ids live in columns whose type is unknown here.
	if (generateId !== undefined && generateId !== "uuid") return undefined;
	const storedIdentifier = await processIdentifier(
		identifier,
		getStorageOption(identifier, options.verification?.storeIdentifier),
	);
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(`verification:${storedIdentifier}`),
	);
	// 24 bytes encode to 32 characters, within the `varchar(36)` id column.
	return encodeDeterministicId(new Uint8Array(digest).slice(0, 24), options, {
		adapter: ctx.context.adapter,
		model: "verification",
	});
}

type VerificationInput = Parameters<
	InternalAdapter["createVerificationValue"]
>[0];

function toStoredIdentifier(ctx: GenericEndpointContext, identifier: string) {
	return processIdentifier(
		identifier,
		getStorageOption(
			identifier,
			ctx.context.options.verification?.storeIdentifier,
		),
	);
}

// Keyed by the stored identifier so `storeIdentifier` hashing also covers it.
const toIssuanceIdentifier = (storedIdentifier: string) =>
	`issued:${storedIdentifier}`;

/**
 * Digests the part of a `<code>:<attempts>` value before the attempt counter,
 * so it names a code however many attempts were counted. It is keyed by the
 * secret because a short plain or unsalted hashed code would otherwise be
 * recoverable from the digest.
 */
function digestCode(ctx: GenericEndpointContext, value: string) {
	const separator = value.lastIndexOf(":");
	return createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		separator === -1 ? value : value.slice(0, separator),
	);
}

/**
 * Points the issuance marker of an identifier at the code just stored under
 * it. The marker outlives the code, so a write-back can tell that another code
 * was stored after the one it consumed, even once that code is used too. It is
 * written once the code is stored and before the code is handed out, so a
 * code can only be used after the marker names it. Resolves to `false` when a
 * verification hook vetoes the write.
 */
async function recordIssuance(
	ctx: GenericEndpointContext,
	data: VerificationInput,
) {
	const identifier = toIssuanceIdentifier(
		await toStoredIdentifier(ctx, data.identifier),
	);
	const value = await digestCode(ctx, data.value);
	const issuance = await createOrFindVerification(ctx, {
		identifier,
		value,
		expiresAt: data.expiresAt,
	});
	if (!issuance) return false;
	if (issuance.value === value) return true;
	// Replace the previous marker in place, so no read finds the identifier
	// without one.
	const updated =
		await ctx.context.internalAdapter.updateVerificationByIdentifier(
			identifier,
			{ value, expiresAt: data.expiresAt },
		);
	return !!updated;
}

/**
 * Replaces the OTP stored under an identifier with a newly issued
 * `<code>:<attempts>` value, through {@link createOrFindVerification}, and
 * records the issuance when this value is the one stored. A concurrent send
 * that stored its code first is returned instead and keeps its own record.
 * Resolves to `null` when a verification hook vetoes a write.
 */
export async function issueVerification(
	ctx: GenericEndpointContext,
	data: VerificationInput,
): Promise<Verification | null> {
	await ctx.context.internalAdapter.deleteVerificationByIdentifier(
		data.identifier,
	);
	const stored = await createOrFindVerification(ctx, data);
	if (!stored) return null;
	if (stored.value !== data.value) return stored;
	return (await recordIssuance(ctx, data)) ? stored : null;
}

/**
 * Overwrites the OTP a concurrent send stored under an identifier with a newly
 * issued value, and records the issuance. Resolves to `null` when a
 * verification hook vetoes a write.
 */
export async function replaceVerification(
	ctx: GenericEndpointContext,
	data: VerificationInput,
) {
	const replaced =
		(await ctx.context.internalAdapter.updateVerificationByIdentifier(
			data.identifier,
			{ value: data.value, expiresAt: data.expiresAt, createdAt: new Date() },
		)) ??
		// The concurrent code was consumed meanwhile, so nothing was replaced.
		(await createOrFindVerification(ctx, data));
	if (!replaced) return null;
	return (await recordIssuance(ctx, data)) ? replaced : null;
}

/**
 * Extends the expiry of the OTP stored under an identifier, together with its
 * issuance marker.
 */
export async function extendVerification(
	ctx: GenericEndpointContext,
	identifier: string,
	expiresAt: Date,
) {
	const { internalAdapter } = ctx.context;
	await Promise.all([
		internalAdapter.updateVerificationByIdentifier(identifier, { expiresAt }),
		internalAdapter.updateVerificationByIdentifier(
			toIssuanceIdentifier(await toStoredIdentifier(ctx, identifier)),
			{ expiresAt },
		),
	]);
}

/**
 * Consumes the OTP stored under an identifier, so only one caller at a time
 * can check a guess against it. Returns `null` when there is no valid value
 * to consume.
 *
 * `restore` writes the value back, such as a code with one more failed
 * attempt, keeping its expiry and creation time. It resolves to `"restored"`,
 * to `"vetoed"` when a `verification.create.before` hook vetoes the write, or
 * to `"superseded"` when the write yields because another code was stored
 * after the consumed one, whether that code is still live or already used.
 */
export async function consumeVerification(
	ctx: GenericEndpointContext,
	identifier: string,
) {
	const verification =
		await ctx.context.internalAdapter.consumeVerificationValue(identifier);
	if (!verification) return null;
	return {
		verification,
		restore: (value: string) =>
			restoreVerification(ctx, {
				value,
				identifier,
				expiresAt: verification.expiresAt,
				createdAt: verification.createdAt,
			}),
	};
}

/**
 * The write-back proceeds only while the issuance marker names the consumed
 * code. A code stored before markers existed has none, and proceeds unless a
 * newer code is live.
 *
 * The consume removes every value under the stored identifier, so a live value
 * found there was issued after it. A row under the plain identifier, left from
 * before `storeIdentifier` hashing, is not. Neither storage offers a
 * conditional write for every id strategy, so a code issued between these
 * reads and the write can still be replaced.
 */
async function restoreVerification(
	ctx: GenericEndpointContext,
	data: VerificationInput & { createdAt: Date },
): Promise<"restored" | "superseded" | "vetoed"> {
	const { internalAdapter } = ctx.context;
	const storedIdentifier = await toStoredIdentifier(ctx, data.identifier);
	const [live, issuance, code] = await Promise.all([
		internalAdapter.findVerificationValue(data.identifier),
		internalAdapter.findVerificationValue(
			toIssuanceIdentifier(storedIdentifier),
		),
		digestCode(ctx, data.value),
	]);
	if (
		(issuance &&
			new Date(issuance.expiresAt).getTime() > Date.now() &&
			issuance.value !== code) ||
		(live &&
			live.identifier === storedIdentifier &&
			new Date(live.expiresAt).getTime() > Date.now())
	) {
		return "superseded";
	}
	const restored = await createOrFindVerification(ctx, data);
	if (!restored) return "vetoed";
	return restored.value === data.value ? "restored" : "superseded";
}
