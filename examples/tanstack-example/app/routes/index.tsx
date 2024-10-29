import { createFileRoute } from "@tanstack/react-router";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { useSession } from "~/lib/client/auth";

export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	const { data } = useSession();

	return (
		<div className="container flex justify-center">
			<Card className="w-fit">
				{data?.user && (
					<>
						<CardHeader>
							<CardTitle>Welcome, {data.user.name}!</CardTitle>
							<CardDescription>
								You are signed in as {data.user.email}.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-2 justify-start">
							<div className="flex flex-col">
								<p>Created At</p>
								<Input
									readOnly
									disabled
									value={data.user.createdAt.toLocaleString()}
								/>
								<p>Session ID</p>
								<Input readOnly disabled value={data.session.id} />
							</div>
						</CardContent>
					</>
				)}
			</Card>
		</div>
	);
}
