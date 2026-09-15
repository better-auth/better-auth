import { describe, expect, it, vi } from "vitest";
import { safeCloneRequest } from "./request";

describe("safeCloneRequest", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10335
	 */
	it("returns a bodyless request when cloning throws", async () => {
		const originalClone = Request.prototype.clone;
		const cloneSpy = vi
			.spyOn(Request.prototype, "clone")
			.mockImplementation(function (this: Request) {
				if (this.url === "http://localhost/clone-throws") {
					throw new TypeError("unusable");
				}
				return originalClone.call(this);
			});

		const request = new Request("http://localhost/clone-throws", {
			method: "POST",
			body: "{}",
		});

		try {
			const fallbackRequest = safeCloneRequest(request);

			expect(fallbackRequest).not.toBe(request);
			expect(fallbackRequest?.method).toBe("POST");
			expect(fallbackRequest?.url).toBe("http://localhost/clone-throws");
			await expect(fallbackRequest?.text()).resolves.toBe("");
		} finally {
			cloneSpy.mockRestore();
		}
	});
});
