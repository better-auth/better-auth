import type { BetterFetchResponse } from "@better-fetch/fetch";
import { betterFetch } from "@better-fetch/fetch";
import { assertType, describe, expect, expectTypeOf, it, vi } from "vitest";

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

/**
 * @see https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/#choose-a-flow
 */
describe("CloudflareOptions", () => {
	it("accepts confidential and public clients", () => {
		assertType<CloudflareOptions>({
			clientId: "client",
			clientSecret: "secret",
		});
		assertType<CloudflareOptions>({
			clientId: "client",
			clientSecret: "secret",
			tokenEndpointAuth: { method: "client_secret_post" },
		});
		assertType<CloudflareOptions>({ clientId: "client" });
		assertType<CloudflareOptions>({
			clientId: "client",
			tokenEndpointAuth: { method: "none" },
		});
		assertType<CloudflareOptions>({
			clientId: "client",
			clientSecret: "secret",
			tokenEndpointAuthMethod: "client_secret_post",
		});
		assertType<CloudflareOptions>({
			clientId: "client",
			tokenEndpointAuthMethod: "none",
		});
		expectTypeOf<
			NonNullable<CloudflareOptions["tokenEndpointAuth"]>["method"]
		>().toEqualTypeOf<"client_secret_basic" | "client_secret_post" | "none">();
	});

	it("rejects mismatched client authentication", () => {
		expectTypeOf<{
			clientId: string;
			tokenEndpointAuth: { method: "client_secret_basic" };
		}>().not.toExtend<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			tokenEndpointAuth: { method: "client_secret_post" };
		}>().not.toExtend<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			clientSecret: string;
			tokenEndpointAuth: { method: "none" };
		}>().not.toExtend<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			tokenEndpointAuthMethod: "client_secret_basic";
		}>().not.toExtend<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			tokenEndpointAuthMethod: "client_secret_post";
		}>().not.toExtend<CloudflareOptions>();
		expectTypeOf<{
			clientId: string;
			clientSecret: string;
			tokenEndpointAuthMethod: "none";
		}>().not.toExtend<CloudflareOptions>();
	});
});

/**
 * @see https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/#choose-a-flow
 */
it.each([
	{
		name: "new option",
		authentication: { tokenEndpointAuth: { method: "client_secret_post" } },
	},
	{
		name: "deprecated option",
		authentication: { tokenEndpointAuthMethod: "client_secret_post" },
	},
	{
		name: "new option precedence",
		authentication: {
			tokenEndpointAuthMethod: "client_secret_basic",
			tokenEndpointAuth: { method: "client_secret_post" },
		},
	},
] as const)(
	"uses $name for Cloudflare refresh authentication",
	async ({ authentication }) => {
		mockedBetterFetch.mockResolvedValueOnce({
			data: {
				access_token: "access-token",
				token_type: "Bearer",
				expires_in: 3600,
			},
			error: null,
		});

		await cloudflare({
			clientId: "client",
			clientSecret: "secret",
			...authentication,
		}).refreshAccessToken("refresh-token");

		const [url, init] = mockedBetterFetch.mock.calls[0]!;
		expect(url).toBe("https://dash.cloudflare.com/oauth2/token");
		expect(
			new Headers(init?.headers as HeadersInit | undefined).get(
				"authorization",
			),
		).toBeNull();
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			grant_type: "refresh_token",
			refresh_token: "refresh-token",
			client_id: "client",
			client_secret: "secret",
		});
	},
);

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
