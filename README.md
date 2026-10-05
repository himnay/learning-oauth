# <span style="color:hsl(55,80%,50%)">learning-oauth — OAuth 2.0 + PKCE with Keycloak, Spring Boot and Node</span>

## <span style="color:hsl(141,80%,58%)">Table of contents</span>

1. 🎯 [Overview](#overview)
2. 🗂️ [Project layout](#project-layout)
3. 📋 [Prerequisites](#prerequisites)
4. 🚀 [Quick start](#quick-start)
5. 🏗️ [Architecture and full flow](#architecture-and-full-flow)
    - 5.1 [Why the browser doesn't call the API directly](#why-the-browser-doesnt-call-the-api-directly)
6. 🛡️ [Module 1: oauth-keycloak (`oauth-keycloak/`)](#module-1-oauth-keycloak-oauth-keycloak)
    - 6.1 [Keycloak (`oauth-keycloak/keycloak/`)](#keycloak-oauth-keycloakkeycloak)
    - 6.2 [Spring Boot resource server](#spring-boot-resource-server)
7. 🟢 [Module 2: oauth-ui (`oauth-ui/`)](#module-2-oauth-ui-oauth-ui)
8. 🔐 [How PKCE works](#how-pkce-works)
9. 🔌 [Endpoints](#endpoints)
    - 9.1 [oauth-ui (http://localhost:4000)](#oauth-ui-httplocalhost4000)
    - 9.2 [oauth-keycloak (http://localhost:8081)](#oauth-keycloak-httplocalhost8081)
10. ⚙️ [Configuration](#configuration)
    - 10.1 [oauth-ui](#oauth-ui)
    - 10.2 [oauth-keycloak](#oauth-keycloak)
11. 🧪 [Experiments to try](#experiments-to-try)
12. 🩺 [Troubleshooting](#troubleshooting)
13. 🏭 [Going to production](#going-to-production)
14. 📖 [References](#references)

<a id="overview"></a>
## <span style="color:hsl(278,80%,58%)">1. 🎯 Overview</span>

A hands-on project for learning **OAuth 2.0 Authorization Code flow with PKCE**, **OpenID Connect** and **JWT-protected REST APIs**.

| Piece | Role in OAuth terms | Tech |
|---|---|---|
| **Keycloak** | Authorization server / OpenID Provider: logs users in, issues tokens | Docker Compose, Red Hat build of Keycloak `registry.redhat.io/rhbk/keycloak-rhel9:26.6` |
| **`oauth-ui`** | Client (backend-for-frontend) + the single page UI | Node.js, Express |
| **`oauth-keycloak`** | Resource server: a REST API that only accepts valid Keycloak access tokens | Spring Boot 4.1, Spring Security 7 |

The user logs in through Keycloak using PKCE. Once login is validated, the page calls the Spring Boot API through the Node server, which attaches the access token. Spring Security validates the token, and the page shows the API's response.

The OAuth client flow is written by hand (no OIDC client library) so every step is readable in [`oauth-ui/server.js`](oauth-ui/server.js). The API side uses idiomatic Spring Security in a few small classes.

---

<a id="project-layout"></a>
## <span style="color:hsl(193,80%,58%)">2. 🗂️ Project layout</span>

```
learning-oauth/
├── pom.xml                                     # Maven aggregator (parent: com.org.llm:super-pom)
├── mvnw, .mvn/                                 # Maven wrapper (run from the repo root)
├── oauth-keycloak/                             # Module 1: Spring Boot REST API (resource server)
│   ├── keycloak/
│   │   ├── docker-compose.yml                  # Keycloak on :8080
│   │   └── realm-export.json                   # realm, client, roles, users (imported on startup)
│   ├── src/main/java/com/example/oauthapi/
│   │   ├── OauthApiApplication.java            # Spring Boot entry point
│   │   ├── config/SecurityConfig.java          # Spring Security: JWT validation + role rule
│   │   ├── controller/GreetingController.java  # the single REST endpoint: GET /api/greeting
│   │   ├── model/GreetingResponse.java         # response record returned by the endpoint
│   │   └── utils/KeycloakRealmRoleConverter.java # realm_access.roles -> ROLE_*, scope -> SCOPE_*
│   ├── src/main/resources/
│   │   ├── application.yml                     # issuer-uri, audience, port 8081, actuator info
│   │   └── banner.txt                          # startup banner (version, Java, port, issuer)
│   ├── src/test/java/...                       # MockMvc security tests + converter unit test
│   └── pom.xml                                 # module pom (parent: learning-oauth)
├── oauth-ui/                                   # Module 2: OAuth client + single page UI
│   ├── server.js                               # Authorization Code + PKCE, token refresh, API proxy
│   ├── public/index.html                       # the single page
│   ├── package.json
│   ├── .env.example
│   └── README.md                               # how to start and configure the UI
└── README.md
```

<a id="prerequisites"></a>
## <span style="color:hsl(331,80%,58%)">3. 📋 Prerequisites</span>

| Tool | Version | Check |
|---|---|---|
| Docker + Docker Compose v2 | recent | `docker compose version` |
| Red Hat registry login | for the RHBK image (or use the public image, see [Keycloak image](#keycloak-image-rhbk)) | `docker login registry.redhat.io` |
| Java (JDK) | **27** (set by super-pom) | `java -version` |
| Node.js | **22.9+** (uses `--env-file-if-exists`) | `node -v` |

Maven is **not** required: the repo root ships the Maven wrapper (`./mvnw`). The root `pom.xml` is a multi-module aggregator whose parent is the shared `com.org.llm:super-pom` (must be in your local `~/.m2` or a reachable repository).

Free ports: **8080** (Keycloak), **8081** (oauth-keycloak), **4000** (oauth-ui).

<a id="quick-start"></a>
## <span style="color:hsl(56,80%,50%)">4. 🚀 Quick start</span>

Use three terminals, started in this order.

```bash
# Terminal 1: Keycloak, Red Hat build (first start pulls the image, ~30-60 s)
cd oauth-keycloak/keycloak
docker login registry.redhat.io        # first time only; no Red Hat account? see "Keycloak image"
docker compose up -d
docker compose logs -f keycloak        # wait for "Listening on: http://0.0.0.0:8080", then Ctrl+C

# Terminal 2: Spring Boot API on :8081 (from the repo root)
./mvnw -pl oauth-keycloak spring-boot:run

# Terminal 3: Node app on :4000
cd oauth-ui
npm install
npm start
```

Open **http://localhost:4000** and click **Login with Keycloak**.

| User | Password | Has `api-user` role | Expected API result |
|---|---|---|---|
| `demo` | `demo` | yes | **200** with a greeting and the token details the API saw |
| `noaccess` | `noaccess` | no | **403** `insufficient_scope` (logged in, but not allowed) |

After login the page shows the **oauth-keycloak response** first (called automatically), then the PKCE values used, token metadata, the verified ID token claims and the decoded access token claims. **Call oauth-keycloak again** repeats the API call.

Stop everything: `Ctrl+C` in terminals 2 and 3, then `cd oauth-keycloak/keycloak && docker compose down`.

Run the API tests (no Keycloak needed):

```bash
./mvnw test
```

---

<a id="architecture-and-full-flow"></a>
## <span style="color:hsl(0,80%,58%)">5. 🏗️ Architecture and full flow</span>

```
                    ┌──────────────────────── front channel (browser redirects) ───────────────────────┐
                    │                                                                                    │
 ┌─────────┐   session cookie   ┌──────────────────┐   back channel: code+verifier → tokens   ┌─────────────────┐
 │ Browser │ ◄────────────────► │ oauth-ui  :4000  │ ───────────────────────────────────────► │ Keycloak :8080  │
 │ (page)  │   /api/* JSON      │ (OAuth client,   │                                          │ (authorization  │
 └─────────┘                    │  holds tokens)   │                                          │  server)        │
                                └────────┬─────────┘                                          └────────┬────────┘
                                         │ GET /api/greeting                                           │
                                         │ Authorization: Bearer <access_token>                        │ JWKS (public keys),
                                         ▼                                                             │ fetched once & cached
                                ┌──────────────────┐                                                   │
                                │ oauth-keycloak :8081  │ ◄─────────────────────────────────────────────────┘
                                │ (Spring Security │   verifies signature, exp, iss, aud, role
                                │  resource server)│
                                └──────────────────┘
```

Step by step:

1. Browser → `oauth-ui /login`. Node creates `code_verifier`, `code_challenge`, `state`, `nonce` and stores them in the session.
2. Browser is redirected to Keycloak's authorization endpoint with `code_challenge` (S256), `state`, `nonce`.
3. User logs in on Keycloak. Keycloak redirects to `oauth-ui /callback?code=…&state=…`.
4. Node checks `state`, POSTs `code` + `code_verifier` to Keycloak's token endpoint and receives `access_token`, `id_token`, `refresh_token`.
5. Node verifies the ID token (signature via JWKS, `iss`, `aud`, `exp`, `nonce`), regenerates the session, and redirects to `/`.
6. **Login validated → the page calls `oauth-ui /api/greeting`.**
7. Node refreshes the access token if it's about to expire, then calls `oauth-keycloak GET /api/greeting` with `Authorization: Bearer <access_token>`.
8. **Spring Security** in `oauth-keycloak`:
   - fetches Keycloak's public keys (first request only) and verifies the RS256 signature,
   - checks `exp`/`nbf`, `iss == http://localhost:8080/realms/learning`, and that `aud` contains `oauth-keycloak`,
   - maps `realm_access.roles` to `ROLE_*` authorities and requires `ROLE_api-user`.
   - Failures produce **401** (bad/missing token) or **403** (valid token, missing role) with an RFC 6750 `WWW-Authenticate` header.
9. The controller returns JSON. Node passes it, with the status, to the page, which displays it.

<a id="why-the-browser-doesnt-call-the-api-directly"></a>
### <span style="color:hsl(20,80%,58%)">5.1 Why the browser doesn't call the API directly</span>

The tokens live only in the Node server's session (the **backend-for-frontend** pattern), so JavaScript in the page can't leak them (e.g. via XSS). The page talks to Node with a cookie, and Node talks to the API with the Bearer token. Side benefit: the API needs no CORS configuration.

---

<a id="module-1-oauth-keycloak-oauth-keycloak"></a>
## <span style="color:hsl(200,80%,58%)">6. 🛡️ Module 1: oauth-keycloak (`oauth-keycloak/`)</span>

<a id="keycloak-oauth-keycloakkeycloak"></a>
### <span style="color:hsl(20,80%,58%)">6.1 Keycloak (`oauth-keycloak/keycloak/`)</span>

The authorization server that the API trusts. It's started by Docker Compose and configured entirely from `realm-export.json`.

<a id="keycloak-image-rhbk"></a>
#### Keycloak image: Red Hat build of Keycloak (RHBK)

This project runs the **Red Hat build of Keycloak** (RHBK), `registry.redhat.io/rhbk/keycloak-rhel9:26.6` (Keycloak 26.6.x on RHEL 9, Quarkus based). It is the same Keycloak code as upstream, built, signed and supported by Red Hat. The `26.6` tag follows the latest 26.6 patch build.

| Image | Who / what | Pull access | Use it for |
|---|---|---|---|
| `registry.redhat.io/rhbk/keycloak-rhel9` (**default here**) | Red Hat build of Keycloak: RHEL-based, Red Hat support and long-term fixes | Red Hat account + `docker login registry.redhat.io` | Production with a Red Hat subscription; this project |
| `quay.io/keycloak/keycloak` | Upstream Keycloak, published by the Keycloak project on Quay.io | Public, no login | Learning without a Red Hat account; newest features first |

**One-time login** before the first `docker compose up` (Docker keeps its own registry login, separate from the Red Hat website):

```bash
docker login registry.redhat.io
# username/password = Red Hat account, or a Registry Service Account
# from https://access.redhat.com/terms-based-registry/ (needed if your account uses 2FA)
```

**No Red Hat account?** The compose file reads the image from `KEYCLOAK_IMAGE`, so you can use the public upstream image without changing any file. Configuration (`start-dev`, `--import-realm`, `KC_*` variables) and URLs are identical:

```bash
KEYCLOAK_IMAGE=quay.io/keycloak/keycloak:26.8.0 docker compose up -d
```

To see which RHBK builds exist: [Red Hat Ecosystem Catalog: search `rhbk/keycloak-rhel9`](https://catalog.redhat.com/software/containers/search?q=rhbk%2Fkeycloak-rhel9). RHBK versions trail upstream by a few minor releases.

How this differs from the old WildFly-based `jboss/keycloak` image (retired at 16.1.1), in case you follow older tutorials:

| Old tutorials (`jboss/keycloak`) | This project (RHBK / `quay.io/keycloak/keycloak`) |
|---|---|
| URLs contain `/auth/`, e.g. `/auth/realms/x` | No `/auth/` prefix: `/realms/x` |
| `KEYCLOAK_USER` / `KEYCLOAK_PASSWORD` | `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` |
| `KEYCLOAK_IMPORT=/tmp/realm.json` | `--import-realm` + files in `/opt/keycloak/data/import/` |
| WildFly CLI / `standalone.xml` | `KC_*` env vars or CLI flags |

#### `docker-compose.yml`

- `start-dev`: HTTP, embedded dev database. **Development only.**
- Admin console user `admin` / `admin`.
- Mounts `realm-export.json` and passes `--import-realm`, so the realm exists on first start.

> Data lives inside the container. `docker compose down` deletes it, and the next `up` re-imports the JSON. Edit `realm-export.json`, then run `docker compose down && docker compose up -d` to apply changes.

#### What the realm import creates

| Item | Value | Why |
|---|---|---|
| Realm | `learning` | Isolated tenant |
| Realm role | `api-user` | Required by `oauth-keycloak` to call `/api/greeting` |
| Client | `node-pkce-app`, **public** (no secret) | The Node app. PKCE replaces the secret as proof of who started the flow |
| Standard flow | on; implicit + password grant off | Only the secure flow is allowed |
| `pkce.code.challenge.method` | `S256` | Keycloak **rejects** auth requests without an S256 challenge |
| Redirect URI | `http://localhost:4000/callback` (exact) | Where codes may be sent |
| Post-logout redirect URI | `http://localhost:4000/` | Where logout returns |
| Protocol mapper `oauth-keycloak-audience` | adds `oauth-keycloak` to the access token's `aud` | The API only accepts tokens issued **for it** |
| Users | `demo`/`demo` (has `api-user`), `noaccess`/`noaccess` (doesn't) | To see 200 vs 403 |

#### Useful Keycloak URLs

| What | URL |
|---|---|
| Admin console | http://localhost:8080/admin (admin / admin) |
| OIDC discovery | http://localhost:8080/realms/learning/.well-known/openid-configuration |
| Public signing keys (JWKS) | http://localhost:8080/realms/learning/protocol/openid-connect/certs |
| Account console | http://localhost:8080/realms/learning/account |

<a id="spring-boot-resource-server"></a>
### <span style="color:hsl(80,80%,50%)">6.2 Spring Boot resource server</span>

A stateless REST API on port **8081** with one endpoint, `GET /api/greeting`. It doesn't log anyone in. It only validates the Bearer tokens Keycloak issued.

**Dependencies** (`pom.xml`): `spring-boot-starter-webmvc`, `spring-boot-starter-oauth2-resource-server` (Spring Security + Nimbus JOSE for JWT) and `spring-boot-starter-actuator` (`/actuator/health`, `/actuator/info`).

**`application.yml`**: two properties configure all token validation:

```yaml
spring.security.oauth2.resourceserver.jwt:
  issuer-uri: http://localhost:8080/realms/learning   # keys discovered from here; "iss" must match
  audiences: oauth-keycloak                                # "aud" must contain this
```

Spring Boot reads `issuer-uri`, lazily downloads `/.well-known/openid-configuration` → `jwks_uri` on the first request, caches the public keys, and builds a `JwtDecoder` that validates signature, timestamps, issuer and audience. Keycloak doesn't need to be up when the API starts.

**`SecurityConfig.java`**:

```java
.authorizeHttpRequests(auth -> auth
        .requestMatchers("/actuator/health", "/actuator/info").permitAll()
        .requestMatchers("/api/greeting").hasRole("api-user")   // needs ROLE_api-user
        .anyRequest().authenticated())
.oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(converter)))
.sessionManagement(s -> s.sessionCreationPolicy(STATELESS))   // no HttpSession
.csrf(csrf -> csrf.disable())                                  // no cookies → no CSRF risk
```

The `JwtAuthenticationConverter` bean uses `preferred_username` as the principal name (instead of the opaque `sub` UUID) and delegates authorities to `KeycloakRealmRoleConverter`.

**`KeycloakRealmRoleConverter.java`**: by default Spring only turns the `scope` claim into `SCOPE_*` authorities. Keycloak puts roles in a nested claim:

```json
"realm_access": { "roles": ["api-user", "offline_access", "default-roles-learning"] }
```

The converter maps those to `ROLE_api-user`, `ROLE_offline_access` and so on, so `hasRole("api-user")` works. (Spring Security 7 also adds a `FACTOR_BEARER` authority recording *how* the user authenticated. You'll see it in the response.)

**`GreetingController.java`**: runs only after validation succeeds. It receives the `JwtAuthenticationToken` and returns a `GreetingResponse` record (`model` package):

```json
{
  "message": "Hello demo, your token was validated by oauth-keycloak (Spring Security)",
  "username": "demo",
  "email": "demo@example.com",
  "subject": "31365d03-…",
  "authorities": ["FACTOR_BEARER", "ROLE_api-user", "…", "SCOPE_email", "SCOPE_openid", "SCOPE_profile"],
  "audience": ["oauth-keycloak", "account"],
  "tokenIssuedAt": "2026-10-04T07:09:14Z",
  "tokenExpiresAt": "2026-10-04T07:14:14Z",
  "serverTime": "2026-10-04T07:09:14.802Z"
}
```

**Startup banner and app info**: `src/main/resources/banner.txt` prints the module version, Spring Boot and Java versions, port, issuer URI and active profile on startup. `/actuator/info` (public) returns the `info.app.*` block from `application.yml` plus git commit details (git-commit-id plugin from super-pom), Java and OS info. `/actuator/health` is public too; everything else still needs a token.

**Tests** (`./mvnw test`, no Keycloak needed):
- `GreetingControllerTest`: MockMvc + `spring-security-test`'s `jwt()`: no token → 401, token without role → 403, token with role → 200.
- `JwtAuthenticationConverterTest`: a Keycloak-shaped `Jwt` maps to username `demo` with the right `ROLE_*` / `SCOPE_*` authorities.

---

<a id="module-2-oauth-ui-oauth-ui"></a>
## <span style="color:hsl(141,80%,58%)">7. 🟢 Module 2: oauth-ui (`oauth-ui/`)</span>

An Express server that serves the single page and acts as the OAuth client.

> Full start-up, configuration and troubleshooting guide: [`oauth-ui/README.md`](oauth-ui/README.md).

- **Dependencies:** `express`, `express-session` (server-side session cookie), `jose` (JWT verification against Keycloak's JWKS).
- **No OIDC library**: PKCE, the authorization redirect, state/nonce checks, token exchange and refresh are plain code.
- **Tokens never reach the browser.**

What's in [`server.js`](oauth-ui/server.js):

1. **Discovery** (`getDiscovery`): fetches and caches Keycloak's endpoints from `/.well-known/openid-configuration`.
2. **PKCE helpers**: `createCodeVerifier` (32 random bytes, base64url = 43 chars) and `createCodeChallenge` (`BASE64URL(SHA256(verifier))`).
3. **`GET /login`**: generates verifier/challenge/state/nonce, stores them in the session, redirects to Keycloak.
4. **`GET /callback`**: checks `error` and `state`, exchanges `code` + `code_verifier` at the token endpoint (no client secret), verifies the ID token with `jose.jwtVerify`, checks `nonce`, **regenerates the session** (prevents session fixation), and stores tokens.
5. **`GET /api/me`**: login state + claims for the page.
6. **`getAccessToken`**: if the access token expires within 10 s, uses the `refresh_token` grant to get a new one (Keycloak access tokens last 5 minutes by default).
7. **`GET /api/greeting`**: calls `oauth-keycloak` with `Authorization: Bearer <access_token>` and returns `{ request, status, wwwAuthenticate, body }` so the page can show both successes and Spring Security's error details.
8. **`GET /logout`**: destroys the session and redirects to Keycloak's `end_session_endpoint` (RP-initiated logout) so the SSO session ends too.

[`public/index.html`](oauth-ui/public/index.html) loads `/api/me`. If logged in, it renders the claims and **immediately calls `/api/greeting`**, showing the status badge, message and full response.

> **Why PKCE with a backend?** PKCE was designed for public clients, but the OAuth 2.0 Security BCP (RFC 9700) and OAuth 2.1 recommend it for **all** clients: it stops authorization-code interception and injection attacks.

---

<a id="how-pkce-works"></a>
## <span style="color:hsl(30,80%,58%)">8. 🔐 How PKCE works</span>

| Parameter | Where | Purpose |
|---|---|---|
| `code_verifier` | Secret in the Node session; sent only in the back-channel token request | Proves the party redeeming the code started the flow. A stolen `code` is useless without it. |
| `code_challenge` | Front channel (authorization request) | `BASE64URL(SHA256(code_verifier))`. Safe to expose because the hash can't be reversed. |
| `code_challenge_method=S256` | Authorization request | How Keycloak verifies. Never use `plain`. |
| `state` | Sent out, returned on callback | CSRF protection: the callback must belong to a login this browser started. |
| `nonce` | Sent out, embedded in the ID token | Binds the ID token to this login and prevents replay. |
| `redirect_uri` | Authorization + token requests | Must exactly match a registered URI, and be identical in both requests. |
| `scope=openid profile email` | Authorization request | `openid` makes it OIDC (ID token); others add claims. |

At the token endpoint Keycloak computes `BASE64URL(SHA256(code_verifier))` and compares it with the `code_challenge` it stored in step 2. If they differ, it returns `invalid_grant: PKCE verification failed: Code mismatch`.

---

<a id="endpoints"></a>
## <span style="color:hsl(170,80%,58%)">9. 🔌 Endpoints</span>

<a id="oauth-ui-httplocalhost4000"></a>
### <span style="color:hsl(20,80%,58%)">9.1 oauth-ui (http://localhost:4000)</span>

| Method | Path | Description |
|---|---|---|
| GET | `/` | Single page UI |
| GET | `/login` | Starts Authorization Code + PKCE |
| GET | `/callback` | Redirect URI; exchanges code + verifier for tokens |
| GET | `/api/me` | `{ authenticated, user, accessTokenClaims, token, pkce }` |
| GET | `/api/greeting` | Calls oauth-keycloak with the session's access token; returns `{ request, status, wwwAuthenticate, body }` |
| GET | `/logout` | Clears session and logs out of Keycloak |

<a id="oauth-keycloak-httplocalhost8081"></a>
### <span style="color:hsl(80,80%,50%)">9.2 oauth-keycloak (http://localhost:8081)</span>

| Method | Path | Auth | Responses |
|---|---|---|---|
| GET | `/api/greeting` | `Authorization: Bearer <Keycloak access token>` with `aud` ∋ `oauth-keycloak` and realm role `api-user` | `200` greeting JSON · `401` missing/invalid/expired token · `403` valid token without `api-user` |
| GET | `/actuator/health` | none | `200` `{"status":"UP"}` |
| GET | `/actuator/info` | none | `200` app name/description/version, issuer, audience, git commit, Java, OS |

---

<a id="configuration"></a>
## <span style="color:hsl(300,80%,58%)">10. ⚙️ Configuration</span>

<a id="oauth-ui"></a>
### <span style="color:hsl(20,80%,58%)">10.1 oauth-ui</span>

Works with no configuration. To override, copy `oauth-ui/.env.example` to `oauth-ui/.env` (loaded automatically by `npm start`):

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | App port |
| `APP_BASE_URL` | `http://localhost:4000` | Builds `redirect_uri` and the post-logout URI |
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL |
| `KEYCLOAK_REALM` | `learning` | Realm |
| `KEYCLOAK_CLIENT_ID` | `node-pkce-app` | Client ID |
| `SESSION_SECRET` | `dev-only-secret` | Signs the session cookie |
| `API_URL` | `http://localhost:8081` | Base URL of oauth-keycloak |

> If you change the Node port/URL, update `redirectUris`, `webOrigins`, `rootUrl` and `post.logout.redirect.uris` in `oauth-keycloak/keycloak/realm-export.json`, then recreate Keycloak.

<a id="oauth-keycloak"></a>
### <span style="color:hsl(80,80%,50%)">10.2 oauth-keycloak</span>

Environment variables (or edit `application.yml`):

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `8081` | API port |
| `KEYCLOAK_ISSUER_URI` | `http://localhost:8080/realms/learning` | Must equal the `iss` claim in tokens, character for character |

Example: `PORT=9090 ./mvnw -pl oauth-keycloak spring-boot:run` (then set `API_URL=http://localhost:9090` for oauth-ui).

---

<a id="experiments-to-try"></a>
## <span style="color:hsl(120,80%,58%)">11. 🧪 Experiments to try</span>

1. **401 vs 403.** Log in as `demo` (200), log out, log in as `noaccess` (403 `insufficient_scope`). Authentication and authorization are different things.
2. **Call the API with curl.**
   ```bash
   curl -i http://localhost:8081/api/greeting                                   # 401, no token
   curl -i -H 'Authorization: Bearer abc.def.ghi' http://localhost:8081/api/greeting   # 401 invalid_token
   ```
   Read the `WWW-Authenticate` header: Spring Security says exactly what's wrong.
3. **Use a real token with curl.** Temporarily add `console.log(accessToken)` in `/api/greeting` of `server.js`, copy the token from the Node logs, then:
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8081/api/greeting | jq
   ```
   Wait 5 minutes and try again: `401 … Jwt expired at …`.
4. **Audience check.** In the Keycloak admin console remove the `oauth-keycloak-audience` mapper (Clients → node-pkce-app → Client scopes → node-pkce-app-dedicated), log in again: the API returns 401 because `aud` no longer contains `oauth-keycloak`.
5. **Grant the role.** Admin console → Users → `noaccess` → Role mapping → assign `api-user`. Log out and in again (roles are baked into the token at issue time): 200.
6. **Tamper with a token.** Change one character in the payload of a real token and call the API: signature verification fails → 401.
7. **See PKCE enforcement.** Open this URL (no `code_challenge`):
   ```
   http://localhost:8080/realms/learning/protocol/openid-connect/auth?response_type=code&client_id=node-pkce-app&redirect_uri=http%3A%2F%2Flocalhost%3A4000%2Fcallback&scope=openid
   ```
   Keycloak answers `error=invalid_request&error_description=Missing parameter: code_challenge_method`.
8. **Wrong verifier.** In `/callback`, replace `pending.codeVerifier` with `'x'.repeat(43)` and log in: `PKCE verification failed: Code mismatch`.
9. **Token refresh.** Stay on the page for over 5 minutes, then click **Call oauth-keycloak again**. Node logs `[refresh] access token refreshed` and the API still returns 200 with a new `tokenExpiresAt`.
10. **Decode tokens.** Paste a token into https://jwt.io, or `echo '<token>' | cut -d. -f2 | base64 -d 2>/dev/null`.

---

<a id="troubleshooting"></a>
## <span style="color:hsl(20,80%,58%)">12. 🩺 Troubleshooting</span>

| Symptom | Cause / fix |
|---|---|
| Page shows `oauth-keycloak not reachable at http://localhost:8081` (502) | API not running. Start it from the repo root: `./mvnw -pl oauth-keycloak spring-boot:run`. |
| API returns 401 `The iss claim is not valid` | `KEYCLOAK_ISSUER_URI` doesn't exactly match the token's `iss` (e.g. `127.0.0.1` vs `localhost`, or running the API in Docker and using `keycloak:8080`). Use the same hostname the browser uses. |
| API returns 401 `The aud claim is not valid` | Audience mapper missing. Recreate Keycloak so the realm re-imports. |
| API returns 403 for `demo` | Realm import didn't assign `api-user`. Check Users → demo → Role mapping, then re-login. |
| API 401 on first call with `Unable to resolve the Configuration with the provided Issuer` | API can't reach Keycloak to load keys. Is Keycloak up on :8080? |
| `OIDC discovery failed … (is Keycloak running?)` in Node | Keycloak not up yet: `docker compose ps`, `docker compose logs keycloak`. |
| Keycloak page: **Invalid parameter: redirect_uri** | Node URL/port doesn't match `redirectUris` in the realm. |
| `docker compose up`: `Please login to the Red Hat Registry` | Run `docker login registry.redhat.io`, or start with `KEYCLOAK_IMAGE=quay.io/keycloak/keycloak:26.8.0 docker compose up -d`. |
| Red Hat website says `You are already authenticated as different user` | Browser still has another Red Hat SSO session: sign out, clear `redhat.com` cookies, or use a private window. |
| Realm JSON changes not applied | Import skips existing realms: `docker compose down && docker compose up -d`. |
| `EADDRINUSE` / port in use | Change `PORT` (and related URLs, see [Configuration](#configuration)). |
| "No login in progress" after login | Node restarted mid-login (sessions are in memory). Start again. |
| `./mvnw: Permission denied` | `chmod +x mvnw`. |
| Java version error during build | JDK 27 required (inherited from super-pom). |
| `Could not get HEAD Ref` (git-commit-id plugin) | The repo has no commits yet. Commit once, or add `-Dmaven.gitcommitid.skip=true`. |

---

<a id="going-to-production"></a>
## <span style="color:hsl(340,80%,58%)">13. 🏭 Going to production</span>

- **Keycloak:** `start` (not `start-dev`), PostgreSQL, HTTPS, `KC_HOSTNAME`, strong admin password.
- **oauth-ui:** HTTPS + `cookie.secure: true`, persistent session store (Redis/DB), strong `SESSION_SECRET`, don't expose PKCE values or claims to the page, consider [`openid-client`](https://github.com/panva/openid-client). Optionally make the client confidential (client secret) and keep PKCE.
- **oauth-keycloak:** keep issuer + audience validation; prefer fine-grained authorities (roles or scopes per operation); add actuator health checks; run behind TLS; consider client roles (`resource_access.<client>.roles`) instead of realm roles for per-API permissions.

---

<a id="references"></a>
## <span style="color:hsl(45,80%,50%)">14. 📖 References</span>

- RFC 6749 – OAuth 2.0: https://datatracker.ietf.org/doc/html/rfc6749
- RFC 6750 – Bearer Token Usage: https://datatracker.ietf.org/doc/html/rfc6750
- RFC 7636 – PKCE: https://datatracker.ietf.org/doc/html/rfc7636
- RFC 9068 – JWT Profile for Access Tokens: https://datatracker.ietf.org/doc/html/rfc9068
- RFC 9700 – OAuth 2.0 Security Best Current Practice: https://datatracker.ietf.org/doc/html/rfc9700
- OAuth 2.0 for Browser-Based Apps: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
- OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html
- Spring Security – OAuth 2.0 Resource Server (JWT): https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html
- Keycloak docs: https://www.keycloak.org/documentation
