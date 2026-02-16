type Params = {
	message: string;
	status: number;
	code: string;
};

export const middlewareResponse = ({ message, status, code }: Params) => ({
	response: new Response(
		JSON.stringify({
			message,
			code,
		}),
		{
			status,
		},
	),
});
