import { expectTypeOf, it } from "vitest";
import type { VkProfile } from "./vk";

/**
 * @see https://github.com/VKCOM/vkid-web-sdk/blob/8ff76cfe59ea72e370c4c6c3b40712ecfd43aadd/src/auth/types.ts#L163-L177
 */
it("types VK phone numbers as optional strings", () => {
	expectTypeOf<VkProfile["user"]["phone"]>().toEqualTypeOf<
		string | undefined
	>();
});
