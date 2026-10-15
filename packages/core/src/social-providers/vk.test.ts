import { assertType, expect, it } from "vitest";
import type { VkProfile } from "./vk";
import { vk } from "./vk";

/**
 * @see https://github.com/VKCOM/vkid-web-sdk/blob/8ff76cfe59ea72e370c4c6c3b40712ecfd43aadd/src/auth/types.ts#L163-L177
 */
it("accepts VK phone numbers as strings", async () => {
	const profile = {
		user: {
			user_id: "vk-user",
			first_name: "Jane",
			last_name: "Doe",
			birthday: "01.01.2000",
			phone: "+79991234567",
		},
	};
	assertType<VkProfile>(profile);
	const provider = vk({
		clientId: "vk-app",
		getUserInfo: async () => ({
			user: { name: profile.user.first_name, emailVerified: false },
			data: profile,
		}),
	});

	const result = await provider.getUserInfo({ accessToken: "access-token" });

	expect(result?.data.user.phone).toBe("+79991234567");
});
