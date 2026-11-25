// @vitest-environment happy-dom

import {
	captureArtifact,
	expectDiagnostic,
	expectNoDiagnostics,
} from "@solidjs/diagnostics";
import { createRoot, createSignal, isPending, resolve } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { testClientPlugin } from "../test-plugin";
import { createAuthClient } from "./index";

function createClient() {
	return createAuthClient({
		plugins: [testClientPlugin()],
		baseURL: "http://localhost:3000",
		fetchOptions: {
			customFetchImpl: async () =>
				new Response(
					JSON.stringify({
						user: { id: "1", email: "test@email.com" },
						session: { id: "session-1" },
					}),
				),
		},
	});
}

const wait = (ms: number) =>
	new Promise<void>((done) => {
		setTimeout(done, ms);
	});

/**
 * Solid's dev builds report reactive anti-patterns as coded diagnostics; any
 * code emitted by the adapter is a defect.
 *
 * @see https://docs.solidjs.com/reference/solid-js/diagnostics
 */
describe("solid-v2 reactive diagnostics", () => {
	afterEach(() => {
		for (const key of [
			"better-auth:broadcast-channel",
			"better-auth:focus-manager",
			"better-auth:online-manager",
		]) {
			Reflect.deleteProperty(globalThis, Symbol.for(key));
		}
	});

	it("captures a known defect (control)", async () => {
		const { artifact } = await captureArtifact(
			() => {
				createRoot((dispose) => {
					const [, setCount] = createSignal(0);
					try {
						setCount(1);
					} catch {
						// Dev builds throw as well as report; the report is under test.
					}
					dispose();
				});
			},
			{ scenario: "owned-write-control", attribution: false },
		);
		expectDiagnostic(artifact, "REACTIVE_WRITE_IN_OWNED_SCOPE");
	});

	it("a session lifecycle emits no diagnostics", async () => {
		const client = createClient();
		const { artifact, result } = await captureArtifact(
			async () => {
				const { session, computed, dispose } = createRoot((dispose) => ({
					session: client.useSession(),
					computed: client.useComputedAtom(),
					dispose,
				}));
				await wait(10);
				const email = (await resolve(() => session()))?.user.email;
				const refetching = session.refetch();
				const pendingDuringRefetch = isPending(() => session());
				await refetching;
				const readComputed = computed();
				dispose();
				return { email, pendingDuringRefetch, readComputed };
			},
			{ scenario: "session-lifecycle", attribution: false },
		);
		expect(result).toEqual({
			email: "test@email.com",
			pendingDuringRefetch: true,
			readComputed: expect.any(Number),
		});
		expectNoDiagnostics(artifact);
	});
});
