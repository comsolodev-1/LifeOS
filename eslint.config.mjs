import next from "eslint-config-next/core-web-vitals";

const config = [
  ...next,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/privacy/gateway.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@google/genai", message: "Only src/lib/privacy/gateway.ts may import the Gemini SDK. Use askGemini()." }],
          patterns: [{ group: ["@google/genai/*"], message: "Only src/lib/privacy/gateway.ts may import the Gemini SDK." }],
        },
      ],
    },
  },
  { ignores: [".next/**", "node_modules/**", "drizzle/**"] },
];

export default config;
