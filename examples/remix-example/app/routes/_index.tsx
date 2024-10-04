import type { MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Button } from "~/components/ui/button";
import { auth } from "~/lib/auth";
import { Session } from "~/lib/auth-types";

export const meta: MetaFunction = () => {
	return [
		{ title: "Better Auth Remix Example" },
		{ name: "description", content: "Welcome to Remix!" },
	];
};

export async function loader({ request }: { request: Request }) {
	return auth.api.getSession({
		headers: request.headers,
	});
}

export default function Index() {
	const session = useLoaderData<Session | null>();
	return (
		<div className="min-h-[80vh] flex items-center justify-center overflow-hidden no-visible-scrollbar px-6 md:px-0">
			<main className="flex flex-col gap-4 row-start-2 items-center justify-center">
				<div className="flex flex-col gap-1">
					<h3 className="font-bold text-4xl text-black dark:text-white text-center">
						Better Auth.
					</h3>
					<p className="text-center break-words text-sm md:text-base">
						Remix demo to showcase{" "}
						<a
							href="https://better-auth.com"
							target="_blank"
							className="italic underline"
						>
							better-auth.
						</a>{" "}
						features and capabilities. <br />
					</p>
				</div>
				<Link to={session ? "/dashboard" : "/sign-in"}>
					<Button className="rounded-none" size="lg">
						{session ? "Dashboard" : "Sign In"}
					</Button>
				</Link>
			</main>
		</div>
	);
}
