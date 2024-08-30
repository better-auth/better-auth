import { Organization } from "@/components/organization";
import UserCard from "@/components/user-card";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function TypewriterEffectSmoothDemo() {
	const session = await auth.api.getSession({
		headers: headers(),
	});
	return (
		<div className="h-[50rem] w-full dark:bg-black bg-white  dark:bg-grid-white/[0.2] bg-grid-black/[0.2] relative flex items-center justify-center">
			{/* Radial gradient for the container to give a faded look */}
			<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
			{session ? (
				<div>
					<UserCard session={session} />
					<Organization />
				</div>
			) : null}
		</div>
	);
}
