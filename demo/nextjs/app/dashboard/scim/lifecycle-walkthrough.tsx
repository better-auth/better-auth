"use client";

import { Check, Loader2, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";

const SCIM_BASE_PATH = "/api/auth/scim/v2";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const LIFECYCLE_WALKTHROUGH = {
	version: 1,
	steps: [
		{ key: "baseline", title: "Read the active User and populated Group" },
		{ key: "deactivate", title: "Deactivate Maya with a native Boolean" },
		{ key: "reactivate", title: "Reactivate the same SCIM User" },
		{
			key: "delete-user",
			title: "Delete Maya and verify the tombstone boundary",
		},
		{
			key: "reprovision-user",
			title: "Reprovision the exact external identity",
		},
		{ key: "restore-user-membership", title: "Restore Maya’s membership" },
		{ key: "delete-group", title: "Delete the populated Finance group" },
		{ key: "recreate-group", title: "Recreate the exact empty Finance group" },
		{ key: "restore-group-membership", title: "Restore final membership" },
	] as const,
} as const;

type LifecycleStepKey = (typeof LIFECYCLE_WALKTHROUGH.steps)[number]["key"];
type LifecycleStatus = "idle" | "running" | "passed" | "failed" | "canceled";
type StepStatus = "idle" | "running" | "passed" | "failed";

interface LifecycleStepState {
	key: LifecycleStepKey;
	status: StepStatus;
	summary: string | null;
	title: string;
}

interface LifecycleDirectoryFixture {
	displayName: string;
	email: string;
	subject: string;
	userKey: string;
}

interface LifecycleResource {
	active?: boolean;
	displayName: string;
	externalId?: string | null;
	id: string;
	userName?: string;
}

interface LifecycleConnection {
	connection: {
		status: "active" | "decommissioning" | "decommissioned";
	};
	directory: {
		fixtures: LifecycleDirectoryFixture[];
	};
	resources: {
		groups: LifecycleResource[];
		users: LifecycleResource[];
	};
}

interface LifecycleWalkthroughProps {
	bearerToken: string;
	checkpointBlocked: boolean;
	connection: LifecycleConnection | null;
	disabled: boolean;
	onCheckpointChange: (ready: boolean) => void;
	onFinish: () => void;
	onRefresh: () => Promise<boolean>;
	onStart: () => boolean;
	organizationId: string;
}

interface WalkthroughResources {
	group: Record<string, unknown> & { id: string };
	originalGroupId: string;
	originalUserId: string;
	user: Record<string, unknown> & { id: string };
}

function initialSteps(): LifecycleStepState[] {
	return LIFECYCLE_WALKTHROUGH.steps.map((step) => ({
		...step,
		status: "idle",
		summary: null,
	}));
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function requireResource(
	value: unknown,
	schema: typeof SCIM_USER_SCHEMA | typeof SCIM_GROUP_SCHEMA,
	subject: string,
): Record<string, unknown> & { id: string } {
	const record = readRecord(value);
	if (
		!record ||
		typeof record.id !== "string" ||
		!Array.isArray(record.schemas) ||
		!record.schemas.includes(schema)
	) {
		throw new Error(`${subject} was not a canonical SCIM resource.`);
	}
	return { ...record, id: record.id };
}

function requireActive(
	resource: Record<string, unknown>,
	expected: boolean,
	subject: string,
) {
	if (resource.active !== expected) {
		throw new Error(`${subject} did not return canonical active ${expected}.`);
	}
}

function requireMembers(
	resource: Record<string, unknown>,
	expectedIds: string[],
	subject: string,
) {
	if (!Array.isArray(resource.members)) {
		throw new Error(`${subject} did not return canonical members.`);
	}
	const members = resource.members.flatMap((member) => {
		const record = readRecord(member);
		return record ? [record] : [];
	});
	if (
		members.length !== expectedIds.length ||
		!expectedIds.every((memberId) =>
			members.some(
				(member) =>
					member.value === memberId &&
					member.type === "User" &&
					member.$ref ===
						new URL(
							`${SCIM_BASE_PATH}/Users/${encodeURIComponent(memberId)}`,
							globalThis.location.origin,
						).href &&
					typeof member.display === "string" &&
					member.display.length > 0,
			),
		)
	) {
		throw new Error(
			`${subject} returned unexpected or non-canonical membership.`,
		);
	}
}

function requireNotFound(value: unknown, subject: string) {
	const record = readRecord(value);
	if (
		!record ||
		!Array.isArray(record.schemas) ||
		!record.schemas.includes(SCIM_ERROR_SCHEMA) ||
		record.status !== "404"
	) {
		throw new Error(`${subject} did not return a canonical SCIM 404 Error.`);
	}
}

function createDirectoryUserBody(fixture: LifecycleDirectoryFixture) {
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
		active: true,
	};
}

function createGroupBody(organizationId: string) {
	return {
		schemas: [SCIM_GROUP_SCHEMA],
		externalId: `scim-demo:${organizationId}-finance-admins`,
		displayName: "Finance administrators",
		members: [],
	};
}

function nextStepAction(key: LifecycleStepKey): string {
	switch (key) {
		case "baseline":
			return "Begin walkthrough";
		case "deactivate":
			return "Deactivate Maya";
		case "reactivate":
			return "Reactivate Maya";
		case "delete-user":
			return "Delete Maya";
		case "reprovision-user":
			return "Reprovision Maya";
		case "restore-user-membership":
			return "Restore membership";
		case "delete-group":
			return "Delete Finance group";
		case "recreate-group":
			return "Recreate Finance group";
		case "restore-group-membership":
			return "Restore final membership";
	}
}

export function LifecycleWalkthrough({
	bearerToken,
	checkpointBlocked,
	connection,
	disabled,
	onCheckpointChange,
	onFinish,
	onRefresh,
	onStart,
	organizationId,
}: LifecycleWalkthroughProps) {
	const [error, setError] = useState<string | null>(null);
	const [isRequesting, setIsRequesting] = useState(false);
	const [status, setStatus] = useState<LifecycleStatus>("idle");
	const [steps, setSteps] = useState(initialSteps);
	const bearerTokenRef = useRef("");
	const controllerRef = useRef<AbortController | null>(null);
	const resourcesRef = useRef<WalkthroughResources | null>(null);
	const operationInFlightRef = useRef(false);
	const finishedRef = useRef(true);

	const nextStep = steps.find((step) => step.status !== "passed") ?? null;
	const directoryFixture = connection?.directory.fixtures.find(
		(candidate) => candidate.userKey === "maya-chen",
	);
	const initialUser = connection?.resources.users.find(
		(user) => user.externalId === directoryFixture?.subject,
	);
	const initialGroup = connection?.resources.groups.find(
		(group) =>
			group.externalId === `scim-demo:${organizationId}-finance-admins`,
	);
	const isActive = status === "running";
	const canBegin =
		!disabled &&
		connection?.connection.status === "active" &&
		Boolean(directoryFixture && initialUser && initialGroup && bearerToken);

	useEffect(
		() => () => {
			finishedRef.current = true;
			controllerRef.current?.abort();
			controllerRef.current = null;
			bearerTokenRef.current = "";
			resourcesRef.current = null;
		},
		[],
	);

	function updateStep(
		key: LifecycleStepKey,
		stepStatus: StepStatus,
		summary: string | null = null,
	) {
		setSteps((current) =>
			current.map((step) =>
				step.key === key ? { ...step, status: stepStatus, summary } : step,
			),
		);
	}

	function finish(nextStatus: Exclude<LifecycleStatus, "idle" | "running">) {
		if (finishedRef.current) return;
		finishedRef.current = true;
		controllerRef.current?.abort();
		controllerRef.current = null;
		bearerTokenRef.current = "";
		resourcesRef.current = null;
		operationInFlightRef.current = false;
		setIsRequesting(false);
		setStatus(nextStatus);
		onCheckpointChange(false);
		onFinish();
	}

	async function requestSCIM(
		path: string,
		input: {
			body?: unknown;
			method?: "GET" | "POST" | "PATCH" | "DELETE";
			expectedStatus?: 200 | 201 | 204 | 404;
		} = {},
	): Promise<unknown> {
		const expectedStatus = input.expectedStatus ?? 200;
		const response = await fetch(`${SCIM_BASE_PATH}${path}`, {
			method: input.method ?? "GET",
			cache: "no-store",
			credentials: "omit",
			referrerPolicy: "no-referrer",
			signal: controllerRef.current?.signal,
			headers: {
				accept: "application/scim+json",
				authorization: `Bearer ${bearerTokenRef.current}`,
				...(input.body === undefined
					? {}
					: { "content-type": "application/scim+json" }),
			},
			...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
		});
		const responseText = await response.text();
		let body: unknown = null;
		if (responseText.length > 0) {
			try {
				body = JSON.parse(responseText);
			} catch {
				throw new Error("The SCIM endpoint returned invalid JSON.");
			}
		}
		if (response.status !== expectedStatus) {
			throw new Error(
				`The SCIM endpoint returned HTTP ${response.status}; expected ${expectedStatus}.`,
			);
		}
		if (expectedStatus === 204) {
			if (responseText.length !== 0) {
				throw new Error("The SCIM endpoint returned a body with HTTP 204.");
			}
		} else {
			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.toLowerCase().includes("application/scim+json")) {
				throw new Error(
					`The SCIM endpoint returned ${contentType || "no content type"}.`,
				);
			}
		}
		if (expectedStatus === 404) {
			requireNotFound(body, path);
		}
		return body;
	}

	async function readUser(userId: string, expectedActive: boolean) {
		const user = requireResource(
			await requestSCIM(`/Users/${encodeURIComponent(userId)}`),
			SCIM_USER_SCHEMA,
			"Maya User GET",
		);
		requireActive(user, expectedActive, "Maya User GET");
		return user;
	}

	async function readGroup(groupId: string, expectedMemberIds: string[]) {
		const group = requireResource(
			await requestSCIM(`/Groups/${encodeURIComponent(groupId)}`),
			SCIM_GROUP_SCHEMA,
			"Finance Group GET",
		);
		requireMembers(group, expectedMemberIds, "Finance Group GET");
		return group;
	}

	async function executeStep(
		key: LifecycleStepKey,
		run: () => Promise<string>,
	) {
		operationInFlightRef.current = true;
		onCheckpointChange(false);
		setIsRequesting(true);
		updateStep(key, "running");
		try {
			const summary = await run();
			if (finishedRef.current) return;
			updateStep(key, "passed", summary);
			if (!(await onRefresh())) {
				throw new Error(
					"The management view could not confirm the lifecycle checkpoint.",
				);
			}
			if (key === "restore-group-membership") {
				finish("passed");
			} else {
				onCheckpointChange(true);
			}
		} catch (cause) {
			if (finishedRef.current) return;
			updateStep(key, "failed");
			if (cause instanceof Error && cause.name === "AbortError") {
				finish("canceled");
			} else {
				setError(
					cause instanceof Error
						? cause.message
						: "The lifecycle walkthrough could not be completed.",
				);
				finish("failed");
			}
		} finally {
			operationInFlightRef.current = false;
			if (!finishedRef.current) setIsRequesting(false);
		}
	}

	async function runStep(key: LifecycleStepKey) {
		if (operationInFlightRef.current) return;
		const currentDirectoryFixture = directoryFixture;
		const currentInitialUser = initialUser;
		const currentInitialGroup = initialGroup;
		if (key === "baseline") {
			if (
				!currentDirectoryFixture ||
				!currentInitialUser ||
				!currentInitialGroup ||
				!bearerToken
			) {
				return;
			}
			if (!onStart()) return;
			finishedRef.current = false;
			onCheckpointChange(false);
			bearerTokenRef.current = bearerToken;
			controllerRef.current = new AbortController();
			resourcesRef.current = null;
			setError(null);
			setSteps(initialSteps());
			setStatus("running");
			await executeStep("baseline", async () => {
				const user = await readUser(currentInitialUser.id, true);
				const group = await readGroup(currentInitialGroup.id, [
					currentInitialUser.id,
				]);
				if (
					user.externalId !== currentDirectoryFixture.subject ||
					user.userName !== currentDirectoryFixture.email ||
					group.externalId !== `scim-demo:${organizationId}-finance-admins` ||
					group.displayName !== "Finance administrators"
				) {
					throw new Error(
						"The baseline resources did not match the typed lifecycle fixture.",
					);
				}
				resourcesRef.current = {
					user,
					group,
					originalUserId: user.id,
					originalGroupId: group.id,
				};
				return "Canonical GETs returned active Maya and Finance membership";
			});
			return;
		}

		const resources = resourcesRef.current;
		if (!resources || !currentDirectoryFixture) {
			setError("The lifecycle state was not retained. Rotate and start again.");
			finish("failed");
			return;
		}

		switch (key) {
			case "deactivate":
				await executeStep(key, async () => {
					await requestSCIM(`/Users/${encodeURIComponent(resources.user.id)}`, {
						method: "PATCH",
						expectedStatus: 200,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "replace",
									path: "active",
									value: false,
								},
							],
						},
					});
					resources.user = await readUser(resources.user.id, false);
					return "HTTP 200; canonical GET returned active false with the same ID";
				});
				break;
			case "reactivate":
				await executeStep(key, async () => {
					await requestSCIM(`/Users/${encodeURIComponent(resources.user.id)}`, {
						method: "PATCH",
						expectedStatus: 200,
						body: {
							schemas: [SCIM_PATCH_SCHEMA],
							Operations: [
								{
									op: "replace",
									path: "active",
									value: true,
								},
							],
						},
					});
					resources.user = await readUser(resources.user.id, true);
					return "HTTP 200; canonical GET returned active true with the same ID";
				});
				break;
			case "delete-user":
				await executeStep(key, async () => {
					const deletedUserId = resources.user.id;
					await requestSCIM(`/Users/${encodeURIComponent(deletedUserId)}`, {
						method: "DELETE",
						expectedStatus: 204,
					});
					await requestSCIM(`/Users/${encodeURIComponent(deletedUserId)}`, {
						expectedStatus: 404,
					});
					resources.group = await readGroup(resources.group.id, []);
					return "HTTP 204; User GET returned 404 and Finance became empty";
				});
				break;
			case "reprovision-user":
				await executeStep(key, async () => {
					const user = requireResource(
						await requestSCIM("/Users", {
							method: "POST",
							expectedStatus: 201,
							body: createDirectoryUserBody(currentDirectoryFixture),
						}),
						SCIM_USER_SCHEMA,
						"Reprovisioned Maya User",
					);
					requireActive(user, true, "Reprovisioned Maya User");
					if (
						user.id === resources.originalUserId ||
						user.externalId !== currentDirectoryFixture.subject ||
						user.userName !== currentDirectoryFixture.email
					) {
						throw new Error(
							"Reprovisioning did not create a new exact external SCIM User.",
						);
					}
					resources.user = user;
					resources.group = await readGroup(resources.group.id, []);
					return "HTTP 201 returned a new SCIM ID; Finance stayed empty";
				});
				break;
			case "restore-user-membership":
				await executeStep(key, async () => {
					await requestSCIM(
						`/Groups/${encodeURIComponent(resources.group.id)}`,
						{
							method: "PATCH",
							expectedStatus: 200,
							body: {
								schemas: [SCIM_PATCH_SCHEMA],
								Operations: [
									{
										op: "add",
										path: "members",
										value: [{ value: resources.user.id }],
									},
								],
							},
						},
					);
					resources.group = await readGroup(resources.group.id, [
						resources.user.id,
					]);
					return "HTTP 200; canonical GET returned the explicit new membership";
				});
				break;
			case "delete-group":
				await executeStep(key, async () => {
					const deletedGroupId = resources.group.id;
					await requestSCIM(`/Groups/${encodeURIComponent(deletedGroupId)}`, {
						method: "DELETE",
						expectedStatus: 204,
					});
					await requestSCIM(`/Groups/${encodeURIComponent(deletedGroupId)}`, {
						expectedStatus: 404,
					});
					resources.user = await readUser(resources.user.id, true);
					return "HTTP 204; Group GET returned 404 while Maya stayed active";
				});
				break;
			case "recreate-group":
				await executeStep(key, async () => {
					const group = requireResource(
						await requestSCIM("/Groups", {
							method: "POST",
							expectedStatus: 201,
							body: createGroupBody(organizationId),
						}),
						SCIM_GROUP_SCHEMA,
						"Recreated Finance Group",
					);
					if (
						group.id === resources.originalGroupId ||
						group.externalId !== `scim-demo:${organizationId}-finance-admins` ||
						group.displayName !== "Finance administrators"
					) {
						throw new Error(
							"Recreation did not create a new exact external SCIM Group.",
						);
					}
					requireMembers(group, [], "Recreated Finance Group");
					resources.group = group;
					return "HTTP 201 returned a new empty Group with the exact external identity";
				});
				break;
			case "restore-group-membership":
				await executeStep(key, async () => {
					await requestSCIM(
						`/Groups/${encodeURIComponent(resources.group.id)}`,
						{
							method: "PATCH",
							expectedStatus: 200,
							body: {
								schemas: [SCIM_PATCH_SCHEMA],
								Operations: [
									{
										op: "add",
										path: "members",
										value: [{ value: resources.user.id }],
									},
								],
							},
						},
					);
					resources.group = await readGroup(resources.group.id, [
						resources.user.id,
					]);
					return "HTTP 200; canonical GET returned the final explicit membership";
				});
				break;
		}
	}

	function cancel() {
		controllerRef.current?.abort();
		finish("canceled");
	}

	return (
		<Card>
			<CardHeader className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="font-semibold leading-none">Lifecycle walkthrough</h2>
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">Ordered state machine</Badge>
						<Badge variant="secondary">
							Walkthrough v{LIFECYCLE_WALKTHROUGH.version}
						</Badge>
					</div>
				</div>
				<CardDescription>
					Exercise deactivation, deletion, tombstone relinking, and Group
					recreation from this browser through the real SCIM endpoint. This
					faithful local client is not live Entra or Okta certification.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<div aria-live="polite">
					{status === "passed" ? (
						<h3 className="font-medium">Lifecycle complete</h3>
					) : status === "running" ? (
						<h3 className="font-medium">Lifecycle in progress</h3>
					) : status === "failed" ? (
						<h3 className="font-medium">Lifecycle stopped</h3>
					) : status === "canceled" ? (
						<h3 className="font-medium">Lifecycle canceled</h3>
					) : (
						<h3 className="font-medium">Lifecycle ready</h3>
					)}
				</div>

				<ol className="space-y-2 text-sm" data-testid="scim-lifecycle-steps">
					{steps.map((step, index) => (
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
										<p className="mt-1 text-muted-foreground">{step.summary}</p>
									) : null}
								</div>
								<Badge
									variant={step.status === "passed" ? "default" : "outline"}
								>
									{step.status === "running" ? (
										<Loader2
											className="mr-1 size-3 animate-spin"
											aria-hidden="true"
										/>
									) : step.status === "passed" ? (
										<Check className="mr-1 size-3" aria-hidden="true" />
									) : null}
									{step.status}
								</Badge>
							</div>
						</li>
					))}
				</ol>

				{error ? (
					<Alert variant="destructive">
						<AlertTitle>Lifecycle not completed</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}

				{isActive && nextStep ? (
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={isRequesting || checkpointBlocked}
							onClick={() => void runStep(nextStep.key)}
						>
							{nextStepAction(nextStep.key)}
						</Button>
						<Button
							variant="outline"
							disabled={checkpointBlocked}
							onClick={cancel}
						>
							<Square className="size-4" aria-hidden="true" />
							Abort walkthrough
						</Button>
					</div>
				) : (
					<Button disabled={!canBegin} onClick={() => void runStep("baseline")}>
						<RotateCcw className="size-4" aria-hidden="true" />
						Begin walkthrough
					</Button>
				)}

				<p className="text-xs text-muted-foreground">
					Start with a freshly rotated bearer after the Entra recipe. The bearer
					is removed from the page at handoff and cleared after success,
					failure, abort, navigation, or reload.
				</p>
			</CardContent>
		</Card>
	);
}
