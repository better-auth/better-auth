"use client";

import SignIn from "@/components/sign-in";

export default function Page() {
	return (
		<div className="w-full">
			<div className="flex items-center flex-col justify-center w-full md:py-10">
				<div className="md:w-[400px]">
					<SignIn />
				</div>
			</div>
		</div>
	);
}
