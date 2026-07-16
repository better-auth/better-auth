import { expect } from "vitest";

const SCIM_MEDIA_TYPE = "application/scim+json";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

type SCIMMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface SCIMRequestInit {
	method?: SCIMMethod;
	body?: unknown;
}

interface SCIMMeta {
	location: string;
	resourceType: string;
}

interface SCIMUserResource {
	schemas: string[];
	id: string;
	externalId?: string;
	userName: string;
	displayName: string;
	active: boolean;
	meta: SCIMMeta;
}

interface SCIMGroupMemberResource {
	value: string;
	type: string;
	$ref: string;
}

interface SCIMGroupResource {
	schemas: string[];
	id: string;
	externalId?: string;
	displayName: string;
	members?: SCIMGroupMemberResource[];
	meta: SCIMMeta;
}

interface SCIMListResponse<Resource> {
	schemas: string[];
	totalResults: number;
	startIndex: number;
	itemsPerPage: number;
	Resources: Resource[];
}

interface SCIMServiceProviderConfig {
	schemas: string[];
	patch: { supported: boolean };
	filter: { supported: boolean };
	meta: SCIMMeta;
}

interface SCIMErrorResponse {
	schemas: string[];
	status: string;
	detail?: string;
}

/** Observable lifecycle boundaries for database and application-state oracles. */
export type SCIMLifecycleCheckpoint =
	| "group-created"
	| "failed-add-rolled-back"
	| "member-added"
	| "okta-member-removed"
	| "entra-member-removed"
	| "member-restored"
	| "user-deactivated"
	| "user-reactivated"
	| "populated-user-deleted"
	| "user-reprovisioned"
	| "reprovisioned-member-added"
	| "populated-group-deleted"
	| "lifecycle-complete";

/** Input for the reusable SCIM black-box lifecycle contract. */
export interface SCIMLifecycleOptions {
	/** Better Auth origin exposed by a real HTTP listener. */
	baseURL: string;
	/** Bearer credential for the SCIM connection under test. */
	token: string;
	/** Stable suffix that isolates resources created by this execution. */
	testId: string;
	/** Optional harness control used to prove a failed Group mutation rolls back. */
	projectionFailure?: {
		enable: () => void;
		disable: () => void;
	};
	/** Optional out-of-band oracle invoked after each verified HTTP boundary. */
	onCheckpoint?: (checkpoint: SCIMLifecycleCheckpoint) => void | Promise<void>;
}

/** Identifiers created and deleted by a completed SCIM lifecycle. */
export interface SCIMLifecycleResult {
	userId: string;
	groupId: string;
	reprovisionedUserId: string;
	userLocation: string;
	groupLocation: string;
}

async function readJson<ResponseBody>(
	response: Response,
): Promise<ResponseBody> {
	return (await response.json()) as ResponseBody;
}

function expectSCIMResponse(response: Response, status: number): void {
	expect(response.status).toBe(status);
	if (status === 204) return;
	expect(response.headers.get("content-type")?.split(";", 1)[0]).toBe(
		SCIM_MEDIA_TYPE,
	);
}

async function expectSCIMErrorResponse(
	response: Response,
	status: number,
): Promise<SCIMErrorResponse> {
	expectSCIMResponse(response, status);
	const body = await readJson<SCIMErrorResponse>(response);
	expect(body).toMatchObject({
		schemas: [SCIM_ERROR_SCHEMA],
		status: status.toString(),
	});
	return body;
}

async function expectSCIMNoContent(response: Response): Promise<void> {
	expectSCIMResponse(response, 204);
	expect(await response.text()).toBe("");
}

function createSCIMRequest(baseURL: string, token: string) {
	return async (path: string, init: SCIMRequestInit = {}) => {
		const headers = new Headers({
			accept: SCIM_MEDIA_TYPE,
			authorization: `Bearer ${token}`,
		});
		if (init.body !== undefined) {
			headers.set("content-type", SCIM_MEDIA_TYPE);
		}
		return fetch(`${baseURL}${path}`, {
			method: init.method ?? "GET",
			headers,
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
		});
	};
}

function userFilterPath(userName: string): string {
	const query = new URLSearchParams({ filter: `userName eq "${userName}"` });
	return `/Users?${query.toString()}`;
}

/**
 * Executes one provider-shaped SCIM User and Group lifecycle exclusively over
 * HTTP. The runner has no access to Better Auth APIs or database internals.
 */
