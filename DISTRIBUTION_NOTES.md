# Node Module Distribution Considerations

## 1. Quality Assurance (Completed)

- **Linting & Formatting**: Integrated `eslint` and `prettier`. Run `npm run lint` and `npm run format`.
- **CI/CD**: GitHub Actions set up in `.github/workflows/ci.yml`.

## 2. Publishing (Completed)

- **NPM**: Account created and verified on npmjs.com.
- **Semantic Versioning**: Following SemVer (major.minor.patch).
- **Publishing Pipeline**: GitHub Action `publish.yml` is configured to automate publishing to npm.

## 3. Bundling (Completed)

- **Tooling**: Integrated `tsup` to handle bundling.
- **Outputs**:
  - **ESM**: `dist/index.js` (for modern bundlers).
  - **CJS**: `dist/index.cjs` (for legacy Node.js).
  - **IIFE**: `dist/index.global.js` (for direct browser usage).
- **CDN Usage**: The IIFE bundle exposes the library as the global `irdata` variable. It works with unpkg/jsDelivr.
- **Type Definitions**: Bundled into `dist/index.d.ts`.

## 4. Documentation

- **TypeDoc**: Use `typedoc` to generate searchable API documentation from TypeScript source code. This can be hosted via GitHub Pages.
- **CONTRIBUTING.md**: Create a guide for contributors, detailing local setup, testing procedures, and coding standards.
- **Examples**: Add an `examples/` directory with standalone scripts demonstrating key library features (e.g., auth flow, chunked data fetching).

## 5. Security

- **Dependabot**: Create `.github/dependabot.yml` to automate dependency updates and security patches.
- **Vulnerability Scanning**: Integrate `npm audit` into the CI pipeline to block PRs with insecure dependencies.
- **Native APIs**: Prefer native `fetch` and `crypto` to minimize external dependencies and reduce the attack surface.

## 6. Compatibility

- **Target**: `ES2022`.
- **Node.js**: Requires **v18.0.0+** due to native `fetch` and global `crypto` requirements.
- **Browsers**: Compatible with modern browsers (Chrome 100+, Firefox 100+, Safari 15.4+).
- **Lowering Target**: If support for older environments (like Node 16) is needed, polyfills or target adjustments (e.g., `undici`) would be required.
