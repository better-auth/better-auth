import * as z from "zod";
import type { SCIMCanonicalEmail, SCIMEmail, SCIMName } from "./configuration";
import type { SCIMUser } from "./persistence";
import {
	resolveSCIMCanonicalAttributePath,
	stripSCIMCoreAttributePrefix,
} from "./resource-schema-registry";
import { createSCIMError } from "./scim-error";
import { readSCIMUserAttributes } from "./user-attributes";
import { createSCIMEmailTupleKey } from "./user-email";
import {
	createCanonicalSCIMUserProfile,
	normalizeSCIMEmails,
} from "./user-profile";
import type { SCIMCanonicalUserAttributes } from "./user-schemas";
import {
	APIUserSchema,
	hasUniqueSCIMDefinedTypes,
	SCIM_ENTERPRISE_USER_SCHEMA,
	SCIMEnterpriseUserInputSchema,
	SCIMEnterpriseUserResourceSchema,
	SCIMUserResourceSchema,
} from "./user-schemas";

const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const EMAIL_TYPE_VALUE_PATH =
	/^emails\s*\[\s*type\s+eq\s+"([^"]+)"\s*\]\s*\.\s*value$/i;
/** Matches Microsoft Entra's `emails[primary eq true].value` PATCH path. */
const EMAIL_PRIMARY_VALUE_PATH =
	/^emails\s*\[\s*primary\s+eq\s+"?true"?\s*\]\s*\.\s*value$/i;
const scimEmailValueSchema = z.email().max(254);

export const patchSCIMUserBodySchema = z.object({
	schemas: z
		.array(z.literal(SCIM_PATCH_SCHEMA))
		.length(1, "schemas must contain only the PatchOp schema"),
	// An empty array is a valid no-op PATCH (Microsoft Entra sends one).
	Operations: z.array(
		z.object({
			op: z
				.string()
				.toLowerCase()
				.default("replace")
				.pipe(z.enum(["replace", "add", "remove"])),
			path: z.string().optional(),
			value: z.unknown().optional(),
		}),
	),
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
	emails: SCIMCanonicalEmail[];
	displayName: string;
	formattedName: string;
	givenName: string | undefined;
	familyName: string | undefined;
	middleName: string | undefined;
	honorificPrefix: string | undefined;
	honorificSuffix: string | undefined;
	externalId: string | undefined;
	active: boolean;
	attributes: SCIMCanonicalUserAttributes;
}

function createComparableSCIMPatchValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(createComparableSCIMPatchValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, item]) => item !== undefined)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, createComparableSCIMPatchValue(item)]),
	);
}

