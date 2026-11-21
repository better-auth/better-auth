import { describe, expect, it, vi } from "vitest";
import { isD1SqliteClient } from "./d1-sqlite-client";

describe("isD1SqliteClient", () => {
	it("returns false when a proxy has trap throws", () => {
		const db = new Proxy(
			{},
			{
				has() {
					throw new Error("DATABASE_URL is not set");
				},
				get() {
					throw new Error("DATABASE_URL is not set");
				},
			},
		);
		expect(isD1SqliteClient(db)).toBe(false);
	});

	it("ignores objects that only have D1 method names", () => {
		expect(
			isD1SqliteClient({
				batch: true,
				prepare: true,
				exec: true,
			}),
		).toBe(false);
	});

	it("detects a drizzle client with D1 methods on $client", () => {
		expect(
			isD1SqliteClient({
				$client: {
					batch: vi.fn(),
					prepare: vi.fn(),
					exec: vi.fn(),
				},
			}),
		).toBe(true);
	});
});
