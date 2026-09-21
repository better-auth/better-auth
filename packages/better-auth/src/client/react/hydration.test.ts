// @vitest-environment node

import { organizationClient } from "better-auth/client/plugins";
import { organization } from "better-auth/plugins";
import {
	createAuthClient as createReactClient,
	useStore,
} from "better-auth/react";
import { getTestInstance } from "better-auth/test";
import { Window } from "happy-dom";
import { atom, cleanStores, computed } from "nanostores";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const roots: Root[] = [];
const stores: Parameters<typeof cleanStores> = [];

beforeEach(() => {
	vi.useFakeTimers();
	const window = new Window();
	// Keep Node's HTTP globals: browser Headers hide Set-Cookie from the test client.
	vi.stubGlobal("window", window);
	vi.stubGlobal("document", window.document);
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
	await act(async () => {
		for (const root of roots.splice(0)) root.unmount();
	});
	cleanStores(...stores.splice(0));
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10972
 */
describe("React auth query hydration", () => {
	it("hydrates the generated useSession hook with its server snapshot", async () => {
		const client = createReactClient({
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl: async () =>
					new Response(JSON.stringify(null), {
						headers: { "content-type": "application/json" },
					}),
			},
		});
		stores.push(client.$store.atoms.session);
		const renderedPendingStates: boolean[] = [];

		function SaveButton() {
			const { isPending } = client.useSession();
			renderedPendingStates.push(isPending);
			return createElement(
				"button",
				{ "aria-disabled": isPending },
				isPending ? "Loading" : "Save",
			);
		}

		const container = document.createElement("div");
		container.innerHTML = renderToString(createElement(SaveButton));
		expect(container.innerHTML).toBe(
			'<button aria-disabled="true">Loading</button>',
		);

		const earlyContainer = document.createElement("div");
		const earlyRoot = createRoot(earlyContainer);
		roots.push(earlyRoot);
		await act(async () => {
			earlyRoot.render(createElement(SaveButton));
			await vi.runAllTimersAsync();
		});
		expect(earlyContainer.textContent).toBe("Save");

		renderedPendingStates.length = 0;
		const onRecoverableError = vi.fn();
		await act(async () => {
			roots.push(
				hydrateRoot(container, createElement(SaveButton), {
					onRecoverableError,
				}),
			);
		});

		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(renderedPendingStates[0]).toBe(true);
		expect(container.textContent).toBe("Save");
	});

	it.each([
		"signed in",
		"signed out",
	])("hydrates a late session subscriber after the session resolves %s", async (status) => {
		const { client, signInWithTestUser } = await getTestInstance();
		stores.push(client.useSession);

		function Session() {
			const { data, isPending } = useStore(client.useSession);
			return createElement(
				isPending ? "span" : "p",
				null,
				isPending ? "Loading" : data ? data.user.email : "Signed out",
			);
		}

		const container = document.createElement("div");
		container.innerHTML = renderToString(createElement(Session));
		expect(container.innerHTML).toBe("<span>Loading</span>");
		const early = document.createElement("div");
		const earlyRoot = createRoot(early);
		roots.push(earlyRoot);
		await act(async () => earlyRoot.render(createElement(Session)));

		await act(async () => {
			if (status === "signed in") {
				const { runWithUser } = await signInWithTestUser();
				await runWithUser(async () => client.useSession.get().refetch());
			} else {
				await client.useSession.get().refetch();
			}
		});
		expect(client.useSession.get().isPending).toBe(false);
		expect(early.textContent).toBe(
			status === "signed in" ? "test@test.com" : "Signed out",
		);

		const onRecoverableError = vi.fn();
		await act(async () => {
			roots.push(
				hydrateRoot(container, createElement(Session), { onRecoverableError }),
			);
		});
		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(container.innerHTML).toBe(early.innerHTML);
	});

	it("hydrates a session seeded with hydrateSession before the first subscriber", async () => {
		const { client, auth, signInWithTestUser } = await getTestInstance();
		stores.push(client.useSession);
		function Session() {
			const { data, isPending } = useStore(client.useSession);
			return createElement("p", null, isPending ? "Loading" : data?.user.email);
		}
		const container = document.createElement("div");
		container.innerHTML = renderToString(createElement(Session));
		const { headers } = await signInWithTestUser();
		const session = await auth.api.getSession({ headers });
		expect(session).not.toBeNull();
		client.hydrateSession(session);
		const onRecoverableError = vi.fn();
		await act(async () => {
			roots.push(
				hydrateRoot(container, createElement(Session), { onRecoverableError }),
			);
		});
		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(container.textContent).toBe("test@test.com");
	});

	it("hydrates a resolved organization query and keeps subsequent updates", async () => {
		const { client } = await getTestInstance(
			{ plugins: [organization()] },
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const query = client.useListOrganizations;
		stores.push(query);
		function Organizations() {
			const { data, isPending } = useStore(query);
			return createElement(
				"p",
				null,
				isPending ? "Loading" : `${data?.length ?? 0} organizations`,
			);
		}
		const container = document.createElement("div");
		container.innerHTML = renderToString(createElement(Organizations));
		query.set({ ...query.get(), data: [], isPending: false });
		const onRecoverableError = vi.fn();
		await act(async () => {
			roots.push(
				hydrateRoot(container, createElement(Organizations), {
					onRecoverableError,
				}),
			);
		});
		expect(onRecoverableError).not.toHaveBeenCalled();
		expect(container.textContent).toBe("0 organizations");
		await act(async () => query.set({ ...query.get(), isPending: true }));
		expect(container.textContent).toBe("Loading");
	});

	it("preserves live SSR values for ordinary and computed plugin stores", async () => {
		const label = atom<string | undefined>(undefined);
		label.set("Ready");
		const length = computed(label, (value) => value?.length ?? 0);
		const count = atom(1);
		count.set(2);
		const { client } = await getTestInstance(
			{},
			{
				clientOptions: {
					plugins: [
						{ id: "ssr-stores", getAtoms: () => ({ label, length, count }) },
					],
				},
			},
		);
		stores.push(label, length, count);
		function Values() {
			return createElement(
				"p",
				null,
				`${useStore(client.useLabel)}: ${useStore(client.useLength)}, ${useStore(client.useCount)}`,
			);
		}
		expect(renderToString(createElement(Values))).toBe("<p>Ready: 5, 2</p>");
	});
});
