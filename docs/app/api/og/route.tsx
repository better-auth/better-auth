import { ImageResponse } from "@vercel/og";
import { z } from "zod";
import { Plus } from "lucide-react";
export const runtime = "edge";
const ogSchema = z.object({
  heading: z.string(),
  mode: z.string(),
  type: z.string(),
});
// Use this example object to work with og image generator

// const ogData = {
//   heading: "This is a test heading for the page",
//   mode: "dark",
//   type: "documentation",
// };
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
        fill: "rgba(107, 114, 128, 0.3)",
        stroke: "rgba(107, 114, 128, 0.3)",
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
            stroke="rgba(255,255,255,0.1)"
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
    console.log({ urlParamsValues });
    console.log("THE VALUD PARAMS: ", { validParams });
    const { heading, type, mode } = validParams;
    const trueHeading =
      heading.length > 140 ? `${heading.substring(0, 140)}...` : heading;

    const paint = mode === "dark" ? "#fff" : "#000";

    const fontSize = trueHeading.length > 100 ? "30px" : "60px";
    return new ImageResponse(
      (
        <div
          tw="flex w-full relative flex-col p-9"
          style={{
            color: paint,
            backgroundColor: "transparent",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            boxShadow: "0 -20px 80px -20px rgba(134, 134, 240, 0.1) inset",
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
                fill="#ada8c4"
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
                fill="#ada8c4"
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
                fill="#ada8c4"
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
                fill="#ada8c4"
              />
            </svg>
            <svg
              width="110"
              height="110"
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="200" height="200" fill="#D9D9D9" />
              <line
                x1="21.5"
                y1="2.18557e-08"
                x2="21.5"
                y2="200"
                stroke="#C4C4C4"
              />
              <line
                x1="173.5"
                y1="2.18557e-08"
                x2="173.5"
                y2="200"
                stroke="#C4C4C4"
              />
              <line
                x1="200"
                y1="176.5"
                x2="-4.37114e-08"
                y2="176.5"
                stroke="#C4C4C4"
              />
              <line
                x1="200"
                y1="24.5"
                x2="-4.37114e-08"
                y2="24.5"
                stroke="#C4C4C4"
              />
              <path
                d="M64.4545 135V65.1818H88.8636C93.7273 65.1818 97.7386 66.0227 100.898 67.7045C104.057 69.3636 106.409 71.6023 107.955 74.4205C109.5 77.2159 110.273 80.3182 110.273 83.7273C110.273 86.7273 109.739 89.2045 108.67 91.1591C107.625 93.1136 106.239 94.6591 104.511 95.7955C102.807 96.9318 100.955 97.7727 98.9545 98.3182V99C101.091 99.1364 103.239 99.8864 105.398 101.25C107.557 102.614 109.364 104.568 110.818 107.114C112.273 109.659 113 112.773 113 116.455C113 119.955 112.205 123.102 110.614 125.898C109.023 128.693 106.511 130.909 103.08 132.545C99.6477 134.182 95.1818 135 89.6818 135H64.4545ZM72.9091 127.5H89.6818C95.2045 127.5 99.125 126.432 101.443 124.295C103.784 122.136 104.955 119.523 104.955 116.455C104.955 114.091 104.352 111.909 103.148 109.909C101.943 107.886 100.227 106.273 98 105.068C95.7727 103.841 93.1364 103.227 90.0909 103.227H72.9091V127.5ZM72.9091 95.8636H88.5909C91.1364 95.8636 93.4318 95.3636 95.4773 94.3636C97.5455 93.3636 99.1818 91.9545 100.386 90.1364C101.614 88.3182 102.227 86.1818 102.227 83.7273C102.227 80.6591 101.159 78.0568 99.0227 75.9205C96.8864 73.7614 93.5 72.6818 88.8636 72.6818H72.9091V95.8636ZM131.665 135.545C129.983 135.545 128.54 134.943 127.335 133.739C126.131 132.534 125.528 131.091 125.528 129.409C125.528 127.727 126.131 126.284 127.335 125.08C128.54 123.875 129.983 123.273 131.665 123.273C133.347 123.273 134.79 123.875 135.994 125.08C137.199 126.284 137.801 127.727 137.801 129.409C137.801 130.523 137.517 131.545 136.949 132.477C136.403 133.409 135.665 134.159 134.733 134.727C133.824 135.273 132.801 135.545 131.665 135.545Z"
                fill="#302208"
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
                style={{ fontFamily: "GeistMono", fontWeight: "semibold" }}
              >
                Better Auth
              </div>
              <div tw="flex gap-2 items-center text-xl">
                <div
                  style={{
                    fontFamily: "GeistMono",
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
        </div>
      ),
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
