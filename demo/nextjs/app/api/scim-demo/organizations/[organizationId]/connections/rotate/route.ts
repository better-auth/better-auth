import * as z from "zod";
import { auth } from "@/lib/auth";
import { isSCIMDemoEnabled, SCIM_DEMO_SCOPES } from "@/lib/scim-demo";
import {
	assertSCIMDemoOrganizationContext,
	authorizeSCIMDemoManagementRequest,
	createSCIMDemoConnectionResponse,
	createSCIMDemoCredentialExpiry,
	createSCIMDemoManagementError,
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
			.refine((scopes) => new Set(scopes).size === scopes.length),
		expiresInDays: z.number().int().min(1).max(365),
	})
	.strict();

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ organizationId: string }> },
) {
	const organizationId = (await params).organizationId;
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
		const current = await loadSCIMDemoManagedState(organizationId);
		if (!current) {
			throw createSCIMDemoManagementError(
				404,
				"This organization does not have a SCIM connection",
			);
		}
		const rotated = await auth.api.rotateSCIMManagedCredential({
			body: {
				connectionId: current.connection.connectionId,
				provisioningDomainId: current.connection.provisioningDomainId,
				actorId: session.user.id,
				scopes: parsed.data.scopes,
				expiresAt: createSCIMDemoCredentialExpiry(parsed.data.expiresInDays),
			},
		});
		const refreshed = await loadSCIMDemoManagedState(organizationId);
		if (!refreshed) {
			throw createSCIMDemoManagementError(
				500,
				"The SCIM connection disappeared after credential rotation",
			);
		}
		const state = await createSCIMDemoConnectionResponse(
			context.adapter,
			refreshed,
		);
		return Response.json(
			{
				...state,
				issuedCredential: {
					id: rotated.credential.credentialId,
					token: rotated.token,
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