/** Whether an applied PATCH changes the canonical persisted User resource. */
export function scimUserPatchChangesState(
	user: SCIMUser,
	state: SCIMUserPatchState,
): boolean {
	const attributes = readSCIMUserAttributes(user);
	return (
		user.userName !== state.userName ||
		user.primaryEmail !== state.primaryEmail ||
		JSON.stringify(createComparableSCIMPatchValue(attributes.emails)) !==
			JSON.stringify(createComparableSCIMPatchValue(state.emails)) ||
		user.displayName !== state.displayName ||
		attributes.name.formatted !== state.formattedName ||
		attributes.name.givenName !== state.givenName ||
		attributes.name.familyName !== state.familyName ||
		attributes.name.middleName !== state.middleName ||
		attributes.name.honorificPrefix !== state.honorificPrefix ||
		attributes.name.honorificSuffix !== state.honorificSuffix ||
		(user.externalId ?? undefined) !== state.externalId ||
		user.active !== state.active ||
		JSON.stringify(createComparableSCIMPatchValue(attributes)) !==
			JSON.stringify(createComparableSCIMPatchValue(state.attributes))
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

/**
 * Unwrap a PATCH operation value Microsoft Entra sent as a single-element
 * array for what is actually a single-valued attribute.
 */
function unwrapSinglePatchValue(value: unknown): unknown {
	return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function readNonEmptyString(value: unknown, attribute: string): string {
	const scalar = unwrapSinglePatchValue(value);
	if (typeof scalar !== "string" || !scalar.trim()) {
		return invalidPatchValue(`${attribute} must be a non-empty string`);
	}
	return scalar.trim();
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

function readEmailSet(value: unknown, userName: string): SCIMCanonicalEmail[] {
	const emails = readEmailValues(value);
	if (emails.filter((email) => email.primary).length > 1) {
		return invalidPatchValue("emails cannot contain multiple primary values");
	}
	if (new Set(emails.map(createSCIMEmailTupleKey)).size !== emails.length) {
		return invalidPatchValue(
			"emails cannot contain duplicate type and value pairs",
		);
	}
	if (!hasUniqueSCIMDefinedTypes(emails)) {
		return invalidPatchValue("emails cannot contain duplicate defined types");
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
			case "middlename":
				name.middleName = readNonEmptyString(attributeValue, "name.middleName");
				break;
			case "honorificprefix":
				name.honorificPrefix = readNonEmptyString(
					attributeValue,
					"name.honorificPrefix",
				);
				break;
			case "honorificsuffix":
				name.honorificSuffix = readNonEmptyString(
					attributeValue,
					"name.honorificSuffix",
				);
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
	attribute:
		| "familyName"
		| "givenName"
		| "honorificPrefix"
		| "honorificSuffix"
		| "middleName",
	value: string | undefined,
): void {
	state[attribute] = value;
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
		state.emails.map((email) => ({ ...email, value: replacement })),
	);
}

function replaceSelectedEmail(
	state: SCIMUserPatchState,
	selector: string,
	value: unknown,
): void {
	const replacement = readEmail(value);
	const matches = (email: SCIMEmail) => email.type === selector;
	const hasSelection = state.emails.some(matches);
	// A selector miss appends the email: Entra replaces addresses it has not created yet.
	if (!hasSelection) {
		setEmails(state, [
			...state.emails,
			{ value: replacement, type: selector, primary: false },
		]);
		return;
	}
	const emails = state.emails.map((email) =>
		matches(email) ? { ...email, value: replacement } : email,
	);
	setEmails(state, emails);
}

/** Replace the currently primary email's value, keeping `primary` on it. */
function replacePrimaryEmail(state: SCIMUserPatchState, value: unknown): void {
	const replacement = readEmail(value);
	if (!state.emails.some((email) => email.primary)) {
		throw createSCIMError("BAD_REQUEST", {
			detail: "No primary email matches the PATCH path",
			scimType: "noTarget",
		});
	}
	setEmails(
		state,
		state.emails.map((email) =>
			email.primary ? { ...email, value: replacement } : email,
		),
	);
}

function normalizePatchPath(path: string): string {
	return resolveSCIMCanonicalAttributePath("User", path.trim()).toLowerCase();
}

interface SCIMPatchAttributeDescriptor {
	name: string;
	type: string;
	multiValued: boolean;
	mutability?: string;
	subAttributes?: readonly SCIMPatchAttributeDescriptor[];
}

interface ResolvedSCIMPatchPath {
	attribute: SCIMPatchAttributeDescriptor;
	attributeName: string;
	enterprise: boolean;
	selectorType?: string;
	selectorPrimary?: boolean;
	subAttribute?: SCIMPatchAttributeDescriptor;
	subAttributeName?: string;
}

const SCIM_VALUE_PATH =
	/^([A-Za-z$][\w$-]*)\s*\[\s*type\s+eq\s+"([^"]+)"\s*\](?:\s*\.\s*([A-Za-z$][\w$-]*))?$/i;
/** Matches Microsoft Entra's `attr[primary eq true]` and `attr[primary eq "true"]` filters. */
const SCIM_PRIMARY_VALUE_PATH =
	/^([A-Za-z$][\w$-]*)\s*\[\s*primary\s+eq\s+"?(true|false)"?\s*\](?:\s*\.\s*([A-Za-z$][\w$-]*))?$/i;

function clonePatchValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(clonePatchValue);
	if (!isRecord(value)) return value;
	return clonePatchRecord(value);
}

function clonePatchRecord(
	value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, clonePatchValue(item)]),
	);
}

function findPatchAttribute(
	attributes: readonly SCIMPatchAttributeDescriptor[],
	name: string,
): SCIMPatchAttributeDescriptor | undefined {
	return attributes.find(
		(attribute) => attribute.name.toLowerCase() === name.toLowerCase(),
	);
}

