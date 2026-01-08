import { ImageResponse } from "@vercel/og";
import * as z from "zod";
export const runtime = "edge";

const ogSchema = z.object({
	heading: z.string().default("Better Auth Documentation"),
	mode: z.string().default("dark"),
	type: z.string().default("documentation"),
});
export async function GET(req: Request) {
	try {
		const geist = await fetch(
			new URL("../../../assets/Geist.ttf", import.meta.url),
		).then((res) => res.arrayBuffer());
		const geistMono = await fetch(
			new URL("../../../assets/GeistMono.ttf", import.meta.url),
		).then((res) => res.arrayBuffer());
		const url = new URL(req.url);
		const urlParamsValues = Object.fromEntries(url.searchParams);
		const validParams = ogSchema.parse(urlParamsValues);
		const { heading, type } = validParams;
		const trueHeading =
			heading.length > 140 ? `${heading.substring(0, 140)}...` : heading;

		const paint = "#fff";

		const fontSize = trueHeading.length > 100 ? "30px" : "60px";
		return new ImageResponse(
			<div
				tw="flex w-full relative flex-col p-12"
				style={{
					color: paint,
					backgroundColor: "transparent",
					border: "1px solid rgba(255, 255, 255, 0.1)",
					boxShadow: "0 -20px 80px -20px rgba(28, 12, 12, 0.1) inset",
					background: "#0a0505",
				}}
			>
				<div
					tw={`relative flex flex-col w-full h-full border-2 border-[${paint}]/20 p-10}`}
				>
					<svg
						style={{
							position: "absolute",
							top: "-9px",
							right: "-9px",
						}}
						width="17"
						height="17"
						fill="none"
					>
						<path
							d="M7 1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 1-1-1V1z"
							fill="#d0cfd1d3"
						/>
					</svg>

					<svg
						style={{
							position: "absolute",
							top: "-9px",
							left: "-9px",
						}}
						width="17"
						height="17"
						fill="none"
					>
						<path
							d="M7 1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 1-1-1V1z"
							fill="#cacaca"
						/>
					</svg>
					<svg
						style={{
							position: "absolute",
							bottom: "-9px",
							left: "-9px",
						}}
						width="17"
						height="17"
						fill="none"
					>
						<path
							d="M7 1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 1-1-1V1z"
							fill="#cacaca"
						/>
					</svg>
					<svg
						style={{
							position: "absolute",
							bottom: "-9px",
							right: "-9px",
						}}
						width="17"
						height="17"
						fill="none"
					>
						<path
							d="M7 1a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 1 1 1v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1V8a1 1 0 0 1 1-1h2a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H8a1 1 0 0 1-1-1V1z"
							fill="#cacaca"
						/>
					</svg>
					<div tw="flex flex-col flex-1 py-10">
						<svg
							width="100"
							height="95"
							viewBox="0 0 60 45"
							fill="none"
							className="mb-10"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								fillRule="evenodd"
								stroke={paint}
								clipRule="evenodd"
								d="M0 0H15V15H30V30H15V45H0V30V15V0ZM45 30V15H30V0H45H60V15V30V45H45H30V30H45Z"
								fill="white"
							/>
						</svg>
						<div
							style={{ fontFamily: "GeistMono", fontWeight: "normal" }}
							tw="relative flex mt-10 text-xl uppercase font-bold gap-2 items-center"
						>
							{type === "documentation" ? (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="1.2em"
									height="1.2em"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										fillRule="evenodd"
										d="M4.172 3.172C3 4.343 3 6.229 3 10v4c0 3.771 0 5.657 1.172 6.828S7.229 22 11 22h2c3.771 0 5.657 0 6.828-1.172S21 17.771 21 14v-4c0-3.771 0-5.657-1.172-6.828S16.771 2 13 2h-2C7.229 2 5.343 2 4.172 3.172M8 9.25a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5z"
										clipRule="evenodd"
									></path>
								</svg>
							) : null}
							{type}
						</div>
						<div
							tw="flex max-w-[70%] mt-5 tracking-tighter leading-[1.1] text-[30px] font-bold"
							style={{
								fontWeight: "bold",
								marginLeft: "-3px",
								fontSize,

								fontFamily: "GeistMono",
							}}
						>
							{trueHeading}
						</div>
					</div>
					<div tw="flex items-center w-full justify-between">
						<div
							tw="flex text-xl"
							style={{ fontFamily: "GeistSans", fontWeight: "semibold" }}
						>
							Better Auth.
						</div>
						<div tw="flex gap-2 items-center text-xl">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.2em"
								height="1.2em"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
								></path>
							</svg>
							<span
								style={{
									fontFamily: "GeistSans",
								}}
								tw="flex ml-2"
							>
								github.com/better-auth/better-auth
							</span>
						</div>
					</div>
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				fonts: [
					{
						name: "Geist",
						data: geist,
						weight: 400,
						style: "normal",
					},
					{
						name: "GeistMono",
						data: geistMono,
						weight: 700,
						style: "normal",
					},
				],
			},
		);
	} catch (err) {
		console.log({ err });
		return new Response("Failed to generate the og image", { status: 500 });
	}
}
