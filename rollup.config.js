import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { terser } from "@rollup/plugin-terser";

export default {
  input: "src/investment-tracker-card.js",
  output: {
    file: "dist/investment-tracker-card.js",
    format: "iife",
    name: "InvestmentTrackerCard",
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    terser({ format: { comments: false } }),
  ],
};
