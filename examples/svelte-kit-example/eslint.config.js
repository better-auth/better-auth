import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

// Fix for globals.browser AudioWorkletGlobalScope trailing space bug
// See: https://github.com/sindresorhus/globals/issues/239
const GLOBALS_BROWSER_FIX = Object.assign({}, globals.browser, {
	AudioWorkletGlobalScope: globals.browser['AudioWorkletGlobalScope '],
});
delete GLOBALS_BROWSER_FIX['AudioWorkletGlobalScope '];

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...GLOBALS_BROWSER_FIX,
				...globals.node,
			},
		},
		rules: {
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		ignores: ['eslint.config.js', 'svelte.config.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig,
			},
		},
	},
);
