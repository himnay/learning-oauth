// Minimal OAuth 2.0 Authorization Code + PKCE client for Keycloak.
// The flow is hand-written (no OIDC client library) so every step is visible.
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';

const config = {
  port: Number(process.env.PORT ?? 4000),
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:4000',
  keycloakUrl: process.env.KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: process.env.KEYCLOAK_REALM ?? 'learning',
  clientId: process.env.KEYCLOAK_CLIENT_ID ?? 'node-pkce-app',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-secret',
  apiUrl: process.env.API_URL ?? 'http://localhost:8081',
};

const issuer = `${config.keycloakUrl}/realms/${config.realm}`;
const redirectUri = `${config.appBaseUrl}/callback`;

// Endpoints are discovered from Keycloak's OpenID Provider metadata on first use.
let discovery;
let jwks;
async function getDiscovery() {
  if (!discovery) {
    const res = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status} (is Keycloak running?)`);
    discovery = await res.json();
    jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  }
  return discovery;
}

// ---- PKCE helpers (RFC 7636) ----
const base64url = (buf) => buf.toString('base64url');
const randomString = (bytes = 32) => base64url(crypto.randomBytes(bytes));
// code_verifier: high-entropy random string, 43-128 chars
const createCodeVerifier = () => randomString(32);
// code_challenge = BASE64URL(SHA256(code_verifier))
const createCodeChallenge = (verifier) =>
  base64url(crypto.createHash('sha256').update(verifier).digest());

const app = express();
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  }),
);
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

// Step 1: build the authorization request and send the browser to Keycloak.
app.get('/login', async (req, res, next) => {
  try {
    const { authorization_endpoint } = await getDiscovery();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const state = randomString(16); // CSRF protection
    const nonce = randomString(16); // ID token replay protection

    // Kept server side only; the verifier never leaves this app until the token request.
    req.session.oauth = { codeVerifier, codeChallenge, state, nonce };

    const url = new URL(authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();

    console.log('[login] redirecting to Keycloak, code_challenge=%s', codeChallenge);
    res.redirect(url.toString());
  } catch (err) {
    next(err);
  }
});

// Step 2: Keycloak redirects back with ?code&state. Exchange code + code_verifier for tokens.
app.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description } = req.query;
    const pending = req.session.oauth;

    if (error) return res.status(400).send(`Keycloak returned an error: ${error} - ${error_description ?? ''}`);
    if (!pending) return res.status(400).send('No login in progress. <a href="/">Start again</a>');
    if (state !== pending.state) return res.status(400).send('State mismatch - possible CSRF. <a href="/">Start again</a>');

    const { token_endpoint } = await getDiscovery();
    const tokenRes = await fetch(token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        code_verifier: pending.codeVerifier, // proves we started this flow
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).send(`Token exchange failed: <pre>${JSON.stringify(tokens, null, 2)}</pre>`);
    }

    // Step 3: verify the ID token signature and claims before trusting it.
    const { payload: idClaims } = await jwtVerify(tokens.id_token, jwks, {
      issuer,
      audience: config.clientId,
    });
    if (idClaims.nonce !== pending.nonce) return res.status(400).send('Nonce mismatch');

    delete req.session.oauth;
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.tokens = tokens;
      req.session.user = idClaims;
      // Exposed to the page purely for learning purposes.
      req.session.pkce = { codeVerifier: pending.codeVerifier, codeChallenge: pending.codeChallenge, method: 'S256' };
      console.log('[callback] logged in as %s', idClaims.preferred_username);
      res.redirect('/');
    });
  } catch (err) {
    next(err);
  }
});

// JSON consumed by the single page.
app.get('/api/me', (req, res) => {
  if (!req.session.tokens) return res.json({ authenticated: false });
  const { access_token, refresh_token, expires_in, scope, token_type } = req.session.tokens;
  res.json({
    authenticated: true,
    user: req.session.user,
    accessTokenClaims: decodeJwt(access_token),
    token: { token_type, scope, expires_in, has_refresh_token: Boolean(refresh_token) },
    pkce: req.session.pkce,
  });
});

// Returns a non-expired access token, using the refresh token when the current one is about to expire.
async function getAccessToken(req) {
  const tokens = req.session.tokens;
  const { exp } = decodeJwt(tokens.access_token);
  if (exp * 1000 - Date.now() > 10_000) return tokens.access_token;

  const { token_endpoint } = await getDiscovery();
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: config.clientId,
    }),
  });
  if (!res.ok) return null; // refresh token expired too (SSO session ended)
  req.session.tokens = { ...tokens, ...(await res.json()) };
  console.log('[refresh] access token refreshed');
  return req.session.tokens.access_token;
}

// Calls the Spring Boot oauth-jboss-backend with the user's access token as a Bearer token.
// The browser never sees the token: it only talks to this server (backend-for-frontend).
app.get('/api/greeting', async (req, res, next) => {
  try {
    if (!req.session.tokens) return res.status(401).json({ error: 'not logged in' });
    const accessToken = await getAccessToken(req);
    if (!accessToken) return res.status(401).json({ error: 'session expired, please log in again' });

    const url = `${config.apiUrl}/api/greeting`;
    let apiRes;
    try {
      apiRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch {
      return res.status(502).json({ error: `oauth-jboss-backend not reachable at ${config.apiUrl} (is it running?)` });
    }
    const text = await apiRes.text();
    res.status(apiRes.status).json({
      request: `GET ${url}`,
      status: apiRes.status,
      // Spring Security explains 401/403 in this header, e.g. error="invalid_token"
      wwwAuthenticate: apiRes.headers.get('www-authenticate') ?? undefined,
      body: text ? JSON.parse(text) : null,
    });
  } catch (err) {
    next(err);
  }
});

// RP-initiated logout: clear local session, then end the Keycloak SSO session.
app.get('/logout', async (req, res, next) => {
  try {
    const { end_session_endpoint } = await getDiscovery();
    const idToken = req.session.tokens?.id_token;
    req.session.destroy(() => {
      const url = new URL(end_session_endpoint);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('post_logout_redirect_uri', `${config.appBaseUrl}/`);
      if (idToken) url.searchParams.set('id_token_hint', idToken);
      res.redirect(url.toString());
    });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send(`<pre>${err.message}</pre><a href="/">Back</a>`);
});

app.listen(config.port, () => {
  console.log(`App:      ${config.appBaseUrl}`);
  console.log(`Keycloak: ${issuer}`);
  console.log(`API:      ${config.apiUrl}`);
});
