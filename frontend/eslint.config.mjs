import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // La sesión vive en localStorage y se hidrata después del montaje.
      // Mantener esta excepción hasta migrar la autenticación a cookies/SSR.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Distribución de terceros: no es código fuente de la aplicación.
    "public/tesseract/**",
  ]),
]);

export default eslintConfig;
