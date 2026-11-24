# LEARN web

Next.js app in the LEARN monorepo. API types and schemas come from the workspace package `@learn/contracts` (`packages/contracts`, transpiled by Next).

Setup: `npm ci` at the repository root, then in this directory: npm run lint, npm run typecheck, npm test, npm run test:tooling, npm run build. Docker image: `docker build -f infra/Dockerfile.web .` from the root.

Copy .env.example to .env.local. API paths include /api/v1; the configured base is the origin only.

Local development with the backend sandbox (repository root: `npm run sandbox:up`, then API on port 4400 and the worker for AI jobs): run the web on port 3000, because the API only allows CORS from `http://127.0.0.1:3000` and `http://localhost:3000`:

    NEXT_PUBLIC_API_URL=http://127.0.0.1:4400 APP_URL=http://127.0.0.1:3000 npx next dev -p 3000 -H 127.0.0.1

`npm run check:long-text` defaults to port 3100; set `LEARN_APP_URL=http://127.0.0.1:3000` when the app runs as above.

A single `401` on `POST /api/v1/auth/refresh` in the console when no one is signed in is expected: the app probes for a session before showing the login page.

Deploy: the image is built with an empty NEXT_PUBLIC_API_URL by default, so the browser calls relative /api paths. Serve it behind the one-origin reverse proxy in `infra/onebox`, where /api/* goes to the API on the same hostname. Set an absolute origin only for a separate-origin deployment.
