import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../oauth2", async (importOriginal) => {
	const mod = await importOriginal<typeof import("../oauth2")>();
	return {
		...mod,
		validateAuthorizationCode: vi.fn(async (args: {
			options: { clientId?: string; clientKey?: string; clientSecret?: string };
		}) => {
			// Mirror production token-auth layer: secret + post requires clientId.
			if (args.options.clientSecret && !args.options.clientId) {
				throw new Error(
					"client_secret_post token endpoint authentication requires clientId",
				);
			}
			return {
				accessToken: "access",
				refreshToken: "refresh",
				accessTokenExpiresAt: new Date(),
			};
		}),
		refreshAccessToken: vi.fn(async (args: {
			options: { clientId?: string; clientSecret?: string };
		}) => {
			if (args.options.clientSecret && !args.options.clientId) {
				throw new Error(
					"client_secret_post token endpoint authentication requires clientId",
				);
			}
			return {
				accessToken: "access-refreshed",
				refreshToken: "refresh",
				accessTokenExpiresAt: new Date(),
			};
		}),
	};
});

import {
	refreshAccessToken,
	validateAuthorizationCode,
} from "../oauth2";
import { tiktok } from "./tiktok";

describe("tiktok OAuth clientId mapping (#10696)", () => {
	beforeEach(() => {
		vi.mocked(validateAuthorizationCode).mockClear();
		vi.mocked(refreshAccessToken).mockClear();
	});

	const options = {
		clientKey: "tt-client-key",
		clientSecret: "tt-secret",
	};

	it("maps clientKey to clientId on authorization-code exchange", async () => {
		const provider = tiktok(options);
		await provider.validateAuthorizationCode!({
			code: "auth-code",
			redirectURI: "https://app.example/callback",
		});

		expect(validateAuthorizationCode).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({
					clientId: "tt-client-key",
					clientKey: "tt-client-key",
					clientSecret: "tt-secret",
				}),
			}),
		);
	});

	it("maps clientKey to clientId on token refresh", async () => {
		const provider = tiktok(options);
		await provider.refreshAccessToken!("refresh-token");

		expect(refreshAccessToken).toHaveBeenCalledWith(
			expect.objectContaining({
				options: expect.objectContaining({
					clientId: "tt-client-key",
					clientSecret: "tt-secret",
				}),
				extraParams: expect.objectContaining({
					client_key: "tt-client-key",
				}),
			}),
		);
	});

	it("does not throw client_secret_post requires clientId after mapping", async () => {
		const provider = tiktok(options);
		await expect(
			provider.validateAuthorizationCode!({
				code: "auth-code",
				redirectURI: "https://app.example/callback",
			}),
		).resolves.toMatchObject({ accessToken: "access" });
	});
});
