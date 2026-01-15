/**
 * Stripe Embedded Checkout Client
 *
 * A client-side helper that handles Stripe.js loading and embedded checkout mounting,
 * eliminating the need to manually import @stripe/stripe-js.
 *
 * @example
 * ```ts
 * import { createStripeEmbeddedCheckout } from "@better-auth/stripe/client";
 *
 * const stripeCheckout = createStripeEmbeddedCheckout({
 *   publishableKey: "pk_test_...",
 *   appearance: { theme: "night" },
 *   onComplete: () => console.log("Checkout complete!"),
 * });
 *
 * // Mount the checkout
 * await stripeCheckout.mount({
 *   clientSecret: data.clientSecret,
 *   container: "#checkout",
 * });
 *
 * // Later, unmount if needed
 * stripeCheckout.unmount();
 * ```
 */

declare global {
	interface Window {
		Stripe?: StripeConstructor;
	}
}

// Stripe types (minimal definitions to avoid dependency on @stripe/stripe-js)
type StripeConstructor = (
	publishableKey: string,
	options?: StripeElementsOptions,
) => StripeInstance;

interface StripeInstance {
	initEmbeddedCheckout(options: {
		clientSecret: string;
		onComplete?: () => void;
	}): Promise<EmbeddedCheckoutInstance>;
}

interface EmbeddedCheckoutInstance {
	mount(container: string | HTMLElement): void;
	unmount(): void;
	destroy(): void;
}

interface StripeElementsOptions {
	stripeAccount?: string;
	locale?: string;
	betas?: string[];
}

/**
 * Appearance customization for Stripe Embedded Checkout
 * @see https://docs.stripe.com/elements/appearance-api
 */
export interface StripeEmbeddedCheckoutAppearance {
	/**
	 * Theme preset: 'stripe', 'night', or 'flat'
	 */
	theme?: "stripe" | "night" | "flat";
	/**
	 * CSS variables to customize the checkout appearance
	 */
	variables?: {
		colorPrimary?: string;
		colorBackground?: string;
		colorText?: string;
		colorDanger?: string;
		colorTextPlaceholder?: string;
		colorTextSecondary?: string;
		colorBorder?: string;
		fontFamily?: string;
		fontSizeBase?: string;
		borderRadius?: string;
		spacingUnit?: string;
		[key: string]: string | undefined;
	};
	/**
	 * CSS rules to customize specific elements
	 */
	rules?: Record<
		string,
		Record<string, string | number | undefined> | undefined
	>;
}

export interface StripeEmbeddedCheckoutOptions {
	/**
	 * Your Stripe publishable key
	 */
	publishableKey: string;
	/**
	 * Optional Stripe Connect account ID
	 */
	stripeAccount?: string;
	/**
	 * Locale for the checkout UI (e.g., 'en', 'de', 'fr')
	 * @default 'auto'
	 */
	locale?: string;
	/**
	 * Callback when checkout completes successfully.
	 * Use this for immediate UI feedback. The webhook will handle the server-side processing.
	 */
	onComplete?: () => void;
	/**
	 * Custom URL to load Stripe.js from
	 * @default 'https://js.stripe.com/v3/'
	 */
	stripeJsUrl?: string;
	/**
	 * Stripe beta features to enable
	 */
	betas?: string[];
}

export interface MountOptions {
	/**
	 * The client secret returned from upgrade endpoint with embeddedCheckout: true
	 */
	clientSecret: string;
	/**
	 * CSS selector or HTMLElement to mount the checkout into
	 */
	container: string | HTMLElement;
	/**
	 * Override the onComplete callback for this mount
	 */
	onComplete?: () => void;
}

interface StripeEmbeddedCheckoutInstance {
	/**
	 * Mount the embedded checkout to a container
	 */
	mount(options: MountOptions): Promise<void>;
	/**
	 * Unmount the checkout (can be remounted later)
	 */
	unmount(): void;
	/**
	 * Destroy the checkout instance completely
	 */
	destroy(): void;
	/**
	 * Check if the checkout is currently mounted
	 */
	isMounted(): boolean;
	/**
	 * Get the underlying Stripe instance (for advanced usage)
	 */
	getStripe(): Promise<StripeInstance>;
}

// Cache for loaded Stripe instance
let stripePromise: Promise<StripeInstance> | null = null;
let loadedPublishableKey: string | null = null;

/**
 * Reset the Stripe instance cache.
 * Useful for testing or when you need to reinitialize with different options.
 * @internal
 */
export function __resetStripeCache(): void {
	stripePromise = null;
	loadedPublishableKey = null;
}

/**
 * Loads Stripe.js dynamically
 */
