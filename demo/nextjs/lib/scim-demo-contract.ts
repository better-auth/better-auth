import type { SCIMDemoGroupKey, SCIMDemoUserKey } from "./scim-demo-catalog.ts";
import {
	isSCIMDemoUserKey,
	SCIM_DEMO_GROUP_KEYS,
} from "./scim-demo-catalog.ts";

export type { SCIMDemoGroupKey, SCIMDemoUserKey };
export { isSCIMDemoUserKey };

export type SCIMDemoView = "users" | "groups" | "role-mappings" | "activity";

export type SCIMDemoUserLifecycle =
	| "not-provisioned"
	| "active"
	| "inactive"
	| "deleted";

export type SCIMDemoAccountLinkStatus = "linked" | "not-linked";
export type SCIMDemoSessionStatus = "active" | "none";

export interface SCIMDemoDirectoryUser {
	key: SCIMDemoUserKey;
	displayName: string;
	email: string;
	initials: string;
	defaultGroupKey: SCIMDemoGroupKey;
}

export interface SCIMDemoUserState extends SCIMDemoDirectoryUser {
	activeSessionCount: number;
	applicationUserId: string | null;
	employeePortalPath: string;
	groups: SCIMDemoGroupKey[];
	accountLinkStatus: SCIMDemoAccountLinkStatus;
	lastSyncedAt: string | null;
	lifecycle: SCIMDemoUserLifecycle;
	role: string | null;
	scimResourceId: string | null;
	sessionStatus: SCIMDemoSessionStatus;
}

export interface SCIMDemoGroupState {
	created: boolean;
	displayName: string;
	key: SCIMDemoGroupKey;
	lastSyncedAt: string | null;
	mappedRole: string | null;
	members: SCIMDemoUserKey[];
	scimResourceId: string | null;
}

export interface SCIMDemoOperation {
	createdAt: string;
	effect: string;
	id: string;
	method: "POST" | "PATCH" | "DELETE";
	requestBody: string | null;
	resource: string;
	responseBody: string | null;
	status: number;
	userKey: SCIMDemoUserKey | null;
}

export interface SCIMDemoConnectionState {
	detail: string;
	id: string;
	lastSyncedAt: string | null;
	name: string;
	status: "connected" | "error";
}

export interface SCIMDemoWorkspace {
	connection: SCIMDemoConnectionState;
	groups: SCIMDemoGroupState[];
	users: SCIMDemoUserState[];
}

export interface SCIMDemoActionResult {
	operations: SCIMDemoOperation[];
	workspace: SCIMDemoWorkspace;
}

export interface SCIMDemoActionFailure {
	error: string;
	operations: SCIMDemoOperation[];
	workspace: SCIMDemoWorkspace;
}

export type SCIMDemoEmployeePortalState =
	| {
			message: string;
			status: "invalid";
	  }
	| {
			activeSessionCount: number;
			applicationUserId: string | null;
			directoryStatus: SCIMDemoUserLifecycle;
			displayName: string;
			email: string;
			accountLinkStatus: SCIMDemoAccountLinkStatus;
			isCurrentEmployee: boolean;
			role: string | null;
			sessionStatus: SCIMDemoSessionStatus;
			status: "ready";
			userKey: SCIMDemoUserKey;
			workspaceId: string;
	  };

export type SCIMDemoAction =
	| { type: "provision-user"; userKey: SCIMDemoUserKey }
	| {
			type: "update-profile";
			userKey: SCIMDemoUserKey;
			displayName: string;
	  }
	| {
			type: "set-groups";
			userKey: SCIMDemoUserKey;
			groupKeys: SCIMDemoGroupKey[];
	  }
	| { type: "set-active"; userKey: SCIMDemoUserKey; active: boolean }
	| { type: "delete-user"; userKey: SCIMDemoUserKey }
	| { type: "reset-sandbox" };

export type SCIMDemoUserAction = Exclude<
	SCIMDemoAction,
	{ type: "reset-sandbox" }
