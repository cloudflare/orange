/** @type {import('eslint').Linter.Config} */
module.exports = {
	extends: ['@remix-run/eslint-config', '@remix-run/eslint-config/node'],
	rules: {
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
	},
}
