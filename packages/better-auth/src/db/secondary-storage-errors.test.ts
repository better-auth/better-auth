import { inspect } from "node:util";
import type { BetterAuthOptions } from "@better-auth/core";
import type { SecondaryStorage } from "@better-auth/core/db";
import type { LogLevel } from "@better-auth/core/env";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";

type StorageMethod = "get" | "set" | "delete";

function createMemoryStorage(store: Map<string, string>): SecondaryStorage {
	return {
		set(key, value) {
			store.set(key, value);
		},
		get(key) {
			return store.get(key) ?? null;
		},
		getAndDelete(key) {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment(key) {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
		delete(key) {
			store.delete(key);
		},
	};
}

/**
 * ioredis attaches the failed command, including its key, to reply errors.
 * @see https://github.com/redis/ioredis/blob/v5.11.1/lib/DataHandler.ts
 */
function ioredisReplyError(command: string, args: unknown[]) {
	return Object.assign(
		new Error("READONLY You can't write against a read only replica."),
		{ name: "ReplyError", command: { name: command, args } },
	);
}

/**
 * Upstash puts the whole request body, key and value included, in the message.
 * @see https://github.com/upstash/redis-js/blob/v1.38.0/pkg/http.ts
 */
function upstashError(args: unknown[]) {
	const error = new Error(
		`ERR max requests limit exceeded, command was: ${JSON.stringify(args)}`,
	);
	error.name = "UpstashError";
	return error;
}

type ErrorShape = "ioredis" | "upstash";

function storageError(shape: ErrorShape, command: string, args: unknown[]) {
	return shape === "ioredis"
		? ioredisReplyError(command, args)
		: upstashError([command, ...args]);
}

/**
 * Captures what Better Auth logs, formatted the way `console.error` prints it,
 * so a secret in an error's message, stack, or own properties shows up.
 */
function captureLogs() {
	const entries: string[] = [];
	return {
		entries,
		logger: {
			level: "debug" as const,
			log(
				level: Exclude<LogLevel, "success">,
				message: string,
				...args: unknown[]
			) {
				entries.push(
					[
						level,
						message,
						...args.map((arg) => inspect(arg, { depth: 10 })),
					].join(" "),
				);
			},
		},
		output() {
			return entries.join("\n");
		},
	};
}

async function setup(options: {
	shape: ErrorShape;
	failing: StorageMethod;
	transactions?: boolean;
}) {
	const store = new Map<string, string>();
	const storage = createMemoryStorage(store);
	const logs = captureLogs();
	let failing = false;
	const fail = (method: StorageMethod, args: unknown[]) => {
		if (failing && method === options.failing) {
			throw storageError(
				options.shape,
				method === "delete" ? "del" : method,
				args,
			);
		}
	};
	let resetToken: string | undefined;
	const instance = await getTestInstance({
		secondaryStorage: {
			...storage,
			get(key) {
				fail("get", [key]);
				return storage.get(key);
			},
			set(key, value, ttl) {
				fail("set", ttl ? [key, ttl, value] : [key, value]);
				return storage.set(key, value, ttl);
			},
			delete(key) {
				fail("delete", [key]);
				return storage.delete(key);
			},
		},
		session: { storeSessionInDatabase: true },
		rateLimit: { enabled: false },
		logger: logs.logger,
		emailAndPassword: {
			enabled: true,
			revokeSessionsOnPasswordReset: true,
			async sendResetPassword({ token }) {
				resetToken = token;
			},
		},
	});
	if (options.transactions === false) {
		const ctx = await instance.auth.$context;
		// Behave like an adapter configured with `transaction: false`.
		ctx.adapter.transaction = (cb) => cb(ctx.adapter);
		const adapterConfig = ctx.adapter.options!.adapterConfig as {
			transaction: unknown;
		};
		adapterConfig.transaction = false;
	}
	const { headers, user } = await instance.signInWithTestUser();
	const token = [...store.keys()].find(
		(key) => !key.startsWith("active-sessions-"),
	);
	if (!token) throw new Error("expected a cached session");
	return {
		...instance,
		headers,
		user,
		token,
		logs,
		startFailing() {
			failing = true;
			logs.entries.length = 0;
		},
		async requestPasswordReset() {
			await instance.client.requestPasswordReset({
				email: instance.testUser.email,
				redirectTo: "/reset",
			});
			if (!resetToken) throw new Error("expected a reset token");
			return resetToken;
		},
	};
}

describe.each(["ioredis", "upstash"] as const)(
	"secondary storage errors shaped like %s",
	(shape) => {
		const expectedDiagnostics =
			shape === "ioredis"
				? [
						"ReplyError",
						"READONLY You can't write against a read only replica.",
					]
				: ["UpstashError", "ERR max requests limit exceeded"];

		it("keeps the session token out of the request error log", async () => {
			const { client, headers, token, logs, startFailing } = await setup({
				shape,
				failing: "delete",
			});

			startFailing();
			const revoked = await client.revokeSessions({
				fetchOptions: { headers },
			});

			expect(revoked.error?.status).toBe(500);
			const output = logs.output();
			for (const diagnostic of expectedDiagnostics) {
				expect(output).toContain(diagnostic);
			}
			if (shape === "ioredis") expect(output).toContain("name: 'del'");
			expect(output).not.toContain(token);
		});

		it("keeps the session token out of the after-commit hook failure log", async () => {
			const { auth, client, token, logs, startFailing, requestPasswordReset } =
				await setup({ shape, failing: "delete", transactions: false });
			const resetToken = await requestPasswordReset();
			const ctx = await auth.$context;
			// Fail the work after the cached sessions were queued for removal.
			vi.spyOn(ctx.internalAdapter, "updatePassword").mockRejectedValueOnce(
				new Error("database unavailable"),
			);

			startFailing();
			const reset = await client.resetPassword({
				newPassword: "new-password",
				token: resetToken,
			});

			expect(reset.error?.status).toBe(500);
			const output = logs.output();
			expect(output).toContain(
				"Failed to run an after-commit hook for work that could not roll back",
			);
			for (const diagnostic of expectedDiagnostics) {
				expect(output).toContain(diagnostic);
			}
			expect(output).not.toContain(token);
		});

		it("keeps the session token and cached session out of the session refresh log", async () => {
			const { client, headers, token, user, logs, startFailing } = await setup({
				shape,
				failing: "set",
			});

			startFailing();
			const updated = await client.updateUser({
				name: "Renamed User",
				fetchOptions: { headers },
			});

			expect(updated.error).toBeNull();
			const output = logs.output();
			expect(output).toContain(
				"Failed to refresh committed user sessions in secondary storage",
			);
			for (const diagnostic of expectedDiagnostics) {
				expect(output).toContain(diagnostic);
			}
			expect(output).not.toContain(token);
			expect(output).not.toContain(user.email);
		});
	},
);

describe("secondary storage supplied by a plugin", () => {
	let failReads = false;
	const storage = createMemoryStorage(new Map());
	const failingStorage = (): SecondaryStorage => ({
		...storage,
		get(key) {
			if (failReads) throw ioredisReplyError("get", [key]);
			return storage.get(key);
		},
	});

	it.each([
		[
			"options",
			(storage: SecondaryStorage) => ({
				options: { secondaryStorage: storage },
			}),
		],
		[
			"context",
			(storage: SecondaryStorage) => ({
				context: { secondaryStorage: storage },
			}),
		],
	] as const)(
		"redacts errors from storage set through init %s",
		async (_, init) => {
			const { auth } = await getTestInstance({
				plugins: [{ id: "storage-plugin", init: () => init(failingStorage()) }],
			});
			const ctx = await auth.$context;
			const options: BetterAuthOptions = ctx.options;
			failReads = true;
			onTestFinished(() => {
				failReads = false;
			});

			for (const storage of [ctx.secondaryStorage, options.secondaryStorage]) {
				if (!storage) continue;
				const error = await (async () => storage.get("secret-token"))().catch(
					(e: unknown) => e,
				);
				expect(error).toMatchObject({
					command: { name: "get", args: ["[redacted]"] },
				});
			}
			expect(ctx.secondaryStorage ?? options.secondaryStorage).toBeDefined();
		},
	);
});