export async function runSCIMLifecycle(
	options: SCIMLifecycleOptions,
): Promise<SCIMLifecycleResult> {
	const origin = options.baseURL.replace(/\/$/, "");
	const scimBaseURL = `${origin}/api/auth/scim/v2`;
	const request = createSCIMRequest(scimBaseURL, options.token);
	const checkpoint = async (value: SCIMLifecycleCheckpoint) => {
		await options.onCheckpoint?.(value);
	};
	const userName = `${options.testId}.user@example.com`;
	const email = `${options.testId}.primary@example.com`;
	const userExternalId = `${options.testId}-directory-user`;
	const groupExternalId = `${options.testId}-finance-admins`;
	const userCreateBody = {
		schemas: [SCIM_USER_SCHEMA],
		externalId: userExternalId,
		userName,
		name: {
			formatted: "Ada Lovelace",
			givenName: "Ada",
			familyName: "Lovelace",
		},
		displayName: "Ada Lovelace",
		active: true,
		emails: [{ value: email, type: "work", primary: true }],
	};

	const unauthorized = await fetch(`${scimBaseURL}/Users`, {
		headers: { accept: SCIM_MEDIA_TYPE },
	});
	await expectSCIMErrorResponse(unauthorized, 401);
	expect(unauthorized.headers.get("www-authenticate")).toBe(
		'Bearer realm="SCIM"',
	);

	const discoveryResponse = await fetch(
		`${scimBaseURL}/ServiceProviderConfig`,
		{ headers: { accept: SCIM_MEDIA_TYPE } },
	);
	expectSCIMResponse(discoveryResponse, 200);
	const discovery =
		await readJson<SCIMServiceProviderConfig>(discoveryResponse);
	expect(discovery).toMatchObject({
		patch: { supported: true },
		filter: { supported: true },
		meta: {
			resourceType: "ServiceProviderConfig",
			location: `${scimBaseURL}/ServiceProviderConfig`,
		},
	});

	const initialListResponse = await request(userFilterPath(userName));
	expectSCIMResponse(initialListResponse, 200);
	expect(
		await readJson<SCIMListResponse<SCIMUserResource>>(initialListResponse),
	).toMatchObject({
		schemas: [SCIM_LIST_SCHEMA],
		totalResults: 0,
		Resources: [],
	});

	const createUserResponse = await request("/Users", {
		method: "POST",
		body: userCreateBody,
	});
	expectSCIMResponse(createUserResponse, 201);
	const createdUser = await readJson<SCIMUserResource>(createUserResponse);
	const userLocation = `${scimBaseURL}/Users/${encodeURIComponent(createdUser.id)}`;
	expect(createdUser).toMatchObject({
		schemas: [SCIM_USER_SCHEMA],
		externalId: userExternalId,
		userName,
		displayName: "Ada Lovelace",
		active: true,
		meta: { resourceType: "User", location: userLocation },
	});
	expect(createUserResponse.headers.get("location")).toBe(userLocation);
	expect(createUserResponse.headers.get("content-location")).toBe(userLocation);

	const populatedListResponse = await request(userFilterPath(userName));
	expectSCIMResponse(populatedListResponse, 200);
	expect(
		await readJson<SCIMListResponse<SCIMUserResource>>(populatedListResponse),
	).toMatchObject({
		totalResults: 1,
		itemsPerPage: 1,
		Resources: [{ id: createdUser.id }],
	});

	const replaceUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
		{
			method: "PUT",
			body: {
				schemas: [SCIM_USER_SCHEMA],
				externalId: userExternalId,
				userName,
				name: {
					formatted: "Ada Byron",
					givenName: "Ada",
					familyName: "Byron",
				},
				displayName: "Ada Byron",
				active: true,
				emails: [{ value: email, type: "work", primary: true }],
			},
		},
	);
	expectSCIMResponse(replaceUserResponse, 200);
	expect(await readJson<SCIMUserResource>(replaceUserResponse)).toMatchObject({
		id: createdUser.id,
		externalId: userExternalId,
		displayName: "Ada Byron",
		active: true,
	});
	const replacedUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
	);
	expectSCIMResponse(replacedUserResponse, 200);
	const replacedUser = await readJson<SCIMUserResource>(replacedUserResponse);
	expect(replacedUser).toMatchObject({
		id: createdUser.id,
		externalId: userExternalId,
		displayName: "Ada Byron",
		active: true,
	});

	const unchangedUserPatchResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
		{
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [
					{
						op: "Replace",
						path: "displayName",
						value: "Ada Byron",
					},
				],
			},
		},
	);
	await expectSCIMNoContent(unchangedUserPatchResponse);
	const unchangedUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
	);
	expectSCIMResponse(unchangedUserResponse, 200);
	expect(await readJson<SCIMUserResource>(unchangedUserResponse)).toEqual(
		replacedUser,
	);

	const createGroupResponse = await request("/Groups", {
		method: "POST",
		body: {
			schemas: [SCIM_GROUP_SCHEMA],
			externalId: groupExternalId,
			displayName: "Finance administrators",
		},
	});
	expectSCIMResponse(createGroupResponse, 201);
	const createdGroup = await readJson<SCIMGroupResource>(createGroupResponse);
	const groupLocation = `${scimBaseURL}/Groups/${encodeURIComponent(createdGroup.id)}`;
	expect(createdGroup).toMatchObject({
		schemas: [SCIM_GROUP_SCHEMA],
		externalId: groupExternalId,
		displayName: "Finance administrators",
		members: [],
		meta: { resourceType: "Group", location: groupLocation },
	});
	expect(createGroupResponse.headers.get("location")).toBe(groupLocation);
	expect(createGroupResponse.headers.get("content-location")).toBe(
		groupLocation,
	);
	await checkpoint("group-created");

	const addMember = () =>
		request(`/Groups/${encodeURIComponent(createdGroup.id)}`, {
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [
					{
						op: "Add",
						path: "members",
						value: [{ value: createdUser.id }],
					},
				],
			},
		});

	if (options.projectionFailure) {
		options.projectionFailure.enable();
		const failedAddResponse = await addMember().finally(() => {
			options.projectionFailure?.disable();
		});
		expect(await expectSCIMErrorResponse(failedAddResponse, 500)).toEqual({
			schemas: [SCIM_ERROR_SCHEMA],
			status: "500",
			detail: "SCIM projection reconciliation failed",
		});
		const groupAfterFailedAddResponse = await request(
			`/Groups/${encodeURIComponent(createdGroup.id)}`,
		);
		expectSCIMResponse(groupAfterFailedAddResponse, 200);
		expect(
			(await readJson<SCIMGroupResource>(groupAfterFailedAddResponse)).members,
		).toEqual([]);
		await checkpoint("failed-add-rolled-back");
	}

	const addMemberResponse = await addMember();
	await expectSCIMNoContent(addMemberResponse);

	const groupWithMemberResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	expectSCIMResponse(groupWithMemberResponse, 200);
	const groupWithMember = await readJson<SCIMGroupResource>(
		groupWithMemberResponse,
	);
	expect(groupWithMember.members).toEqual([
		expect.objectContaining({
			value: createdUser.id,
			type: "User",
			$ref: userLocation,
		}),
	]);
	await checkpoint("member-added");

	const oktaRemovalResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
		{
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [
					{
						op: "Remove",
						path: `members[value eq "${createdUser.id}"]`,
					},
				],
			},
		},
	);
	await expectSCIMNoContent(oktaRemovalResponse);
	const groupAfterOktaRemovalResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	expectSCIMResponse(groupAfterOktaRemovalResponse, 200);
	expect(
		(await readJson<SCIMGroupResource>(groupAfterOktaRemovalResponse)).members,
	).toEqual([]);
	await checkpoint("okta-member-removed");

	const secondAddResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
		{
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [
					{
						op: "Add",
						path: "members",
						value: [{ value: createdUser.id }],
					},
				],
			},
		},
	);
	await expectSCIMNoContent(secondAddResponse);
	const entraRemovalResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
		{
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [
					{
						op: "Remove",
						path: "members",
						value: [{ value: createdUser.id }],
					},
				],
			},
		},
	);
	await expectSCIMNoContent(entraRemovalResponse);
	const groupAfterEntraRemovalResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	expectSCIMResponse(groupAfterEntraRemovalResponse, 200);
	expect(
		(await readJson<SCIMGroupResource>(groupAfterEntraRemovalResponse)).members,
	).toEqual([]);
	await checkpoint("entra-member-removed");

	const restoreMemberResponse = await addMember();
	await expectSCIMNoContent(restoreMemberResponse);
	const restoredGroupResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	expectSCIMResponse(restoredGroupResponse, 200);
	expect(
		(await readJson<SCIMGroupResource>(restoredGroupResponse)).members,
	).toEqual([
		expect.objectContaining({ value: createdUser.id, $ref: userLocation }),
	]);
	await checkpoint("member-restored");

	const deactivateUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
		{
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [{ op: "Replace", path: "active", value: false }],
			},
		},
	);
	await expectSCIMNoContent(deactivateUserResponse);
	const inactiveUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
	);
	expectSCIMResponse(inactiveUserResponse, 200);
	expect(await readJson<SCIMUserResource>(inactiveUserResponse)).toMatchObject({
		id: createdUser.id,
		active: false,
	});
	const groupWithInactiveMemberResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	expectSCIMResponse(groupWithInactiveMemberResponse, 200);
	expect(
		(await readJson<SCIMGroupResource>(groupWithInactiveMemberResponse))
			.members,
	).toEqual([expect.objectContaining({ value: createdUser.id })]);
	await checkpoint("user-deactivated");

	const reactivateUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
		{
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [{ op: "Replace", path: "active", value: true }],
			},
		},
	);
	await expectSCIMNoContent(reactivateUserResponse);
	const activeUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
	);
	expectSCIMResponse(activeUserResponse, 200);
	expect(await readJson<SCIMUserResource>(activeUserResponse)).toMatchObject({
		id: createdUser.id,
		active: true,
	});
	await checkpoint("user-reactivated");

	const deleteUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
		{ method: "DELETE" },
	);
	await expectSCIMNoContent(deleteUserResponse);
	const missingUserResponse = await request(
		`/Users/${encodeURIComponent(createdUser.id)}`,
	);
	await expectSCIMErrorResponse(missingUserResponse, 404);
	const groupAfterPopulatedUserDeleteResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	expectSCIMResponse(groupAfterPopulatedUserDeleteResponse, 200);
	expect(
		(await readJson<SCIMGroupResource>(groupAfterPopulatedUserDeleteResponse))
			.members,
	).toEqual([]);
	await checkpoint("populated-user-deleted");
	const emptyAfterDeleteResponse = await request(userFilterPath(userName));
	expectSCIMResponse(emptyAfterDeleteResponse, 200);
	expect(
		await readJson<SCIMListResponse<SCIMUserResource>>(
			emptyAfterDeleteResponse,
		),
	).toMatchObject({ totalResults: 0, Resources: [] });

	const reprovisionResponse = await request("/Users", {
		method: "POST",
		body: userCreateBody,
	});
	expectSCIMResponse(reprovisionResponse, 201);
	const reprovisionedUser =
		await readJson<SCIMUserResource>(reprovisionResponse);
	expect(reprovisionedUser).toMatchObject({
		externalId: userExternalId,
		userName,
		active: true,
	});
	expect(reprovisionedUser.id).not.toBe(createdUser.id);
	const reprovisionedUserLocation = `${scimBaseURL}/Users/${encodeURIComponent(reprovisionedUser.id)}`;
	expect(reprovisionedUser.meta.location).toBe(reprovisionedUserLocation);
	expect(reprovisionResponse.headers.get("location")).toBe(
		reprovisionedUserLocation,
	);
	await checkpoint("user-reprovisioned");

	const addReprovisionedMemberResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
		{
			method: "PATCH",
			body: {
				schemas: [SCIM_PATCH_SCHEMA],
				Operations: [
					{
						op: "Add",
						path: "members",
						value: [{ value: reprovisionedUser.id }],
					},
				],
			},
		},
	);
	await expectSCIMNoContent(addReprovisionedMemberResponse);
	const groupWithReprovisionedMemberResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	expectSCIMResponse(groupWithReprovisionedMemberResponse, 200);
	expect(
		(await readJson<SCIMGroupResource>(groupWithReprovisionedMemberResponse))
			.members,
	).toEqual([
		expect.objectContaining({
			value: reprovisionedUser.id,
			$ref: reprovisionedUserLocation,
		}),
	]);
	await checkpoint("reprovisioned-member-added");

	const deleteGroupResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
		{ method: "DELETE" },
	);
	await expectSCIMNoContent(deleteGroupResponse);
	const missingGroupResponse = await request(
		`/Groups/${encodeURIComponent(createdGroup.id)}`,
	);
	await expectSCIMErrorResponse(missingGroupResponse, 404);
	const userAfterPopulatedGroupDeleteResponse = await request(
		`/Users/${encodeURIComponent(reprovisionedUser.id)}`,
	);
	expectSCIMResponse(userAfterPopulatedGroupDeleteResponse, 200);
	expect(
		await readJson<SCIMUserResource>(userAfterPopulatedGroupDeleteResponse),
	).toMatchObject({ id: reprovisionedUser.id, active: true });
	await checkpoint("populated-group-deleted");

	const deleteReprovisionedResponse = await request(
		`/Users/${encodeURIComponent(reprovisionedUser.id)}`,
		{ method: "DELETE" },
	);
	await expectSCIMNoContent(deleteReprovisionedResponse);
	const missingReprovisionedUserResponse = await request(
		`/Users/${encodeURIComponent(reprovisionedUser.id)}`,
	);
	await expectSCIMErrorResponse(missingReprovisionedUserResponse, 404);
	const emptyFinalListResponse = await request(userFilterPath(userName));
	expectSCIMResponse(emptyFinalListResponse, 200);
	expect(
		await readJson<SCIMListResponse<SCIMUserResource>>(emptyFinalListResponse),
	).toMatchObject({ totalResults: 0, Resources: [] });
	await checkpoint("lifecycle-complete");

	return {
		userId: createdUser.id,
		groupId: createdGroup.id,
		reprovisionedUserId: reprovisionedUser.id,
		userLocation,
		groupLocation,
	};
}
