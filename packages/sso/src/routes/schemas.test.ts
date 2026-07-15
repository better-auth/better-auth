import { describe, expect, it } from "vitest";
import { sso } from "../index";
import {
	getRegisterSSOProviderBodySchema,
	getUpdateSSOProviderBodySchema,
	ssoProviderDomainSchema,
	ssoProviderIdSchema,
} from "./schemas";

describe("SSO provider routing input", () => {
	it.each([
		"",
		" ",
		"tenant/path",
		"tenant?mode=test",
		"tenant#fragment",
		"tenant%2Fcallback",
		".",
		"..",
	])("rejects provider IDs that are not one normalized URL segment: %j", (id) => {
		expect(ssoProviderIdSchema.safeParse(id).success).toBe(false);
	});

	it.each([
		"tenant",
		"tenant-1",
		"tenant_one",
		"tenant.one",
		"tenant~one",
	])("accepts a normalized provider ID: %s", (id) => {
		expect(ssoProviderIdSchema.parse(id)).toBe(id);
	});

	it("normalizes a non-empty provider domain list", () => {
		expect(
			ssoProviderDomainSchema.parse(
				" HTTPS://Login.Example.COM/path , subsidiary.example.com ",
			),
		).toBe("login.example.com,subsidiary.example.com");
		expect(ssoProviderDomainSchema.safeParse(" , ").success).toBe(false);
	});

	it("uses the routing and domain contracts for register and update bodies", () => {
		const registerSchema = getRegisterSSOProviderBodySchema();
		const updateSchema = getUpdateSSOProviderBodySchema();

		expect(
			registerSchema.safeParse({
				providerId: "tenant/path",
				issuer: "https://idp.example.com",
				domain: "example.com",
			}).success,
		).toBe(false);
		expect(
			updateSchema.safeParse({
				providerId: "",
				domain: "example.com",
			}).success,
		).toBe(false);
		expect(
			updateSchema.parse({
				providerId: "tenant",
				domain: "HTTPS://Example.COM/path",
			}).domain,
		).toBe("example.com");
	});

	it("rejects invalid configured provider routing before plugin initialization", () => {
		expect(() =>
			sso({
				defaultSSO: [
					{
						providerId: "tenant/path",
						domain: "example.com",
						oidcConfig: {
							clientId: "client-id",
							clientSecret: "client-secret",
							issuer: "https://idp.example.com",
							discoveryEndpoint:
								"https://idp.example.com/.well-known/openid-configuration",
							pkce: true,
						},
					},
				],
			}),
		).toThrow(/providerId/i);
		expect(() =>
			sso({
				defaultSSO: [
					{
						providerId: "tenant",
						domain: "",
						oidcConfig: {
							clientId: "client-id",
							clientSecret: "client-secret",
							issuer: "https://idp.example.com",
							discoveryEndpoint:
								"https://idp.example.com/.well-known/openid-configuration",
							pkce: true,
						},
					},
				],
			}),
		).toThrow(/domain/i);
	});
});
