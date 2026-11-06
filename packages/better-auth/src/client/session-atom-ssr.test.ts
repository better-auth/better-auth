// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { getGlobalBroadcastChannel } from "./broadcast-channel";
import { getGlobalFocusManager } from "./focus-manager";
import { getGlobalOnlineManager } from "./online-manager";
import { getSessionAtom } from "./session-atom";

describe("getSessionAtom SSR", () => {
	afterEach(() => {
		delete (globalThis as any)[Symbol.for("better-auth:broadcast-channel")];
		delete (globalThis as any)[Symbol.for("better-auth:focus-manager")];
		delete (globalThis as any)[Symbol.for("better-auth:online-manager")];
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/12233
	 */
	it("does not retain global refresh listeners across server mounts", () => {
		const $fetch = vi.fn(async () => ({ data: null, error: null }));
		const broadcast = getGlobalBroadcastChannel() as {
			listeners: Set<unknown>;
		};
		const focus = getGlobalFocusManager() as { listeners: Set<unknown> };
		const online = getGlobalOnlineManager() as { listeners: Set<unknown> };

		for (let i = 0; i < 3; i++) {
			const { session } = getSessionAtom($fetch as never);
			const unsubscribe = session.subscribe(() => {});
			unsubscribe();
		}

		expect(broadcast.listeners.size).toBe(0);
		expect(focus.listeners.size).toBe(0);
		expect(online.listeners.size).toBe(0);
		expect($fetch).not.toHaveBeenCalled();
	});
});
