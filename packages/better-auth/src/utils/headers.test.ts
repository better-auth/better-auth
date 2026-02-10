import { describe, expect, it } from "vitest";
import { toHeaders } from "./headers";

describe("toHeaders", () => {
	it("should return undefined for undefined input", () => {
		expect(toHeaders(undefined)).toBeUndefined();
	});

	it("should clone a Headers instance", () => {
		const input = new Headers({ cookie: "a=b" });
		const output = toHeaders(input);
		expect(output).toBeInstanceOf(Headers);
		expect(output).not.toBe(input);
		expect(output?.get("cookie")).toBe("a=b");
	});

	it("should support Node.js IncomingHttpHeaders-style records", () => {
		const output = toHeaders({
			cookie: "a=b",
			"x-test": ["a", "b"],
		});
		expect(output?.get("cookie")).toBe("a=b");
		// Multiple values are joined per Fetch semantics
		expect(output?.get("x-test")).toBe("a, b");
	});

	it("should support Next.js ReadonlyHeaders-style objects via entries()", () => {
		class ReadonlyHeadersLike {
			private readonly inner: Headers;
			constructor(init: Record<string, string>) {
				this.inner = new Headers(init);
			}
			get(name: string) {
				return this.inner.get(name);
			}
			entries() {
				return this.inner.entries();
			}
		}

		const output = toHeaders(
			new ReadonlyHeadersLike({ cookie: "a=b", "x-test": "1" }) as any,
		);
		expect(output?.get("cookie")).toBe("a=b");
		expect(output?.get("x-test")).toBe("1");
	});

	it("should support header-like objects via get/forEach()", () => {
		class ForEachHeadersLike {
			private readonly map = new Map<string, string>();
			constructor(init: Record<string, string>) {
				for (const [k, v] of Object.entries(init)) {
					this.map.set(k.toLowerCase(), v);
				}
			}
			get(name: string) {
				return this.map.get(name.toLowerCase()) ?? null;
			}
			forEach(cb: (value: string, key: string) => void) {
				for (const [k, v] of this.map.entries()) {
					cb(v, k);
				}
			}
		}

		const output = toHeaders(
			new ForEachHeadersLike({ cookie: "a=b", "x-test": "1" }) as any,
		);
		expect(output?.get("cookie")).toBe("a=b");
		expect(output?.get("x-test")).toBe("1");
	});
});

