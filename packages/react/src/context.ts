import React, { createContext, useContext } from "react";
import { errors } from "@better-auth/components";
import type { createAuthClient } from "./client";

type Context = ReturnType<typeof createAuthClient>;

const ComponentContext = createContext<Context | undefined>(undefined);

export function useOptions() {
	const ctx = useContext(ComponentContext);
	if (!ctx) {
		throw new errors.BetterAuthComponentMissingConfigError("No context found");
	}
	return ctx;
}

export function BetterAuthContext({
	options,
	children,
}: {
	options: ReturnType<typeof createAuthClient>
	children: React.ReactNode;
}) {
	return React.createElement(
		ComponentContext.Provider,
		{
			value: options
		},
		children,
	);
}
