import * as z from "zod";
import { createSCIMError } from "./scim-error";
import type { SCIMEmail, SCIMName, SCIMUser } from "./types";
import {
	createSCIMEmailTupleKey,
	normalizeSCIMEmails,
	readSCIMEmails,
	serializeSCIMEmails,
} from "./user-profile";

const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_USER_SCHEMA_PREFIX =
	/^urn:ietf:params:scim:schemas:core:2\.0:user:/i;
const WORK_EMAIL_VALUE_PATH =
	/^emails\s*\[\s*type\s+eq\s+"work"\s*\]\s*\.\s*value$/i;
const scimEmailValueSchema = z.email().max(254);

export const patchSCIMUserBodySchema = z.object({
	schemas: z
		.array(z.string())
		.refine((schemas) => schemas.includes(SCIM_PATCH_SCHEMA), {
			message: "Invalid schemas for PatchOp",
		}),
	Operations: z
		.array(
			z.object({
				op: z
					.string()
					.toLowerCase()
					.default("replace")
					.pipe(z.enum(["replace", "add", "remove"])),
				path: z.string().optional(),
				value: z.unknown().optional(),
			}),
		)
		.min(1),
});

const patchEmailSchema = z.object({
	value: scimEmailValueSchema,
	primary: z.boolean().optional(),
	type: z.string().trim().min(1).optional(),
});

/** Complete canonical User state produced by an ordered SCIM PATCH. */
export interface SCIMUserPatchState {
	userName: string;
	primaryEmail: string;
	emails: SCIMEmail[];
	displayName: string;
	formattedName: string;
	givenName: string | undefined;
	familyName: string | undefined;
	externalId: string | undefined;
	active: boolean;
}

