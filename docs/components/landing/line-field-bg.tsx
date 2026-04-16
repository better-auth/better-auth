// spell-checker:disable
"use client";

import { useLayoutEffect, useRef } from "react";

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

// Vertical straight lines with a top-to-bottom halftone envelope — cleared
// behind the logo, strong fade above, lighter fade below. A slow outward
// ripple pulse modulates line intensity. Output is monochrome; CSS handles
// the invert between dark and light themes.
const FRAGMENT_SHADER = `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_center;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;

  // Aspect-corrected distance from the logo center.
  vec2 p = vec2((uv.x - u_center.x) * aspect, uv.y - u_center.y);
  float dist = length(p);

  float t = u_time * 0.08;

  // --- Vertical straight lines ------------------------------------------
  // Uniform stripes drifting slowly sideways. Narrow smoothstep keeps the
  // strokes hairline-thin.
  float stripeFreq = 110.0;
  float phase = uv.x * stripeFreq + t * 0.6;
  float stripe = abs(fract(phase) - 0.5) * 2.0; // 0 on line, 1 between
  float lineCore = 1.0 - smoothstep(0.06, 0.22, stripe);

  // --- Vertical halftone envelope ----------------------------------------
  // Asymmetric fade: strong/fast above the logo so the mark sits on an
  // empty backdrop, looser falloff below so the lines still breathe down
  // the column.
  float dy = uv.y - u_center.y;
  float sigma = dy > 0.0 ? 0.08 : 0.22;
  float verticalHalo = exp(-pow(dy / sigma, 2.0));

  // Hard-clear the logo zone so lines never crowd the mark.
  float centerClear = smoothstep(0.14, 0.28, dist);

  float envelope = verticalHalo * centerClear;

  // --- Outward ripple pulse ----------------------------------------------
  float ripple = 0.0;
  for (int i = 0; i < 3; i++) {
    float rp = fract(t * 0.3 + float(i) * 0.333);
    float radius = rp * 1.2;
    float bell = (1.0 - rp) * rp * 4.0;
    ripple += exp(-pow((dist - radius) * 10.0, 2.0)) * bell;
  }

  float lines = lineCore * envelope * (0.55 + ripple * 1.4);

  // Vignette.
  vec2 vc = uv - 0.5;
  float vignette = clamp(1.0 - dot(vc, vc) * 0.9, 0.0, 1.0);

  float brightness = lines * 0.9 * vignette;

  // Keep overall intensity low so the logo remains the focal point.
  brightness *= 0.75;
  brightness = clamp(brightness, 0.0, 1.0);

  gl_FragColor = vec4(vec3(brightness), 1.0);
}`;

export function LineFieldBackground() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const frameRef = useRef<number>(0);

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const gl = canvas.getContext("webgl", {
			alpha: false,
			antialias: false,
			preserveDrawingBuffer: false,
		});
		if (!gl) return;

		function createShader(type: number, source: string) {
			const shader = gl!.createShader(type)!;
			gl!.shaderSource(shader, source);
			gl!.compileShader(shader);
			return shader;
		}

		const vs = createShader(gl.VERTEX_SHADER, VERTEX_SHADER);
		const fs = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

		const program = gl.createProgram()!;
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		gl.useProgram(program);

		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
			gl.STATIC_DRAW,
		);

		const aPosition = gl.getAttribLocation(program, "a_position");
		gl.enableVertexAttribArray(aPosition);
		gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

		const uTime = gl.getUniformLocation(program, "u_time");
		const uResolution = gl.getUniformLocation(program, "u_resolution");
		const uCenter = gl.getUniformLocation(program, "u_center");

		const startTime = performance.now();

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const scale = 0.75 * dpr;
			canvas.width = canvas.offsetWidth * scale;
			canvas.height = canvas.offsetHeight * scale;
			gl.viewport(0, 0, canvas.width, canvas.height);
		};

		resize();
		window.addEventListener("resize", resize);

		const draw = () => {
			const elapsed = (performance.now() - startTime) / 1000;

			// The 3D logo sits above geometric center: parent has h-full +
			// flex items-center, then the logo has -mt-[30%] (30% of the
			// column's width). Convert that offset into UV-Y space using the
			// canvas aspect ratio.
			const cssW = canvas.offsetWidth || canvas.width;
			const cssH = canvas.offsetHeight || canvas.height;
			const logoOffsetPx = cssW * 0.15; // half of -mt-[30%]
			const centerY = Math.min(0.5 + logoOffsetPx / cssH, 0.85);

			gl.uniform1f(uTime, elapsed);
			gl.uniform2f(uResolution, canvas.width, canvas.height);
			gl.uniform2f(uCenter, 0.5, centerY);
			gl.drawArrays(gl.TRIANGLES, 0, 6);

			frameRef.current = requestAnimationFrame(draw);
		};

		gl.uniform1f(uTime, 0);
		gl.uniform2f(uResolution, canvas.width, canvas.height);
		gl.uniform2f(uCenter, 0.5, 0.5);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		frameRef.current = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frameRef.current);
			window.removeEventListener("resize", resize);
			gl.deleteProgram(program);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			gl.deleteBuffer(buffer);
		};
	}, []);

	return (
		<div
			className="hidden lg:block absolute inset-0 overflow-hidden bg-background pointer-events-none"
			aria-hidden="true"
		>
			<canvas
				ref={canvasRef}
				className="w-full h-full invert opacity-60 dark:invert-0 dark:opacity-70"
			/>
		</div>
	);
}
