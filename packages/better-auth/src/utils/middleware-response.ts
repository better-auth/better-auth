type Params = {
	code: string;
	message: string;
	status: number;
};

export const middlewareResponse = ({ code, message, status }: Params) => ({
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