/** Whether an applied PATCH changes the canonical persisted User resource. */
export function scimUserPatchChangesState(
	user: SCIMUser,
	state: SCIMUserPatchState,
): boolean {
	return (
		user.userName !== state.userName ||
		user.primaryEmail !== state.primaryEmail ||
		user.serializedEmails !== serializeSCIMEmails(state.emails) ||
		user.displayName !== state.displayName ||
		user.formattedName !== state.formattedName ||
		(user.givenName ?? undefined) !== state.givenName ||
		(user.familyName ?? undefined) !== state.familyName ||
		(user.externalId ?? undefined) !== state.externalId ||
		user.active !== state.active
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidPatchValue(detail: string): never {
	throw createSCIMError("BAD_REQUEST", {
		detail,
		scimType: "invalidValue",
	});
}

function readNonEmptyString(value: unknown, attribute: string): string {
	if (typeof value !== "string" || !value.trim()) {
		return invalidPatchValue(`${attribute} must be a non-empty string`);
	}
	return value.trim();
}

function readEmail(value: unknown): string {
	const parsed = scimEmailValueSchema.safeParse(value);
	if (!parsed.success)
		return invalidPatchValue("emails.value must be an email");
	return parsed.data.toLowerCase();
}

function readEmailValues(value: unknown): SCIMEmail[] {
	const parsed = z.array(patchEmailSchema).min(1).max(20).safeParse(value);
	if (!parsed.success) {
		return invalidPatchValue(
			"emails must contain between 1 and 20 valid emails",
		);
	}
	return parsed.data;
}

function readEmailSet(value: unknown, userName: string): SCIMEmail[] {
	const emails = readEmailValues(value);
	if (emails.filter((email) => email.primary).length > 1) {
		return invalidPatchValue("emails cannot contain multiple primary values");
	}
	if (new Set(emails.map(createSCIMEmailTupleKey)).size !== emails.length) {
		return invalidPatchValue(
			"emails cannot contain duplicate type and value pairs",
		);
	}
	return normalizeSCIMEmails(userName, emails);
}

function readName(value: unknown): Partial<SCIMName> {
	if (!isRecord(value)) return invalidPatchValue("name must be an object");
	const name: Partial<SCIMName> = {};
	for (const [attribute, attributeValue] of Object.entries(value)) {
		switch (attribute.toLowerCase()) {
			case "formatted":
				name.formatted = readNonEmptyString(attributeValue, "name.formatted");
				break;
			case "givenname":
				name.givenName = readNonEmptyString(attributeValue, "name.givenName");
				break;
			case "familyname":
				name.familyName = readNonEmptyString(attributeValue, "name.familyName");
				break;
			default:
				throw createSCIMError("BAD_REQUEST", {
					detail: `User attribute name.${attribute} is not supported`,
					scimType: "invalidPath",
				});
		}
	}
	return name;
}

function rejectReadOnlyAttribute(attribute: string): never {
	throw createSCIMError("BAD_REQUEST", {
		detail: `${attribute} is read-only`,
		scimType: "mutability",
	});
}

function setFormattedName(
	state: SCIMUserPatchState,
	formattedName: string,
): void {
	const displayNameWasDerived = state.displayName === state.formattedName;
	state.formattedName = formattedName;
	if (displayNameWasDerived) state.displayName = formattedName;
}

function composeName(state: SCIMUserPatchState): string {
	return [state.givenName, state.familyName].filter(Boolean).join(" ");
}

function setNamePart(
	state: SCIMUserPatchState,
	attribute: "givenName" | "familyName",
	value: string | undefined,
): void {
	const previousComposedName = composeName(state);
	const formattedNameWasDerived =
		previousComposedName.length > 0 &&
		state.formattedName === previousComposedName;
	state[attribute] = value;
	if (formattedNameWasDerived) {
		setFormattedName(
			state,
			composeName(state) || state.displayName || state.primaryEmail,
		);
	}
}

function setEmails(
	state: SCIMUserPatchState,
	emails: readonly SCIMEmail[],
): void {
	state.emails = readEmailSet(emails, state.userName);
	state.primaryEmail =
		state.emails.find((email) => email.primary)?.value ??
		state.emails[0]?.value ??
		invalidPatchValue("emails must contain at least one value");
}

function coalesceEmailTuples(emails: readonly SCIMEmail[]): SCIMEmail[] {
	const byTuple = new Map<string, SCIMEmail>();
	for (const email of emails) {
		const key = createSCIMEmailTupleKey(email);
		const existing = byTuple.get(key);
		if (!existing) {
			byTuple.set(key, email);
			continue;
		}
		if (email.primary && !existing.primary) {
			byTuple.set(key, { ...existing, primary: true });
		}
	}
	return [...byTuple.values()];
}

function addEmails(state: SCIMUserPatchState, value: unknown): void {
	const additions = coalesceEmailTuples(
		readEmailValues(value).map((email) => ({
			value: email.value.trim().toLowerCase(),
			...(email.type?.trim() ? { type: email.type.trim().toLowerCase() } : {}),
			primary: email.primary === true,
		})),
	);
	if (additions.filter((email) => email.primary).length > 1) {
		invalidPatchValue("emails cannot contain multiple primary values");
	}
	const existingTupleKeys = new Set(state.emails.map(createSCIMEmailTupleKey));
	const newEmails = additions.filter(
		(email) => !existingTupleKeys.has(createSCIMEmailTupleKey(email)),
	);
	if (newEmails.length === 0) return;

	const existingEmails = newEmails.some((email) => email.primary)
		? state.emails.map((email) => ({ ...email, primary: false }))
		: state.emails;
	setEmails(state, [...existingEmails, ...newEmails]);
}

function replaceAllEmailValues(
	state: SCIMUserPatchState,
	value: unknown,
): void {
	const replacement = readEmail(value);
	setEmails(
		state,
		coalesceEmailTuples(
			state.emails.map((email) => ({ ...email, value: replacement })),
		),
	);
}

function replaceSelectedEmail(
	state: SCIMUserPatchState,
	selector: "work",
	op: "add" | "replace",
	value: unknown,
): void {
	const replacement = readEmail(value);
	const matches = (email: SCIMEmail) => email.type === "work";
	const hasSelection = state.emails.some(matches);
	if (!hasSelection && op === "add") {
		setEmails(state, [
			...state.emails,
			{ value: replacement, type: "work", primary: false },
		]);
		return;
	}
	if (!hasSelection) {
		throw createSCIMError("BAD_REQUEST", {
			detail: `No ${selector} email matches the PATCH path`,
			scimType: "noTarget",
		});
	}
	const emails = state.emails.map((email) =>
		matches(email) ? { ...email, value: replacement } : email,
	);
	setEmails(state, coalesceEmailTuples(emails));
}

function normalizePatchPath(path: string): string {
	return path
		.trim()
		.replace(SCIM_USER_SCHEMA_PREFIX, "")
		.replace(/\s+/g, "")
		.toLowerCase();
}

/** Apply ordered User PatchOp operations without mutating persisted state. */
export function applySCIMUserPatch(
	user: SCIMUser,
	operations: z.infer<typeof patchSCIMUserBodySchema>["Operations"],
): SCIMUserPatchState {
	const state: SCIMUserPatchState = {
		userName: user.userName,
		primaryEmail: user.primaryEmail,
		emails: readSCIMEmails(user),
		displayName: user.displayName,
		formattedName: user.formattedName,
		givenName: user.givenName ?? undefined,
		familyName: user.familyName ?? undefined,
		externalId: user.externalId ?? undefined,
		active: user.active,
	};

	function applyAttribute(
		op: "add" | "remove" | "replace",
		path: string,
		value: unknown,
	): void {
		const schemaRelativePath = path.trim().replace(SCIM_USER_SCHEMA_PREFIX, "");
		const normalizedPath = normalizePatchPath(path);
		if (
			normalizedPath === "id" ||
			normalizedPath === "schemas" ||
			normalizedPath === "meta" ||
			normalizedPath.startsWith("meta.")
		) {
			rejectReadOnlyAttribute(path);
		}

		switch (normalizedPath) {
			case "username":
				if (op === "remove") rejectReadOnlyAttribute("userName");
				state.userName = readNonEmptyString(value, "userName");
				return;
			case "externalid":
				state.externalId =
					op === "remove" ? undefined : readNonEmptyString(value, "externalId");
				return;
			case "active":
				if (op === "remove") {
					state.active = true;
					return;
				}
				if (typeof value !== "boolean") {
					invalidPatchValue("active must be a boolean");
				}
				state.active = value;
				return;
			case "displayname":
				state.displayName =
					op === "remove"
						? state.formattedName
						: readNonEmptyString(value, "displayName");
				return;
			case "name": {
				if (op === "remove") {
					state.givenName = undefined;
					state.familyName = undefined;
					setFormattedName(state, state.displayName || state.primaryEmail);
					return;
				}
				const name = readName(value);
				if (op === "replace") {
					state.givenName = name.givenName;
					state.familyName = name.familyName;
					setFormattedName(
						state,
						(name.formatted ?? composeName(state)) || state.displayName,
					);
					return;
				}
				if (name.givenName !== undefined) {
					setNamePart(state, "givenName", name.givenName);
				}
				if (name.familyName !== undefined) {
					setNamePart(state, "familyName", name.familyName);
				}
				if (name.formatted !== undefined) {
					setFormattedName(state, name.formatted);
				}
				return;
			}
			case "name.formatted":
				setFormattedName(
					state,
					op === "remove"
						? composeName(state) || state.displayName || state.primaryEmail
						: readNonEmptyString(value, "name.formatted"),
				);
				return;
			case "name.givenname":
				setNamePart(
					state,
					"givenName",
					op === "remove"
						? undefined
						: readNonEmptyString(value, "name.givenName"),
				);
				return;
			case "name.familyname":
				setNamePart(
					state,
					"familyName",
					op === "remove"
						? undefined
						: readNonEmptyString(value, "name.familyName"),
				);
				return;
			case "emails":
				if (op === "remove") {
					invalidPatchValue("emails cannot be removed");
				}
				if (op === "add") {
					addEmails(state, value);
					return;
				}
				setEmails(state, readEmailSet(value, state.userName));
				return;
			case "emails.value":
				if (op === "remove") {
					invalidPatchValue("emails.value cannot be removed");
				}
				replaceAllEmailValues(state, value);
				return;
			default:
				if (WORK_EMAIL_VALUE_PATH.test(schemaRelativePath)) {
					if (op === "remove") {
						const remaining = state.emails.filter(
							(email) => email.type !== "work",
						);
						if (remaining.length === state.emails.length) return;
						setEmails(state, remaining);
						return;
					}
					replaceSelectedEmail(state, "work", op, value);
					return;
				}
				throw createSCIMError("BAD_REQUEST", {
					detail: `User PATCH path ${path} is not supported`,
					scimType: "invalidPath",
				});
		}
	}

	for (const operation of operations) {
		const path = operation.path?.trim();
		if (path) {
			applyAttribute(operation.op, path, operation.value);
			continue;
		}
		if (operation.op === "remove") {
			throw createSCIMError("BAD_REQUEST", {
				detail: "A remove User PATCH operation requires a path",
				scimType: "noTarget",
			});
		}
		if (!isRecord(operation.value)) {
			invalidPatchValue("A pathless User PATCH value must be an object");
		}
		for (const [attribute, value] of Object.entries(operation.value)) {
			applyAttribute(operation.op, attribute, value);
		}
	}

	return state;
}