function resolveMutableSCIMUserPatchPath(
	path: string,
): ResolvedSCIMPatchPath | { enterpriseRoot: true } {
	const canonicalPath = resolveSCIMCanonicalAttributePath("User", path.trim());
	const enterprisePrefix = "enterprise.";
	const enterprise =
		canonicalPath.toLowerCase() === "enterprise" ||
		canonicalPath.toLowerCase().startsWith(enterprisePrefix);
	if (canonicalPath.toLowerCase() === "enterprise") {
		return { enterpriseRoot: true };
	}
	const relativePath = enterprise
		? canonicalPath.slice(enterprisePrefix.length)
		: canonicalPath;
	const attributes = (
		enterprise
			? SCIMEnterpriseUserResourceSchema.attributes
			: SCIMUserResourceSchema.attributes
	) as readonly SCIMPatchAttributeDescriptor[];
	const valuePathMatch = SCIM_VALUE_PATH.exec(relativePath);
	const primaryValuePathMatch = valuePathMatch
		? null
		: SCIM_PRIMARY_VALUE_PATH.exec(relativePath);
	const filterMatch = valuePathMatch ?? primaryValuePathMatch;
	const pathSegments = relativePath.split(".");
	const [attributePath, subAttributePath] = filterMatch
		? [filterMatch[1], filterMatch[3]]
		: pathSegments;
	if (
		!attributePath ||
		(!filterMatch &&
			(pathSegments.length > 2 ||
				pathSegments.some((segment) => segment.length === 0)))
	) {
		throw createSCIMError("BAD_REQUEST", {
			detail: `User PATCH path ${path} is not supported`,
			scimType: "invalidPath",
		});
	}
	const attribute = findPatchAttribute(attributes, attributePath);
	if (!attribute) {
		throw createSCIMError("BAD_REQUEST", {
			detail: `User PATCH path ${path} is not supported`,
			scimType: "invalidPath",
		});
	}
	if (attribute.mutability === "readOnly") rejectReadOnlyAttribute(path);

	const subAttribute = subAttributePath
		? findPatchAttribute(attribute.subAttributes ?? [], subAttributePath)
		: undefined;
	if (subAttributePath && !subAttribute) {
		throw createSCIMError("BAD_REQUEST", {
			detail: `User PATCH path ${path} is not supported`,
			scimType: "invalidPath",
		});
	}
	if (subAttribute?.mutability === "readOnly") rejectReadOnlyAttribute(path);
	if (filterMatch && !attribute.multiValued) {
		throw createSCIMError("BAD_REQUEST", {
			detail: `User PATCH path ${path} is not a multi-valued attribute`,
			scimType: "invalidPath",
		});
	}

	return {
		attribute,
		attributeName: attribute.name,
		enterprise,
		...(valuePathMatch?.[2]
			? { selectorType: valuePathMatch[2].trim().toLowerCase() }
			: {}),
		...(primaryValuePathMatch
			? { selectorPrimary: primaryValuePathMatch[2]?.toLowerCase() === "true" }
			: {}),
		...(subAttribute
			? {
					subAttribute,
					subAttributeName: subAttribute.name,
				}
			: {}),
	};
}

function getSCIMPatchContainer(
	document: Record<string, unknown>,
	enterprise: boolean,
	create: boolean,
): Record<string, unknown> | undefined {
	if (!enterprise) return document;
	const current = document[SCIM_ENTERPRISE_USER_SCHEMA];
	if (isRecord(current)) return current;
	if (!create) return undefined;
	const extension: Record<string, unknown> = {};
	document[SCIM_ENTERPRISE_USER_SCHEMA] = extension;
	return extension;
}

function setEnterpriseSchemaDeclaration(
	document: Record<string, unknown>,
	declared: boolean,
): void {
	const schemas = Array.isArray(document.schemas)
		? document.schemas.filter(
				(schema): schema is string => typeof schema === "string",
			)
		: [];
	const withoutEnterprise = schemas.filter(
		(schema) => schema !== SCIM_ENTERPRISE_USER_SCHEMA,
	);
	document.schemas = declared
		? [...withoutEnterprise, SCIM_ENTERPRISE_USER_SCHEMA]
		: withoutEnterprise;
}

function removeEmptyEnterpriseExtension(
	document: Record<string, unknown>,
): void {
	const extension = document[SCIM_ENTERPRISE_USER_SCHEMA];
	if (!isRecord(extension) || Object.keys(extension).length > 0) return;
	delete document[SCIM_ENTERPRISE_USER_SCHEMA];
	setEnterpriseSchemaDeclaration(document, false);
}

