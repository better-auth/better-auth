import type { AuthContext } from "../../core/src";
import React, { createContext, useContext } from "react";

const ComponentContext = createContext<AuthContext>(
	undefined as unknown as AuthContext,
);

export function useOptions() {
	return useContext(ComponentContext);
}

export function BetterAuthContext({
	options,
	children,
}: {
	options: AuthContext;
	children: React.ReactNode;
}) {
	return React.createElement(
		ComponentContext.Provider,
		{
			value: options,
		},
		children,
	);
}
