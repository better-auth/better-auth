// @vitest-environment happy-dom
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { createAuthClient } from "./index";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10972
 */
it("hydrates useSession with the pending state the server rendered", async () => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl: () => new Promise<Response>(() => {}),
		},
	});
	const rendered: boolean[] = [];
	const SaveButton = () => {
		const { isPending } = client.useSession();
		rendered.push(isPending);
		return createElement(
			"button",
			{ "aria-disabled": isPending },
			isPending ? "loading" : "save",
		);
	};

	const html = renderToString(createElement(SaveButton));
	expect(html).toContain('aria-disabled="true"');

	// A subscriber higher in the tree already resolved the session before this
	// subtree hydrates.
	const now = new Date();
	client.hydrateSession({
		user: {
			id: "user-id",
			name: "Test User",
			email: "test@example.com",
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		},
		session: {
			id: "session-id",
			userId: "user-id",
			token: "token",
			expiresAt: now,
			createdAt: now,
			updatedAt: now,
		},
	});
	expect(client.$store.atoms.session!.get().isPending).toBe(false);

	const container = document.createElement("div");
	container.innerHTML = html;
	const onRecoverableError = vi.fn();
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
	rendered.length = 0;
	let root: Root | undefined;
	await act(async () => {
		root = hydrateRoot(container, createElement(SaveButton), {
			onRecoverableError,
		});
	});

	expect(onRecoverableError).not.toHaveBeenCalled();
	expect(consoleError).not.toHaveBeenCalled();
	// The hydration render matches the server, then the live value lands.
	expect(rendered[0]).toBe(true);
	const button = container.querySelector("button");
	expect(button?.getAttribute("aria-disabled")).toBe("false");
	expect(button?.textContent).toBe("save");

	await act(async () => root?.unmount());
});
