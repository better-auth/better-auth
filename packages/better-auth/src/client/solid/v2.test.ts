import { atom, onStart } from "nanostores";
import { createMemo, createRoot, flush } from "solid-js-v2";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthClient } from "./v2";

describe("Solid 2 client", () => {
	it("updates useSession when the server returns a session and then null", async () => {
		const fetchSession = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(
				Response.json({ user: { name: "Ada" }, session: { id: "session" } }),
			)
			.mockResolvedValueOnce(Response.json(null));
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			fetchOptions: { customFetchImpl: fetchSession },
		});
		const { dispose, session } = createRoot((dispose) => ({
			dispose,
			session: client.useSession(),
		}));
		expect(session().data).toBeNull();
		await session().refetch();
		flush();
		expect(session().data?.user.name).toBe("Ada");
		expect(session().isPending).toBe(false);
		await session().refetch();
		flush();
		expect(session().data).toBeNull();
		dispose();
	});

	it("subscribes to the mounted value, tracks individual fields and disposes the subscription", () => {
		const profile = atom({ user: { name: "initial" }, pending: true });
		const start = vi.fn(() => {
			profile.set({ user: { name: "mounted" }, pending: false });
		});
		onStart(profile, start);
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [{ id: "profile", getAtoms: () => ({ profile }) }],
		});

		const { dispose, profileState, name, readName } = createRoot((dispose) => {
			const profileState = client.useProfile();
			const readName = vi.fn(() => profileState().user.name);
			const name = createMemo(readName);
			return { dispose, profileState, name, readName };
		});

		expectTypeOf(profileState().user.name).toEqualTypeOf<string>();
		expect(name()).toBe("mounted");
		expect(start).toHaveBeenCalledOnce();
		const reads = readName.mock.calls.length;
		profile.set({ user: { name: "mounted" }, pending: true });
		flush();
		expect(profileState().pending).toBe(true);
		expect(name()).toBe("mounted");
		expect(readName).toHaveBeenCalledTimes(reads);

		profile.set({ user: { name: "updated" }, pending: false });
		flush();
		expect(name()).toBe("updated");
		dispose();
		expect(profile.lc).toBe(0);
	});

	it("exposes function-valued plugin atoms without invoking them", () => {
		const first = vi.fn(() => "first");
		const second = vi.fn(() => "second");
		const callback = atom(first);
		const client = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [{ id: "callback", getAtoms: () => ({ callback }) }],
		});
		const { dispose, value } = createRoot((dispose) => ({
			dispose,
			value: client.useCallback(),
		}));
		expect(value()).toBe(first);
		callback.set(second);
		flush();
		expect(value()).toBe(second);
		expect(first).not.toHaveBeenCalled();
		expect(second).not.toHaveBeenCalled();
		dispose();
	});
});
