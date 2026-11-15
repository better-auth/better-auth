import type { GenericEndpointContext } from "@better-auth/core";
import type { StoredAuthorizationQuery } from "@better-auth/oauth-provider";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { generateRandomString } from "better-auth/crypto";
import type { FirstPartyAuthSessionRow } from "./schema";
import type {
	FirstPartyAuthSession,
	FirstPartyAuthSessionState,
} from "./types";

const MODEL = "firstPartyAuthSession";

/** A new handle: 64 characters from a 62-letter alphabet, over 256 bits (§5.3.1). */
export function generateHandle(): string {
	return generateRandomString(64, "a-z", "A-Z", "0-9");
}

export async function hashHandle(handle: string): Promise<string> {
	const digest = await createHash("SHA-256").digest(
		new TextEncoder().encode(handle),
	);
	return base64Url.encode(new Uint8Array(digest), { padding: false });
}

/** An `auth_session` row as the endpoint works with it. */
export interface AuthSessionRecord {
	id?: string;
	clientId: string;
	userId?: string;
	sessionId?: string;
	ownsSession: boolean;
	dpopJkt?: string;
	state: FirstPartyAuthSessionState;
	query: StoredAuthorizationQuery & { client_id: string };
	amr: string[];
	challenge?: {
		strategy: string;
		type: string;
		state?: Record<string, unknown>;
	};
	acrValues?: string;
	failures: number;
	expiresAt: Date;
}

function fromRow(row: FirstPartyAuthSessionRow): AuthSessionRecord {
	return {
		id: row.id,
		clientId: row.clientId,
		userId: row.userId ?? undefined,
		sessionId: row.sessionId ?? undefined,
		ownsSession: !!row.ownsSession,
		dpopJkt: row.dpopJkt ?? undefined,
		state: row.state as FirstPartyAuthSessionState,
		query: JSON.parse(row.query),
		amr: row.amr ? JSON.parse(row.amr) : [],
		challenge: row.challenge ? JSON.parse(row.challenge) : undefined,
		acrValues: row.acrValues ?? undefined,
		failures: row.failures ?? 0,
		expiresAt: new Date(row.expiresAt),
	};
}

function toRow(record: AuthSessionRecord) {
	return {
		clientId: record.clientId,
		userId: record.userId ?? null,
		sessionId: record.sessionId ?? null,
		ownsSession: record.ownsSession,
		dpopJkt: record.dpopJkt ?? null,
		state: record.state,
		query: JSON.stringify(record.query),
		amr: record.amr.length ? JSON.stringify(record.amr) : null,
		challenge: record.challenge ? JSON.stringify(record.challenge) : null,
		acrValues: record.acrValues ?? null,
		failures: record.failures,
		expiresAt: record.expiresAt,
		updatedAt: new Date(),
	};
}

/** What a strategy sees of a record. */
export function toStrategyView(
	record: AuthSessionRecord,
): FirstPartyAuthSession {
	return {
		state: record.state,
		query: record.query,
		userId: record.userId,
		amr: [...record.amr],
		challenge: record.challenge
			? { type: record.challenge.type, state: record.challenge.state }
			: undefined,
		acrValues: record.acrValues,
	};
}

export async function findAuthSession(
	ctx: GenericEndpointContext,
	handle: string,
): Promise<AuthSessionRecord | null> {
	const row = await ctx.context.adapter.findOne<FirstPartyAuthSessionRow>({
		model: MODEL,
		where: [{ field: "handleHash", value: await hashHandle(handle) }],
	});
	return row ? fromRow(row) : null;
}

/**
 * Finds the record behind a grant, keyed by client, user, session, and DPoP
 * key (C4), in one of `states`.
 */
export async function findAuthSessionForGrant(
	ctx: GenericEndpointContext,
	key: {
		clientId: string;
		userId: string;
		sessionId: string;
		dpopJkt?: string;
	},
	states: FirstPartyAuthSessionState[],
): Promise<AuthSessionRecord | null> {
	const rows = await ctx.context.adapter.findMany<FirstPartyAuthSessionRow>({
		model: MODEL,
		where: [
			{ field: "sessionId", value: key.sessionId },
			{ field: "clientId", value: key.clientId },
		],
	});
	const row = rows.find(
		(candidate) =>
			candidate.userId === key.userId &&
			(candidate.dpopJkt ?? undefined) === key.dpopJkt &&
			states.includes(candidate.state as FirstPartyAuthSessionState),
	);
	return row ? fromRow(row) : null;
}

/**
 * Stores `record` under a new handle and returns the handle. An existing
 * record keeps its row and gets the new handle, so an older handle stops
 * working.
 */
export async function saveAuthSession(
	ctx: GenericEndpointContext,
	record: AuthSessionRecord,
	options: { rotate: boolean },
): Promise<string | undefined> {
	const handle = options.rotate || !record.id ? generateHandle() : undefined;
	const data = {
		...toRow(record),
		...(handle ? { handleHash: await hashHandle(handle) } : {}),
	};
	if (record.id) {
		await ctx.context.adapter.update({
			model: MODEL,
			where: [{ field: "id", value: record.id }],
			update: data,
		});
	} else {
		const created = await ctx.context.adapter.create<
			Record<string, unknown>,
			FirstPartyAuthSessionRow
		>({
			model: MODEL,
			data: { ...data, createdAt: new Date() },
		});
		record.id = created.id;
	}
	return handle;
}

/**
 * Revokes a handle. The sign-in session behind it is deleted only when this
 * handle created it (C2), so a step-up handle never signs the user out.
 */
export async function revokeAuthSession(
	ctx: GenericEndpointContext,
	record: AuthSessionRecord,
): Promise<void> {
	if (record.id) {
		await ctx.context.adapter.delete({
			model: MODEL,
			where: [{ field: "id", value: record.id }],
		});
	}
	if (record.ownsSession && record.sessionId) {
		const session = await findLiveSession(ctx, record.sessionId);
		if (session) {
			await ctx.context.internalAdapter.deleteSession(session.session.token);
		}
	}
}

/** The session behind a record, or `null` when it ended or expired (C2). */
export async function findLiveSession(
	ctx: GenericEndpointContext,
	sessionId: string,
) {
	const session = await ctx.context.adapter.findOne<{
		id: string;
		token: string;
		userId: string;
		expiresAt: Date;
	}>({
		model: "session",
		where: [{ field: "id", value: sessionId }],
	});
	if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
		return null;
	}
	return ctx.context.internalAdapter.findSession(session.token);
}
