import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "supabase/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The whole point of the service-role split: catch a bad import early.
    // Client components and shared UI must never reach for it. The two
    // server-only modules that legitimately use it are exempted below.
    files: ["src/components/**/*.{ts,tsx}", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/supabase/admin", "@/lib/supabase/admin"],
              message:
                "supabaseAdmin bypasses Row Level Security. Use it only in the server-only modules src/lib/ratelimit.ts and src/lib/audit.ts.",
            },
          ],
        },
      ],
    },
  },
];