function mergePatchObject(
	current: unknown,
	value: unknown,
	attribute: string,
): Record<string, unknown> {
	if (!isRecord(value)) {
		return invalidPatchValue(`${attribute} must be an object`);
	}
	return {
		...(isRecord(current) ? current : {}),
		...clonePatchRecord(value),
	};
}

function parseEnterprisePatchObject(
	value: unknown,
	attribute: string,
): Record<string, unknown> {
	if (!isRecord(value)) {
		return invalidPatchValue(`${attribute} must be an object`);
	}
	for (const key of Object.keys(value)) {
		if (
			!findPatchAttribute(
				SCIMEnterpriseUserResourceSchema.attributes as readonly SCIMPatchAttributeDescriptor[],
				key,
			)
		) {
			throw createSCIMError("BAD_REQUEST", {
				detail: `User PATCH path ${SCIM_ENTERPRISE_USER_SCHEMA}:${key} is not supported`,
				scimType: "invalidPath",
			});
		}
	}
	const parsed = SCIMEnterpriseUserInputSchema.safeParse(value);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return invalidPatchValue(
			issue
				? `${attribute}.${issue.path.join(".")}: ${issue.message}`
				: `${attribute} is invalid`,
		);
	}
	return clonePatchRecord(parsed.data);
}

function mergeEnterprisePatchObject(
	current: unknown,
	value: unknown,
	attribute: string,
): Record<string, unknown> {
	const currentEnterprise = isRecord(current) ? current : {};
	const patch = parseEnterprisePatchObject(value, attribute);
	const currentManager = currentEnterprise.manager;
	const patchManager = patch.manager;
	return {
		...currentEnterprise,
		...patch,
		...(isRecord(patchManager)
			? {
					manager: {
						...(isRecord(currentManager) ? currentManager : {}),
						...patchManager,
					},
				}
			: {}),
	};
}

function normalizeManagerPatchValue(value: unknown): Record<string, unknown> {
	const manager = parseEnterprisePatchObject(
		{ manager: value },
		`${SCIM_ENTERPRISE_USER_SCHEMA}:manager`,
	).manager;
	return isRecord(manager)
		? manager
		: invalidPatchValue("manager must contain value or $ref");
}

function normalizeMultiValueAdditions(value: unknown): unknown[] {
	return (Array.isArray(value) ? value : [value]).map(clonePatchValue);
}

function valueSetsPrimary(value: unknown): boolean {
	return Array.isArray(value)
		? value.some(valueSetsPrimary)
		: isRecord(value) && value.primary === true;
}

function enforceSinglePatchedPrimary(
	values: unknown[],
	preferredIndex: number | undefined,
): unknown[] {
	if (preferredIndex === undefined) return values;
	return values.map((item, index) =>
		isRecord(item) && item.primary === true && index !== preferredIndex
			? { ...item, primary: false }
			: item,
	);
}

function matchesSCIMType(value: unknown, selectorType: string): boolean {
	return (
		isRecord(value) &&
		typeof value.type === "string" &&
		value.type.trim().toLowerCase() === selectorType
	);
}

function matchesSCIMPrimary(value: unknown, selectorPrimary: boolean): boolean {
	return isRecord(value) && value.primary === selectorPrimary;
}

