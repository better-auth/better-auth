// spell-checker:disable
"use client";

import { useLayoutEffect, useRef } from "react";

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_click;
uniform vec2 u_clickPos;

//
// Simplex 2D noise (Ashima Arts)
//
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(
    0.211324865405187,
    0.366025403784439,
   -0.577350269189626,
    0.024390243902439
  );
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// Fractal Brownian Motion
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    value += amp * snoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.5;

  float t = u_time * 0.04;

  // Mouse disruption - push noise coordinates away from cursor
  vec2 mouseUV = u_mouse;
  mouseUV.x *= aspect;
  mouseUV *= 2.5;
  vec2 diff = p - mouseUV;
  float dist = length(diff);
  float radius = 0.5;
  if (u_mouse.x > 0.0 && dist < radius) {
    float strength = smoothstep(radius, 0.0, dist) * 0.2;
    vec2 push = normalize(diff) * strength;
    p += push;
  }

  // Click disruption - ripple outward from click point
  if (u_click > 0.01) {
    vec2 clickUV = u_clickPos;
    clickUV.x *= aspect;
    clickUV *= 2.5;
    vec2 cdiff = p - clickUV;
    float cdist = length(cdiff);
    float ripple = sin(cdist * 12.0 - u_time * 8.0) * u_click * 0.4;
    float falloff = exp(-cdist * 2.0);
    p += normalize(cdiff + 0.001) * ripple * falloff;
  }

  // Domain warping - feed noise into noise for organic flowing shapes
  vec2 q = vec2(
    fbm(p + vec2(0.0, 0.0) + t * 0.3),
    fbm(p + vec2(5.2, 1.3) + t * 0.2)
  );

  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.15),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.12)
  );

  float f = fbm(p + 4.0 * r);

  // Build the color - dark smoky clouds
  float brightness = (f * f * f + 0.6 * f * f + 0.5 * f);

  // Remap to 0-1 range and darken overall
  brightness = clamp(brightness, 0.0, 1.0);
  brightness *= 0.12;

  // Fade out on the left side for subtlety
  float leftFade = smoothstep(0.0, 0.45, uv.x);
  brightness *= leftFade;

  // Slight vignette to darken edges
  vec2 vc = uv - 0.5;
  float vignette = 1.0 - dot(vc, vc) * 0.8;
  brightness *= vignette;

  gl_FragColor = vec4(vec3(brightness), 1.0);
}`;

export function HalftoneBackground() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<number>(0);
	const mouseRef = useRef({ x: -1, y: -1 });
	const smoothMouseRef = useRef({ x: -1, y: -1 });
	const clickRef = useRef({ strength: 0, x: 0, y: 0 });

	useLayoutEffect(() => {
		const canvas = canvasRef.current;
		const wrapper = wrapperRef.current;
		if (!canvas || !wrapper) return;

		const gl = canvas.getContext("webgl", {
			alpha: false,
			antialias: false,
			preserveDrawingBuffer: false,
		});
		if (!gl) return;

		// Compile shaders
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

		// Fullscreen quad
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
		const uMouse = gl.getUniformLocation(program, "u_mouse");
		const uClick = gl.getUniformLocation(program, "u_click");
		const uClickPos = gl.getUniformLocation(program, "u_clickPos");

		const startTime = performance.now();

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const scale = 0.5 * dpr;
			canvas.width = canvas.offsetWidth * scale;
			canvas.height = canvas.offsetHeight * scale;
			gl.viewport(0, 0, canvas.width, canvas.height);
		};

		resize();
		window.addEventListener("resize", resize);

		const onMouseMove = (e: MouseEvent) => {
			const rect = wrapper.getBoundingClientRect();
			mouseRef.current.x = (e.clientX - rect.left) / rect.width;
			mouseRef.current.y = 1.0 - (e.clientY - rect.top) / rect.height;
		};

		const onMouseLeave = () => {
			mouseRef.current.x = -1;
			mouseRef.current.y = -1;
		};

		const onClick = (e: MouseEvent) => {
			const rect = wrapper.getBoundingClientRect();
			clickRef.current.x = (e.clientX - rect.left) / rect.width;
			clickRef.current.y = 1.0 - (e.clientY - rect.top) / rect.height;
			clickRef.current.strength = 1.0;
		};

		window.addEventListener("mousemove", onMouseMove, { passive: true });
		wrapper.addEventListener("mouseleave", onMouseLeave);
		wrapper.addEventListener("click", onClick);

		const draw = () => {
			const elapsed = (performance.now() - startTime) / 1000;

			const lerp = 0.08;
			const target = mouseRef.current;
			const smooth = smoothMouseRef.current;
			if (target.x < 0) {
				smooth.x += (target.x - smooth.x) * 0.02;
				smooth.y += (target.y - smooth.y) * 0.02;
			} else {
				smooth.x += (target.x - smooth.x) * lerp;
				smooth.y += (target.y - smooth.y) * lerp;
			}

			clickRef.current.strength *= 0.96;

			gl.uniform1f(uTime, elapsed);
			gl.uniform2f(uResolution, canvas.width, canvas.height);
			gl.uniform2f(uMouse, smooth.x, smooth.y);
			gl.uniform1f(uClick, clickRef.current.strength);
			gl.uniform2f(uClickPos, clickRef.current.x, clickRef.current.y);
			gl.drawArrays(gl.TRIANGLES, 0, 6);

			frameRef.current = requestAnimationFrame(draw);
		};

		// Draw the first frame synchronously so the canvas has content before paint
		gl.uniform1f(uTime, 0);
		gl.uniform2f(uResolution, canvas.width, canvas.height);
		gl.uniform2f(uMouse, -1, -1);
		gl.uniform1f(uClick, 0);
		gl.uniform2f(uClickPos, 0, 0);
		gl.drawArrays(gl.TRIANGLES, 0, 6);

		frameRef.current = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frameRef.current);
			window.removeEventListener("resize", resize);
			window.removeEventListener("mousemove", onMouseMove);
			wrapper.removeEventListener("mouseleave", onMouseLeave);
			wrapper.removeEventListener("click", onClick);
			gl.deleteProgram(program);
			gl.deleteShader(vs);
			gl.deleteShader(fs);
			gl.deleteBuffer(buffer);
		};
	}, []);

	return (
		<div
			ref={wrapperRef}
			className="absolute inset-0 overflow-hidden bg-background"
			aria-hidden="true"
		>
			<canvas ref={canvasRef} className="w-full h-full invert dark:invert-0" />
		</div>
	);
}
