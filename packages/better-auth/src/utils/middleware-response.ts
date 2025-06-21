type Params = {
	code: string;
	message: string;
	status: number;
};

export const middlewareResponse = ({ message, status }: Params) => ({
	response: new Response(
		JSON.stringify({
			code,
			message,
		}),
		{
			status,
		},
	),
});
