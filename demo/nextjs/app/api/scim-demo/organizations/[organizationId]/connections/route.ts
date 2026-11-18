import * as z from "zod";
import { auth } from "@/lib/auth";
import {
	getSCIMDemoProvisioningDomainId,
	isSCIMDemoEnabled,
	SCIM_DEMO_SCOPES,
} from "@/lib/scim-demo";
import {
	assertSCIMDemoOrganizationContext,
	authorizeSCIMDemoManagementRequest,
	createSCIMDemoConnectionCreationRequestId,
	createSCIMDemoConnectionResponse,
	createSCIMDemoCredentialExpiry,
	createSCIMDemoManagementError,
	isSCIMManagedCreationRequestConflict,
	loadSCIMDemoManagedState,
	SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
	scimDemoManagementErrorResponse,
} from "@/lib/scim-demo-management";

export const runtime = "nodejs";

const requestSchema = z
	.object({
		organizationId: z.string().min(1).max(200),
		scopes: z
			.array(z.enum(SCIM_DEMO_SCOPES))
			.min(1)
			.refine((scopes) => new Set(scopes).size === scopes.length)
			.optional(),
		expiresInDays: z.number().int().min(1).max(365).optional(),
	})
	.strict();

async function getOrganizationId(
	params: Promise<{ organizationId: string }>,
): Promise<string> {
	return (await params).organizationId;
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ organizationId: string }> },
) {
	const organizationId = await getOrganizationId(params);
	try {
		if (!isSCIMDemoEnabled()) {
			throw createSCIMDemoManagementError(404, "SCIM demo not found");
		}
		const { context } = await authorizeSCIMDemoManagementRequest(
			request,
			organizationId,
			{ mutation: false },
		);
		const state = await loadSCIMDemoManagedState(organizationId);
		return Response.json(
			state
				? await createSCIMDemoConnectionResponse(context.adapter, state)
				: null,
			{
				headers: SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
			},
		);
	} catch (error) {
		return scimDemoManagementErrorResponse(error);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ organizationId: string }> },
) {
	const organizationId = await getOrganizationId(params);
	try {
		if (!isSCIMDemoEnabled()) {
			throw createSCIMDemoManagementError(404, "SCIM demo not found");
		}
		const { context, session } = await authorizeSCIMDemoManagementRequest(
			request,
			organizationId,
			{ mutation: true },
		);
		const body: unknown = await request.json().catch(() => undefined);
		const parsed = requestSchema.safeParse(body);
		if (!parsed.success) {
			throw createSCIMDemoManagementError(
				400,
				"The SCIM credential policy was invalid",
			);
		}
		assertSCIMDemoOrganizationContext(
			parsed.data.organizationId,
			organizationId,
		);
		if (await loadSCIMDemoManagedState(organizationId)) {
			throw createSCIMDemoManagementError(
				409,
				"This organization already has a SCIM connection",
			);
		}
		const provisioningDomainId =
			getSCIMDemoProvisioningDomainId(organizationId);
		// The creation-request id is derived from the organization rather than
		// random, so concurrent creates for the same organization collide on
		// the plugin's existing uniqueness instead of both succeeding. The
		// preflight check above is only a fast path for the common case.
		let created: Awaited<
			ReturnType<typeof auth.api.createSCIMManagedConnection>
		>;
		try {
			created = await auth.api.createSCIMManagedConnection({
				body: {
					creationRequestId:
						createSCIMDemoConnectionCreationRequestId(provisioningDomainId),
					provisioningDomainId,
					actorId: session.user.id,
					scopes: parsed.data.scopes ?? SCIM_DEMO_SCOPES,
					expiresAt: createSCIMDemoCredentialExpiry(parsed.data.expiresInDays),
				},
			});
		} catch (error) {
			if (isSCIMManagedCreationRequestConflict(error)) {
				throw createSCIMDemoManagementError(
					409,
					"This organization already has a SCIM connection",
				);
			}
			throw error;
		}
		const history = await auth.api.listSCIMManagedConnectionEvents({
			body: {
				connectionId: created.connection.connectionId,
				provisioningDomainId,
			},
		});
		const connection = await createSCIMDemoConnectionResponse(context.adapter, {
			connection: created.connection,
			credentials: [created.credential],
			events: history.events,
		});
		return Response.json(
			{
				...connection,
				issuedCredential: {
					id: created.credential.credentialId,
					token: created.token,
				},
			},
			{
				status: 201,
				headers: SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
			},
		);
	} catch (error) {
		return scimDemoManagementErrorResponse(error);
	}
}
