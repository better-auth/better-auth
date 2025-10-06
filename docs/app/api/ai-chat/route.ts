import { NextResponse } from "next/server";
export const maxDuration = 300;
export async function POST(request: Request) {
	try {
		const body = await request.json();
		const gurubasePayload = {
			question: body.question,
			stream: body.stream,
			external_user_id: body.external_user_id,
			session_id: body.session_id,
			fetch_existing: body.fetch_existing || false,
		};
		const response = await fetch(
			`https://api.gurubase.io/api/v1/${process.env.GURUBASE_SLUG}/answer/`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": `${process.env.GURUBASE_API_KEY}`,
				},
				body: JSON.stringify(gurubasePayload),
			},
		);
		if (!response.ok) {
			const errorText = await response.text();
			console.error("Gurubase API error:", response.status, errorText);
			if (response.status === 400) {
				return NextResponse.json(
					{
						error:
							"I'm sorry, I couldn't process that question. Please try asking something else about Better-Auth.",
					},
					{ status: 200 },
				);
			}

			return NextResponse.json(
				{ error: `External API error: ${response.status} ${errorText}` },
				{ status: response.status },
			);
		}
		const isStreaming = gurubasePayload.stream === true;
		if (isStreaming) {
			const stream = new ReadableStream({
				start(controller) {
					const reader = response.body?.getReader();
					if (!reader) {
						controller.close();
						return;
					}

					function pump(): Promise<void> {
						return reader!.read().then(({ done, value }) => {
							if (done) {
								controller.close();
								return;
							}
							controller.enqueue(value);
							return pump();
						});
					}

					return pump();
				},
			});

			return new NextResponse(stream, {
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": "no-cache",
					Connection: "keep-alive",
				},
			});
		} else {
			const data = await response.json();
			return NextResponse.json(data);
		}
	} catch (error) {
		return NextResponse.json(
			{
				error: `Proxy error: ${error instanceof Error ? error.message : "Unknown error"}`,
			},
			{ status: 500 },
		);
	}
}
