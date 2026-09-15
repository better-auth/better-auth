import type { BetterFetchResponse } from "@better-fetch/fetch";
import { betterFetch } from "@better-fetch/fetch";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { logger } from "../env";
import type { CloudflareOptions, CloudflareProfile } from "./cloudflare";
import { cloudflare } from "./cloudflare";

const mockedBetterFetch = vi.mocked(betterFetch);

type CloudflareUserResponse = {
	success: boolean;
	errors: { code: number; message: string }[];
	result: CloudflareProfile | null;
};

function userResponse(
	profile: CloudflareProfile,
): BetterFetchResponse<CloudflareUserResponse> {
	return {
		data: {
			success: true,
			errors: [],
			result: profile,
		},
		error: null,
	};
}

describe("CloudflareOptions", () => {
	it("accepts confidential and public clients", () => {
		expectTypeOf<{
			clientId: string;
			clientSecret: string;
		}>().toMatchTypeOf<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			clientSecret: string;
			tokenEndpointAuthMethod: "client_secret_post";
		}>().toMatchTypeOf<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
		}>().toMatchTypeOf<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			tokenEndpointAuthMethod: "none";
		}>().toMatchTypeOf<CloudflareOptions>();
	});

	it("rejects mismatched client authentication", () => {
		expectTypeOf<{
			clientId: string;
			tokenEndpointAuthMethod: "client_secret_basic";
		}>().not.toMatchTypeOf<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			tokenEndpointAuthMethod: "client_secret_post";
		}>().not.toMatchTypeOf<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			clientSecret: string;
			tokenEndpointAuthMethod: "none";
		}>().not.toMatchTypeOf<CloudflareOptions>();
	});
});

describe("cloudflare.getUserInfo", () => {
	it("maps the Cloudflare profile without redefining provider identity", async () => {
		mockedBetterFetch.mockResolvedValueOnce(
			userResponse({
				id: "cloudflare-user-1",
				email: "user@example.com",
				first_name: "Cloudflare",
				last_name: "User",
			}),
		);

		const provider = cloudflare({
			clientId: "cloudflare-client",
			clientSecret: "cloudflare-secret",
		});

		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(result?.user).toEqual({
			name: "Cloudflare User",
			email: "user@example.com",
			emailVerified: false,
		});
		expect(result?.user).not.toHaveProperty("id");
		if (!result) return;
		expect(
			await provider.accountSubject({
				tokens: { accessToken: "access-token" },
				profile: result.data,
			}),
		).toBe("cloudflare-user-1");
	});

	it("uses the email as the display name when Cloudflare omits both names", async () => {
		mockedBetterFetch.mockResolvedValueOnce(
			userResponse({
				id: "cloudflare-user-2",
				email: "nameless@example.com",
			}),
		);

		const provider = cloudflare({
			clientId: "cloudflare-client",
			clientSecret: "cloudflare-secret",
		});

		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(result?.user.name).toBe("nameless@example.com");
	});

	it.each([
		{
			name: "the request fails",
			response: {
				data: null,
				error: {
					message: "Internal Server Error",
					status: 500,
					statusText: "Internal Server Error",
				},
			} satisfies BetterFetchResponse<CloudflareUserResponse>,
		},
		{
			name: "Cloudflare reports an error",
			response: {
				data: {
					success: false,
					errors: [{ code: 1000, message: "Unable to fetch user" }],
					result: null,
				},
				error: null,
			} satisfies BetterFetchResponse<CloudflareUserResponse>,
		},
		{
			name: "Cloudflare omits the profile",
			response: {
				data: {
					success: true,
					errors: [],
					result: null,
				},
				error: null,
			} satisfies BetterFetchResponse<CloudflareUserResponse>,
		},
	])("returns null when $name", async ({ response }) => {
		const loggerError = vi.spyOn(logger, "error").mockImplementation(() => {});
		mockedBetterFetch.mockResolvedValueOnce(response);

		const provider = cloudflare({
			clientId: "cloudflare-client",
			clientSecret: "cloudflare-secret",
		});

		const result = await provider.getUserInfo({ accessToken: "access-token" });

		expect(result).toBeNull();
		expect(loggerError).toHaveBeenCalledOnce();
	});
});
