import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export interface OrganizationActiveParams {
	organizationId: string | null;
}

export async function setOrganizationActive(params: OrganizationActiveParams) {
	const { data, error } = await authClient.organization.setActive({
		organizationId: params.organizationId,
	});
	if (error) throw new Error(error.message);

	return data;
}

export const useOrganizationActiveMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: setOrganizationActive,
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationKeys.detail(),
			});
		},
	});
};
