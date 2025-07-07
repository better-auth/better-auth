"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PasswordInput = ({
	ref,
	className,
	...props
}: any & {
	ref: React.RefObject<HTMLInputElement>;
}) => {
	const [showPassword, setShowPassword] = React.useState(false);
	const disabled =
		props.value === "" || props.value === undefined || props.disabled;

	return (
		<div className="relative">
			<Input
				{...props}
				type={showPassword ? "text" : "password"}
				name="password_fake"
				className={cn("hide-password-toggle pr-10", className)}
				ref={ref}
			/>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
				onClick={() => setShowPassword((prev) => !prev)}
				disabled={disabled}
			>
				{showPassword && !disabled ? (
					<EyeIcon className="h-4 w-4" aria-hidden="true" />
				) : (
					<EyeOffIcon className="h-4 w-4" aria-hidden="true" />
				)}
				<span className="sr-only">
					{showPassword ? "Hide password" : "Show password"}
				</span>
			</Button>

			{/* hides browsers password toggles */}
			<style>{`
                .hide-password-toggle::-ms-reveal,
                .hide-password-toggle::-ms-clear {
                    visibility: hidden;
                    pointer-events: none;
                    display: none;
                }
            `}</style>
		</div>
	);
};
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
