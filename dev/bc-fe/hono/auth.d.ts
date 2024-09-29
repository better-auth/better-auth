export type Auth = {
	baseURL: "http://localhost:3000";
	basePath: "/auth";
	database: {
		provider: "sqlite";
		url: "./db.sqlite";
	};
	socialProviders: [
		{
			id: "github";
		},
	];
	plugins: [
		{
			id: "two-factor";
			endpoints: {};
		},
		{
			id: "organization";
			endpoints: {};
		},
	];
};
