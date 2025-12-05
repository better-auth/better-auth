import boxen from "boxen";
import chalk from "chalk";
import logUpdate from "log-update";
import { cliVersion } from "../..";

const getHero = (title: string, subtitle?: string) => {
	const b = `██`;
	const s = `  `;
	const betterAuthLogo = [
		`${b}${s}${b}${b}${s}`,
		`${b}${b}${s}${b}${s}${title}`,
		`${b}${s}${b}${b}${s}${subtitle}`,
	].join("\n");

	return betterAuthLogo;
};

export type RendererState =
	| "idle"
	| "typing"
	| "blinking"
	| "paused"
	| "stopped";

export class HeroRenderer {
	private subtitle: string = "";
	private subtitleStyle?: (text: string) => string;
	private defaultTips: string | null = null;
	private tips: string | null = this.defaultTips;
	private cursorVisible: boolean = true;
	private blinkInterval: NodeJS.Timeout | null = null;
	private blinkTimeout: NodeJS.Timeout | null = null;
	private state: RendererState = "idle";
	private readonly title: string;
	private readonly cursor: string = "░";
	private readonly blinkIntervalMs: number = 200;

	// Input handling state
	private inputHandler: ((key: string) => void) | null = null;
	private inputHandlerActive: boolean = false;
	private stdinWasRaw: boolean = false;
	private stdinWasPaused: boolean = false;
	private skipToEnd: boolean = false;
	private isTypingSession: boolean = false;

	constructor(title: string) {
		this.title = title;
		// Start input handling immediately to prevent inputs from breaking rendering
		this.startInputHandling();
	}

	setDefaultTips(text: string | null): void {
		this.defaultTips = text;
	}

