import { defineConfig } from 'tsup';
import pkg from './package.json';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm', 'iife'],
  dts: true,
  clean: true,
  sourcemap: true,
  globalName: 'irdata',
  target: 'es2022',
  minify: false, // Keep it readable for now
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
});