function applySCIMMultiValuePatch(
	container: Record<string, unknown>,
	resolved: ResolvedSCIMPatchPath,
	op: "add" | "remove" | "replace",
	value: unknown,
	path: string,
): void {
	const current = container[resolved.attributeName];
	const currentValues = Array.isArray(current)
		? current.map(clonePatchValue)
		: [];

	if (
		!resolved.selectorType &&
		resolved.selectorPrimary === undefined &&
		!resolved.subAttributeName
	) {
		if (op === "remove") {
			delete container[resolved.attributeName];
			return;
		}
		const additions = normalizeMultiValueAdditions(value);
		const nextValues =
			op === "add" ? [...currentValues, ...additions] : additions;
		const firstAddedPrimary = additions.findIndex(
			(item) => isRecord(item) && item.primary === true,
		);
		const preferredPrimary =
			firstAddedPrimary < 0
				? undefined
				: (op === "add" ? currentValues.length : 0) + firstAddedPrimary;
		container[resolved.attributeName] = enforceSinglePatchedPrimary(
			nextValues,
			preferredPrimary,
		);
		return;
	}

	const matches = currentValues.map((item) => {
		if (resolved.selectorPrimary !== undefined) {
			return matchesSCIMPrimary(item, resolved.selectorPrimary);
		}
		return resolved.selectorType
			? matchesSCIMType(item, resolved.selectorType)
			: true;
	});
	const hasTarget = matches.some(Boolean);
	// A selector miss creates the value instead of returning RFC 7644 noTarget: Entra replaces values that do not exist yet, and rejecting would void the whole PATCH.
	if (!hasTarget) {
		if (op === "remove") return;
		if (!resolved.subAttributeName) {
			const additions = normalizeMultiValueAdditions(value).map((item) =>
				isRecord(item)
					? {
							...item,
							...(resolved.selectorType ? { type: resolved.selectorType } : {}),
							...(resolved.selectorPrimary === undefined
								? {}
								: { primary: resolved.selectorPrimary }),
						}
					: item,
			);
			const nextValues = [...currentValues, ...additions];
			const firstAddedPrimary = additions.findIndex(
				(item) => isRecord(item) && item.primary === true,
			);
			container[resolved.attributeName] = enforceSinglePatchedPrimary(
				nextValues,
				firstAddedPrimary < 0
					? undefined
					: currentValues.length + firstAddedPrimary,
			);
			return;
		}
		const nextValues = [
			...currentValues,
			{
				...(resolved.selectorType ? { type: resolved.selectorType } : {}),
				...(resolved.selectorPrimary === undefined
					? {}
					: { primary: resolved.selectorPrimary }),
				[resolved.subAttributeName]: clonePatchValue(value),
			},
		];
		container[resolved.attributeName] = enforceSinglePatchedPrimary(
			nextValues,
			resolved.subAttributeName.toLowerCase() === "primary" && value === true
				? nextValues.length - 1
				: undefined,
		);
		return;
	}

	if (!resolved.subAttributeName) {
		if (op === "remove") {
			const remainingValues = currentValues.filter(
				(_, index) => !matches[index],
			);
			if (remainingValues.length === 0) {
				delete container[resolved.attributeName];
			} else {
				container[resolved.attributeName] = remainingValues;
			}
			return;
		}
		const replacements = normalizeMultiValueAdditions(value);
		if (replacements.length !== 1 || !isRecord(replacements[0])) {
			return invalidPatchValue(
				`User PATCH path ${path} requires one complex value`,
			);
		}
		const replacement = replacements[0];
		const nextValues = currentValues.map((item, index) => {
			if (!matches[index]) return item;
			if (!isRecord(item)) {
				return invalidPatchValue(
					`${resolved.attributeName} must contain objects`,
				);
			}
			return { ...item, ...replacement };
		});
		const firstReplacedIndex = matches.findIndex(Boolean);
		container[resolved.attributeName] = enforceSinglePatchedPrimary(
			nextValues,
			replacement.primary === true && firstReplacedIndex >= 0
				? firstReplacedIndex
				: undefined,
		);
		return;
	}

	const subAttributeName = resolved.subAttributeName;
	const nextValues = currentValues.map((item, index) => {
		if (!matches[index]) return item;
		if (!isRecord(item)) {
			return invalidPatchValue(
				`${resolved.attributeName} must contain objects`,
			);
		}
		if (op === "remove") {
			const { [resolved.subAttributeName as string]: _removed, ...remaining } =
				item;
			return remaining;
		}
		return {
			...item,
			[subAttributeName]: clonePatchValue(value),
		};
	});
	const selectedIndex = matches.findIndex(Boolean);
	container[resolved.attributeName] = enforceSinglePatchedPrimary(
		nextValues,
		subAttributeName.toLowerCase() === "primary" &&
			value === true &&
			selectedIndex >= 0
			? selectedIndex
			: valueSetsPrimary(value)
				? selectedIndex
				: undefined,
	);
}

