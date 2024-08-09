/** @type {import('eslint').Linter.Config} */
module.exports = {
	reportUnusedDisableDirectives: true,
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2020,
		EXPERIMENTAL_useProjectService: true,
		sourceType: 'module',
	},
	plugins: ['@typescript-eslint'],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:@typescript-eslint/recommended-requiring-type-checking',
		'plugin:react/jsx-runtime',
		'plugin:react-hooks/recommended',
		'plugin:jsx-a11y/recommended',
		'plugin:deprecation/recommended',
	],
	ignorePatterns: ['/public/noise/*'],
	rules: {
		'no-mixed-spaces-and-tabs': ['error', 'smart-tabs'],
		'@typescript-eslint/no-extra-semi': ['off'],
		'@typescript-eslint/no-unused-vars': [
			'warn',
			{
				// vars: "all",
				varsIgnorePattern: '^_',
				// args: "after-used",
				argsIgnorePattern: '^_',
			},
		],
		'@typescript-eslint/no-misused-promises': [
			'error',
			{
				checksConditionals: true,
				checksVoidReturn: false,
				checksSpreads: true,
			},
		],
	},
	root: true,
}
