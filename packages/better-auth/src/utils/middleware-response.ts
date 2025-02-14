type Params = {
	message: string;
	status: number;
};

export const middlewareResponse = ({ message, status }: Params) => ({
	response: new Response(
		JSON.stringify({
			message,
		}),
		{
			status,
		},
	),
});