function applyGenericSCIMUserAttributePatch(
	document: Record<string, unknown>,
	op: "add" | "remove" | "replace",
	path: string,
	value: unknown,
): void {
	const resolved = resolveMutableSCIMUserPatchPath(path);
	if ("enterpriseRoot" in resolved) {
		if (op === "remove") {
			delete document[SCIM_ENTERPRISE_USER_SCHEMA];
			setEnterpriseSchemaDeclaration(document, false);
			return;
		}
		document[SCIM_ENTERPRISE_USER_SCHEMA] = mergeEnterprisePatchObject(
			document[SCIM_ENTERPRISE_USER_SCHEMA],
			value,
			SCIM_ENTERPRISE_USER_SCHEMA,
		);
		setEnterpriseSchemaDeclaration(document, true);
		return;
	}
	if (
		!resolved.enterprise &&
		(resolved.attributeName === "emails" || resolved.attributeName === "name")
	) {
		throw createSCIMError("BAD_REQUEST", {
			detail: `User PATCH path ${path} is not supported`,
			scimType: "invalidPath",
		});
	}

	const container = getSCIMPatchContainer(
		document,
		resolved.enterprise,
		op !== "remove",
	);
	if (!container) return;
	if (resolved.enterprise && op !== "remove") {
		setEnterpriseSchemaDeclaration(document, true);
	}

	if (resolved.attribute.multiValued) {
		applySCIMMultiValuePatch(container, resolved, op, value, path);
		removeEmptyEnterpriseExtension(document);
		return;
	}

	if (resolved.subAttributeName) {
		const current = container[resolved.attributeName];
		if (!isRecord(current)) {
			if (op === "remove") return;
			container[resolved.attributeName] = {
				[resolved.subAttributeName]: clonePatchValue(value),
			};
			return;
		}
		if (op === "remove") {
			delete current[resolved.subAttributeName];
			if (Object.keys(current).length === 0) {
				delete container[resolved.attributeName];
			}
		} else {
			current[resolved.subAttributeName] = clonePatchValue(value);
		}
		removeEmptyEnterpriseExtension(document);
		return;
	}

	if (op === "remove") {
		delete container[resolved.attributeName];
		removeEmptyEnterpriseExtension(document);
		return;
	}
	if (
		resolved.enterprise &&
		resolved.attributeName === "manager" &&
		resolved.attribute.type === "complex"
	) {
		// Microsoft Entra clears manager with a replace to "" instead of a remove op.
		if (value === "") {
			delete container[resolved.attributeName];
			removeEmptyEnterpriseExtension(document);
			return;
		}
		const currentManager = container[resolved.attributeName];
		container[resolved.attributeName] = {
			...(isRecord(currentManager) ? currentManager : {}),
			...normalizeManagerPatchValue(value),
		};
		return;
	}
	container[resolved.attributeName] =
		resolved.attribute.type === "complex" && isRecord(value)
			? mergePatchObject(
					container[resolved.attributeName],
					value,
					resolved.attributeName,
				)
			: clonePatchValue(value);
}

function createSCIMUserPatchDocument(
	user: SCIMUser,
	attributes: SCIMCanonicalUserAttributes,
): Record<string, unknown> {
	const { enterprise, ...coreAttributes } = attributes;
	return {
		...clonePatchRecord(coreAttributes),
		userName: user.userName,
		...(user.externalId === null ? {} : { externalId: user.externalId }),
		displayName: user.displayName,
		active: user.active,
		...(enterprise
			? {
					[SCIM_ENTERPRISE_USER_SCHEMA]: clonePatchValue(enterprise),
				}
			: {}),
	};
}

function finalizeSCIMUserPatch(
	state: SCIMUserPatchState,
	document: Record<string, unknown>,
): SCIMUserPatchState {
	document.userName = state.userName;
	document.externalId = state.externalId;
	document.displayName = state.displayName;
	document.active = state.active;
	document.name = {
		formatted: state.formattedName,
		...(state.givenName ? { givenName: state.givenName } : {}),
		...(state.familyName ? { familyName: state.familyName } : {}),
		...(state.middleName ? { middleName: state.middleName } : {}),
		...(state.honorificPrefix
			? { honorificPrefix: state.honorificPrefix }
			: {}),
		...(state.honorificSuffix
			? { honorificSuffix: state.honorificSuffix }
			: {}),
	};
	document.emails = clonePatchValue(state.emails);

	const parsed = APIUserSchema.safeParse(document);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return invalidPatchValue(
			issue
				? `${issue.path.join(".") || "User"}: ${issue.message}`
				: "The patched User resource is invalid",
		);
	}
	const profile = createCanonicalSCIMUserProfile(parsed.data);
	return {
		userName: profile.userName,
		primaryEmail: profile.primaryEmail,
		emails: profile.emails,
		displayName: profile.displayName,
		formattedName: profile.formattedName,
		givenName: profile.name.givenName,
		familyName: profile.name.familyName,
		middleName: profile.name.middleName,
		honorificPrefix: profile.name.honorificPrefix,
		honorificSuffix: profile.name.honorificSuffix,
		externalId: parsed.data.externalId,
		active: parsed.data.active !== false,
		attributes: profile.attributes,
	};
}

