import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: ["node_modules/**", "public/**", "test-results/**", ".wrangler/**", ".wrangler-state/**", ".dev-vars*", "*.config.js"]
  },
  js.configs.recommended,
  {
    files: ["react-app/**/*.{js,jsx}", "src/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  },
  {
    // The worker and the test scripts lean on intentional empty catches and
    // try/catch reassignments for graceful degradation — deliberate patterns.
    files: ["src/**/*.js", "scripts/**/*.mjs"],
    rules: {
      "no-empty": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "warn",
      "no-control-regex": "off"
    }
  }
];
