"use client";

import {
	Ban,
	KeyRound,
	Loader2,
	RefreshCw,
	Send,
	ShieldOff,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as z from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LifecycleWalkthrough } from "./lifecycle-walkthrough";

const scopeSchema = z.enum([
	"scim.users.read",
	"scim.users.write",
	"scim.groups.read",
	"scim.groups.write",
]);
const ALL_SCIM_SCOPES = scopeSchema.options;
const SCIM_BASE_PATH = "/api/auth/scim/v2";
const SCIM_LIST_RESPONSE_SCHEMA =
	"urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA =
	"urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const SCIM_ENTERPRISE_USER_SCHEMA =
	"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User";
const SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA =
	"http://schemas.microsoft.com/2006/11/ResourceManagement/ADSCIM/2.0/Group";
const ENTRA_LOCAL_RECIPE = {
	version: 2,
	steps: [
		{
			key: "discovery",
			title: "Validate discovery and schemas",
		},
		{
			key: "find-manager",
			title: "Confirm Maya is not provisioned",
		},
		{
			key: "create-manager",
			title: "Provision manager Maya Chen",
		},
		{
			key: "find-report",
			title: "Confirm Julian is not provisioned",
		},
		{
			key: "create-report",
			title: "Provision report Julian Foster",
		},
		{
			key: "update-report",
			title: "Update Julian’s Enterprise profile and manager",
		},
		{
			key: "find-group",
			title: "Confirm the Finance group is not provisioned",
		},
		{
			key: "create-group",
			title: "Create Finance administrators",
		},
		{
			key: "add-member",
			title: "Add Maya to Finance administrators",
		},
		{
			key: "deactivate-report",
			title: "Deactivate Julian with Entra’s string Boolean",
		},
	] as const,
} as const;
const OKTA_LOCAL_RECIPE = {
	version: 1,
	steps: [
		{
			key: "startup",
			title: "Read startup User and Group pages",
		},
		{
			key: "uniqueness",
			title: "Confirm catalog resources are unique",
		},
		{
			key: "create-maya",
			title: "Provision Maya Chen",
		},
		{
			key: "replace-maya",
			title: "Read and replace Maya Chen",
		},
		{
			key: "create-julian",
			title: "Provision Julian Foster",
		},
		{
			key: "create-group",
			title: "Create Finance administrators with Maya",
		},
		{
			key: "membership-delta",
			title: "Replace Maya membership with Julian",
		},
		{
			key: "active-transition",
			title: "Deactivate and reactivate Maya Chen",
		},
	] as const,
} as const;
const CREDENTIAL_STATUS_LABELS = {
	active: "Active",
	decommissioned: "Decommissioned",
	expired: "Expired",
	revoked: "Revoked",
} as const;

const credentialStateSchema = z
	.object({
		id: z.string().min(1),
		status: z.enum(["active", "decommissioned", "expired", "revoked"]),
		scopes: z.array(scopeSchema).min(1),
		createdAt: z.string(),
		createdBy: z.string(),
		expiresAt: z.string(),
		lastAuthenticatedAt: z.string().nullable(),
		revokedAt: z.string().nullable(),
	})
	.strict();

const eventStateSchema = z
	.object({
		sequence: z.number().int().positive(),
		type: z.enum([
			"connection.created",
			"credential.issued",
			"connection.disabled",
			"credential.rotated",
			"connection.reactivated",
			"credential.revoked",
			"connection.decommissioning",
			"connection.decommissioned",
		]),
		actorUserId: z.string().min(1),
		credentialId: z.string().nullable(),
		createdAt: z.string(),
	})
	.strict();

const directoryFixtureSchema = z
	.object({
		userKey: z.string().min(1),
		displayName: z.string().min(1),
		email: z.email(),
		subject: z.string().regex(/^scim-demo:v2:[A-Za-z0-9_-]{43}$/),
	})
	.strict();

const connectionStateSchema = z
	.object({
		connection: z
			.object({
				creationRequestId: z.string().min(1),
				connectionId: z.string().min(1),
				provisioningDomainId: z.string().min(1),
				status: z.enum(["active", "decommissioning", "decommissioned"]),
				createdAt: z.string(),
				createdBy: z.string(),
				decommissionStartedAt: z.string().nullable(),
				decommissionStartedBy: z.string().nullable(),
				decommissionedAt: z.string().nullable(),
				decommissionedBy: z.string().nullable(),
			})
			.strict(),
		directory: z
			.object({
				fixtures: z.array(directoryFixtureSchema),
			})
			.strict(),
		oidc: z
			.object({
				providerId: z.literal("scim-demo-sso"),
				issuer: z.url(),
			})
			.strict()
			.nullable(),
		credentials: z.array(credentialStateSchema),
		events: z.array(eventStateSchema),
		resources: z
			.object({
				users: z.array(
					z
						.object({
							id: z.string(),
							externalId: z.string().nullable().optional(),
							userName: z.string(),
							displayName: z.string(),
							active: z.boolean(),
						})
						.strict(),
				),
				groups: z.array(
					z
						.object({
							id: z.string(),
							externalId: z.string().nullable().optional(),
							displayName: z.string(),
						})
						.strict(),
				),
			})
			.strict(),
	})
	.strict();

