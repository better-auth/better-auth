import { afterEach, describe, expect, it } from "vitest";
import { customerMetadata, subscriptionMetadata } from "../src/metadata";

const ROOT_PROBE_KEY = "polluted";

/**
 * @see https://github.com/advisories/GHSA-737v-mqg7-c878
 */
describe("stripe metadata prototype pollution guard", () => {
	afterEach(() => {
		Reflect.deleteProperty(Object.prototype, ROOT_PROBE_KEY);
	});

	it("drops __proto__ from user metadata on customerMetadata.set", () => {
		const malicious = JSON.parse(
			`{"__proto__":{"${ROOT_PROBE_KEY}":"yes"},"plan":"pro"}`,
		);
		const result = customerMetadata.set(
			{ customerType: "user", userId: "u1" },
			malicious,
		);
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
		expect(result.plan).toBe("pro");
		expect(result.userId).toBe("u1");
	});

	it("drops constructor and prototype from user metadata on customerMetadata.set", () => {
		const malicious = JSON.parse(
			`{"constructor":{"prototype":{"${ROOT_PROBE_KEY}":"yes"}},"plan":"pro"}`,
		);
		const result = customerMetadata.set(
			{ customerType: "user", userId: "u1" },
			malicious,
		);
		expect(result.constructor).toBe(Object);
		expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
		expect(result.plan).toBe("pro");
	});

	it("drops __proto__ from user metadata on subscriptionMetadata.set", () => {
		const malicious = JSON.parse(
			`{"__proto__":{"${ROOT_PROBE_KEY}":"yes"},"planName":"pro"}`,
		);
		const result = subscriptionMetadata.set(
			{ userId: "u1", subscriptionId: "s1", referenceId: "ref1" },
			malicious,
		);
		expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
		expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
		expect(result.planName).toBe("pro");
		expect(result.subscriptionId).toBe("s1");
	});

	it("internal fields always take precedence over user metadata", () => {
		const result = customerMetadata.set(
			{ customerType: "user", userId: "real" },
			{ userId: "spoofed", customerType: "organization" },
		);
		expect(result.userId).toBe("real");
		expect(result.customerType).toBe("user");
	});
});

describe("stripe metadata helpers", () => {
	it("customerMetadata.set protects internal fields", () => {
		const result = customerMetadata.set(
			{ userId: "real", customerType: "user" },
			{ userId: "fake", custom: "value" },
		);
		expect(result.userId).toBe("real");
		expect(result.customerType).toBe("user");
		expect(result.custom).toBe("value");
	});

	it("customerMetadata.get extracts typed fields", () => {
		const result = customerMetadata.get({
			userId: "u1",
			customerType: "organization",
			extra: "ignored",
		});
		expect(result.userId).toBe("u1");
		expect(result.customerType).toBe("organization");
		expect(result).not.toHaveProperty("extra");
	});

	it("subscriptionMetadata.set protects internal fields", () => {
		const result = subscriptionMetadata.set(
			{ userId: "u1", subscriptionId: "s1", referenceId: "r1" },
			{ subscriptionId: "fake" },
		);
		expect(result.subscriptionId).toBe("s1");
	});

	it("subscriptionMetadata.get extracts typed fields", () => {
		const result = subscriptionMetadata.get({
			userId: "u1",
			subscriptionId: "s1",
			referenceId: "r1",
			extra: "ignored",
		});
		expect(result.userId).toBe("u1");
		expect(result.subscriptionId).toBe("s1");
		expect(result.referenceId).toBe("r1");
		expect(result).not.toHaveProperty("extra");
	});
});
