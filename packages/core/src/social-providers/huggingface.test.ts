import { assertType, expect, it } from "vitest";
import type { HuggingFaceProfile } from "./huggingface";
import { huggingface } from "./huggingface";

/**
 * @see https://huggingface.co/docs/huggingface_hub/package_reference/oauth#huggingface_hub.OAuthUserInfo
 */
it("accepts organization arrays in Hugging Face profiles", async () => {
	const profile = {
		sub: "hf-user",
		name: "User",
		preferred_username: "user",
		profile: "https://huggingface.co/user",
		picture: "https://example.com/avatar.png",
		isPro: false,
		orgs: [
			{
				sub: "hf-org",
				name: "Organization",
				picture: "https://example.com/org.png",
				preferred_username: "organization",
				isEnterprise: false,
			},
		],
	};
	assertType<HuggingFaceProfile>(profile);
	const provider = huggingface({
		clientId: "hf-app",
		getUserInfo: async () => ({
			user: { name: profile.name, emailVerified: false },
			data: profile,
		}),
	});

	const result = await provider.getUserInfo({ accessToken: "access-token" });

	expect(result?.data.orgs?.map((org) => org.sub)).toEqual(["hf-org"]);
});