	setSubtitle(text: string, style?: (text: string) => string): void {
		// Remove cursor if present
		this.subtitle = text.replace(/░(\u001B\[[0-9;]*m)*$/, "");
		this.subtitleStyle = style;
		if (this.state !== "paused" && this.state !== "stopped") {
			this.render();
		}
	}

	private setTips(text: string | null): void {
		this.tips = text ?? this.defaultTips;
		if (this.state !== "paused" && this.state !== "stopped") {
			this.render();
		}
	}

	private startInputHandling(): void {
		if (this.inputHandlerActive) {
			return;
		}

		this.inputHandlerActive = true;
		this.skipToEnd = false;
		this.stdinWasRaw = process.stdin.isRaw;
		this.stdinWasPaused = process.stdin.isPaused();

		// Set up stdin for raw mode input
		if (!this.stdinWasRaw) {
			process.stdin.setRawMode(true);
		}
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		// Create input handler that captures all inputs
		this.inputHandler = (key: string) => {
			// Always allow Ctrl+C to exit normally
			if (key === "\u0003") {
				process.exit(0);
			}

			// Only respond to Enter during typing session (check flag, not just state)
			// State may temporarily be "blinking" during typing, but flag persists
			if (this.isTypingSession) {
				// Handle Enter key - skip to end of typing
				if (
					key === "\r" ||
					key === "\n" ||
					key === "\u000d" ||
					key === "\u000a"
				) {
					this.skipToEnd = true;
					return;
				}
			}

			// For all other states and keys, ignore the input
			// This prevents inputs from breaking rendering or creating newlines
		};

		process.stdin.on("data", this.inputHandler);
	}

	private stopInputHandling(): void {
		if (!this.inputHandlerActive) {
			return;
		}

		if (this.inputHandler) {
			process.stdin.removeListener("data", this.inputHandler);
			this.inputHandler = null;
		}

		// Restore stdin state
		if (!this.stdinWasRaw) {
			process.stdin.setRawMode(false);
		}
		if (this.stdinWasPaused) {
			process.stdin.pause();
		}

		this.inputHandlerActive = false;
		this.skipToEnd = false;
	}

	buildOutput(displayText: string, opts?: { borderless?: boolean }): string {
		const hero = getHero(this.title, displayText);
		const boxedHero = boxen(hero, {
			padding: opts?.borderless ? 0 : 1,
			borderStyle: opts?.borderless ? "none" : "classic",
			margin: opts?.borderless ? {} : { left: 1, right: 1 },
			fullscreen: opts?.borderless
				? undefined
				: (width) => {
						return [width - 2, 0];
					},
			titleAlignment: "right",
			title: opts?.borderless
				? undefined
				: chalk.dim(this.tips ?? `v${cliVersion}`),
			dimBorder: true,
		});
		return boxedHero;
	}

	render(): void {
		if (this.state === "paused" || this.state === "stopped") {
			return;
		}

		let displaySubtitle = this.subtitle;
		if (this.subtitleStyle) {
			displaySubtitle = this.subtitleStyle(this.subtitle);
		}

		const displayText = this.cursorVisible
			? displaySubtitle + this.cursor
			: displaySubtitle;

		logUpdate(this.buildOutput(displayText));
	}

	async blink(duration: number): Promise<void> {
		if (this.state === "paused" || this.state === "stopped") {
			return;
		}

		// Preserve typing state if we're in a typing session
		const wasTyping = this.isTypingSession && this.state === "typing";
		this.state = "blinking";
		this.cursorVisible = true;

		return new Promise<void>((resolve) => {
			const startTime = Date.now();

			// For very short durations, just show cursor without blinking
			if (duration < this.blinkIntervalMs) {
				this.render();
				this.blinkTimeout = setTimeout(() => {
					this.render();
					// Restore typing state if we were in a typing session
					this.state = wasTyping ? "typing" : "idle";
					resolve();
				}, duration);
				return;
			}

			// Initial render
			this.render();

			this.blinkInterval = setInterval(() => {
				const elapsed = Date.now() - startTime;

				if (elapsed >= duration) {
					this.stopBlinking();
					this.cursorVisible = true;
					this.render();
					// Restore typing state if we were in a typing session
					this.state = wasTyping ? "typing" : "idle";
					resolve();
					return;
				}

				this.cursorVisible = !this.cursorVisible;
				this.render();
			}, this.blinkIntervalMs);
		});
	}

	async typeText(
		text: string,
		options?: {
			delay?: number;
			spaceDelay?: number;
			variation?: number;
			skipAnimation?: boolean;
		},
	): Promise<void> {
		if (this.state === "paused" || this.state === "stopped") {
			return;
		}

		this.subtitle = "";
		this.subtitleStyle = (text: string) => chalk.dim(text);

		// If skipAnimation is true, just show the full text immediately
		if (options?.skipAnimation) {
			this.subtitle = text;
			const displaySubtitle = this.subtitleStyle
				? this.subtitleStyle(this.subtitle)
				: this.subtitle;
			const displayText = this.cursorVisible
				? displaySubtitle + this.cursor
				: displaySubtitle;
			logUpdate(this.buildOutput(displayText));
			this.setTips(null);
			this.state = "idle";
			return;
		}

		this.setTips("press enter to skip");
		this.state = "typing";
		this.isTypingSession = true;
		const delay = options?.delay ?? 80;
		const spaceDelay = options?.spaceDelay ?? 80;
		// Variation percentage (0-1), defaults to 0.2 (20% variation)
		const variation = options?.variation ?? 0.2;

		// Reset skip flag for new typing session
		this.skipToEnd = false;

		// Helper to add random variation to a delay
		const varyDelay = (baseDelay: number): number => {
			const variationAmount = baseDelay * variation;
			const randomVariation = (Math.random() * 2 - 1) * variationAmount; // -variationAmount to +variationAmount
			return Math.max(10, baseDelay + randomVariation); // Minimum 10ms
		};

		// Input handling is already active from constructor
		// Just ensure it's set up (in case it was stopped)
		this.startInputHandling();

		try {
			for (const letter of text) {
				if (this.skipToEnd) {
					// Skip to end - set full text and break
					this.subtitle = text;
					const displaySubtitle = this.subtitleStyle
						? this.subtitleStyle(this.subtitle)
						: this.subtitle;
					const displayText = this.cursorVisible
						? displaySubtitle + this.cursor
						: displaySubtitle;
					logUpdate(this.buildOutput(displayText));
					break;
				}

				this.subtitle += letter;
				const displaySubtitle = this.subtitleStyle
					? this.subtitleStyle(this.subtitle)
					: this.subtitle;
				const displayText = this.cursorVisible
					? displaySubtitle + this.cursor
					: displaySubtitle;
				logUpdate(this.buildOutput(displayText));
				const baseDuration = letter === " " ? spaceDelay : delay;
				const variedDuration = varyDelay(baseDuration);
				await this.blink(variedDuration);
			}
		} finally {
			// Clear typing session flag
			this.isTypingSession = false;
		}
		this.setTips(null);
		this.state = "idle";
	}

	pause(): void {
		this.stopBlinking();
		// Stop input handling when paused - inputs should be handled by prompts
		this.stopInputHandling();
		// Render final state once without cursor blinking
		this.cursorVisible = false;
		logUpdate(this.buildOutput(this.subtitle));
		this.state = "paused";
	}

	/**
	 * Finalizes the renderer output by converting it from log-update to permanent console output.
	 * This allows the output to persist while prompts render below it.
	 */
	finalize(): void {
		if (this.state === "stopped") return;

		// Get the current output
		const output = this.buildOutput(this.subtitle);

		// Render it one final time with log-update
		logUpdate(output);

		// Convert to permanent console output
		console.log(output);

		// Clear log-update so prompts can render properly below
		logUpdate.clear();
	}

	/**
	 * Clears log-update output, allowing normal console output to work properly.
	 * Call this before using console.log() or other console methods after using the renderer.
	 */
	clear(): void {
		logUpdate.clear();
	}

	resume(): void {
		if (this.state !== "paused") return;
		this.state = "idle";
		// Restart input handling after resume
		this.startInputHandling();
		this.render();
	}

	/**
	 * Resets the renderer to a clean state, ready for new content.
	 * Clears log-update, stops any ongoing operations, and ensures it's ready to render.
	 */
	reset(): void {
		this.stopBlinking();
		this.stopInputHandling();
		this.state = "idle";
		this.subtitle = "";
		this.cursorVisible = true;
		this.isTypingSession = false;
		this.skipToEnd = false;
		logUpdate.clear();
		// Restart input handling for new rendering session
		this.startInputHandling();
	}

	/**
	 * Checks if the renderer is stopped (destroyed)
	 */
	isStopped(): boolean {
		return this.state === "stopped";
	}

	stop(): void {
		this.stopBlinking();
		// Stop input handling when stopped
		this.stopInputHandling();
		this.state = "stopped";
	}

	destroy(): void {
		this.stop();
		// Ensure input handling is completely cleaned up
		this.stopInputHandling();
		logUpdate.clear();
	}

	async clearSubtitle(initialSubtitle: string): Promise<void> {
		this.setSubtitle(initialSubtitle, (text: string) =>
			chalk.bgWhiteBright(chalk.blackBright(text)),
		);
		await this.blink(200);
		this.setSubtitle("");
		await this.blink(500);
	}

	private stopBlinking(): void {
		if (this.blinkInterval) {
			clearInterval(this.blinkInterval);
			this.blinkInterval = null;
		}
		if (this.blinkTimeout) {
			clearTimeout(this.blinkTimeout);
			this.blinkTimeout = null;
		}
	}
}
