# Node Module Distribution Considerations

## 1. Quality Assurance (Completed)

- **Linting & Formatting**: Integrated `eslint` and `prettier`. Run `npm run lint` and `npm run format`.
- **CI/CD**: GitHub Actions set up in `.github/workflows/ci.yml`.

## 2. Publishing (Completed)

- **NPM**: Account created and verified on npmjs.com.
- **Semantic Versioning**: Following SemVer (major.minor.patch).
- **Publishing Pipeline**: GitHub Action `publish.yml` is configured to automate publishing to npm.

## 3. Bundling (Optional)

- **Current State**: `tsc` outputs ESM modules suitable for modern environments.
- **tsup**: Consider using `tsup` for dual-format support (ESM and CJS) and minified browser bundles (IIFE). It also supports declaration bundling into a single file.
- **Browser Usage**: For direct `<script>` tag support via CDNs (unpkg/jsDelivr), an IIFE or UMD bundle is recommended.

## 4. Documentation (Completed)

- **TypeDoc**: configured to generate API documentation. Run `npm run docs`.
- **CONTRIBUTING.md**: Created guide for contributors.
- **Examples**: Demo application serves as the primary example.

## 5. Security

- **Dependabot**: Create `.github/dependabot.yml` to automate dependency updates and security patches.
- **Vulnerability Scanning**: Integrate `npm audit` into the CI pipeline to block PRs with insecure dependencies.
- **Native APIs**: Prefer native `fetch` and `crypto` to minimize external dependencies and reduce the attack surface.

## 6. Compatibility

- **Target**: `ES2022`.
- **Node.js**: Requires **v18.0.0+** due to native `fetch` and global `crypto` requirements.
- **Browsers**: Compatible with modern browsers (Chrome 100+, Firefox 100+, Safari 15.4+).
- **Lowering Target**: If support for older environments (like Node 16) is needed, polyfills or target adjustments (e.g., `undici`) would be required.