const connectionMutationSchema = connectionStateSchema
	.extend({
		issuedCredential: z
			.object({
				id: z.string().min(1),
				token: z
					.string()
					.regex(/^ba_scim_credential_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
			})
			.strict(),
	})
	.strict();

const employeeLinkResponseSchema = z
	.object({
		url: z.url(),
	})
	.strict();

type ConnectionState = z.infer<typeof connectionStateSchema>;
type DirectoryFixture = z.infer<typeof directoryFixtureSchema>;
type SCIMScope = z.infer<typeof scopeSchema>;
type EntraLocalRecipeStepKey = (typeof ENTRA_LOCAL_RECIPE.steps)[number]["key"];
type OktaLocalRecipeStepKey = (typeof OKTA_LOCAL_RECIPE.steps)[number]["key"];
type LocalRecipeStatus = "idle" | "running" | "passed" | "failed" | "canceled";

interface LocalRecipeStepState<Key extends string> {
	key: Key;
	status: "idle" | "running" | "passed" | "failed";
	summary: string | null;
	title: string;
}

type EntraLocalRecipeStepState = LocalRecipeStepState<EntraLocalRecipeStepKey>;
type OktaLocalRecipeStepState = LocalRecipeStepState<OktaLocalRecipeStepKey>;

interface SCIMListResponse {
	resources: Record<string, unknown>[];
	totalResults: number;
}

interface ConsoleResult {
	status: number;
	resourceId?: string;
	active?: boolean;
}

interface SCIMSettingsProps {
	organizationId: string;
	organizationName: string;
}

function createResourceConsoleUserBody(fixture: DirectoryFixture) {
	const displayName = fixture.displayName;
	const [givenName, ...familyNameParts] = displayName.split(" ");
	return JSON.stringify(
		{
			schemas: [SCIM_USER_SCHEMA],
			externalId: fixture.subject,
			userName: fixture.email,
			displayName,
			name: {
				givenName: givenName ?? displayName,
				familyName: familyNameParts.join(" "),
			},
			emails: [
				{
					value: fixture.email,
					type: "work",
					primary: true,
				},
			],
			active: true,
		},
		null,
		2,
	);
}

function createDirectoryUserBody(fixture: DirectoryFixture, active: boolean) {
	const [givenName, ...familyNameParts] = fixture.displayName.split(" ");
	return {
		schemas: [SCIM_USER_SCHEMA],
		externalId: fixture.subject,
		userName: fixture.email,
		displayName: fixture.displayName,
		name: {
			givenName,
			familyName: familyNameParts.join(" "),
		},
		emails: [
			{
				value: fixture.email,
				type: "work",
				primary: true,
			},
		],
		active,
	};
}

function managementPath(organizationId: string) {
	return `/api/scim-demo/organizations/${encodeURIComponent(organizationId)}/connections`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function createInitialRecipeSteps(): EntraLocalRecipeStepState[] {
	return ENTRA_LOCAL_RECIPE.steps.map((step) => ({
		...step,
		status: "idle",
		summary: null,
	}));
}

function createInitialOktaRecipeSteps(): OktaLocalRecipeStepState[] {
	return OKTA_LOCAL_RECIPE.steps.map((step) => ({
		...step,
		status: "idle",
		summary: null,
	}));
}

function requireRecord(
	value: unknown,
	subject: string,
): Record<string, unknown> {
	const record = readRecord(value);
	if (!record) throw new Error(`${subject} was not a JSON object.`);
	return record;
}

function requireResource(
	value: unknown,
	schema: typeof SCIM_USER_SCHEMA | typeof SCIM_GROUP_SCHEMA,
	subject: string,
): Record<string, unknown> & { id: string } {
	const record = requireRecord(value, subject);
	if (
		typeof record.id !== "string" ||
		!Array.isArray(record.schemas) ||
		!record.schemas.includes(schema)
	) {
		throw new Error(`${subject} was not a canonical SCIM resource.`);
	}
	return { ...record, id: record.id };
}

function requireListResponse(
	value: unknown,
	subject: string,
): SCIMListResponse {
	const record = requireRecord(value, subject);
	if (
		!Array.isArray(record.schemas) ||
		!record.schemas.includes(SCIM_LIST_RESPONSE_SCHEMA) ||
		typeof record.totalResults !== "number" ||
		!Array.isArray(record.Resources)
	) {
		throw new Error(`${subject} was not a SCIM ListResponse.`);
	}
	const resources = record.Resources.flatMap((resource) => {
		const parsed = readRecord(resource);
		return parsed ? [parsed] : [];
	});
	if (resources.length !== record.Resources.length) {
		throw new Error(`${subject} contained an invalid resource.`);
	}
	return { resources, totalResults: record.totalResults };
}

function formatTimestamp(value: string | null): string {
	return value ? new Date(value).toLocaleString() : "Never";
}

function shortCredentialId(credentialId: string): string {
	return credentialId.length > 18
		? `${credentialId.slice(0, 10)}…${credentialId.slice(-6)}`
		: credentialId;
}

export function SCIMSettings({
	organizationId,
	organizationName,
}: SCIMSettingsProps) {
	const [connection, setConnection] = useState<ConnectionState | null>(null);
	const [consoleBody, setConsoleBody] = useState("");
	const [consoleMethod, setConsoleMethod] = useState("POST");
	const [consolePath, setConsolePath] = useState("/Users");
	const [consoleResult, setConsoleResult] = useState<ConsoleResult | null>(
		null,
	);
	const [consoleToken, setConsoleToken] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [employeeLinkMessage, setEmployeeLinkMessage] = useState<string | null>(
		null,
	);
	const [entraRecipeError, setEntraRecipeError] = useState<string | null>(null);
	const [entraRecipeStatus, setEntraRecipeStatus] =
		useState<LocalRecipeStatus>("idle");
	const [entraRecipeSteps, setEntraRecipeSteps] = useState(
		createInitialRecipeSteps,
	);
	const [oktaRecipeError, setOktaRecipeError] = useState<string | null>(null);
	const [oktaRecipeStatus, setOktaRecipeStatus] =
		useState<LocalRecipeStatus>("idle");
	const [oktaRecipeSteps, setOktaRecipeSteps] = useState(
		createInitialOktaRecipeSteps,
	);
	const [issuedToken, setIssuedToken] = useState("");
	const [isEmployeeLinkMutating, setIsEmployeeLinkMutating] = useState(false);
	const [isLifecycleAtCheckpoint, setIsLifecycleAtCheckpoint] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isMutating, setIsMutating] = useState(false);
	const [rotationExpiryDays, setRotationExpiryDays] = useState(90);
	const [rotationScopes, setRotationScopes] = useState<SCIMScope[]>([
		...ALL_SCIM_SCOPES,
	]);
	const employeeLinkInFlight = useRef(false);
	const mutationInFlight = useRef(false);
	const recipeAbortController = useRef<AbortController | null>(null);

	const clearSecrets = useCallback(() => {
		setIssuedToken("");
		setConsoleToken("");
	}, []);

	const beginMutation = useCallback((): boolean => {
		if (mutationInFlight.current) return false;
		mutationInFlight.current = true;
		setIsMutating(true);
		setError(null);
		return true;
	}, []);

	const finishMutation = useCallback(() => {
		mutationInFlight.current = false;
		setIsMutating(false);
	}, []);

	const updateLifecycleCheckpoint = useCallback((ready: boolean) => {
		setIsLifecycleAtCheckpoint(ready);
		if (!ready) setEmployeeLinkMessage(null);
	}, []);

	const loadConnection = useCallback(async (): Promise<boolean> => {
		try {
			const response = await fetch(managementPath(organizationId), {
				cache: "no-store",
				credentials: "same-origin",
				referrerPolicy: "no-referrer",
			});
			if (!response.ok) {
				setError("The SCIM connection state could not be loaded.");
				return false;
			}
			const state: unknown = await response.json();
			const parsed = connectionStateSchema.nullable().safeParse(state);
			if (!parsed.success) {
				setError("The SCIM connection response was not valid.");
				return false;
			}
			setConnection(parsed.data);
			const fixture = parsed.data?.directory.fixtures[0];
			setConsoleBody(fixture ? createResourceConsoleUserBody(fixture) : "");
			return true;
		} catch {
			setError("The SCIM connection state could not be loaded.");
			return false;
		}
	}, [organizationId]);

	useEffect(() => {
		void loadConnection().finally(() => setIsLoading(false));
		return () => {
			recipeAbortController.current?.abort();
			recipeAbortController.current = null;
			clearSecrets();
		};
	}, [clearSecrets, loadConnection]);

	function acceptIssuedCredential(body: unknown): boolean {
		const parsed = connectionMutationSchema.safeParse(body);
		if (!parsed.success) return false;
		const { issuedCredential, ...state } = parsed.data;
		setIssuedToken(issuedCredential.token);
		setConnection(state);
		const fixture = state.directory.fixtures[0];
		setConsoleBody(fixture ? createResourceConsoleUserBody(fixture) : "");
		return true;
	}

	async function createConnection() {
		if (!beginMutation()) return;
		try {
			const response = await fetch(managementPath(organizationId), {
				method: "POST",
				cache: "no-store",
				credentials: "same-origin",
				referrerPolicy: "no-referrer",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ organizationId }),
			});
			const body: unknown = await response.json();
			if (!response.ok) {
				setError("The SCIM connection could not be created.");
				return;
			}
			if (!acceptIssuedCredential(body)) {
				setError("The SCIM connection response was not valid.");
			}
		} catch {
			setError("The SCIM connection could not be created.");
		} finally {
			finishMutation();
		}
	}

	async function rotateCredential() {
		if (!beginMutation()) return;
		try {
			const response = await fetch(`${managementPath(organizationId)}/rotate`, {
				method: "POST",
				cache: "no-store",
				credentials: "same-origin",
				referrerPolicy: "no-referrer",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					organizationId,
					scopes: rotationScopes,
					expiresInDays: rotationExpiryDays,
				}),
			});
			const body: unknown = await response.json();
			if (!response.ok) {
				setError("The SCIM credential could not be rotated.");
				return;
			}
			if (!acceptIssuedCredential(body)) {
				setError("The SCIM connection response was not valid.");
			}
		} catch {
			setError("The SCIM credential could not be rotated.");
		} finally {
			finishMutation();
		}
	}

	async function revokeCredential(credentialId: string) {
		if (!beginMutation()) return;
		clearSecrets();
		try {
			const encodedCredentialId = encodeURIComponent(credentialId);
			const response = await fetch(
				`${managementPath(organizationId)}/credentials/${encodedCredentialId}/revoke`,
				{
					method: "POST",
					cache: "no-store",
					credentials: "same-origin",
					referrerPolicy: "no-referrer",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ organizationId, credentialId }),
				},
			);
			if (!response.ok) {
				setError("The SCIM credential could not be revoked.");
				return;
			}
			const state: unknown = await response.json();
			const parsed = connectionStateSchema.safeParse(state);
			if (!parsed.success) {
				setError("The SCIM connection response was not valid.");
				return;
			}
			setConnection(parsed.data);
		} catch {
			setError("The SCIM credential could not be revoked.");
		} finally {
			finishMutation();
		}
	}

	async function decommissionConnection() {
		if (!beginMutation()) return;
		clearSecrets();
		try {
			const response = await fetch(
				`${managementPath(organizationId)}/decommission`,
				{
					method: "POST",
					cache: "no-store",
					credentials: "same-origin",
					referrerPolicy: "no-referrer",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ organizationId }),
				},
			);
			const state: unknown = await response.json();
			if (!response.ok) {
				await loadConnection();
				setError(
					"The SCIM connection could not finish decommissioning. Retry the retained operation.",
				);
				return;
			}
			const parsed = connectionStateSchema.safeParse(state);
			if (!parsed.success) {
				setError("The SCIM connection response was not valid.");
				return;
			}
			setConnection(parsed.data);
		} catch {
			await loadConnection();
			setError(
				"The SCIM connection could not finish decommissioning. Retry the retained operation.",
			);
		} finally {
			finishMutation();
		}
	}

	async function sendSCIMRequest() {
		if (!beginMutation()) return;
		setConsoleResult(null);
		const hasBody = consoleMethod !== "GET" && consoleMethod !== "DELETE";
		if (hasBody) {
			try {
				JSON.parse(consoleBody);
			} catch {
				setError("The SCIM request body must be valid JSON.");
				finishMutation();
				return;
			}
		}
		try {
			if (!/^\/(?:Users|Groups)(?:\/[A-Za-z0-9_-]+)?$/u.test(consolePath)) {
				setError("Use a /Users or /Groups path with an optional resource ID.");
				return;
			}
			const response = await fetch(`/api/auth/scim/v2${consolePath}`, {
				method: consoleMethod,
				cache: "no-store",
				credentials: "omit",
				referrerPolicy: "no-referrer",
				headers: {
					accept: "application/scim+json",
					authorization: `Bearer ${consoleToken}`,
					...(hasBody ? { "content-type": "application/scim+json" } : {}),
				},
				...(hasBody ? { body: consoleBody } : {}),
			});
			const body: unknown =
				response.status === 204
					? null
					: await response.json().catch(() => null);
			const record = readRecord(body);
			setConsoleResult({
				status: response.status,
				...(typeof record?.id === "string" ? { resourceId: record.id } : {}),
				...(typeof record?.active === "boolean"
					? { active: record.active }
					: {}),
			});
			await loadConnection();
		} catch {
			setError("The SCIM request could not be completed.");
		} finally {
			clearSecrets();
			finishMutation();
		}
	}

	function updateRecipeStep(
		key: EntraLocalRecipeStepKey,
		status: EntraLocalRecipeStepState["status"],
		summary: string | null = null,
	) {
		setEntraRecipeSteps((current) =>
			current.map((step) =>
				step.key === key ? { ...step, status, summary } : step,
			),
		);
	}

	async function requestSCIM(
		path: string,
		input: {
			bearerToken?: string;
			body?: unknown;
			method?: "GET" | "POST" | "PUT" | "PATCH";
			signal: AbortSignal;
		},
	): Promise<unknown> {
		const response = await fetch(`${SCIM_BASE_PATH}${path}`, {
			method: input.method ?? "GET",
			cache: "no-store",
			credentials: "omit",
			referrerPolicy: "no-referrer",
			signal: input.signal,
			headers: {
				accept: "application/scim+json",
				...(input.bearerToken
					? { authorization: `Bearer ${input.bearerToken}` }
					: {}),
				...(input.body === undefined
					? {}
					: { "content-type": "application/scim+json" }),
			},
			...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
		});
		const body: unknown =
			response.status === 204 ? null : await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(`The SCIM endpoint returned HTTP ${response.status}.`);
		}
		return body;
	}

	async function runRecipeStep<Result>(
		key: EntraLocalRecipeStepKey,
		summary: string,
		run: () => Promise<Result>,
	): Promise<Result> {
		updateRecipeStep(key, "running");
		try {
			const result = await run();
			updateRecipeStep(key, "passed", summary);
			return result;
		} catch (cause) {
			updateRecipeStep(key, "failed");
			throw cause;
		}
	}

	async function runEntraLocalRecipe() {
		const bearerToken = issuedToken;
		const managerFixture = connection?.directory.fixtures.find(
			(candidate) => candidate.userKey === "maya-chen",
		);
		const reportFixture = connection?.directory.fixtures.find(
			(candidate) => candidate.userKey === "julian-foster",
		);
		if (!bearerToken) return;
		if (
			!managerFixture ||
			!reportFixture ||
			connection?.connection.status !== "active"
		) {
			clearSecrets();
			setEntraRecipeStatus("failed");
			setEntraRecipeError(
				"The local recipe requires an active connection with the Maya and Julian fixtures.",
			);
			return;
		}
		if (!beginMutation()) return;
		clearSecrets();
		const controller = new AbortController();
		recipeAbortController.current = controller;
		setEntraRecipeError(null);
		setEntraRecipeStatus("running");
		setEntraRecipeSteps(createInitialRecipeSteps());

		try {
			await runRecipeStep(
				"discovery",
				"Discovery and resource schemas are available",
				async () => {
					const serviceProviderConfig = requireRecord(
						await requestSCIM("/ServiceProviderConfig", {
							signal: controller.signal,
						}),
						"ServiceProviderConfig",
					);
					const patch = readRecord(serviceProviderConfig.patch);
					if (
						!Array.isArray(serviceProviderConfig.schemas) ||
						!serviceProviderConfig.schemas.includes(
							SCIM_SERVICE_PROVIDER_CONFIG_SCHEMA,
						) ||
						patch?.supported !== true
					) {
						throw new Error(
							"ServiceProviderConfig did not advertise PATCH support.",
						);
					}
					const { resources: schemas } = requireListResponse(
						await requestSCIM("/Schemas", {
							signal: controller.signal,
						}),
						"Schemas discovery",
					);
					if (
						!schemas.some((schema) => schema.id === SCIM_USER_SCHEMA) ||
						!schemas.some((schema) => schema.id === SCIM_GROUP_SCHEMA)
					) {
						throw new Error("User and Group schemas were not advertised.");
					}
					const { resources: resourceTypes } = requireListResponse(
						await requestSCIM("/ResourceTypes", {
							signal: controller.signal,
						}),
						"ResourceTypes discovery",
					);
					if (
						!resourceTypes.some(
							(resourceType) => resourceType.name === "User",
						) ||
						!resourceTypes.some((resourceType) => resourceType.name === "Group")
					) {
						throw new Error(
							"User and Group resource types were not advertised.",
						);
					}
				},
			);

			await runRecipeStep(
				"find-manager",
				"No existing Maya Chen user",
				async () => {
					const query = new URLSearchParams({
						filter: `userName eq "${managerFixture.email}"`,
					});
					const result = requireListResponse(
						await requestSCIM(`/Users?${query}`, {
							bearerToken,
							signal: controller.signal,
						}),
						"Maya user lookup",
					);
					if (result.totalResults !== 0 || result.resources.length !== 0) {
						throw new Error("Maya Chen is already provisioned.");
					}
				},
			);

			const maya = await runRecipeStep(
				"create-manager",
				"Maya Chen is an active Finance director",
				async () => {
					const [givenName, ...familyNameParts] =
						managerFixture.displayName.split(" ");
					const resource = requireResource(
						await requestSCIM("/Users", {
							method: "POST",
							bearerToken,
							signal: controller.signal,
							body: {
								schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
								externalId: managerFixture.subject,
								userName: managerFixture.email,
								displayName: managerFixture.displayName,
								name: {
									givenName,
									familyName: familyNameParts.join(" "),
								},
								emails: [
									{
										value: managerFixture.email,
										type: "work",
										primary: true,
									},
								],
								title: "Finance Director",
								[SCIM_ENTERPRISE_USER_SCHEMA]: {
									department: "Finance",
									employeeNumber: managerFixture.subject,
								},
								active: true,
							},
						}),
						SCIM_USER_SCHEMA,
						"Maya user create",
					);
					if (resource.active !== true) {
						throw new Error("Maya was not returned as active.");
					}
					return resource;
				},
			);

			await runRecipeStep(
				"find-report",
				"No existing Julian Foster user",
				async () => {
					const query = new URLSearchParams({
						filter: `userName eq "${reportFixture.email}"`,
					});
					const result = requireListResponse(
						await requestSCIM(`/Users?${query}`, {
							bearerToken,
							signal: controller.signal,
						}),
						"Julian user lookup",
					);
					if (result.totalResults !== 0 || result.resources.length !== 0) {
						throw new Error("Julian Foster is already provisioned.");
					}
				},
			);

			const julian = await runRecipeStep(
				"create-report",
				"Julian Foster is an active Finance analyst",
				async () => {
					const [givenName, ...familyNameParts] =
						reportFixture.displayName.split(" ");
					const resource = requireResource(
						await requestSCIM("/Users", {
							method: "POST",
							bearerToken,
							signal: controller.signal,
							body: {
								schemas: [SCIM_USER_SCHEMA, SCIM_ENTERPRISE_USER_SCHEMA],
								externalId: reportFixture.subject,
								userName: reportFixture.email,
								displayName: reportFixture.displayName,
								name: {
									givenName,
									familyName: familyNameParts.join(" "),
								},
								emails: [
									{
										value: reportFixture.email,
										type: "work",
										primary: true,
									},
								],
								title: "Finance Analyst",
								[SCIM_ENTERPRISE_USER_SCHEMA]: {
									department: "Finance",
									employeeNumber: reportFixture.subject,
								},
								active: true,
							},
						}),
						SCIM_USER_SCHEMA,
						"Julian user create",
					);
					if (resource.active !== true) {
						throw new Error("Julian was not returned as active.");
					}
					return resource;
				},
			);

			await runRecipeStep(
				"update-report",
				"Julian reports to Maya in Financial Planning",
				async () => {
					await requestSCIM(`/Users/${encodeURIComponent(julian.id)}`, {
						method: "PATCH",
						bearerToken,
						signal: controller.signal,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "Replace",
									value: {
										title: "Senior Finance Analyst",
										[`${SCIM_ENTERPRISE_USER_SCHEMA}:department`]:
											"Financial Planning",
									},
								},
								{
									op: "Add",
									path: "manager",
									value: [
										{
											value: maya.id,
											$ref: `${SCIM_BASE_PATH}/Users/${encodeURIComponent(maya.id)}`,
											displayName: managerFixture.displayName,
										},
									],
								},
							],
						},
					});
					const updated = requireResource(
						await requestSCIM(`/Users/${encodeURIComponent(julian.id)}`, {
							bearerToken,
							signal: controller.signal,
						}),
						SCIM_USER_SCHEMA,
						"Updated Julian lookup",
					);
					const enterprise = readRecord(updated[SCIM_ENTERPRISE_USER_SCHEMA]);
					const manager = readRecord(enterprise?.manager);
					if (
						updated.title !== "Senior Finance Analyst" ||
						enterprise?.department !== "Financial Planning" ||
						manager?.value !== maya.id ||
						"displayName" in (manager ?? {})
					) {
						throw new Error(
							"Julian’s canonical Enterprise profile was not returned.",
						);
					}
				},
			);

			await runRecipeStep(
				"find-group",
				"No existing Finance administrators group",
				async () => {
					const query = new URLSearchParams({
						filter: 'displayName eq "Finance administrators"',
						excludedAttributes: "members",
					});
					const result = requireListResponse(
						await requestSCIM(`/Groups?${query}`, {
							bearerToken,
							signal: controller.signal,
						}),
						"Finance group lookup",
					);
					if (result.totalResults !== 0 || result.resources.length !== 0) {
						throw new Error(
							"The Finance administrators group is already provisioned.",
						);
					}
				},
			);

			const financeGroup = await runRecipeStep(
				"create-group",
				"Finance administrators created",
				async () =>
					requireResource(
						await requestSCIM("/Groups", {
							method: "POST",
							bearerToken,
							signal: controller.signal,
							body: {
								schemas: [
									SCIM_GROUP_SCHEMA,
									SCIM_MICROSOFT_ENTRA_LEGACY_GROUP_SCHEMA,
								],
								externalId: `scim-demo:${organizationId}-finance-admins`,
								displayName: "Finance administrators",
								members: [],
								meta: { resourceType: "Group" },
							},
						}),
						SCIM_GROUP_SCHEMA,
						"Finance group create",
					),
			);

			await runRecipeStep(
				"add-member",
				"Finance administrators contains Maya",
				async () => {
					await requestSCIM(`/Groups/${encodeURIComponent(financeGroup.id)}`, {
						method: "PATCH",
						bearerToken,
						signal: controller.signal,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "Add",
									path: "members",
									value: [{ value: maya.id }],
								},
							],
						},
					});
				},
			);

			await runRecipeStep(
				"deactivate-report",
				"String False returned canonical inactive Julian",
				async () => {
					await requestSCIM(`/Users/${encodeURIComponent(julian.id)}`, {
						method: "PATCH",
						bearerToken,
						signal: controller.signal,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "Replace",
									path: "active",
									value: "False",
								},
							],
						},
					});
					const inactive = requireResource(
						await requestSCIM(`/Users/${encodeURIComponent(julian.id)}`, {
							bearerToken,
							signal: controller.signal,
						}),
						SCIM_USER_SCHEMA,
						"Inactive Julian lookup",
					);
					if (inactive.active !== false) {
						throw new Error(
							"String False was not returned as canonical false.",
						);
					}
				},
			);
			setEntraRecipeStatus("passed");
		} catch (cause) {
			if (cause instanceof Error && cause.name === "AbortError") {
				setEntraRecipeStatus("canceled");
			} else {
				setEntraRecipeStatus("failed");
				setEntraRecipeError(
					cause instanceof Error
						? cause.message
						: "The local recipe could not be completed.",
				);
			}
		} finally {
			recipeAbortController.current = null;
			clearSecrets();
			await loadConnection();
			finishMutation();
		}
	}

	function cancelEntraLocalRecipe() {
		recipeAbortController.current?.abort();
		clearSecrets();
	}

	function updateOktaRecipeStep(
		key: OktaLocalRecipeStepKey,
		status: OktaLocalRecipeStepState["status"],
		summary: string | null = null,
	) {
		setOktaRecipeSteps((current) =>
			current.map((step) =>
				step.key === key ? { ...step, status, summary } : step,
			),
		);
	}

	async function runOktaRecipeStep<Result>(
		key: OktaLocalRecipeStepKey,
		summary: string,
		run: () => Promise<Result>,
	): Promise<Result> {
		updateOktaRecipeStep(key, "running");
		try {
			const result = await run();
			updateOktaRecipeStep(key, "passed", summary);
			return result;
		} catch (cause) {
			updateOktaRecipeStep(key, "failed");
			throw cause;
		}
	}

	async function runOktaLocalRecipe() {
		const bearerToken = issuedToken;
		const mayaFixture = connection?.directory.fixtures.find(
			(candidate) => candidate.userKey === "maya-chen",
		);
		const julianFixture = connection?.directory.fixtures.find(
			(candidate) => candidate.userKey === "julian-foster",
		);
		if (!bearerToken) return;
		if (
			!mayaFixture ||
			!julianFixture ||
			connection?.connection.status !== "active"
		) {
			clearSecrets();
			setOktaRecipeStatus("failed");
			setOktaRecipeError(
				"The Okta recipe requires an active connection with Maya and Julian fixtures.",
			);
			return;
		}
		if (!beginMutation()) return;
		clearSecrets();
		const controller = new AbortController();
		recipeAbortController.current = controller;
		setOktaRecipeError(null);
		setOktaRecipeStatus("running");
		setOktaRecipeSteps(createInitialOktaRecipeSteps());

		try {
			await runOktaRecipeStep(
				"startup",
				"One-based User and Group pages are empty",
				async () => {
					const users = requireListResponse(
						await requestSCIM("/Users?startIndex=1&count=2", {
							bearerToken,
							signal: controller.signal,
						}),
						"Okta startup Users",
					);
					const groups = requireListResponse(
						await requestSCIM("/Groups?startIndex=1&count=100", {
							bearerToken,
							signal: controller.signal,
						}),
						"Okta startup Groups",
					);
					if (users.totalResults !== 0 || groups.totalResults !== 0) {
						throw new Error("Okta startup pages were not empty.");
					}
				},
			);

			await runOktaRecipeStep(
				"uniqueness",
				"Maya, Julian, and Finance administrators are not provisioned",
				async () => {
					for (const fixture of [mayaFixture, julianFixture]) {
						const query = new URLSearchParams({
							filter: `userName eq "${fixture.email}"`,
							startIndex: "1",
							count: "2",
						});
						const result = requireListResponse(
							await requestSCIM(`/Users?${query}`, {
								bearerToken,
								signal: controller.signal,
							}),
							`${fixture.displayName} uniqueness lookup`,
						);
						if (result.totalResults !== 0) {
							throw new Error(
								`${fixture.displayName} was already provisioned.`,
							);
						}
					}
					const groupQuery = new URLSearchParams({
						filter: 'displayName eq "Finance administrators"',
						startIndex: "1",
						count: "100",
					});
					const groupResult = requireListResponse(
						await requestSCIM(`/Groups?${groupQuery}`, {
							bearerToken,
							signal: controller.signal,
						}),
						"Finance administrators uniqueness lookup",
					);
					if (groupResult.totalResults !== 0) {
						throw new Error("Finance administrators was already provisioned.");
					}
				},
			);

			const maya = await runOktaRecipeStep(
				"create-maya",
				"Maya Chen is active",
				async () => {
					const resource = requireResource(
						await requestSCIM("/Users", {
							method: "POST",
							bearerToken,
							signal: controller.signal,
							body: createDirectoryUserBody(mayaFixture, true),
						}),
						SCIM_USER_SCHEMA,
						"Maya user create",
					);
					if (resource.active !== true) {
						throw new Error("Maya was not returned as active.");
					}
					return resource;
				},
			);

			await runOktaRecipeStep(
				"replace-maya",
				"Item read preceded a full active User replacement",
				async () => {
					requireResource(
						await requestSCIM(`/Users/${encodeURIComponent(maya.id)}`, {
							bearerToken,
							signal: controller.signal,
						}),
						SCIM_USER_SCHEMA,
						"Maya item lookup",
					);
					const replaced = requireResource(
						await requestSCIM(`/Users/${encodeURIComponent(maya.id)}`, {
							method: "PUT",
							bearerToken,
							signal: controller.signal,
							body: createDirectoryUserBody(mayaFixture, true),
						}),
						SCIM_USER_SCHEMA,
						"Maya user replacement",
					);
					if (replaced.id !== maya.id || replaced.active !== true) {
						throw new Error(
							"Maya replacement did not preserve the active User.",
						);
					}
				},
			);

			const julian = await runOktaRecipeStep(
				"create-julian",
				"Julian Foster is active",
				async () =>
					requireResource(
						await requestSCIM("/Users", {
							method: "POST",
							bearerToken,
							signal: controller.signal,
							body: createDirectoryUserBody(julianFixture, true),
						}),
						SCIM_USER_SCHEMA,
						"Julian user create",
					),
			);

			const financeGroup = await runOktaRecipeStep(
				"create-group",
				"Finance administrators initially contains Maya",
				async () =>
					requireResource(
						await requestSCIM("/Groups", {
							method: "POST",
							bearerToken,
							signal: controller.signal,
							body: {
								schemas: [SCIM_GROUP_SCHEMA],
								externalId: `scim-demo:${organizationId}-okta-finance-admins`,
								displayName: "Finance administrators",
								members: [{ value: maya.id }],
							},
						}),
						SCIM_GROUP_SCHEMA,
						"Finance group create",
					),
			);

			await runOktaRecipeStep(
				"membership-delta",
				"Finance administrators contains Julian, not Maya",
				async () => {
					await requestSCIM(`/Groups/${encodeURIComponent(financeGroup.id)}`, {
						method: "PATCH",
						bearerToken,
						signal: controller.signal,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "remove",
									path: `members[value eq "${maya.id}"]`,
								},
								{
									op: "add",
									path: "members",
									value: [{ value: julian.id }],
								},
							],
						},
					});
					const group = requireResource(
						await requestSCIM(
							`/Groups/${encodeURIComponent(financeGroup.id)}`,
							{
								bearerToken,
								signal: controller.signal,
							},
						),
						SCIM_GROUP_SCHEMA,
						"Finance group lookup",
					);
					const memberIds = Array.isArray(group.members)
						? group.members.flatMap((member) => {
								const record = readRecord(member);
								return typeof record?.value === "string" ? [record.value] : [];
							})
						: [];
					if (
						memberIds.length !== 1 ||
						memberIds[0] !== julian.id ||
						memberIds.includes(maya.id)
					) {
						throw new Error(
							"Finance administrators did not contain only Julian.",
						);
					}
				},
			);

			await runOktaRecipeStep(
				"active-transition",
				"Native Boolean updates returned canonical false, then true",
				async () => {
					await requestSCIM(`/Users/${encodeURIComponent(maya.id)}`, {
						method: "PATCH",
						bearerToken,
						signal: controller.signal,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "replace",
									value: { active: false },
								},
							],
						},
					});
					const inactive = requireResource(
						await requestSCIM(`/Users/${encodeURIComponent(maya.id)}`, {
							bearerToken,
							signal: controller.signal,
						}),
						SCIM_USER_SCHEMA,
						"Inactive Maya lookup",
					);
					if (inactive.active !== false) {
						throw new Error(
							"Native Boolean false was not returned as canonical false.",
						);
					}
					await requestSCIM(`/Users/${encodeURIComponent(maya.id)}`, {
						method: "PATCH",
						bearerToken,
						signal: controller.signal,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "replace",
									value: { active: true },
								},
							],
						},
					});
					const active = requireResource(
						await requestSCIM(`/Users/${encodeURIComponent(maya.id)}`, {
							bearerToken,
							signal: controller.signal,
						}),
						SCIM_USER_SCHEMA,
						"Reactivated Maya lookup",
					);
					if (active.active !== true) {
						throw new Error(
							"Native Boolean true was not returned as canonical true.",
						);
					}
				},
			);
			setOktaRecipeStatus("passed");
		} catch (cause) {
			if (cause instanceof Error && cause.name === "AbortError") {
				setOktaRecipeStatus("canceled");
			} else {
				setOktaRecipeStatus("failed");
				setOktaRecipeError(
					cause instanceof Error
						? cause.message
						: "The Okta recipe could not be completed.",
				);
			}
		} finally {
			recipeAbortController.current = null;
			clearSecrets();
			await loadConnection();
			finishMutation();
		}
	}

	function cancelOktaLocalRecipe() {
		recipeAbortController.current?.abort();
		clearSecrets();
	}

	async function copyEmployeeAccessLink(
		scimUserId: string,
		displayName: string,
	) {
		if (employeeLinkInFlight.current) return;
		const ownsMutationLock = !isLifecycleAtCheckpoint;
		if (ownsMutationLock && !beginMutation()) return;
		employeeLinkInFlight.current = true;
		setIsEmployeeLinkMutating(true);
		setEmployeeLinkMessage(null);
		try {
			const response = await fetch(
				`${managementPath(organizationId)}/employee-links`,
				{
					method: "POST",
					cache: "no-store",
					credentials: "same-origin",
					referrerPolicy: "no-referrer",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ organizationId, scimUserId }),
				},
			);
			const body: unknown = await response.json().catch(() => null);
			const parsed = employeeLinkResponseSchema.safeParse(body);
			if (!response.ok || !parsed.success) {
				setError("The employee access link could not be created.");
				return;
			}
			await navigator.clipboard.writeText(parsed.data.url);
			setEmployeeLinkMessage(
				`${displayName}’s one-time employee access link was copied.`,
			);
		} catch {
			setError("The employee access link could not be created.");
		} finally {
			employeeLinkInFlight.current = false;
			setIsEmployeeLinkMutating(false);
			if (ownsMutationLock) finishMutation();
		}
	}

	function updateRotationScope(scope: SCIMScope, checked: boolean) {
		setRotationScopes((current) =>
			checked
				? current.includes(scope)
					? current
					: [...current, scope]
				: current.filter((candidate) => candidate !== scope),
		);
	}

	return (
		<div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
			<div className="space-y-5">
				<LifecycleWalkthrough
					bearerToken={issuedToken}
					checkpointBlocked={isEmployeeLinkMutating}
					connection={connection}
					disabled={isMutating}
					onCheckpointChange={updateLifecycleCheckpoint}
					onFinish={finishMutation}
					onRefresh={loadConnection}
					onStart={() => {
						if (!beginMutation()) return false;
						clearSecrets();
						return true;
					}}
					organizationId={organizationId}
				/>

				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<CardTitle>SCIM connection</CardTitle>
								<CardDescription>{organizationName}</CardDescription>
							</div>
							{connection ? (
								<Badge
									variant={
										connection.connection.status === "active"
											? "default"
											: "secondary"
									}
								>
									{connection.connection.status}
								</Badge>
							) : null}
						</div>
					</CardHeader>
					<CardContent className="space-y-5">
						{isLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
								Loading connection
							</div>
						) : connection ? (
							<>
								{connection.connection.status === "decommissioning" ? (
									<Alert>
										<Loader2
											className="size-4 animate-spin"
											aria-hidden="true"
										/>
										<AlertTitle>Decommissioning is retained</AlertTitle>
										<AlertDescription className="mt-2 space-y-3">
											<p>
												Credentials are disabled. Retry to resume core
												reconciliation from its durable checkpoint.
											</p>
											<Button
												size="sm"
												variant="destructive"
												disabled={isMutating}
												onClick={decommissionConnection}
											>
												Retry decommission
											</Button>
										</AlertDescription>
									</Alert>
								) : connection.connection.status === "decommissioned" ? (
									<Alert>
										<ShieldOff className="size-4" aria-hidden="true" />
										<AlertTitle>
											Connection permanently decommissioned
										</AlertTitle>
										<AlertDescription>
											Its credentials cannot be reissued or reactivated.
											Canonical SCIM resources remain available below for
											inspection.
										</AlertDescription>
									</Alert>
								) : null}

								{connection.connection.status === "active" ? (
									<>
										<div className="space-y-3 border-t pt-4">
											<div>
												<h3 className="font-medium">
													Issue replacement credential
												</h3>
												<p className="text-sm text-muted-foreground">
													Existing credentials overlap until you revoke them.
												</p>
											</div>
											<fieldset className="space-y-2">
												<legend className="text-sm font-medium">Scopes</legend>
												{ALL_SCIM_SCOPES.map((scope) => (
													<label
														key={scope}
														className="flex items-center gap-2 text-sm"
													>
														<input
															type="checkbox"
															checked={rotationScopes.includes(scope)}
															onChange={(event) =>
																updateRotationScope(scope, event.target.checked)
															}
														/>
														{scope}
													</label>
												))}
											</fieldset>
											<div className="space-y-2">
												<Label htmlFor="scim-credential-expiry">
													Expires after
												</Label>
												<select
													id="scim-credential-expiry"
													className="h-9 w-full border bg-background px-3 text-sm"
													value={rotationExpiryDays}
													onChange={(event) =>
														setRotationExpiryDays(Number(event.target.value))
													}
												>
													{[30, 60, 90].map((days) => (
														<option key={days} value={days}>
															{days} days
														</option>
													))}
												</select>
											</div>
											<Button
												disabled={isMutating || rotationScopes.length === 0}
												onClick={rotateCredential}
											>
												<RefreshCw className="size-4" aria-hidden="true" />
												Rotate credential
											</Button>
										</div>

										<div className="space-y-3 border-t pt-4">
											<div>
												<h3 className="font-medium">
													Permanently decommission
												</h3>
												<p className="text-sm text-muted-foreground">
													Retire this connection’s authority while retaining
													canonical resources and its immutable binding.
												</p>
											</div>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button variant="destructive" disabled={isMutating}>
														<ShieldOff className="size-4" aria-hidden="true" />
														Decommission connection
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>
															Permanently decommission this SCIM connection?
														</AlertDialogTitle>
														<AlertDialogDescription>
															This is irreversible. Every credential is
															disabled, the connection can never be reassigned,
															and its lifecycle and access contributions are
															reconciled away. Canonical SCIM resources are
															retained.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Cancel</AlertDialogCancel>
														<AlertDialogAction
															className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
															disabled={isMutating}
															onClick={decommissionConnection}
														>
															Decommission permanently
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>
									</>
								) : null}
							</>
						) : (
							<Button disabled={isMutating} onClick={createConnection}>
								<KeyRound className="size-4" aria-hidden="true" />
								Create SCIM connection
							</Button>
						)}
					</CardContent>
				</Card>

				{issuedToken ? (
					<Alert>
						<KeyRound className="size-4" aria-hidden="true" />
						<AlertTitle>
							Copy this bearer now. It’s shown once and can’t be recovered.
						</AlertTitle>
						<AlertDescription className="mt-3 space-y-2">
							<Label htmlFor="scim-issued-token">New bearer token</Label>
							<Input
								id="scim-issued-token"
								type="password"
								readOnly
								autoComplete="off"
								spellCheck={false}
								value={issuedToken}
							/>
						</AlertDescription>
					</Alert>
				) : null}

				{connection ? (
					<Card>
						<CardHeader>
							<CardTitle>Credentials</CardTitle>
							<CardDescription>
								Secrets are never returned after issuance.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{connection.credentials.map((credential) => (
								<div
									key={credential.id}
									className="space-y-2 border p-3 text-sm"
									data-testid={`scim-credential-${credential.id}`}
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<code title={credential.id}>
											{shortCredentialId(credential.id)}
										</code>
										<Badge variant="outline">
											{CREDENTIAL_STATUS_LABELS[credential.status]}
										</Badge>
									</div>
									<p className="text-muted-foreground">
										{credential.scopes.join(", ")}
									</p>
									<dl className="grid gap-2 sm:grid-cols-2">
										<div>
											<dt className="text-muted-foreground">Expires</dt>
											<dd>{formatTimestamp(credential.expiresAt)}</dd>
										</div>
										<div>
											<dt className="text-muted-foreground">
												Last authenticated
											</dt>
											<dd>{formatTimestamp(credential.lastAuthenticatedAt)}</dd>
										</div>
									</dl>
									{credential.status === "active" ? (
										<Button
											size="sm"
											variant="outline"
											disabled={isMutating}
											aria-label={`Revoke credential ${credential.id}`}
											onClick={() => revokeCredential(credential.id)}
										>
											<Ban className="size-4" aria-hidden="true" />
											Revoke
										</Button>
									) : null}
								</div>
							))}
						</CardContent>
					</Card>
				) : null}

				{connection ? (
					<Card>
						<CardHeader>
							<CardTitle>Credential history</CardTitle>
							<CardDescription>
								Ordered connection and credential security events.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ol
								className="space-y-2 text-sm"
								data-testid="scim-event-history"
							>
								{connection.events.map((event) => (
									<li key={event.sequence} className="space-y-1 border-b pb-2">
										<div className="flex flex-wrap justify-between gap-2">
											<span>
												{event.sequence}. {event.type}
											</span>
											<time dateTime={event.createdAt}>
												{formatTimestamp(event.createdAt)}
											</time>
										</div>
										<p className="text-xs text-muted-foreground">
											Actor {event.actorUserId}
											{event.credentialId
												? ` · Credential ${shortCredentialId(event.credentialId)}`
												: ""}
										</p>
									</li>
								))}
							</ol>
						</CardContent>
					</Card>
				) : null}

				{connection ? (
					<Card>
						<CardHeader>
							<CardTitle>
								{connection.oidc
									? "Workforce SSO provider"
									: "Workforce SSO not configured"}
							</CardTitle>
							<CardDescription>
								{connection.oidc
									? "The local OpenID Connect provider signs the exact connection-scoped subjects provisioned through SCIM."
									: "SCIM provisioning remains available without the optional employee sign-in demo."}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{connection.oidc ? (
								<dl className="grid gap-3 text-sm">
									<div>
										<dt className="text-muted-foreground">Provider ID</dt>
										<dd>
											<code>{connection.oidc.providerId}</code>
										</dd>
									</div>
									<div>
										<dt className="text-muted-foreground">Issuer</dt>
										<dd className="break-all">
											<code>{connection.oidc.issuer}</code>
										</dd>
									</div>
								</dl>
							) : (
								<p className="text-sm text-muted-foreground">
									Set the server-only SCIM demo OIDC variables to enable
									connection-bound employee links and sign-in.
								</p>
							)}
						</CardContent>
					</Card>
				) : null}

				<Card>
					<CardHeader>
						<CardTitle>Persisted resources</CardTitle>
						<CardDescription>
							Read-only application state owned by this organization’s
							connection.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4 text-sm">
						<div>
							<h3 className="font-medium">
								Users ({connection?.resources.users.length ?? 0})
							</h3>
							{connection?.resources.users.map((user) => {
								const fixture = connection.directory.fixtures.find(
									(candidate) => candidate.subject === user.externalId,
								);
								const connectionAllowsSSO =
									connection.connection.status === "active";
								return (
									<div
										key={user.id}
										className="mt-2 flex flex-wrap items-center justify-between gap-3 border p-3"
									>
										<div>
											<p>{user.displayName}</p>
											<Badge variant="outline">
												{user.active ? "Active" : "Inactive"}
											</Badge>
										</div>
										{connection.oidc &&
										fixture &&
										user.active &&
										connectionAllowsSSO ? (
											<Button
												size="sm"
												variant="outline"
												disabled={
													isEmployeeLinkMutating ||
													(isMutating && !isLifecycleAtCheckpoint)
												}
												aria-label={`Copy employee access link for ${fixture.displayName}`}
												onClick={() =>
													copyEmployeeAccessLink(user.id, fixture.displayName)
												}
											>
												<KeyRound className="size-4" aria-hidden="true" />
												Copy employee link
											</Button>
										) : null}
									</div>
								);
							})}
							{employeeLinkMessage ? (
								<p className="mt-3 text-sm text-muted-foreground" role="status">
									{employeeLinkMessage}
								</p>
							) : null}
						</div>
						<div>
							<h3 className="font-medium">
								Groups ({connection?.resources.groups.length ?? 0})
							</h3>
							{connection?.resources.groups.map((group) => (
								<div key={group.id} className="mt-2 border p-3">
									{group.displayName}
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			<div className="space-y-5">
				<Card>
					<CardHeader className="space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="font-semibold leading-none">
								Entra-shaped local client
							</h2>
							<div className="flex flex-wrap gap-2">
								<Badge variant="outline">Focused subset</Badge>
								<Badge variant="secondary">
									Recipe v{ENTRA_LOCAL_RECIPE.version}
								</Badge>
							</div>
						</div>
						<CardDescription>
							Run a typed local client through this browser and the real SCIM
							endpoint. It follows a focused Entra provisioning sequence; it is
							not live Microsoft Entra certification.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="border bg-muted/20 p-3 text-sm">
							<p className="font-medium">Provider-shaped sequence</p>
							<p className="mt-1 text-muted-foreground">
								Discovery, Enterprise manager/report provisioning, the exact
								classic Entra Group marker, group membership, and an
								exact-string deactivation probe.
							</p>
						</div>

						<div aria-live="polite">
							{entraRecipeStatus === "passed" ? (
								<h3 className="font-medium">Recipe complete</h3>
							) : entraRecipeStatus === "running" ? (
								<h3 className="font-medium">Recipe in progress</h3>
							) : entraRecipeStatus === "failed" ? (
								<h3 className="font-medium">Recipe stopped</h3>
							) : entraRecipeStatus === "canceled" ? (
								<h3 className="font-medium">Recipe canceled</h3>
							) : (
								<h3 className="font-medium">Recipe ready</h3>
							)}
						</div>

						<ol
							className="space-y-2 text-sm"
							data-testid="entra-local-recipe-steps"
						>
							{entraRecipeSteps.map((step, index) => (
								<li
									key={step.key}
									className="border p-3"
									data-step-status={step.status}
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="font-medium">
												{index + 1}. {step.title}
											</p>
											{step.summary ? (
												<p className="mt-1 text-muted-foreground">
													{step.summary}
												</p>
											) : null}
										</div>
										<Badge
											variant={step.status === "passed" ? "default" : "outline"}
										>
											{step.status}
										</Badge>
									</div>
								</li>
							))}
						</ol>

						{entraRecipeError ? (
							<Alert variant="destructive">
								<AlertTitle>Recipe not completed</AlertTitle>
								<AlertDescription>{entraRecipeError}</AlertDescription>
							</Alert>
						) : null}

						{entraRecipeStatus === "running" ? (
							<Button variant="outline" onClick={cancelEntraLocalRecipe}>
								Cancel local recipe
							</Button>
						) : (
							<Button
								disabled={
									isMutating ||
									connection?.connection.status !== "active" ||
									!connection?.directory.fixtures.some(
										(fixture) => fixture.userKey === "maya-chen",
									) ||
									!connection?.directory.fixtures.some(
										(fixture) => fixture.userKey === "julian-foster",
									) ||
									issuedToken.length === 0
								}
								onClick={runEntraLocalRecipe}
							>
								<Send className="size-4" aria-hidden="true" />
								Run local recipe
							</Button>
						)}
						<p className="text-xs text-muted-foreground">
							The newly issued bearer is held only in component memory and
							cleared after success, failure, cancellation, navigation, or
							reload
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="font-semibold leading-none">
								Okta-shaped local client
							</h2>
							<div className="flex flex-wrap gap-2">
								<Badge variant="outline">Focused fixture</Badge>
								<Badge variant="secondary">
									Recipe v{OKTA_LOCAL_RECIPE.version}
								</Badge>
							</div>
						</div>
						<CardDescription>
							Run a typed local client through this browser and the real SCIM
							endpoint. It follows a focused Okta provisioning sequence. It
							isn’t live Okta certification.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="border bg-muted/20 p-3 text-sm">
							<p className="font-medium">Provider-shaped sequence</p>
							<p className="mt-1 text-muted-foreground">
								One-based startup reads, uniqueness lookups, full User
								replacement, Group Push membership delta, and native-Boolean
								pathless updates
							</p>
						</div>

						<div aria-live="polite">
							{oktaRecipeStatus === "passed" ? (
								<h3 className="font-medium">Okta recipe complete</h3>
							) : oktaRecipeStatus === "running" ? (
								<h3 className="font-medium">Okta recipe in progress</h3>
							) : oktaRecipeStatus === "failed" ? (
								<h3 className="font-medium">Okta recipe stopped</h3>
							) : oktaRecipeStatus === "canceled" ? (
								<h3 className="font-medium">Okta recipe canceled</h3>
							) : (
								<h3 className="font-medium">Okta recipe ready</h3>
							)}
						</div>

						<ol
							className="space-y-2 text-sm"
							data-testid="okta-local-recipe-steps"
						>
							{oktaRecipeSteps.map((step, index) => (
								<li
									key={step.key}
									className="border p-3"
									data-step-status={step.status}
								>
									<div className="flex items-start justify-between gap-3">
										<div>
											<p className="font-medium">
												{index + 1}. {step.title}
											</p>
											{step.summary ? (
												<p className="mt-1 text-muted-foreground">
													{step.summary}
												</p>
											) : null}
										</div>
										<Badge
											variant={step.status === "passed" ? "default" : "outline"}
										>
											{step.status}
										</Badge>
									</div>
								</li>
							))}
						</ol>

						{oktaRecipeError ? (
							<Alert variant="destructive">
								<AlertTitle>Okta recipe not completed</AlertTitle>
								<AlertDescription>{oktaRecipeError}</AlertDescription>
							</Alert>
						) : null}

						{oktaRecipeStatus === "running" ? (
							<Button variant="outline" onClick={cancelOktaLocalRecipe}>
								Cancel Okta recipe
							</Button>
						) : (
							<Button
								disabled={
									isMutating ||
									connection?.connection.status !== "active" ||
									!connection?.directory.fixtures.some(
										(fixture) => fixture.userKey === "maya-chen",
									) ||
									!connection?.directory.fixtures.some(
										(fixture) => fixture.userKey === "julian-foster",
									) ||
									issuedToken.length === 0
								}
								onClick={runOktaLocalRecipe}
							>
								<Send className="size-4" aria-hidden="true" />
								Run Okta recipe
							</Button>
						)}
						<p className="text-xs text-muted-foreground">
							The newly issued bearer is held only in component memory and
							cleared after success, failure, cancellation, navigation, or
							reload
						</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Local SCIM request console</CardTitle>
						<CardDescription>
							A transient provider fixture that sends directly from this browser
							to the real SCIM endpoint. It is not an identity provider.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="scim-console-token">Bearer token</Label>
							<Input
								id="scim-console-token"
								type="password"
								autoComplete="off"
								spellCheck={false}
								value={consoleToken}
								onChange={(event) => setConsoleToken(event.target.value)}
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
							<div className="space-y-2">
								<Label htmlFor="scim-console-method">Method</Label>
								<select
									id="scim-console-method"
									className="h-9 w-full border bg-background px-3 text-sm"
									value={consoleMethod}
									onChange={(event) => setConsoleMethod(event.target.value)}
								>
									{["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
										<option key={method} value={method}>
											{method}
										</option>
									))}
								</select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="scim-console-path">SCIM path</Label>
								<Input
									id="scim-console-path"
									value={consolePath}
									onChange={(event) => setConsolePath(event.target.value)}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="scim-console-body">JSON body</Label>
							<Textarea
								id="scim-console-body"
								className="min-h-80 font-mono text-xs"
								spellCheck={false}
								value={consoleBody}
								onChange={(event) => setConsoleBody(event.target.value)}
							/>
						</div>
						<Button
							disabled={
								isMutating ||
								connection?.connection.status !== "active" ||
								consoleToken.length === 0
							}
							onClick={sendSCIMRequest}
						>
							<Send className="size-4" aria-hidden="true" />
							Send SCIM request
						</Button>
						{consoleResult ? (
							<Alert>
								<AlertTitle>HTTP {consoleResult.status}</AlertTitle>
								<AlertDescription className="space-y-1">
									{consoleResult.resourceId ? (
										<p data-testid="scim-console-resource-id">
											Resource ID: {consoleResult.resourceId}
										</p>
									) : null}
									{typeof consoleResult.active === "boolean" ? (
										<p>Active: {String(consoleResult.active)}</p>
									) : null}
								</AlertDescription>
							</Alert>
						) : null}
						{error ? (
							<Alert variant="destructive">
								<AlertTitle>Request not completed</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						) : null}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
