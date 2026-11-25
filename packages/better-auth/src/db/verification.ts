import type {
	GenericEndpointContext,
	InternalAdapter,
} from "@better-auth/core";
import type { Verification } from "@better-auth/core/db";
import {
	encodeDeterministicId,
	isUniqueViolation,
} from "@better-auth/core/db/internal";
import { generateId } from "@better-auth/core/utils/id";
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

/**
 * Names one issuance: `nonce` changes on every issue, and `code` is a digest
 * of the issued value without its attempt counter, so it also names a code
 * after its value was written back with more attempts.
 */
type Issuance = { nonce: string; code: string };

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
 * Digests the part of a `<code>:<attempts>` value before the attempt counter.
 * It is keyed by the secret because a short plain or unsalted hashed code
 * would otherwise be recoverable from the digest.
 */
function digestCode(ctx: GenericEndpointContext, value: string) {
	const separator = value.lastIndexOf(":");
	return createHMAC("SHA-256", "base64urlnopad").sign(
		ctx.context.secret,
		separator === -1 ? value : value.slice(0, separator),
	);
}

async function findIssuance(
	ctx: GenericEndpointContext,
	storedIdentifier: string,
): Promise<Issuance | null> {
	const issuance = await ctx.context.internalAdapter.findVerificationValue(
		toIssuanceIdentifier(storedIdentifier),
	);
	if (!issuance || new Date(issuance.expiresAt).getTime() <= Date.now()) {
		return null;
	}
	const [nonce, code] = issuance.value.split(".");
	return nonce && code ? { nonce, code } : null;
}

/**
 * Replaces the OTP stored under an identifier with a newly issued
 * `<code>:<attempts>` value, through {@link createOrFindVerification}.
 * Resolves to `null` when a `verification.create.before` hook vetoes a write.
 *
 * It also records the issuance under a marker that outlives the value, so a
 * write-back from {@link consumeVerification} can tell that a newer code was
 * issued after the consumed one, even once that code is gone too. The marker
 * is written after the old value is deleted and before the new one exists, so
 * a consume that read the previous marker cannot have taken an older code
 * than the one it names. When a concurrent send stored its code first, the
 * marker is pointed at that code, which is returned. A caller that replaces
 * it uses {@link replaceVerification}.
 */
export async function issueVerification(
	ctx: GenericEndpointContext,
	data: VerificationInput,
): Promise<Verification | null> {
	const { internalAdapter } = ctx.context;
	const issuanceIdentifier = toIssuanceIdentifier(
		await toStoredIdentifier(ctx, data.identifier),
	);
	// The marker goes only once the old code is gone, so a consume that finds
	// no marker cannot take the old code.
	await internalAdapter.deleteVerificationByIdentifier(data.identifier);
	await internalAdapter.deleteVerificationByIdentifier(issuanceIdentifier);
	if (!(await recordIssuance(ctx, issuanceIdentifier, data))) return null;
	const stored = await createOrFindVerification(ctx, data);
	// A concurrent send stored its code first, so the marker names that code.
	if (stored && stored.value !== data.value) {
		if (!(await recordIssuance(ctx, issuanceIdentifier, stored))) return null;
	}
	return stored;
}

/**
 * Overwrites the live OTP under an identifier with a newly issued value, such
 * as after a concurrent send stored its code first, recording the issuance
 * before the value changes. Resolves to `null` when a
 * `verification.create.before` hook vetoes the issuance marker.
 */
export async function replaceVerification(
	ctx: GenericEndpointContext,
	data: VerificationInput,
) {
	const issuanceIdentifier = toIssuanceIdentifier(
		await toStoredIdentifier(ctx, data.identifier),
	);
	if (!(await recordIssuance(ctx, issuanceIdentifier, data))) return null;
	return ctx.context.internalAdapter.updateVerificationByIdentifier(
		data.identifier,
		{ value: data.value, expiresAt: data.expiresAt, createdAt: new Date() },
	);
}

/**
 * Points the issuance marker at a new issuance. A marker a concurrent send
 * stored first is overwritten, so the marker never keeps naming an issuance
 * older than a code stored after it.
 */
async function recordIssuance(
	ctx: GenericEndpointContext,
	issuanceIdentifier: string,
	data: VerificationInput,
) {
	const value = `${generateId()}.${await digestCode(ctx, data.value)}`;
	const issuance = await createOrFindVerification(ctx, {
		identifier: issuanceIdentifier,
		value,
		expiresAt: data.expiresAt,
	});
	if (!issuance) return false;
	if (issuance.value !== value) {
		await ctx.context.internalAdapter.updateVerificationByIdentifier(
			issuanceIdentifier,
			{ value, expiresAt: data.expiresAt },
		);
	}
	return true;
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
 * to `"superseded"` when the write yields because a code was issued after the
 * consumed one, whether that code is still live or already used.
 */
export async function consumeVerification(
	ctx: GenericEndpointContext,
	identifier: string,
) {
	const { internalAdapter } = ctx.context;
	const storedIdentifier = await toStoredIdentifier(ctx, identifier);
	const issuance = await findIssuance(ctx, storedIdentifier);
	const verification =
		await internalAdapter.consumeVerificationValue(identifier);
	if (!verification) return null;
	return {
		verification,
		restore: (value: string) =>
			restoreVerification(
				ctx,
				{
					value,
					identifier,
					expiresAt: verification.expiresAt,
					createdAt: verification.createdAt,
				},
				{ storedIdentifier, issuance },
			),
	};
}

/**
 * The write-back proceeds only while the marker names the consumed code, and
 * either still names the issuance read before the consume or names a code that
 * marker did not, which is a code issued while the consume ran. A marker that
 * disappeared may have been replaced, so it yields. A code issued before
 * markers existed has none before or after, and proceeds.
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
	consumed: { storedIdentifier: string; issuance: Issuance | null },
): Promise<"restored" | "superseded" | "vetoed"> {
	const [live, issuance, code] = await Promise.all([
		ctx.context.internalAdapter.findVerificationValue(data.identifier),
		findIssuance(ctx, consumed.storedIdentifier),
		digestCode(ctx, data.value),
	]);
	const before = consumed.issuance;
	const latest = issuance
		? issuance.code === code &&
			(issuance.nonce === before?.nonce || before?.code !== code)
		: !before;
	if (
		!latest ||
		(live &&
			live.identifier === consumed.storedIdentifier &&
			new Date(live.expiresAt).getTime() > Date.now())
	) {
		return "superseded";
	}
	const restored = await createOrFindVerification(ctx, data);
	if (!restored) return "vetoed";
	return restored.value === data.value ? "restored" : "superseded";
}
