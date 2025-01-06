import { authClient } from "@/auth/auth-client";

export const Home = ({
	setPage,
}: {
	setPage: (page: "home" | "sign-in" | "sign-up") => void;
}) => {
	const { data, error, isPending } = authClient.useSession();

	return (
		<>
			<h1 className="py-10 text-2xl text-center">Better Auth Extension Demo</h1>
			<h2 className="py-10 text-xl text-center text-secondary-foreground">
				{isPending
					? "Loading your session data..."
					: error
						? error.message
						: data
							? "You're Logged in 👍"
							: "You're Not logged in 😢"}
			</h2>
		</>
	);
};
