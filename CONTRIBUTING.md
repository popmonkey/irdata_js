# Contributing to irdata_js

Thank you for your interest in contributing! We welcome bug reports, feature requests, and pull requests.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/popmonkey/irdata_js.git
    cd irdata_js
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Development Workflow

### Local Proxy Server
To test OAuth flows and API interaction without CORS issues, use the included proxy server.

1.  Create `demo/config.json` (see README for details).
2.  Run the dev server:
    ```bash
    npm run dev
    ```
    This starts the proxy and serves the demo app at `http://localhost:80/irdata_js/` (or your configured port/path).

### Code Style
We use ESLint and Prettier to maintain code quality.

-   **Lint:** `npm run lint`
-   **Fix Lint:** `npm run lint:fix`
-   **Format:** `npm run format`

### Testing
We use Vitest for unit testing.

-   **Run tests:** `npm test`

Please add tests for any new features or bug fixes.

## Documentation
We use TypeDoc for API documentation.

-   **Generate docs:** `npm run docs`

## Submitting Changes

1.  Create a new branch for your feature or fix.
2.  Ensure tests pass (`npm test`) and code is linted (`npm run lint`).
3.  Submit a Pull Request with a clear description of your changes.
