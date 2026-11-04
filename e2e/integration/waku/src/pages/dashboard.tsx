export default function DashboardPage() {
	return <h1>Dashboard</h1>;
}

export const getConfig = async () => {
	return { render: "dynamic" } as const;
};
