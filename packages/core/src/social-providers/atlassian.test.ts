import { betterFetch } from "@better-fetch/fetch";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@better-fetch/fetch"), () => ({
	betterFetch: vi.fn(),
}));

import { logger } from "../env";
import { atlassian } from "./atlassian";

const mockedBetterFetch = vi.mocked(betterFetch);

describe("atlassian.getUserInfo", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/11558
	 */
	it("names Atlassian when the user info request fails", async () => {
		const error = new Error("request failed");
		const loggerError = vi.spyOn(logger, "error").mockImplementation(() => {});
		mockedBetterFetch.mockRejectedValueOnce(error);

		const result = await atlassian({
			clientId: "atlassian-client",
			clientSecret: "atlassian-secret",
		}).getUserInfo({ accessToken: "access-token" });

		expect(result).toBeNull();
		expect(loggerError).toHaveBeenCalledWith(
			"Failed to fetch user info from Atlassian:",
			error,
		);
	});
});