async function loadStripeJs(
	publishableKey: string,
	options: {
		stripeAccount?: string;
		locale?: string;
		stripeJsUrl?: string;
		betas?: string[];
	} = {},
): Promise<StripeInstance> {
	// Return cached instance if same publishable key
	if (stripePromise && loadedPublishableKey === publishableKey) {
		return stripePromise;
	}

	stripePromise = new Promise<StripeInstance>((resolve, reject) => {
		// Check if Stripe is already loaded
		if (window.Stripe) {
			const stripeInstance = window.Stripe(publishableKey, {
				stripeAccount: options.stripeAccount,
				locale: options.locale,
				betas: options.betas,
			});
			loadedPublishableKey = publishableKey;
			resolve(stripeInstance);
			return;
		}

		// Create script element
		const script = document.createElement("script");
		script.src = options.stripeJsUrl || "https://js.stripe.com/v3/";
		script.async = true;

		script.onload = () => {
			if (window.Stripe) {
				const stripeInstance = window.Stripe(publishableKey, {
					stripeAccount: options.stripeAccount,
					locale: options.locale,
					betas: options.betas,
				});
				loadedPublishableKey = publishableKey;
				resolve(stripeInstance);
			} else {
				reject(new Error("Stripe.js failed to load"));
			}
		};

		script.onerror = () => {
			stripePromise = null;
			reject(new Error("Failed to load Stripe.js script"));
		};

		// Check for existing script
		const existingScript = document.querySelector(
			`script[src="${script.src}"]`,
		);
		if (existingScript) {
			// Script tag exists, wait for it to load
			const checkStripe = () => {
				if (window.Stripe) {
					const stripeInstance = window.Stripe(publishableKey, {
						stripeAccount: options.stripeAccount,
						locale: options.locale,
						betas: options.betas,
					});
					loadedPublishableKey = publishableKey;
					resolve(stripeInstance);
				} else {
					setTimeout(checkStripe, 50);
				}
			};
			checkStripe();
		} else {
			document.head.appendChild(script);
		}
	});

	return stripePromise;
}

/**
 * Creates a Stripe Embedded Checkout instance.
 *
 * This helper handles loading Stripe.js dynamically and provides a simple API
 * for mounting and managing embedded checkout sessions.
 *
 * @example
 * ```ts
 * import { createStripeEmbeddedCheckout } from "@better-auth/stripe/client";
 *
 * const stripeCheckout = createStripeEmbeddedCheckout({
 *   publishableKey: "pk_test_...",
 *   onComplete: () => {
 *     console.log("Payment submitted!");
 *     // Navigate to success page or show confirmation
 *   },
 * });
 *
 * // After getting clientSecret from upgrade endpoint with embeddedCheckout option
 * const { data } = await authClient.subscription.upgrade({
 *   plan: "pro",
 *   embeddedCheckout: true,
 *   returnUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
 * });
 *
 * if (data) {
 *   await stripeCheckout.mount({
 *     clientSecret: data.clientSecret,
 *     container: "#checkout-container",
 *   });
 * }
 * ```
 */
export function createStripeEmbeddedCheckout(
	options: StripeEmbeddedCheckoutOptions,
): StripeEmbeddedCheckoutInstance {
	const { publishableKey, stripeAccount, locale, onComplete, stripeJsUrl } =
		options;

	let checkoutInstance: EmbeddedCheckoutInstance | null = null;
	let mounted = false;

	const getStripe = async (): Promise<StripeInstance> => {
		return loadStripeJs(publishableKey, {
			stripeAccount,
			locale,
			stripeJsUrl,
			betas: options.betas,
		});
	};

	const mount = async (mountOptions: MountOptions): Promise<void> => {
		const {
			clientSecret,
			container,
			onComplete: mountOnComplete,
		} = mountOptions;

		if (!clientSecret) {
			throw new Error(
				"clientSecret is required. Get it from the upgrade endpoint with embeddedCheckout: true.",
			);
		}

		// Unmount existing checkout if any
		if (checkoutInstance) {
			try {
				checkoutInstance.destroy();
			} catch {
				// Ignore errors during cleanup
			}
			checkoutInstance = null;
			mounted = false;
		}

		const stripe = await getStripe();

		checkoutInstance = await stripe.initEmbeddedCheckout({
			clientSecret,
			onComplete: mountOnComplete || onComplete,
		});

		// Resolve container
		const containerElement =
			typeof container === "string"
				? document.querySelector(container)
				: container;

		if (!containerElement) {
			throw new Error(
				`Container element not found: ${typeof container === "string" ? container : "HTMLElement"}`,
			);
		}

		// Clear container before mounting
		containerElement.innerHTML = "";

		checkoutInstance.mount(containerElement as HTMLElement);
		mounted = true;
	};

	const unmount = (): void => {
		if (checkoutInstance && mounted) {
			try {
				checkoutInstance.unmount();
				mounted = false;
			} catch {
				// Ignore errors during unmount
			}
		}
	};

	const destroy = (): void => {
		if (checkoutInstance) {
			try {
				checkoutInstance.destroy();
			} catch {
				// Ignore errors during destroy
			}
			checkoutInstance = null;
			mounted = false;
		}
	};

	const isMounted = (): boolean => mounted;

	return {
		mount,
		unmount,
		destroy,
		isMounted,
		getStripe,
	};
}

/**
 * Convenience function to quickly mount an embedded checkout.
 *
 * For simple use cases where you don't need to manage the checkout instance.
 *
 * @example
 * ```ts
 * import { mountEmbeddedCheckout } from "@better-auth/stripe/client";
 *
 * const { data } = await authClient.subscription.upgrade({
 *   plan: "pro",
 *   embeddedCheckout: true,
 *   returnUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
 * });
 *
 * if (data) {
 *   const checkout = await mountEmbeddedCheckout({
 *     publishableKey: "pk_test_...",
 *     clientSecret: data.clientSecret,
 *     container: "#checkout",
 *     onComplete: () => console.log("Done!"),
 *   });
 *
 *   // Later: checkout.unmount() or checkout.destroy()
 * }
 * ```
 */
export async function mountEmbeddedCheckout(
	options: StripeEmbeddedCheckoutOptions & MountOptions,
): Promise<StripeEmbeddedCheckoutInstance> {
	const {
		clientSecret,
		container,
		onComplete: mountOnComplete,
		...checkoutOptions
	} = options;

	const checkout = createStripeEmbeddedCheckout({
		...checkoutOptions,
		onComplete: mountOnComplete,
	});

	await checkout.mount({ clientSecret, container });

	return checkout;
}
