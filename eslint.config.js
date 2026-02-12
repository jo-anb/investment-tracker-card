import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";

const compat = new FlatCompat({
  baseDirectory: fileURLToPath(new URL(".", import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

const legacyConfig = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: ".*" }],
  },
};

export default [
  ...compat.config(legacyConfig),
  {
    ignores: ["dist/**"],
  },
];
