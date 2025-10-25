import { Slot } from "@radix-ui/react-slot";
import type { ReactNode } from "react";

export interface BaseLayoutProps {
	children?: ReactNode;
}

export function replaceOrDefault(
	obj:
		| {
				enabled?: boolean;
				component?: ReactNode;
		  }
		| undefined,
	def: ReactNode,
	customComponentProps?: object,
	disabled?: ReactNode,
): ReactNode {
	if (obj?.enabled === false) return disabled;
	if (obj?.component !== undefined)
		return <Slot {...customComponentProps}>{obj.component}</Slot>;

	return def;
}
