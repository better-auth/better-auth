import { EventEmitter } from "node:events";
import { logger } from "@better-auth/core/env";
import type { PostgresPool, PostgresPoolClient } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isConnectionError, withConnectionChecks } from "./connection";

type FakeClient = {
	client: PostgresPoolClient;
	releases: boolean[];
	checkOut: () => void;
	kill: () => void;
	pings: () => number;
};

function fakeClient(): FakeClient {
	let alive = true;
	const releases: boolean[] = [];
	const query = vi.fn(async () => {
		if (!alive) throw new Error("Connection terminated unexpectedly");
		return { command: "SELECT", rowCount: 1, rows: [] };
	});
	const client = { query, release: () => {} };
	return {
		client: client as unknown as PostgresPoolClient,
		releases,
		// Like node-postgres, set a fresh `release` on every checkout.
		checkOut: () => {
			client.release = (destroy?: boolean) => {
				releases.push(destroy ?? false);
			};
		},
		kill: () => {
			alive = false;
		},
		pings: () => query.mock.calls.length,
	};
}

/** A pool that hands out these clients, or throws these errors, in order. */
function fakePool(script: (FakeClient | Error)[]) {
	const connect = vi.fn(async () => {
		const next = script.shift();
		if (!next) throw new Error("No more connections in the script");
		if (next instanceof Error) throw next;
		next.checkOut();
		return next.client;
	});
	const pool = Object.assign(new EventEmitter(), {
		connect,
		end: async () => {},
	});
	return { pool, connect };
}

function connectionError(code: string) {
	return Object.assign(new Error(`connection failed (${code})`), { code });
}

function setNow(time: number) {
	vi.spyOn(Date, "now").mockReturnValue(time);
}

afterEach(() => {
	vi.restoreAllMocks();
});

/** @see https://github.com/better-auth/better-auth/issues/12088 */
describe("Aurora DSQL connections", () => {
	it("adds an error listener so a dropped connection doesn't crash", () => {
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const { pool } = fakePool([]);
		withConnectionChecks(pool);
		expect(pool.listenerCount("error")).toBe(1);
		expect(() => pool.emit("error", new Error("closed"))).not.toThrow();
		expect(warn).toHaveBeenCalledOnce();
	});

	it("leaves the pool alone when the app already listens for errors", () => {
		const { pool } = fakePool([]);
		const listener = vi.fn();
		pool.on("error", listener);
		withConnectionChecks(pool);
		expect(pool.listeners("error")).toEqual([listener]);
	});

	it("reuses a recently released connection without checking it", async () => {
		const a = fakeClient();
		const { pool } = fakePool([a, a]);
		const checked: PostgresPool = withConnectionChecks(pool);
		setNow(0);
		(await checked.connect()).release();
		setNow(10_000);
		expect(await checked.connect()).toBe(a.client);
		expect(a.pings()).toBe(0);
	});

	it("checks an idle connection and keeps it when it still works", async () => {
		const a = fakeClient();
		const { pool } = fakePool([a, a]);
		const checked = withConnectionChecks(pool);
		setNow(0);
		(await checked.connect()).release();
		setNow(31_000);
		expect(await checked.connect()).toBe(a.client);
		expect(a.pings()).toBe(1);
		expect(a.releases).toEqual([false]);
	});

	it("replaces an idle connection that died", async () => {
		const a = fakeClient();
		const b = fakeClient();
		const { pool } = fakePool([a, a, b]);
		const checked = withConnectionChecks(pool);
		setNow(0);
		(await checked.connect()).release();
		setNow(31_000);
		a.kill();
		expect(await checked.connect()).toBe(b.client);
		// Released normally the first time, then destroyed after the failed check.
		expect(a.releases).toEqual([false, true]);
	});

	it("retries opening a connection after a connection error", async () => {
		const a = fakeClient();
		const { pool, connect } = fakePool([
			connectionError("53400"),
			connectionError("ECONNRESET"),
			a,
		]);
		expect(await withConnectionChecks(pool).connect()).toBe(a.client);
		expect(connect).toHaveBeenCalledTimes(3);
	});

	it("doesn't retry other errors", async () => {
		const authFailed = connectionError("28P01");
		const { pool, connect } = fakePool([authFailed]);
		await expect(withConnectionChecks(pool).connect()).rejects.toBe(authFailed);
		expect(connect).toHaveBeenCalledOnce();
	});

	it("gives up after three retries and throws the last error", async () => {
		const last = connectionError("53400");
		const { pool, connect } = fakePool([
			connectionError("53400"),
			connectionError("53400"),
			connectionError("53400"),
			last,
		]);
		await expect(withConnectionChecks(pool).connect()).rejects.toBe(last);
		expect(connect).toHaveBeenCalledTimes(4);
	});

	it.each([
		["ECONNRESET", true],
		["08006", true],
		["57P01", true],
		["53400", true],
		["28P01", false],
		["40001", false],
	])("treats %s as a connection error: %s", (code, expected) => {
		expect(isConnectionError(connectionError(code))).toBe(expected);
	});
});
