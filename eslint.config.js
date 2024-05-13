// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Global ignores
    ignores: ["packages/*/dist"],
  },
  {
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      prettierConfig,
    ],
    files: [
      "packages/*/src/*.ts",
      "packages/*/src/**/*.ts",
    ],
    languageOptions: {
      sourceType: "module",
      parserOptions: {
        project: ["./tsconfig.json", "./packages/*/tsconfig.json"],
      }
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
        }
      ],
      "no-empty": [
        "error",
        {
          "allowEmptyCatch": true
        }
      ],
      "no-console": "error"
    }
  },
)
