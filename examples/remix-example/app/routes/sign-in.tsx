"use client";
import SignInCard from "~/components/sign-in-card";
import { SignUp } from "~/components/sign-up-card";
import { Tabs } from "~/components/tabs";

export default function SignIn() {
	return (
		<div className="w-full">
			<div className="flex items-center flex-col justify-center w-full md:py-10">
				<div className="md:w-[400px]">
					<Tabs
						tabs={[
							{
								title: "Sign In",
								value: "sign-in",
								content: <SignInCard />,
							},
							{
								title: "Sign Up",
								value: "sign-up",
								content: <SignUp />,
							},
						]}
					/>
				</div>
			</div>
		</div>
	);
}
