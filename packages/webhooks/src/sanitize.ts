import type { BetterAuthOptions } from "@better-auth/core";
import {
	parseAccountOutput,
	parseSessionOutput,
	parseUserOutput,
} from "better-auth/db";
import type { Account, Session, User } from "better-auth/types";

export function sanitizeUserRecord(
	options: BetterAuthOptions,
	user: Record<string, unknown>,
): Record<string, unknown> {
	return parseUserOutput(options, user as User);
}

export function sanitizeSessionRecord(
	options: BetterAuthOptions,
	session: Record<string, unknown>,
): Record<string, unknown> {
	return parseSessionOutput(options, session as Session);
}

export function sanitizeAccountRecord(
	options: BetterAuthOptions,
	account: Record<string, unknown>,
): Record<string, unknown> {
	return parseAccountOutput(options, account as Account);
}
