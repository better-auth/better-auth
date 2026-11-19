import { describe, expect, it, onTestFinished, vi } from "vitest";
import { betterAuth } from "../../auth/full";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { inferOrgAdditionalFields, organizationClient } from "./client";
import { organization } from "./organization";

describe("organization", () => {
	const auth = betterAuth({
		plugins: [
			organization({
				schema: {
					organization: {
						additionalFields: {
							newField: {
								type: "string",
							},
						},
					},
				},
			}),
		],
	});

	it("should infer additional fields", async () => {
		const client = createAuthClient({
			plugins: [
				organizationClient({
					schema: inferOrgAdditionalFields<typeof auth>(),
				}),
			],
			fetchOptions: {
				customFetchImpl: async () => new Response(),
			},
		});
		client.organization.create({
			name: "Test",
			slug: "test",
			newField: "123", //this should be allowed
			//@ts-expect-error - this field is not available
			unavailableField: "123", //this should be not allowed
		});
	});

	it("should infer filed when schema is provided", () => {
		const client = createAuthClient({
			plugins: [
				organizationClient({
					schema: inferOrgAdditionalFields({
						organization: {
							additionalFields: {
								newField: {
									type: "string",
								},
							},
						},
					}),
				}),
			],
			fetchOptions: {
				customFetchImpl: async () => new Response(),
			},
		});

		client.organization.create({
			name: "Test",
			slug: "test",
			newField: "123", //this should be allowed
			//@ts-expect-error - this field is not available
			unavailableField: "123", //this should be not allowed
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/9710
 */
it("refreshes the active organization after sign-in sets it in a session hook", async () => {
	let initialOrganizationId: string | undefined;
	const { auth, client, runWithUser, testUser, sessionSetter } =
		await getTestInstance(
			{
				plugins: [organization()],
				databaseHooks: {
					session: {
						create: {
							before: async (session) => ({
								data: {
									...session,
									activeOrganizationId: initialOrganizationId,
								},
							}),
						},
					},
				},
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);

	await runWithUser(testUser.email, testUser.password, async (headers) => {
		const organization = await auth.api.createOrganization({
			body: { name: "Test Workspace", slug: "test-workspace" },
			headers,
		});
		if (!organization) throw new Error("Organization was not created");
		initialOrganizationId = organization.id;
		headers.delete("cookie");

		const previousWindow = global.window;
		global.window = {} as Window & typeof globalThis;
		onTestFinished(() => {
			global.window = previousWindow;
		});

		const activeOrganization = client.$store.atoms.activeOrganization;
		if (!activeOrganization)
			throw new Error("Active organization atom missing");
		const unsubscribe = activeOrganization.subscribe(() => {});
		onTestFinished(unsubscribe);
		await vi.waitFor(() => {
			expect(activeOrganization.get().isPending).toBe(false);
		});
		expect(activeOrganization.get().data).toBeNull();

		const result = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: { onSuccess: sessionSetter(headers) },
		});
		expect(result.error).toBeNull();

		const fullOrganization = await auth.api.getFullOrganization({ headers });
		expect(fullOrganization?.id).toBe(initialOrganizationId);

		await vi.waitFor(() => {
			expect(activeOrganization.get().data?.id).toBe(initialOrganizationId);
		});
	});
});

describe("active organization during an auth change", () => {
	type OrganizationState = {
		isPending: boolean;
		isRefetching: boolean;
		id: string | undefined;
	};

	function deferred() {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		return {
			promise,
			resolve,
		};
	}

	// Yields a full task, so a request that does not wait for the caller runs first.
	const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve));

	const test = it
		.extend("window", { auto: true }, ({}, { onCleanup }) => {
			const previousWindow = global.window;
			global.window = {} as Window & typeof globalThis;
			onCleanup(() => {
				global.window = previousWindow;
			});
		})
		.extend("startSignedIn", true)
		.extend("instance", async ({ startSignedIn }, { onCleanup }) => {
			// The client keeps its own cookie jar, so a test controls when the
			// credentials from a sign-in become visible to later requests.
			const jar = new Headers();
			let activeOrganizationId: string | undefined;
			let beforeOrganizationResponse = async () => {};
			const instance = await getTestInstance(
				{
					plugins: [organization()],
					databaseHooks: {
						session: {
							create: {
								before: async (session) => ({
									data: {
										...session,
										activeOrganizationId,
									},
								}),
							},
						},
					},
				},
				{
					clientOptions: {
						plugins: [
							organizationClient(),
							{
								id: "cookie-jar",
								fetchPlugins: [
									{
										id: "cookie-jar",
										name: "cookie-jar",
										hooks: {
											onRequest(context) {
												const cookie = jar.get("cookie");
												if (cookie) context.headers.set("cookie", cookie);
												return context;
											},
											async onResponse(context) {
												if (
													!context.request.url
														.toString()
														.includes("/organization/get-full-organization")
												)
													return;
												await beforeOrganizationResponse();
											},
										},
									},
								],
							},
						],
					},
				},
			);
			const { headers } = await instance.signInWithTestUser();
			const setCookie = instance.sessionSetter(jar);
			const { client, testUser } = instance;
			const signIn = () =>
				client.signIn.email({
					email: testUser.email,
					password: testUser.password,
					fetchOptions: {
						onSuccess: setCookie,
					},
				});
			if (startSignedIn) {
				await signIn();
				// Like an app, read the session somewhere so it is known signed in.
				const session = client.useSession;
				onCleanup(session.subscribe(() => {}));
				await expect.poll(() => session.get().data).not.toBeNull();
			}
			const activeOrganization = client.useActiveOrganization;
			return {
				client,
				testUser,
				setCookie,
				signIn,
				activeOrganization,
				current(): OrganizationState {
					const state = activeOrganization.get();
					return {
						isPending: state.isPending,
						isRefetching: state.isRefetching,
						id: state.data?.id,
					};
				},
				async createOrganization(slug: string) {
					const created = await instance.auth.api.createOrganization({
						body: {
							name: slug,
							slug,
							keepCurrentActiveOrganization: true,
						},
						headers,
					});
					if (!created) throw new Error("Organization was not created");
					return created;
				},
				// Sessions created from now on start with this active organization.
				activateOnSignIn(id: string) {
					activeOrganizationId = id;
				},
				beforeOrganizationResponse(next: typeof beforeOrganizationResponse) {
					beforeOrganizationResponse = next;
				},
			};
		})
		// Every active organization state after the initial load, while a
		// component reads it.
		.extend("states", async ({ instance }, { onCleanup }) => {
			const loaded: OrganizationState[] = [];
			const unsubscribe = instance.activeOrganization.subscribe(() => {
				loaded.push(instance.current());
			});
			await expect
				.poll(() => loaded.at(-1))
				.toMatchObject({
					isPending: false,
					isRefetching: false,
				});
			const states: OrganizationState[] = [];
			const unlisten = instance.activeOrganization.listen(() => {
				states.push(instance.current());
			});
			onCleanup(() => {
				unlisten();
				unsubscribe();
			});
			return states;
		});

	const loaded = (id: string | undefined): OrganizationState => ({
		isPending: false,
		isRefetching: false,
		id,
	});

	test("reports a refetch of a missing organization through isRefetching only", async ({
		instance: { activeOrganization },
		states,
	}) => {
		await activeOrganization.get().refetch();

		expect(states).toContainEqual({
			isPending: false,
			isRefetching: true,
			id: undefined,
		});
		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});

	test("stays settled through a data-only organization call", async ({
		instance: { client },
		states,
	}) => {
		await client.organization.list();

		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});

	test("stays settled when the user is updated without an organization", async ({
		instance: { client },
		states,
	}) => {
		const result = await client.updateUser({ name: "Renamed" });

		expect(result.error).toBeNull();
		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});

	test("resolves setActive with the organization loaded", async ({
		instance: { client, current, createOrganization },
		states,
	}) => {
		const target = await createOrganization("target");

		await client.organization.setActive({ organizationId: target.id });

		expect(current()).toEqual(loaded(target.id));
		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});

	test("waits for a request that replaced the setActive refetch", async ({
		instance: {
			client,
			current,
			activeOrganization,
			createOrganization,
			beforeOrganizationResponse,
		},
		states,
	}) => {
		const target = await createOrganization("target");
		let replaced = false;
		beforeOrganizationResponse(async () => {
			if (replaced) {
				// Let the replaced request finish first.
				await nextTask();
				return;
			}
			replaced = true;
			void activeOrganization.get().refetch();
		});

		await client.organization.setActive({ organizationId: target.id });

		expect(current()).toEqual(loaded(target.id));
		expect(states).not.toContainEqual(
			expect.objectContaining({ isPending: true }),
		);
	});

	describe("on sign-in", () => {
		test.override("startSignedIn", false);

		test("resolves with the organization loaded", async ({
			instance: {
				client,
				testUser,
				setCookie,
				current,
				activeOrganization,
				createOrganization,
				activateOnSignIn,
			},
			states,
		}) => {
			const workspace = await createOrganization("workspace");
			activateOnSignIn(workspace.id);

			let refetched: OrganizationState | undefined;
			await client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: {
					async onSuccess(context) {
						// A read sent before the credentials are stored.
						await activeOrganization.get().refetch();
						refetched = current();
						setCookie(context);
					},
				},
			});

			expect(refetched).toMatchObject({
				isPending: true,
				id: undefined,
			});
			expect(current()).toEqual(loaded(workspace.id));
			// A settled missing organization would bounce guarded pages.
			expect(states).not.toContainEqual(loaded(undefined));
		});

		test("resolves overlapping sign-ins with the organization loaded", async ({
			instance: {
				client,
				testUser,
				setCookie,
				signIn,
				current,
				createOrganization,
				activateOnSignIn,
			},
			states,
		}) => {
			const workspace = await createOrganization("workspace");
			activateOnSignIn(workspace.id);
			const entered = deferred();
			const released = deferred();
			const first = client.signIn.email({
				email: testUser.email,
				password: testUser.password,
				fetchOptions: {
					async onSuccess(context) {
						entered.resolve();
						await released.promise;
						setCookie(context);
					},
				},
			});
			await entered.promise;

			await signIn();
			const afterSecond = current();
			released.resolve();
			const result = await first;

			expect(afterSecond).toEqual(loaded(workspace.id));
			expect(result.error).toBeNull();
			expect(current()).toEqual(loaded(workspace.id));
			expect(states).not.toContainEqual(loaded(undefined));
		});
	});
});
