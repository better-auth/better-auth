import { describe, expect, it } from "vitest";
import { betterAuth } from "../../auth";
import { oidcProvider } from ".";

describe("oidc", async () => {
	it("should generate the correct metadata", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			plugins: [oidcProvider()],
		});
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata).toMatchSnapshot();
	});
});
