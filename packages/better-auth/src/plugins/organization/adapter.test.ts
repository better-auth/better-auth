import type { AuthContext } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import type { User } from "../../types";
import { getOrgAdapter } from "./adapter";

/**
 * @see https://github.com/better-auth/better-auth/issues/10024
 *
 * `createInvitation` must not generate the invitation id itself. Like
 * `createMember`/`createOrganization`/`createTeam`, it should leave the id out
 * of the create payload so the adapter decides — letting a UUID-native database
 * (`generateId: "uuid"` + `supportsUUIDs`) own id generation. The recording stub
 * captures what the org adapter hands the adapter layer, before any field
 * transform, so the asymmetry is observable without a real database.
 */

const APP_GENERATED_ID = "app-generated-id";

type CreateCall = {
	model: string;
	data: Record<string, any>;
	forceAllowId?: boolean;
};

function setup() {
	const calls: CreateCall[] = [];
	const adapter = {
		create: async ({ model, data, forceAllowId }: CreateCall) => {
			calls.push({ model, data, forceAllowId });
			return { id: data.id ?? "db-generated-id", ...data };
		},
	};
	const context = {
		adapter,
		generateId: () => APP_GENERATED_ID,
	} as unknown as AuthContext;
	const orgAdapter = getOrgAdapter(context);
	const lastCreate = (model: string) =>
		calls.filter((call) => call.model === model).at(-1)!;
	return { orgAdapter, lastCreate };
}

const user = { id: "inviter-1" } as User;
const invitationInput = {
	email: "invitee@example.com",
	role: "member",
	organizationId: "org-1",
	teamIds: [] as string[],
};

describe("getOrgAdapter createInvitation id handling", () => {
	it("does not inject an app-generated id, deferring to the adapter/database", async () => {
		const { orgAdapter, lastCreate } = setup();

		await orgAdapter.createInvitation({ invitation: invitationInput, user });

		const call = lastCreate("invitation");
		expect(call.data).not.toHaveProperty("id");
		expect(call.forceAllowId).toBe(true);
	});

	it("defers id generation the same way createMember does", async () => {
		const { orgAdapter, lastCreate } = setup();

		await orgAdapter.createMember({
			organizationId: "org-1",
			userId: "user-1",
			role: "member",
		} as any);

		expect(lastCreate("member").data).not.toHaveProperty("id");
	});

	it("still honors a caller-provided id (e.g. from beforeCreateInvitation)", async () => {
		const { orgAdapter, lastCreate } = setup();

		await orgAdapter.createInvitation({
			invitation: { ...invitationInput, id: "caller-provided-id" },
			user,
		});

		const call = lastCreate("invitation");
		expect(call.data.id).toBe("caller-provided-id");
		expect(call.forceAllowId).toBe(true);
	});
});
