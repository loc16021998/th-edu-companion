import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  // Thư mục / file do máy sinh ra — không lint (next lint cũ tự bỏ qua; ESLint CLI thì không)
  {
    ignores: [".next/**", ".next-dev/**", "out/**", "coverage/**", "tests/e2e/.report/**", "tests/e2e/.results/**", "next-env.d.ts", "public/sw.js", "backups/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
