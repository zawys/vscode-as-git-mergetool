module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 6,
    sourceType: "module",
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
  plugins: [
    "@typescript-eslint",
    "eslint-comments",
    "promise",
    "unicorn",
    "prettier",
    "header",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:eslint-comments/recommended",
    "plugin:promise/recommended",
    "plugin:unicorn/recommended",
    "plugin:prettier/recommended",
    "prettier",
  ],
  rules: {
    "@typescript-eslint/naming-convention": "error",
    "@typescript-eslint/semi": ["error", "always"],
    "unicorn/filename-case": "off",
    "unicorn/no-useless-undefined": "off",
    "unicorn/no-nested-ternary": "off",
    "unicorn/no-null": "off",
    "prettier/prettier": "warn",
    "header/header": [
      2,
      "line",
      [
        {
          pattern:
            " Copyright \\(C\\) 2\\d{3}  zawys\\. Licensed under AGPL-3\\.0-or-later\\.",
          template:
            " Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.",
        },
        " See LICENSE file in repository root directory.",
      ],
      2,
    ],
    "unicorn/expiring-todo-comments": [
      "error",
      { terms: ["todo", "fixme", "xxx", "debug"] },
    ],
  },
};
