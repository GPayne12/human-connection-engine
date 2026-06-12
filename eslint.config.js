import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Law 1: network calls are only allowed inside src/api/
const networkCallSelectors = ['fetch', 'axios', 'XMLHttpRequest'].map((name) => ({
  selector: `CallExpression[callee.name="${name}"]`,
  message: `Law 1: '${name}' must only be called from src/api/. Move this call there and invoke it via an explicit user action.`,
}))

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Enforce Law 1 outside src/api/
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/api/**'],
    rules: {
      'no-restricted-syntax': ['error', ...networkCallSelectors],
    },
  },
])
