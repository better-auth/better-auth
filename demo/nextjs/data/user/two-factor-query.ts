"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { userKeys } from "./keys";

export async function getTwoFactorMethods() {
	const { data, error } = await authClient.twoFactor.listMethods();
	if (error) throw new Error(error.message);

	return data;
}

export async function getPendingTwoFactorChallenge() {
	const { data, error } = await authClient.twoFactor.pendingChallenge();
	if (error) throw new Error(error.message);

	return data;
}

export const useTwoFactorMethodsQuery = () => {
	return useQuery({
		queryFn: getTwoFactorMethods,
		queryKey: userKeys.twoFactorMethods(),
		retry: 1,
	});
};

export const usePendingTwoFactorChallengeQuery = () => {
	return useQuery({
		queryFn: getPendingTwoFactorChallenge,
		queryKey: userKeys.pendingTwoFactorChallenge(),
		retry: 1,
	});
};
