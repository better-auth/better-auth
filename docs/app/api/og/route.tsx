import { ImageResponse } from "@vercel/og";
import { z } from "zod";
export const runtime = "edge";

const ogSchema = z.object({
	heading: z.string(),
	mode: z.string(),
	type: z.string(),
});

function GridPattern({
	width = 40,
	height = 40,
	x = -1,
	y = -1,
	squares,
	strokeDasharray = "1 1 1",
}: {
	width?: number;
	height?: number;
	x?: number;
	y?: number;
	squares?: [number, number][];
	strokeDasharray?: string;
}) {
	const id = Math.random().toString(36).substr(2, 9);

	return (
		<svg
			width="100%"
			height="100%"
			style={{
				pointerEvents: "none",
				position: "absolute",
				top: 0,
				left: 0,
				height: "100%",
				width: "100%",
				fill: "rgba(0, 0, 0, 0.602)",
				stroke: "rgba(13, 14, 17, 0.777)",
			}}
			xmlns="http://www.w3.org/2000/svg"
		>
			<defs
				style={{
					width: "100%",
					height: "100%",
				}}
			>
				<pattern
					id={id}
					width={width}
					height={height}
					patternUnits="userSpaceOnUse"
					x={x}
					y={y}
				>
					<path
						d={`M.5 ${height}V.5H${width}`}
						fill="none"
						stroke="rgba(9, 2, 2, 0.009)"
						strokeDasharray={strokeDasharray}
					/>
				</pattern>
			</defs>
			<defs
				style={{
					width: "100%",
					height: "100%",
				}}
			>
				<pattern
					id={id}
					width={width}
					height={height}
					patternUnits="userSpaceOnUse"
					x={x}
					y={y}
				>
					<path
						d={`M.5 ${height}V.5H${width}`}
						fill="none"
						stroke="rgba(255,255,255,0.1)"
						strokeDasharray={strokeDasharray}
					/>
				</pattern>
			</defs>
			<rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
			{squares && (
				<svg x={x} y={y}>
					{squares.map(([squareX, squareY]) => (
						<rect
							key={`${squareX}-${squareY}`}
							width={width - 1}
							height={height - 1}
							x={squareX * width + 1}
							y={squareY * height + 1}
							fill="rgba(255,255,255,0.05)"
						/>
					))}
				</svg>
			)}
		</svg>
	);
}

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
		// this is used with the above example
		// const validParams = ogSchema.parse(ogData);
		const validParams = ogSchema.parse(urlParamsValues);

		const { heading, type, mode } = validParams;
		const trueHeading =
			heading.length > 140 ? `${heading.substring(0, 140)}...` : heading;

		const paint = mode === "dark" ? "#fff" : "#000000";

		const fontSize = trueHeading.length > 100 ? "30px" : "60px";
		return new ImageResponse(
			<div
				tw="flex w-full relative flex-col p-9"
				style={{
					color: paint,
					backgroundColor: "transparent",
					border: "1px solid rgba(255, 255, 255, 0.1)",
					boxShadow: "0 -20px 80px -20px rgba(28, 12, 12, 0.1) inset",
					background: mode === "dark" ? "#1A0D0D" : "white",
				}}
			>
				<div
					tw={`relative flex flex-col w-full h-full border-2 border-[${paint}]/20 p-8}`}
				>
					<GridPattern
						width={40}
						height={40}
						squares={[
							[1, 3],
							[2, 1],
							[5, 3],
							[4, 1],
							[-1, -1],
						]}
					/>
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
					<svg
						width="60"
						height="45"
						viewBox="0 0 60 45"
						fill="none"
						className="w-5 h-5"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							fill-rule="evenodd"
							clip-rule="evenodd"
							d="M0 0H15V15H30V30H15V45H0V30V15V0ZM45 30V15H30V0H45H60V15V30V45H45H30V30H45Z"
							className="fill-black dark:fill-white"
						/>
					</svg>
					<div tw="flex flex-col flex-1 py-10">
						<div
							style={{ fontFamily: "GeistMono", fontWeight: "normal" }}
							tw="relative flex text-xl uppercase font-bold tracking-tight"
						>
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
							Better Auth
						</div>
						<div tw="flex gap-2 items-center text-xl">
							<div
								style={{
									fontFamily: "GeistSans",
								}}
								tw="flex ml-2"
							>
								<svg width="32" height="32" viewBox="0 0 48 48" fill="none">
									<path
										d="M30 44v-8a9.6 9.6 0 0 0-2-7c6 0 12-4 12-11 .16-2.5-.54-4.96-2-7 .56-2.3.56-4.7 0-7 0 0-2 0-6 3-5.28-1-10.72-1-16 0-4-3-6-3-6-3-.6 2.3-.6 4.7 0 7a10.806 10.806 0 0 0-2 7c0 7 6 11 12 11a9.43 9.43 0 0 0-1.7 3.3c-.34 1.2-.44 2.46-.3 3.7v8"
										stroke={paint}
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
									<path
										d="M18 36c-9.02 4-10-4-14-4"
										stroke={paint}
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								github.com/better-auth/better-auth
							</div>
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
