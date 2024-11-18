"use client";

import { useActionState } from "react";
import { auth } from "@/lib/auth";
import { singInAction } from "./action";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SignInForm() {
	const [state, action, isPending] = useActionState(singInAction, null);
	return (
		<form action={action}>
			<div>
				<Input type="email" name="email" placeholder="Email" />
			</div>

			<div>
				<Input type="password" name="password" placeholder="Password" />
			</div>

			<Button type="submit" disabled={isPending}>
				{isPending ? "Logging in..." : "Log in"}
			</Button>
		</form>
	);
}
