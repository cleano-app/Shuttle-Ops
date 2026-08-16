// Some Windows dev networks (this sandbox included) transparently intercept
// outbound TLS with a proxy CA that's trusted by Windows but not by Node's
// bundled cert store, causing fetch failures (AuthRetryableFetchError from
// supabase-js, UNABLE_TO_GET_ISSUER_CERT_LOCALLY elsewhere) on every
// outbound HTTPS call made from inside the Next.js dev server process. If a
// local CA bundle has been exported (see .windows-ca-bundle.pem, copied
// from Cleano Ops which hit the same issue), trust it. No-op on machines/
// CI/Vercel where the file doesn't exist.
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");

// Next's CLI operates on process.cwd() to find next.config.ts/app/, not on
// this script's own location. The launch config that invokes this script
// spawns it with the session's default cwd (cleano-app's root, a sibling
// directory) — without this chdir, `next dev` would silently build and
// serve the WRONG app (confirmed: it served Cleano Ops's dashboard on
// Shuttle Ops's port before this fix was added).
process.chdir(appRoot);

const caBundle = path.join(appRoot, ".windows-ca-bundle.pem");
if (fs.existsSync(caBundle)) {
  process.env.NODE_EXTRA_CA_CERTS = caBundle;
}

require("next/dist/bin/next");
