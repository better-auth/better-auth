import type { SCIMDemoGroupKey, SCIMDemoUserKey } from "./scim-demo-catalog.ts";

export type { SCIMDemoGroupKey, SCIMDemoUserKey };

export type SCIMDemoView = "users" | "groups" | "role-mappings" | "activity";

export type SCIMDemoUserLifecycle =
	| "not-provisioned"
	| "active"
	| "inactive"
	| "deleted";

export type SCIMDemoApplicationAccess = "active" | "disabled" | "none";

export interface SCIMDemoDirectoryUser {
	key: SCIMDemoUserKey;
	displayName: string;
	email: string;
	initials: string;
	defaultGroupKey: SCIMDemoGroupKey;
}

export interface SCIMDemoUserState extends SCIMDemoDirectoryUser {
	applicationAccess: SCIMDemoApplicationAccess;
	applicationUserId: string | null;
	groups: SCIMDemoGroupKey[];
	lastSyncedAt: string | null;
	lifecycle: SCIMDemoUserLifecycle;
	role: string | null;
	scimResourceId: string | null;
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

export interface SCIMDemoAccessDecision {
	allowed: boolean;
	applicationUserId: string;
	checkedAt: string;
	message: string;
	role: string | null;
	userKey: SCIMDemoUserKey;
}

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