/** Apply ordered User PatchOp operations without mutating persisted state. */
export function applySCIMUserPatch(
	user: SCIMUser,
	operations: z.infer<typeof patchSCIMUserBodySchema>["Operations"],
): SCIMUserPatchState {
	const attributes = readSCIMUserAttributes(user);
	const document = createSCIMUserPatchDocument(user, attributes);
	const state: SCIMUserPatchState = {
		userName: user.userName,
		primaryEmail: user.primaryEmail,
		emails: attributes.emails,
		displayName: user.displayName,
		formattedName: attributes.name.formatted,
		givenName: attributes.name.givenName,
		familyName: attributes.name.familyName,
		middleName: attributes.name.middleName,
		honorificPrefix: attributes.name.honorificPrefix,
		honorificSuffix: attributes.name.honorificSuffix,
		externalId: user.externalId ?? undefined,
		active: user.active,
		attributes,
	};

	function applyAttribute(
		op: "add" | "remove" | "replace",
		path: string,
		value: unknown,
	): void {
		const schemaRelativePath = stripSCIMCoreAttributePrefix(
			"User",
			path.trim(),
		);
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
			case "active": {
				if (op === "remove") {
					state.active = true;
					return;
				}
				const scalar = unwrapSinglePatchValue(value);
				if (typeof scalar !== "boolean") {
					invalidPatchValue("active must be a boolean");
				}
				state.active = scalar;
				return;
			}
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
					state.middleName = undefined;
					state.honorificPrefix = undefined;
					state.honorificSuffix = undefined;
					setFormattedName(state, state.displayName || state.primaryEmail);
					return;
				}
				const name = readName(value);
				if (name.givenName !== undefined) {
					setNamePart(state, "givenName", name.givenName);
				}
				if (name.familyName !== undefined) {
					setNamePart(state, "familyName", name.familyName);
				}
				if (name.middleName !== undefined) {
					setNamePart(state, "middleName", name.middleName);
				}
				if (name.honorificPrefix !== undefined) {
					setNamePart(state, "honorificPrefix", name.honorificPrefix);
				}
				if (name.honorificSuffix !== undefined) {
					setNamePart(state, "honorificSuffix", name.honorificSuffix);
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
			case "name.middlename":
				setNamePart(
					state,
					"middleName",
					op === "remove"
						? undefined
						: readNonEmptyString(value, "name.middleName"),
				);
				return;
			case "name.honorificprefix":
				setNamePart(
					state,
					"honorificPrefix",
					op === "remove"
						? undefined
						: readNonEmptyString(value, "name.honorificPrefix"),
				);
				return;
			case "name.honorificsuffix":
				setNamePart(
					state,
					"honorificSuffix",
					op === "remove"
						? undefined
						: readNonEmptyString(value, "name.honorificSuffix"),
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
			default: {
				const emailTypeMatch = EMAIL_TYPE_VALUE_PATH.exec(schemaRelativePath);
				if (emailTypeMatch?.[1]) {
					const selectorType = emailTypeMatch[1].trim().toLowerCase();
					if (op === "remove") {
						const remaining = state.emails.filter(
							(email) => email.type !== selectorType,
						);
						if (remaining.length === state.emails.length) return;
						setEmails(state, remaining);
						return;
					}
					replaceSelectedEmail(state, selectorType, value);
					return;
				}
				if (EMAIL_PRIMARY_VALUE_PATH.test(schemaRelativePath)) {
					if (op === "remove") {
						invalidPatchValue("emails.value cannot be removed");
					}
					replacePrimaryEmail(state, value);
					return;
				}
				applyGenericSCIMUserAttributePatch(document, op, path, value);
				return;
			}
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

	return finalizeSCIMUserPatch(state, document);
}
