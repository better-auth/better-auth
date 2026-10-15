import { assertType, expect, it } from "vitest";
import type { HuggingFaceProfile } from "./huggingface";
import { huggingface } from "./huggingface";

/**
 * @see https://huggingface.co/docs/huggingface_hub/package_reference/oauth#huggingface_hub.OAuthUserInfo
 * @see https://github.com/huggingface/huggingface.js/blob/1baa7c25311ead30ae82ab3c610b773581c6b949/packages/hub/src/lib/oauth-handle-redirect.ts#L49-L70
 */
it("accepts organization arrays in Hugging Face profiles", async () => {
	const organization = {
		sub: "hf-org",
		name: "Organization",
		picture: "https://example.com/org.png",
		preferred_username: "organization",
	};
	const profile = {
		sub: "hf-user",
		name: "User",
		preferred_username: "user",
		profile: "https://huggingface.co/user",
		picture: "https://example.com/avatar.png",
		isPro: false,
		orgs: [organization],
	};
	assertType<HuggingFaceProfile>(profile);
	assertType<NonNullable<HuggingFaceProfile["orgs"]>>([
		{ ...organization, plan: "team" },
		{ ...organization, isEnterprise: "plus" },
	]);
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
