import { errors } from "@better-auth/components";
import { useOptions } from "../context";
import generateForm from "./methods/form";
import React from "react";
import type { Methods, SignInMethodConfig } from "@better-auth/better-auth/src/plugins/components/config";

export default function SignIn() {
	const options = useOptions();
	const methods = options.$components.components.signIn

	if (!methods) {
		throw new errors.BetterAuthComponentMissingConfigError(
			"No config found for signIn",
		);
	}


	return React.createElement(
		"div",
		{},
		methods.map((m) => {
			let otps: SignInMethodConfig<Methods>;
			if (typeof m === "function") {
				// @ts-expect-error
				otps = m(options);
			} else {
				otps = m;
			}
				if (otps.type === "form") {
					return generateForm(otps.options);
				}
		}),
	);
}
