import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { organizationKeys } from "./keys";

export interface OrganizationCreateParams {
	name: string;
	slug: string;
	logo?: string;
}

export async function createOrganization(params: OrganizationCreateParams) {
	const { data, error } = await authClient.organization.create({
		name: params.name,
		slug: params.slug,
		logo: params.logo,
	});
	if (error) throw new Error(error.message);

	return data;
}

export const useOrganizationCreateMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: createOrganization,
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: organizationKeys.all(),
			});
			toast.success("Organization created successfully");
		},
		onError: (error) => {
			toast.error(error.message || "Failed to create organization");
		},
	});
};
