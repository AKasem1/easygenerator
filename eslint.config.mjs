import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'apps/web/src/vite-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // The project bans `any` outright rather than merely discouraging it.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // --- apps/api : Node + Nest decorators ---
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Nest resolves providers from decorator metadata, so empty ctor params
      // and decorator-only classes are idiomatic here.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // --- shared : isomorphic, no environment globals ---
  {
    files: ['shared/**/*.ts'],
    languageOptions: {
      globals: {},
    },
  },

  // --- apps/web : browser + React ---
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // --- config files & test setup run in Node ---
  {
    files: ['**/*.config.{ts,mts,mjs,js}', '**/scripts/**/*.mjs', 'apps/web/src/test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  prettier,
);
