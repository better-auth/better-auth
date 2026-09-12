// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { act, createElement, StrictMode, Suspense } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testClientPlugin } from "../test-plugin";
import { createAuthClient } from "./index";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("React auth query Suspense", () => {
	let root: Root | undefined;

	afterEach(async () => {
		if (root) {
			await act(async () => {
				root?.unmount();
			});
		}
		root = undefined;
		document.body.innerHTML = "";
	});

	async function render(node: ReactNode) {
		const container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		await act(async () => {
			root?.render(node);
		});
		return container;
	}

	it("suspends on the initial session request without fetching twice", async () => {
		let fetchCount = 0;
		let resolveRequest: ((response: Response) => void) | undefined;
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async () => {
					fetchCount++;
					return new Promise<Response>((resolve) => {
						resolveRequest = resolve;
					});
				},
			},
		});

		function Session() {
			const session = client.useSession();
			expect(Object.hasOwn(session, "isPending")).toBe(false);
			return createElement("p", null, session.data?.user.email ?? "signed-out");
		}

		const container = await render(
			createElement(
				StrictMode,
				null,
				createElement(
					Suspense,
					{ fallback: createElement("p", null, "loading") },
					createElement(Session),
				),
			),
		);

		await vi.waitFor(() => {
			expect(container.textContent).toBe("loading");
			expect(fetchCount).toBe(1);
		});

		const resolveInitialRequest = resolveRequest;
		if (!resolveInitialRequest)
			throw new Error("Session request did not start");
		await act(async () => {
			resolveInitialRequest(
				new Response(
					JSON.stringify({
						user: { id: "user-1", email: "user@example.com" },
						session: { id: "session-1" },
					}),
				),
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toBe("user@example.com");
			expect(fetchCount).toBe(1);
		});
	});

	it("keeps revealed session content visible during a refetch", async () => {
		let fetchCount = 0;
		let resolveInitialRequest: ((response: Response) => void) | undefined;
		let resolveRefetch: ((response: Response) => void) | undefined;
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async () => {
					fetchCount++;
					if (fetchCount === 1) {
						return new Promise<Response>((resolve) => {
							resolveInitialRequest = resolve;
						});
					}
					return new Promise<Response>((resolve) => {
						resolveRefetch = resolve;
					});
				},
			},
		});
		let refetch: (() => Promise<void>) | undefined;

		function Session() {
			const session = client.useSession();
			refetch = session.refetch;
			return createElement(
				"p",
				null,
				`${session.data?.user.email}:${session.isRefetching}`,
			);
		}

		const container = await render(
			createElement(
				Suspense,
				{ fallback: createElement("p", null, "loading") },
				createElement(Session),
			),
		);

		await vi.waitFor(() => {
			expect(container.textContent).toBe("loading");
			expect(resolveInitialRequest).toBeTypeOf("function");
		});

		const resolveInitialSession = resolveInitialRequest;
		if (!resolveInitialSession) {
			throw new Error("Initial session request did not start");
		}
		await act(async () => {
			resolveInitialSession(
				new Response(
					JSON.stringify({
						user: { id: "user-1", email: "user@example.com" },
						session: { id: "session-1" },
					}),
				),
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toBe("user@example.com:false");
		});

		if (!refetch) throw new Error("Session did not render");
		await act(async () => {
			void refetch?.();
		});

		await vi.waitFor(() => {
			expect(container.textContent).toBe("user@example.com:true");
			expect(container.textContent).not.toBe("loading");
		});

		const resolvePendingRefetch = resolveRefetch;
		if (!resolvePendingRefetch) throw new Error("Refetch did not start");
		await act(async () => {
			resolvePendingRefetch(
				new Response(
					JSON.stringify({
						user: { id: "user-1", email: "updated@example.com" },
						session: { id: "session-1" },
					}),
				),
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toBe("updated@example.com:false");
		});
	});

	it("reveals fetch errors through the query result", async () => {
		let resolveRequest: ((response: Response) => void) | undefined;
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async () =>
					new Promise<Response>((resolve) => {
						resolveRequest = resolve;
					}),
			},
		});

		function Session() {
			const session = client.useSession();
			return createElement(
				"p",
				null,
				session.error ? `error:${session.error.status}` : "ready",
			);
		}

		const container = await render(
			createElement(
				Suspense,
				{ fallback: createElement("p", null, "loading") },
				createElement(Session),
			),
		);

		await vi.waitFor(() => {
			expect(container.textContent).toBe("loading");
			expect(resolveRequest).toBeTypeOf("function");
		});

		const resolveErrorRequest = resolveRequest;
		if (!resolveErrorRequest) throw new Error("Session request did not start");
		await act(async () => {
			resolveErrorRequest(
				new Response(JSON.stringify({ message: "Server error" }), {
					status: 500,
				}),
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toBe("error:500");
		});
	});

	it("suspends plugin query hooks but not ordinary plugin atoms", async () => {
		let resolveRequest: ((response: Response) => void) | undefined;
		const client = createAuthClient({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async () =>
					new Promise<Response>((resolve) => {
						resolveRequest = resolve;
					}),
			},
		});

		function Query() {
			const query = client.useQueryAtom();
			const computedValue = client.useComputedAtom();
			expect(Object.hasOwn(query, "isPending")).toBe(false);
			return createElement(
				"p",
				null,
				`${query.data?.message}:${computedValue}`,
			);
		}

		const container = await render(
			createElement(
				Suspense,
				{ fallback: createElement("p", null, "loading") },
				createElement(Query),
			),
		);

		await vi.waitFor(() => {
			expect(container.textContent).toBe("loading");
			expect(resolveRequest).toBeTypeOf("function");
		});

		const resolvePluginRequest = resolveRequest;
		if (!resolvePluginRequest) throw new Error("Plugin query did not start");
		await act(async () => {
			resolvePluginRequest(
				new Response(JSON.stringify({ message: "plugin-ready" })),
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toBe("plugin-ready:0");
		});
	});
});
