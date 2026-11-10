import { signOut } from "../actions";

export default function DashboardPage() {
	return (
		<>
			<h1>Dashboard</h1>
			<form action={signOut}>
				<button type="submit">Sign out</button>
			</form>
		</>
	);
}

export const getConfig = async () => {
	return { render: "dynamic" } as const;
};
