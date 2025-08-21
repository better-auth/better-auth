import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastSocialProvider, lastSocialProviderClient } from "./index";

describe("last social provider", async () => {
	const { client } = await getTestInstance(
		{
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
				apple: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
				},
			},
			plugins: [lastSocialProvider()],
		},
		{
			clientOptions: {
				plugins: [lastSocialProviderClient()],
			},
		},
	);

	it("returns null when no social provider has been used", async () => {
		const lastSocial = await client.lastUsedSocial();
		expect(lastSocial.data).toBe(null);
	});
});
