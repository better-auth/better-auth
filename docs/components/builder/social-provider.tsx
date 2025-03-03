import { salesforce } from 'better-auth/social-providers';
import { SVGProps } from "react";

export const socialProviders = {
	apple: {
		Icon: (props: SVGProps<any>) => (
			<svg
				{...props}
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M17.05 20.28c-.98.95-2.05.8-3.08.35c-1.09-.46-2.09-.48-3.24 0c-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8c1.18-.24 2.31-.93 3.57-.84c1.51.12 2.65.72 3.4 1.8c-3.12 1.87-2.38 5.98.48 7.13c-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25c.29 2.58-2.34 4.5-3.74 4.25"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M17.05 20.28c-.98.95-2.05.8-3.08.35c-1.09-.46-2.09-.48-3.24 0c-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8c1.18-.24 2.31-.93 3.57-.84c1.51.12 2.65.72 3.4 1.8c-3.12 1.87-2.38 5.98.48 7.13c-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25c.29 2.58-2.34 4.5-3.74 4.25"
				></path>
			</svg>`,
	},
	dropbox: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<g fill="none" fillRule="evenodd">
					<path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"></path>
					<path
						fill="currentColor"
						d="m11.998 13.503l2.879 1.662c.426.246.923.34 1.365.34c.443 0 .94-.094 1.367-.34l.587-.34V17a1 1 0 0 1-.5.866l-5.196 3a1 1 0 0 1-1 0l-5.196-3a1 1 0 0 1-.5-.866v-2.172l.583.337c.426.246.923.34 1.366.34c.442 0 .939-.094 1.366-.34zM6.887 3.5c.434-.251 1.115-.274 1.594-.068l.138.068l3.379 1.95l3.379-1.95c.434-.251 1.115-.274 1.594-.068l.138.068l4.242 2.45c.447.257.476.664.09.942l-.09.057l-3.378 1.95l3.378 1.95c.447.258.476.665.09.943l-.09.057l-4.242 2.45c-.435.25-1.116.273-1.595.068l-.137-.068l-3.38-1.951l-3.378 1.95c-.435.252-1.116.274-1.595.07l-.137-.07l-4.243-2.449c-.447-.257-.476-.665-.09-.942l.09-.058L6.022 8.9L2.644 6.95c-.447-.257-.476-.665-.09-.942l.09-.058zm5.546 2.702c-.205-.119-.52-.136-.755-.051l-.111.05l-4.243 2.45c-.212.122-.236.313-.07.45l.07.05l4.243 2.449c.205.118.52.135.755.05l.111-.05l4.243-2.45c.212-.122.236-.312.07-.45l-.07-.05z"
					></path>
				</g>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<g fill="none" fillRule="evenodd">
					<path d="m12.594 23.258l-.012.002l-.071.035l-.02.004l-.014-.004l-.071-.036q-.016-.004-.024.006l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.016-.018m.264-.113l-.014.002l-.184.093l-.01.01l-.003.011l.018.43l.005.012l.008.008l.201.092q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.003-.011l.018-.43l-.003-.012l-.01-.01z"></path>
					<path
						fill="currentColor"
						d="m11.998 13.503l2.879 1.662c.426.246.923.34 1.365.34c.443 0 .94-.094 1.367-.34l.587-.34V17a1 1 0 0 1-.5.866l-5.196 3a1 1 0 0 1-1 0l-5.196-3a1 1 0 0 1-.5-.866v-2.172l.583.337c.426.246.923.34 1.366.34c.442 0 .939-.094 1.366-.34zM6.887 3.5c.434-.251 1.115-.274 1.594-.068l.138.068l3.379 1.95l3.379-1.95c.434-.251 1.115-.274 1.594-.068l.138.068l4.242 2.45c.447.257.476.664.09.942l-.09.057l-3.378 1.95l3.378 1.95c.447.258.476.665.09.943l-.09.057l-4.242 2.45c-.435.25-1.116.273-1.595.068l-.137-.068l-3.38-1.951l-3.378 1.95c-.435.252-1.116.274-1.595.07l-.137-.07l-4.243-2.449c-.447-.257-.476-.665-.09-.942l.09-.058L6.022 8.9L2.644 6.95c-.447-.257-.476-.665-.09-.942l.09-.058zm5.546 2.702c-.205-.119-.52-.136-.755-.051l-.111.05l-4.243 2.45c-.212.122-.236.313-.07.45l.07.05l4.243 2.449c.205.118.52.135.755.05l.111-.05l4.243-2.45c.212-.122.236-.312.07-.45l-.07-.05z"
					></path>
				</g>
			</svg>`,
	},
	discord: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					fill="currentColor"
					d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.1.1 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.1 16.1 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02M8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12m6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.1.1 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.1 16.1 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02M8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12m6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12"
				></path>
			</svg>`,
	},
	facebook: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					d="M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8.615v-6.96h-2.338v-2.725h2.338v-2c0-2.325 1.42-3.592 3.5-3.592c.699-.002 1.399.034 2.095.107v2.42h-1.435c-1.128 0-1.348.538-1.348 1.325v1.735h2.697l-.35 2.725h-2.348V21H20a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z"
					fill="currentColor"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					d="M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8.615v-6.96h-2.338v-2.725h2.338v-2c0-2.325 1.42-3.592 3.5-3.592c.699-.002 1.399.034 2.095.107v2.42h-1.435c-1.128 0-1.348.538-1.348 1.325v1.735h2.697l-.35 2.725h-2.348V21H20a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z"
					fill="currentColor"
				></path>
			</svg>`,
	},
	github: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					fill="currentColor"
					d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
				></path>
			</svg>`,
	},
	gitlab: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					fill="currentColor"
					d="m22.749 9.769l-.031-.08l-3.027-7.9a.79.79 0 0 0-.782-.495a.8.8 0 0 0-.456.17a.8.8 0 0 0-.268.408L16.14 8.125H7.865L5.822 1.872a.8.8 0 0 0-.269-.409a.81.81 0 0 0-.926-.05c-.14.09-.25.22-.312.376L1.283 9.684l-.03.08a5.62 5.62 0 0 0 1.864 6.496l.01.008l.028.02l4.61 3.453l2.282 1.726l1.39 1.049a.935.935 0 0 0 1.13 0l1.389-1.05l2.281-1.726l4.639-3.473l.011-.01A5.62 5.62 0 0 0 22.75 9.77"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="m22.749 9.769l-.031-.08l-3.027-7.9a.79.79 0 0 0-.782-.495a.8.8 0 0 0-.456.17a.8.8 0 0 0-.268.408L16.14 8.125H7.865L5.822 1.872a.8.8 0 0 0-.269-.409a.81.81 0 0 0-.926-.05c-.14.09-.25.22-.312.376L1.283 9.684l-.03.08a5.62 5.62 0 0 0 1.864 6.496l.01.008l.028.02l4.61 3.453l2.282 1.726l1.39 1.049a.935.935 0 0 0 1.13 0l1.389-1.05l2.281-1.726l4.639-3.473l.011-.01A5.62 5.62 0 0 0 22.75 9.77"
				></path>
			</svg>`,
	},
	google: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="0.98em"
				height="1em"
				viewBox="0 0 256 262"
			>
				<path
					fill="#4285F4"
					d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
				></path>
				<path
					fill="#34A853"
					d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
				></path>
				<path
					fill="#FBBC05"
					d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
				></path>
				<path
					fill="#EB4335"
					d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
				></path>
			</svg>
		),
		stringIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="0.98em" height="1em" viewBox="0 0 256 262">
				<path fill="#4285F4" d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"></path>
				<path fill="#34A853" d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"></path>
				<path fill="#FBBC05" d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"></path>
				<path fill="#EB4335" d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"></path>
			</svg>`,
	},
	linkedin: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					fill="currentColor"
					d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z"
				></path>
			</svg>`,
	},
	microsoft: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.2em"
				height="1.2em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					fill="currentColor"
					d="M2 3h9v9H2zm9 19H2v-9h9zM21 3v9h-9V3zm0 19h-9v-9h9z"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M2 3h9v9H2zm9 19H2v-9h9zM21 3v9h-9V3zm0 19h-9v-9h9z"
				></path>
			</svg>`,
	},
	salesforce: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				xmlnsXlink="http://www.w3.org/1999/xlink"
				viewBox="0 0 273 191"
				{...props}
			>
				<title>{"Salesforce.com logo"}</title>
				<defs>
					<path id="a" d="M.06.5h272v190H.06z" />
				</defs>
				<g fillRule="evenodd">
					<mask id="b" fill="#fff">
						<use xlinkHref="#a" />
					</mask>
					<path
						fill="#00A1E0"
						d="M113 21.3c8.78-9.14 21-14.8 34.5-14.8 18 0 33.6 10 42 24.9a58 58 0 0 1 23.7-5.05c32.4 0 58.7 26.5 58.7 59.2s-26.3 59.2-58.7 59.2c-3.96 0-7.82-.398-11.6-1.15-7.35 13.1-21.4 22-37.4 22a42.7 42.7 0 0 1-18.8-4.32c-7.45 17.5-24.8 29.8-45 29.8-21.1 0-39-13.3-45.9-32a45.1 45.1 0 0 1-9.34.972c-25.1 0-45.4-20.6-45.4-45.9 0-17 9.14-31.8 22.7-39.8a52.6 52.6 0 0 1-4.35-21c0-29.2 23.7-52.8 52.9-52.8 17.1 0 32.4 8.15 42 20.8"
						mask="url(#b)"
					/>
					<path
						fill="#FFFFFE"
						d="M39.4 99.3c-.171.446.061.539.116.618.511.37 1.03.638 1.55.939 2.78 1.47 5.4 1.9 8.14 1.9 5.58 0 9.05-2.97 9.05-7.75v-.094c0-4.42-3.92-6.03-7.58-7.18l-.479-.155c-2.77-.898-5.16-1.68-5.16-3.5v-.093c0-1.56 1.4-2.71 3.56-2.71 2.4 0 5.26.799 7.09 1.81 0 0 .542.35.739-.173.107-.283 1.04-2.78 1.14-3.06.106-.293-.08-.514-.271-.628-2.1-1.28-5-2.15-8-2.15l-.557.002c-5.11 0-8.68 3.09-8.68 7.51v.095c0 4.66 3.94 6.18 7.62 7.23l.592.184c2.68.824 5 1.54 5 3.42v.094c0 1.73-1.51 3.02-3.93 3.02-.941 0-3.94-.016-7.19-2.07-.393-.229-.617-.394-.92-.579-.16-.097-.56-.272-.734.252l-1.1 3.06m81.7 0c-.171.446.061.539.118.618.509.37 1.03.638 1.55.939 2.78 1.47 5.4 1.9 8.14 1.9 5.58 0 9.05-2.97 9.05-7.75v-.094c0-4.42-3.91-6.03-7.58-7.18l-.479-.155c-2.77-.898-5.16-1.68-5.16-3.5v-.093c0-1.56 1.4-2.71 3.56-2.71 2.4 0 5.25.799 7.09 1.81 0 0 .542.35.74-.173.106-.283 1.04-2.78 1.13-3.06.107-.293-.08-.514-.27-.628-2.1-1.28-5-2.15-8-2.15l-.558.002c-5.11 0-8.68 3.09-8.68 7.51v.095c0 4.66 3.94 6.18 7.62 7.23l.591.184c2.69.824 5 1.54 5 3.42v.094c0 1.73-1.51 3.02-3.93 3.02-.943 0-3.95-.016-7.19-2.07-.393-.229-.623-.387-.921-.579-.101-.064-.572-.248-.733.252l-1.1 3.06m55.8-9.36c0 2.7-.504 4.83-1.49 6.34-.984 1.49-2.47 2.22-4.54 2.22s-3.55-.724-4.52-2.21c-.977-1.5-1.47-3.64-1.47-6.34 0-2.7.496-4.82 1.47-6.31.968-1.48 2.44-2.19 4.52-2.19s3.56.717 4.54 2.19c.992 1.49 1.49 3.61 1.49 6.31m4.66-5.01c-.459-1.55-1.17-2.91-2.12-4.05a10.151 10.151 0 0 0-3.58-2.72c-1.42-.665-3.1-1-5-1s-3.57.337-5 1c-1.42.664-2.63 1.58-3.58 2.72-.948 1.14-1.66 2.5-2.12 4.05-.455 1.54-.686 3.22-.686 5.01 0 1.79.231 3.47.686 5.01.457 1.55 1.17 2.91 2.12 4.05.951 1.14 2.16 2.05 3.58 2.7 1.43.648 3.11.978 5 .978 1.89 0 3.57-.33 4.99-.978 1.42-.648 2.63-1.56 3.58-2.7.949-1.14 1.66-2.5 2.12-4.05.454-1.54.685-3.22.685-5.01 0-1.78-.231-3.47-.685-5.01m38.3 12.8c-.153-.453-.595-.282-.595-.282-.677.259-1.4.499-2.17.619-.776.122-1.64.183-2.55.183-2.25 0-4.05-.671-5.33-2-1.29-1.33-2.01-3.47-2-6.37.007-2.64.645-4.62 1.79-6.14 1.13-1.5 2.87-2.28 5.17-2.28 1.92 0 3.39.223 4.93.705 0 0 .365.159.54-.322.409-1.13.711-1.94 1.15-3.18.124-.355-.18-.505-.291-.548-.604-.236-2.03-.623-3.11-.786-1.01-.154-2.18-.234-3.5-.234-1.96 0-3.7.335-5.19.999-1.49.663-2.75 1.58-3.75 2.72-1 1.14-1.76 2.5-2.27 4.05-.505 1.54-.76 3.23-.76 5.02 0 3.86 1.04 6.99 3.1 9.28 2.06 2.3 5.16 3.46 9.2 3.46 2.39 0 4.84-.483 6.6-1.18 0 0 .336-.162.19-.554l-1.15-3.16m8.15-10.4c.223-1.5.634-2.75 1.28-3.72.967-1.48 2.44-2.29 4.51-2.29s3.44.814 4.42 2.29c.65.975.934 2.27 1.04 3.72l-11.3-.002zm15.7-3.3c-.397-1.49-1.38-3-2.02-3.69-1.02-1.09-2.01-1.86-3-2.28a11.5 11.5 0 0 0-4.52-.917c-1.97 0-3.76.333-5.21 1.01-1.45.682-2.67 1.61-3.63 2.77-.959 1.16-1.68 2.53-2.14 4.1-.46 1.55-.692 3.25-.692 5.03 0 1.82.241 3.51.715 5.04.479 1.54 1.25 2.89 2.29 4.01 1.04 1.13 2.37 2.01 3.97 2.63 1.59.615 3.52.934 5.73.927 4.56-.015 6.96-1.03 7.94-1.58.175-.098.34-.267.134-.754l-1.03-2.89c-.158-.431-.594-.275-.594-.275-1.13.422-2.73 1.18-6.48 1.17-2.45-.004-4.26-.727-5.4-1.86-1.16-1.16-1.74-2.85-1.83-5.25l15.8.012s.416-.004.459-.41c.017-.168.541-3.24-.471-6.79zm-142 3.3c.223-1.5.635-2.75 1.28-3.72.968-1.48 2.44-2.29 4.51-2.29s3.44.814 4.42 2.29c.649.975.933 2.27 1.04 3.72l-11.3-.002zm15.7-3.3c-.396-1.49-1.38-3-2.02-3.69-1.02-1.09-2.01-1.86-3-2.28a11.5 11.5 0 0 0-4.52-.917c-1.97 0-3.76.333-5.21 1.01-1.45.682-2.67 1.61-3.63 2.77-.957 1.16-1.68 2.53-2.14 4.1-.459 1.55-.69 3.25-.69 5.03 0 1.82.239 3.51.716 5.04.478 1.54 1.25 2.89 2.28 4.01 1.04 1.13 2.37 2.01 3.97 2.63 1.59.615 3.51.934 5.73.927 4.56-.015 6.96-1.03 7.94-1.58.174-.098.34-.267.133-.754l-1.03-2.89c-.159-.431-.595-.275-.595-.275-1.13.422-2.73 1.18-6.48 1.17-2.44-.004-4.26-.727-5.4-1.86-1.16-1.16-1.74-2.85-1.83-5.25l15.8.012s.416-.004.459-.41c.017-.168.541-3.24-.472-6.79zm-49.8 13.6c-.619-.494-.705-.615-.91-.936-.313-.483-.473-1.17-.473-2.05 0-1.38.46-2.38 1.41-3.05-.01.002 1.36-1.18 4.58-1.14a32 32 0 0 1 4.28.365v7.17h.002s-2 .431-4.26.567c-3.21.193-4.63-.924-4.62-.921zm6.28-11.1c-.64-.047-1.47-.07-2.46-.07-1.35 0-2.66.168-3.88.498-1.23.332-2.34.846-3.29 1.53a7.63 7.63 0 0 0-2.29 2.6c-.559 1.04-.844 2.26-.844 3.64 0 1.4.243 2.61.723 3.6a6.54 6.54 0 0 0 2.06 2.47c.877.638 1.96 1.11 3.21 1.39 1.24.283 2.64.426 4.18.426 1.62 0 3.23-.136 4.79-.399a95.1 95.1 0 0 0 3.97-.772c.526-.121 1.11-.28 1.11-.28.39-.099.36-.516.36-.516l-.009-14.4c0-3.16-.844-5.51-2.51-6.96-1.66-1.45-4.09-2.18-7.24-2.18-1.18 0-3.09.16-4.23.389 0 0-3.44.668-4.86 1.78 0 0-.312.192-.142.627l1.12 3c.139.389.518.256.518.256s.119-.047.259-.13c3.03-1.65 6.87-1.6 6.87-1.6 1.7 0 3.02.345 3.9 1.02.861.661 1.3 1.66 1.3 3.76v.667c-1.35-.196-2.6-.309-2.6-.309zm127-8.13a.428.428 0 0 0-.237-.568c-.269-.102-1.61-.385-2.64-.449-1.98-.124-3.08.21-4.07.654-.978.441-2.06 1.15-2.66 1.97l-.002-1.92c0-.264-.187-.477-.453-.477h-4.04c-.262 0-.452.213-.452.477v23.5a.48.48 0 0 0 .479.479h4.14a.479.479 0 0 0 .478-.479v-11.8c0-1.58.174-3.15.521-4.14.342-.979.807-1.76 1.38-2.32a4.79 4.79 0 0 1 1.95-1.17 7.68 7.68 0 0 1 2.12-.298c.825 0 1.73.212 1.73.212.304.034.473-.152.576-.426.271-.721 1.04-2.88 1.19-3.31"
					/>
					<path
						fill="#FFFFFE"
						d="M162.201 67.548a13.258 13.258 0 0 0-1.559-.37 12.217 12.217 0 0 0-2.144-.166c-2.853 0-5.102.806-6.681 2.398-1.568 1.58-2.635 3.987-3.17 7.154l-.193 1.069h-3.581s-.437-.018-.529.459l-.588 3.28c-.041.314.094.51.514.508h3.486l-3.537 19.743c-.277 1.59-.594 2.898-.945 3.889-.346.978-.684 1.711-1.1 2.243-.403.515-.785.894-1.444 1.115-.544.183-1.17.267-1.856.267-.382 0-.89-.064-1.265-.139-.375-.074-.57-.158-.851-.276 0 0-.409-.156-.57.254-.131.335-1.06 2.89-1.17 3.206-.112.312.045.558.243.629.464.166.809.272 1.441.421.878.207 1.618.22 2.311.22 1.452 0 2.775-.204 3.872-.6 1.104-.399 2.065-1.094 2.915-2.035.919-1.015 1.497-2.078 2.05-3.528.547-1.437 1.013-3.221 1.386-5.3l3.554-20.109h5.196s.438.016.529-.459l.588-3.28c.041-.314-.093-.51-.515-.508h-5.043c.025-.114.254-1.888.833-3.558.247-.713.712-1.288 1.106-1.683a3.273 3.273 0 0 1 1.321-.822 5.48 5.48 0 0 1 1.693-.244c.475 0 .941.057 1.296.131.489.104.679.159.807.197.514.157.583.005.684-.244l1.206-3.312c.124-.356-.178-.506-.29-.55m-70.474 34.117c0 .264-.188.479-.452.479h-4.183c-.265 0-.453-.215-.453-.479V67.997c0-.263.188-.476.453-.476h4.183c.264 0 .452.213.452.476v33.668"
					/>
				</g>
			</svg>
		),
		stringIcon: `<svg version="1.1" viewBox="0 0 273 191" xmlns="http://www.w3.org/2000/svg" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xlink="http://www.w3.org/1999/xlink">
			<title>Salesforce.com logo</title>
			<desc>A cloud computing company based in San Francisco, California, United States</desc>
			 <metadata>
				<rdf:RDF>
				 <cc:Work rdf:about="">
					<dc:format>image/svg+xml</dc:format>
					<dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"/>
					<dc:title/>
				 </cc:Work>
				</rdf:RDF>
			 </metadata>
			 <defs>
				<path id="a" d="m0.06 0.5h272v190h-272z"/>
			 </defs>
			 <g fill-rule="evenodd">
				<mask id="b" fill="#fff">
				 <use xlink:href="#a"/>
				</mask>
				<path d="m113 21.3c8.78-9.14 21-14.8 34.5-14.8 18 0 33.6 10 42 24.9a58 58 0 0 1 23.7-5.05c32.4 0 58.7 26.5 58.7 59.2s-26.3 59.2-58.7 59.2c-3.96 0-7.82-0.398-11.6-1.15-7.35 13.1-21.4 22-37.4 22a42.7 42.7 0 0 1-18.8-4.32c-7.45 17.5-24.8 29.8-45 29.8-21.1 0-39-13.3-45.9-32a45.1 45.1 0 0 1-9.34 0.972c-25.1 0-45.4-20.6-45.4-45.9 0-17 9.14-31.8 22.7-39.8a52.6 52.6 0 0 1-4.35-21c0-29.2 23.7-52.8 52.9-52.8 17.1 0 32.4 8.15 42 20.8" fill="#00A1E0" mask="url(#b)"/>
				<path d="m39.4 99.3c-0.171 0.446 0.061 0.539 0.116 0.618 0.511 0.37 1.03 0.638 1.55 0.939 2.78 1.47 5.4 1.9 8.14 1.9 5.58 0 9.05-2.97 9.05-7.75v-0.094c0-4.42-3.92-6.03-7.58-7.18l-0.479-0.155c-2.77-0.898-5.16-1.68-5.16-3.5v-0.093c0-1.56 1.4-2.71 3.56-2.71 2.4 0 5.26 0.799 7.09 1.81 0 0 0.542 0.35 0.739-0.173 0.107-0.283 1.04-2.78 1.14-3.06 0.106-0.293-0.08-0.514-0.271-0.628-2.1-1.28-5-2.15-8-2.15l-0.557 2e-3c-5.11 0-8.68 3.09-8.68 7.51v0.095c0 4.66 3.94 6.18 7.62 7.23l0.592 0.184c2.68 0.824 5 1.54 5 3.42v0.094c0 1.73-1.51 3.02-3.93 3.02-0.941 0-3.94-0.016-7.19-2.07-0.393-0.229-0.617-0.394-0.92-0.579-0.16-0.097-0.56-0.272-0.734 0.252l-1.1 3.06m81.7 0c-0.171 0.446 0.061 0.539 0.118 0.618 0.509 0.37 1.03 0.638 1.55 0.939 2.78 1.47 5.4 1.9 8.14 1.9 5.58 0 9.05-2.97 9.05-7.75v-0.094c0-4.42-3.91-6.03-7.58-7.18l-0.479-0.155c-2.77-0.898-5.16-1.68-5.16-3.5v-0.093c0-1.56 1.4-2.71 3.56-2.71 2.4 0 5.25 0.799 7.09 1.81 0 0 0.542 0.35 0.74-0.173 0.106-0.283 1.04-2.78 1.13-3.06 0.107-0.293-0.08-0.514-0.27-0.628-2.1-1.28-5-2.15-8-2.15l-0.558 2e-3c-5.11 0-8.68 3.09-8.68 7.51v0.095c0 4.66 3.94 6.18 7.62 7.23l0.591 0.184c2.69 0.824 5 1.54 5 3.42v0.094c0 1.73-1.51 3.02-3.93 3.02-0.943 0-3.95-0.016-7.19-2.07-0.393-0.229-0.623-0.387-0.921-0.579-0.101-0.064-0.572-0.248-0.733 0.252l-1.1 3.06m55.8-9.36c0 2.7-0.504 4.83-1.49 6.34-0.984 1.49-2.47 2.22-4.54 2.22s-3.55-0.724-4.52-2.21c-0.977-1.5-1.47-3.64-1.47-6.34 0-2.7 0.496-4.82 1.47-6.31 0.968-1.48 2.44-2.19 4.52-2.19s3.56 0.717 4.54 2.19c0.992 1.49 1.49 3.61 1.49 6.31m4.66-5.01c-0.459-1.55-1.17-2.91-2.12-4.05-0.951-1.14-2.15-2.06-3.58-2.72-1.42-0.665-3.1-1-5-1s-3.57 0.337-5 1c-1.42 0.664-2.63 1.58-3.58 2.72-0.948 1.14-1.66 2.5-2.12 4.05-0.455 1.54-0.686 3.22-0.686 5.01 0 1.79 0.231 3.47 0.686 5.01 0.457 1.55 1.17 2.91 2.12 4.05 0.951 1.14 2.16 2.05 3.58 2.7 1.43 0.648 3.11 0.978 5 0.978 1.89 0 3.57-0.33 4.99-0.978 1.42-0.648 2.63-1.56 3.58-2.7 0.949-1.14 1.66-2.5 2.12-4.05 0.454-1.54 0.685-3.22 0.685-5.01 0-1.78-0.231-3.47-0.685-5.01m38.3 12.8c-0.153-0.453-0.595-0.282-0.595-0.282-0.677 0.259-1.4 0.499-2.17 0.619-0.776 0.122-1.64 0.183-2.55 0.183-2.25 0-4.05-0.671-5.33-2-1.29-1.33-2.01-3.47-2-6.37 7e-3 -2.64 0.645-4.62 1.79-6.14 1.13-1.5 2.87-2.28 5.17-2.28 1.92 0 3.39 0.223 4.93 0.705 0 0 0.365 0.159 0.54-0.322 0.409-1.13 0.711-1.94 1.15-3.18 0.124-0.355-0.18-0.505-0.291-0.548-0.604-0.236-2.03-0.623-3.11-0.786-1.01-0.154-2.18-0.234-3.5-0.234-1.96 0-3.7 0.335-5.19 0.999-1.49 0.663-2.75 1.58-3.75 2.72-1 1.14-1.76 2.5-2.27 4.05-0.505 1.54-0.76 3.23-0.76 5.02 0 3.86 1.04 6.99 3.1 9.28 2.06 2.3 5.16 3.46 9.2 3.46 2.39 0 4.84-0.483 6.6-1.18 0 0 0.336-0.162 0.19-0.554l-1.15-3.16m8.15-10.4c0.223-1.5 0.634-2.75 1.28-3.72 0.967-1.48 2.44-2.29 4.51-2.29 2.07 0 3.44 0.814 4.42 2.29 0.65 0.975 0.934 2.27 1.04 3.72l-11.3-2e-3zm15.7-3.3c-0.397-1.49-1.38-3-2.02-3.69-1.02-1.09-2.01-1.86-3-2.28a11.5 11.5 0 0 0-4.52-0.917c-1.97 0-3.76 0.333-5.21 1.01-1.45 0.682-2.67 1.61-3.63 2.77-0.959 1.16-1.68 2.53-2.14 4.1-0.46 1.55-0.692 3.25-0.692 5.03 0 1.82 0.241 3.51 0.715 5.04 0.479 1.54 1.25 2.89 2.29 4.01 1.04 1.13 2.37 2.01 3.97 2.63 1.59 0.615 3.52 0.934 5.73 0.927 4.56-0.015 6.96-1.03 7.94-1.58 0.175-0.098 0.34-0.267 0.134-0.754l-1.03-2.89c-0.158-0.431-0.594-0.275-0.594-0.275-1.13 0.422-2.73 1.18-6.48 1.17-2.45-4e-3 -4.26-0.727-5.4-1.86-1.16-1.16-1.74-2.85-1.83-5.25l15.8 0.012s0.416-4e-3 0.459-0.41c0.017-0.168 0.541-3.24-0.471-6.79zm-142 3.3c0.223-1.5 0.635-2.75 1.28-3.72 0.968-1.48 2.44-2.29 4.51-2.29 2.07 0 3.44 0.814 4.42 2.29 0.649 0.975 0.933 2.27 1.04 3.72l-11.3-2e-3zm15.7-3.3c-0.396-1.49-1.38-3-2.02-3.69-1.02-1.09-2.01-1.86-3-2.28a11.5 11.5 0 0 0-4.52-0.917c-1.97 0-3.76 0.333-5.21 1.01-1.45 0.682-2.67 1.61-3.63 2.77-0.957 1.16-1.68 2.53-2.14 4.1-0.459 1.55-0.69 3.25-0.69 5.03 0 1.82 0.239 3.51 0.716 5.04 0.478 1.54 1.25 2.89 2.28 4.01 1.04 1.13 2.37 2.01 3.97 2.63 1.59 0.615 3.51 0.934 5.73 0.927 4.56-0.015 6.96-1.03 7.94-1.58 0.174-0.098 0.34-0.267 0.133-0.754l-1.03-2.89c-0.159-0.431-0.595-0.275-0.595-0.275-1.13 0.422-2.73 1.18-6.48 1.17-2.44-4e-3 -4.26-0.727-5.4-1.86-1.16-1.16-1.74-2.85-1.83-5.25l15.8 0.012s0.416-4e-3 0.459-0.41c0.017-0.168 0.541-3.24-0.472-6.79zm-49.8 13.6c-0.619-0.494-0.705-0.615-0.91-0.936-0.313-0.483-0.473-1.17-0.473-2.05 0-1.38 0.46-2.38 1.41-3.05-0.01 2e-3 1.36-1.18 4.58-1.14a32 32 0 0 1 4.28 0.365v7.17h2e-3s-2 0.431-4.26 0.567c-3.21 0.193-4.63-0.924-4.62-0.921zm6.28-11.1c-0.64-0.047-1.47-0.07-2.46-0.07-1.35 0-2.66 0.168-3.88 0.498-1.23 0.332-2.34 0.846-3.29 1.53a7.63 7.63 0 0 0-2.29 2.6c-0.559 1.04-0.844 2.26-0.844 3.64 0 1.4 0.243 2.61 0.723 3.6a6.54 6.54 0 0 0 2.06 2.47c0.877 0.638 1.96 1.11 3.21 1.39 1.24 0.283 2.64 0.426 4.18 0.426 1.62 0 3.23-0.136 4.79-0.399a95.1 95.1 0 0 0 3.97-0.772c0.526-0.121 1.11-0.28 1.11-0.28 0.39-0.099 0.36-0.516 0.36-0.516l-9e-3 -14.4c0-3.16-0.844-5.51-2.51-6.96-1.66-1.45-4.09-2.18-7.24-2.18-1.18 0-3.09 0.16-4.23 0.389 0 0-3.44 0.668-4.86 1.78 0 0-0.312 0.192-0.142 0.627l1.12 3c0.139 0.389 0.518 0.256 0.518 0.256s0.119-0.047 0.259-0.13c3.03-1.65 6.87-1.6 6.87-1.6 1.7 0 3.02 0.345 3.9 1.02 0.861 0.661 1.3 1.66 1.3 3.76v0.667c-1.35-0.196-2.6-0.309-2.6-0.309zm127-8.13a0.428 0.428 0 0 0-0.237-0.568c-0.269-0.102-1.61-0.385-2.64-0.449-1.98-0.124-3.08 0.21-4.07 0.654-0.978 0.441-2.06 1.15-2.66 1.97l-2e-3 -1.92c0-0.264-0.187-0.477-0.453-0.477h-4.04c-0.262 0-0.452 0.213-0.452 0.477v23.5a0.48 0.48 0 0 0 0.479 0.479h4.14a0.479 0.479 0 0 0 0.478-0.479v-11.8c0-1.58 0.174-3.15 0.521-4.14 0.342-0.979 0.807-1.76 1.38-2.32a4.79 4.79 0 0 1 1.95-1.17 7.68 7.68 0 0 1 2.12-0.298c0.825 0 1.73 0.212 1.73 0.212 0.304 0.034 0.473-0.152 0.576-0.426 0.271-0.721 1.04-2.88 1.19-3.31" fill="#FFFFFE"/>
				<path d="M162.201 67.548a13.258 13.258 0 0 0-1.559-.37 12.217 12.217 0 0 0-2.144-.166c-2.853 0-5.102.806-6.681 2.398-1.568 1.58-2.635 3.987-3.17 7.154l-.193 1.069h-3.581s-.437-.018-.529.459l-.588 3.28c-.041.314.094.51.514.508h3.486l-3.537 19.743c-.277 1.59-.594 2.898-.945 3.889-.346.978-.684 1.711-1.1 2.243-.403.515-.785.894-1.444 1.115-.544.183-1.17.267-1.856.267-.382 0-.89-.064-1.265-.139-.375-.074-.57-.158-.851-.276 0 0-.409-.156-.57.254-.131.335-1.06 2.89-1.17 3.206-.112.312.045.558.243.629.464.166.809.272 1.441.421.878.207 1.618.22 2.311.22 1.452 0 2.775-.204 3.872-.6 1.104-.399 2.065-1.094 2.915-2.035.919-1.015 1.497-2.078 2.05-3.528.547-1.437 1.013-3.221 1.386-5.3l3.554-20.109h5.196s.438.016.529-.459l.588-3.28c.041-.314-.093-.51-.515-.508h-5.043c.025-.114.254-1.888.833-3.558.247-.713.712-1.288 1.106-1.683a3.273 3.273 0 0 1 1.321-.822 5.48 5.48 0 0 1 1.693-.244c.475 0 .941.057 1.296.131.489.104.679.159.807.197.514.157.583.005.684-.244l1.206-3.312c.124-.356-.178-.506-.29-.55m-70.474 34.117c0 .264-.188.479-.452.479h-4.183c-.265 0-.453-.215-.453-.479V67.997c0-.263.188-.476.453-.476h4.183c.264 0 .452.213.452.476v33.668" fill="#FFFFFE"/>
			 </g>
			</svg>`,
	},
	twitch: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					fill="currentColor"
					d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43h11.43Z"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.2em"
				height="1.2em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M11.64 5.93h1.43v4.28h-1.43m3.93-4.28H17v4.28h-1.43M7 2L3.43 5.57v12.86h4.28V22l3.58-3.57h2.85L20.57 12V2m-1.43 9.29l-2.85 2.85h-2.86l-2.5 2.5v-2.5H7.71V3.43h11.43Z"
				></path>
			</svg>`,
	},
	spotify: {
		Icon: (props: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1em"
				height="1em"
				viewBox="0 0 24 24"
				{...props}
			>
				<path
					fill="currentColor"
					d="M12.001 2c-5.5 0-10 4.5-10 10s4.5 10 10 10s10-4.5 10-10s-4.45-10-10-10m3.75 14.65c-2.35-1.45-5.3-1.75-8.8-.95c-.35.1-.65-.15-.75-.45c-.1-.35.15-.65.45-.75c3.8-.85 7.1-.5 9.7 1.1c.35.15.4.55.25.85c-.2.3-.55.4-.85.2m1-2.7c-2.7-1.65-6.8-2.15-9.95-1.15c-.4.1-.85-.1-.95-.5s.1-.85.5-.95c3.65-1.1 8.15-.55 11.25 1.35c.3.15.45.65.2 1s-.7.5-1.05.25M6.3 9.75c-.5.15-1-.15-1.15-.6c-.15-.5.15-1 .6-1.15c3.55-1.05 9.4-.85 13.1 1.35c.45.25.6.85.35 1.3c-.25.35-.85.5-1.3.25C14.7 9 9.35 8.8 6.3 9.75"
				></path>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.2em"
				height="1.2em"
				viewBox="0 0 24 24"
			>
				<path
					fill="currentColor"
					d="M12.001 2c-5.5 0-10 4.5-10 10s4.5 10 10 10s10-4.5 10-10s-4.45-10-10-10m3.75 14.65c-2.35-1.45-5.3-1.75-8.8-.95c-.35.1-.65-.15-.75-.45c-.1-.35.15-.65.45-.75c3.8-.85 7.1-.5 9.7 1.1c.35.15.4.55.25.85c-.2.3-.55.4-.85.2m1-2.7c-2.7-1.65-6.8-2.15-9.95-1.15c-.4.1-.85-.1-.95-.5s.1-.85.5-.95c3.65-1.1 8.15-.55 11.25 1.35c.3.15.45.65.2 1s-.7.5-1.05.25M6.3 9.75c-.5.15-1-.15-1.15-.6c-.15-.5.15-1 .6-1.15c3.55-1.05 9.4-.85 13.1 1.35c.45.25.6.85.35 1.3c-.25.35-.85.5-1.3.25C14.7 9 9.35 8.8 6.3 9.75"
				></path>
			</svg>`,
	},
	tiktok: {
		Icon: (props?: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="0.88em"
				height="1em"
				viewBox="0 0 448 512"
				{...props}
			>
				<path
					fill="currentColor"
					d="M412.19,118.66a109.27,109.27,0,0,1-9.45-5.5,132.87,132.87,0,0,1-24.27-20.62c-18.1-20.71-24.86-41.72-27.35-56.43h.1C349.14,23.9,350,16,350.13,16H267.69V334.78c0,4.28,0,8.51-.18,12.69,0,.52-.05,1-.08,1.56,0,.23,0,.47-.05.71,0,.06,0,.12,0,.18a70,70,0,0,1-35.22,55.56,68.8,68.8,0,0,1-34.11,9c-38.41,0-69.54-31.32-69.54-70s31.13-70,69.54-70a68.9,68.9,0,0,1,21.41,3.39l.1-83.94a153.14,153.14,0,0,0-118,34.52,161.79,161.79,0,0,0-35.3,43.53c-3.48,6-16.61,30.11-18.2,69.24-1,22.21,5.67,45.22,8.85,54.73v.2c2,5.6,9.75,24.71,22.38,40.82A167.53,167.53,0,0,0,115,470.66v-.2l.2.2C155.11,497.78,199.36,496,199.36,496c7.66-.31,33.32,0,62.46-13.81,32.32-15.31,50.72-38.12,50.72-38.12a158.46,158.46,0,0,0,27.64-45.93c7.46-19.61,9.95-43.13,9.95-52.53V176.49c1,.6,14.32,9.41,14.32,9.41s19.19,12.3,49.13,20.31c21.48,5.7,50.42,6.9,50.42,6.9V131.27C453.86,132.37,433.27,129.17,412.19,118.66Z"
				/>
			</svg>
		),
		stringIcon: `<svg
				xmlns="http://www.w3.org/2000/svg"
				width="0.88em"
				height="1em"
				viewBox="0 0 448 512"
				{...props}
			>
				<path
					fill="currentColor"
					d="M412.19,118.66a109.27,109.27,0,0,1-9.45-5.5,132.87,132.87,0,0,1-24.27-20.62c-18.1-20.71-24.86-41.72-27.35-56.43h.1C349.14,23.9,350,16,350.13,16H267.69V334.78c0,4.28,0,8.51-.18,12.69,0,.52-.05,1-.08,1.56,0,.23,0,.47-.05.71,0,.06,0,.12,0,.18a70,70,0,0,1-35.22,55.56,68.8,68.8,0,0,1-34.11,9c-38.41,0-69.54-31.32-69.54-70s31.13-70,69.54-70a68.9,68.9,0,0,1,21.41,3.39l.1-83.94a153.14,153.14,0,0,0-118,34.52,161.79,161.79,0,0,0-35.3,43.53c-3.48,6-16.61,30.11-18.2,69.24-1,22.21,5.67,45.22,8.85,54.73v.2c2,5.6,9.75,24.71,22.38,40.82A167.53,167.53,0,0,0,115,470.66v-.2l.2.2C155.11,497.78,199.36,496,199.36,496c7.66-.31,33.32,0,62.46-13.81,32.32-15.31,50.72-38.12,50.72-38.12a158.46,158.46,0,0,0,27.64-45.93c7.46-19.61,9.95-43.13,9.95-52.53V176.49c1,.6,14.32,9.41,14.32,9.41s19.19,12.3,49.13,20.31c21.48,5.7,50.42,6.9,50.42,6.9V131.27C453.86,132.37,433.27,129.17,412.19,118.66Z"
				/>
			</svg>`,
	},
	twitter: {
		Icon: (props?: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="0.88em"
				height="1em"
				viewBox="0 0 448 512"
				{...props}
			>
				<path
					fill="currentColor"
					d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm297.1 84L257.3 234.6L379.4 396h-95.6L209 298.1L123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5l78.2-89.5zm-37.8 251.6L153.4 142.9h-28.3l171.8 224.7h26.3z"
				></path>
			</svg>
		),
		stringIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 448 512"><path fill="currentColor" d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm297.1 84L257.3 234.6L379.4 396h-95.6L209 298.1L123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5l78.2-89.5zm-37.8 251.6L153.4 142.9h-28.3l171.8 224.7h26.3z"></path></svg>`,
	},
	roblox: {
		Icon: (props?: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.2em"
				height="1.2em"
				viewBox="0 0 267 267"
				{...props}
			>
				<path
					fill="currentColor"
					d="M 56.926 0.986 L 1.01 210.05 L 210.073 266.014 L 265.989 56.951 L 56.926 0.986 Z M 112.15 96.988 L 170.481 112.619 L 154.849 170.95 L 96.47 155.318 L 112.15 96.988 Z"
				></path>
			</svg>
		),
		stringIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 267 267"><path xmlns="http://www.w3.org/2000/svg" fill="currentColor" d="M 56.926 0.986 L 1.01 210.05 L 210.073 266.014 L 265.989 56.951 L 56.926 0.986 Z M 112.15 96.988 L 170.481 112.619 L 154.849 170.95 L 96.47 155.318 L 112.15 96.988 Z"/></svg>`,
	},
	vk: {
		Icon: (props?: SVGProps<any>) => (
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.2em"
				height="1.2em"
				viewBox="0 0 20 20"
				{...props}
			>
				<path
					fill="currentColor"
					fillRule="evenodd"
					d="M17.802 12.298s1.617 1.597 2.017 2.336a.1.1 0 0 1 .018.035q.244.409.123.645c-.135.261-.592.392-.747.403h-2.858c-.199 0-.613-.052-1.117-.4c-.385-.269-.768-.712-1.139-1.145c-.554-.643-1.033-1.201-1.518-1.201a.6.6 0 0 0-.18.03c-.367.116-.833.639-.833 2.032c0 .436-.344.684-.585.684H9.674c-.446 0-2.768-.156-4.827-2.327C2.324 10.732.058 5.4.036 5.353c-.141-.345.155-.533.475-.533h2.886c.387 0 .513.234.601.444c.102.241.48 1.205 1.1 2.288c1.004 1.762 1.621 2.479 2.114 2.479a.53.53 0 0 0 .264-.07c.644-.354.524-2.654.494-3.128c0-.092-.001-1.027-.331-1.479c-.236-.324-.638-.45-.881-.496c.065-.094.203-.238.38-.323c.441-.22 1.238-.252 2.029-.252h.439c.858.012 1.08.067 1.392.146c.628.15.64.557.585 1.943c-.016.396-.033.842-.033 1.367c0 .112-.005.237-.005.364c-.019.711-.044 1.512.458 1.841a.4.4 0 0 0 .217.062c.174 0 .695 0 2.108-2.425c.62-1.071 1.1-2.334 1.133-2.429c.028-.053.112-.202.214-.262a.5.5 0 0 1 .236-.056h3.395c.37 0 .621.056.67.196c.082.227-.016.92-1.566 3.016c-.261.349-.49.651-.691.915c-1.405 1.844-1.405 1.937.083 3.337"
					clipRule="evenodd"
				/>
			</svg>
		),
		stringIcon: `<svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 448 512"><path fill="currentColor" d="M64 32C28.7 32 0 60.7 0 96v320c0 35.3 28.7 64 64 64h320c35.3 0 64-28.7 64-64V96c0-35.3-28.7-64-64-64zm297.1 84L257.3 234.6L379.4 396h-95.6L209 298.1L123.3 396H75.8l111-126.9L69.7 116h98l67.7 89.5l78.2-89.5zm-37.8 251.6L153.4 142.9h-28.3l171.8 224.7h26.3z"></path></svg>`,
	},
};