>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

export function isSCIMDemoGroupKey(value: unknown): value is SCIMDemoGroupKey {
	return SCIM_DEMO_GROUP_KEYS.some((groupKey) => groupKey === value);
}

export function isSCIMDemoOperation(
	value: unknown,
): value is SCIMDemoOperation {
	return (
		isRecord(value) &&
		typeof value.createdAt === "string" &&
		typeof value.effect === "string" &&
		typeof value.id === "string" &&
		(value.method === "POST" ||
			value.method === "PATCH" ||
			value.method === "DELETE") &&
		isNullableString(value.requestBody) &&
		typeof value.resource === "string" &&
		isNullableString(value.responseBody) &&
		Number.isInteger(value.status) &&
		(value.userKey === null || isSCIMDemoUserKey(value.userKey))
	);
}

function isSCIMDemoConnectionState(
	value: unknown,
): value is SCIMDemoConnectionState {
	return (
		isRecord(value) &&
		typeof value.detail === "string" &&
		typeof value.id === "string" &&
		isNullableString(value.lastSyncedAt) &&
		typeof value.name === "string" &&
		(value.status === "connected" || value.status === "error")
	);
}

function isSCIMDemoGroupState(value: unknown): value is SCIMDemoGroupState {
	return (
		isRecord(value) &&
		typeof value.created === "boolean" &&
		typeof value.displayName === "string" &&
		isSCIMDemoGroupKey(value.key) &&
		isNullableString(value.lastSyncedAt) &&
		isNullableString(value.mappedRole) &&
		Array.isArray(value.members) &&
		value.members.every(isSCIMDemoUserKey) &&
		isNullableString(value.scimResourceId)
	);
}

function isSCIMDemoUserState(value: unknown): value is SCIMDemoUserState {
	return (
		isRecord(value) &&
		typeof value.activeSessionCount === "number" &&
		Number.isInteger(value.activeSessionCount) &&
		value.activeSessionCount >= 0 &&
		isNullableString(value.applicationUserId) &&
		isSCIMDemoGroupKey(value.defaultGroupKey) &&
		typeof value.displayName === "string" &&
		typeof value.email === "string" &&
		typeof value.employeePortalPath === "string" &&
		Array.isArray(value.groups) &&
		value.groups.every(isSCIMDemoGroupKey) &&
		(value.accountLinkStatus === "linked" ||
			value.accountLinkStatus === "not-linked") &&
		typeof value.initials === "string" &&
		isSCIMDemoUserKey(value.key) &&
		isNullableString(value.lastSyncedAt) &&
		(value.lifecycle === "not-provisioned" ||
			value.lifecycle === "active" ||
			value.lifecycle === "inactive" ||
			value.lifecycle === "deleted") &&
		isNullableString(value.role) &&
		isNullableString(value.scimResourceId) &&
		(value.sessionStatus === "active" || value.sessionStatus === "none")
	);
}

export function isSCIMDemoWorkspace(
	value: unknown,
): value is SCIMDemoWorkspace {
	return (
		isRecord(value) &&
		isSCIMDemoConnectionState(value.connection) &&
		Array.isArray(value.groups) &&
		value.groups.every(isSCIMDemoGroupState) &&
		Array.isArray(value.users) &&
		value.users.every(isSCIMDemoUserState)
	);
}

export function isSCIMDemoActionResult(
	value: unknown,
): value is SCIMDemoActionResult {
	return (
		isRecord(value) &&
		Array.isArray(value.operations) &&
		value.operations.every(isSCIMDemoOperation) &&
		isSCIMDemoWorkspace(value.workspace)
	);
}

export function isSCIMDemoActionFailure(
	value: unknown,
): value is SCIMDemoActionFailure {
	return (
		isRecord(value) &&
		typeof value.error === "string" &&
		Array.isArray(value.operations) &&
		value.operations.every(isSCIMDemoOperation) &&
		isSCIMDemoWorkspace(value.workspace)
	);
}
