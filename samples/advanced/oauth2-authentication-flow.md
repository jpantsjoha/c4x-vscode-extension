# OAuth 2.0 Authentication Flow

Demonstrates the **OAuth 2.0 Authorization Code Grant** flow with PKCE (Proof Key for Code Exchange) for secure authentication.

## Use Case

A mobile app authenticating users via Google OAuth to access a protected API.

## System Context (C1) - Authentication Ecosystem

```c4x
%%{ c4: system-context }%%
graph TB
  %% Users
  Person(user, "End User", "Mobile app user", $x="70", $y="40")

  %% Our Systems
  System(mobile_app, "Mobile App", "React Native application")
  System(api_server, "API Server", "Protected resources", $x="491", $y="541")

  %% External Systems
  System_Ext(auth_provider, "OAuth Provider", "Google/Auth0/Okta", $x="39", $y="702")
  System_Ext(user_db, "User Directory", "Google accounts")

  %% Relationships
  user -->|Uses| mobile_app
  mobile_app -->|Redirects for login| auth_provider
  mobile_app -->|Accesses with token| api_server

  auth_provider -->|Validates credentials| user_db
  api_server -->|Validates tokens with| auth_provider
```

## Dynamic Diagram - OAuth 2.0 Authorization Code Flow

```c4x
%%{ c4: dynamic }%%
graph TB
  %% Elements
  Person(user, "User v2", "Mobile app user", $x="59", $y="0")
  Container(app, "Mobile App", "React Native", "Client application", $x="524", $y="211")
  Container(auth, "OAuth Provider", "Auth0", "Authorization server", $x="34", $y="461")
  Container(api, "API Server", "Node.js", "Resource server", $x="229", $y="804")

  %% Flow (auto-numbered 1, 2, 3...)
  user -->|1. Taps "Login with Google"| app
  app -->|2. Initiates auth (with PKCE)| auth
  auth -.->|3. Shows login screen| user
  user -->|4. Enters credentials| auth
  auth -.->|5. Returns authorization code| app
  app -->|6. Exchanges code for token| auth
  auth -.->|7. Returns access_token + refresh_token| app
  app -->|8. Requests /api/profile (with token)| api
  api -->|9. Validates token| auth
  auth -.->|10. Token valid| api
  api -.->|11. Returns user profile| app
  app -.->|12. Shows dashboard| user
```

## Container Diagram (C2) - OAuth Architecture

```c4x
%%{ c4: container }%%
graph TB
  %% Users
  Person(user, "End User", "App user")

  %% Client Applications
  Container(web_app, "Web App", "React/Next.js", "SPA client")
  Container(mobile_app, "Mobile App", "React Native", "Native app")
  Container(desktop_app, "Desktop App", "Electron", "Desktop client")

  %% Our Backend
  subgraph OurPlatform {
    Container(api_gateway, "API Gateway", "Kong", "Request routing")
    Container(user_service, "User Service", "Node.js", "User management")
    Container(resource_service, "Resource Service", "Java", "Protected resources")
    ContainerDb(session_db, "Session Store", "Redis", "Token cache")
  }

  %% OAuth Infrastructure
  subgraph OAuth2Provider {
    Container(auth_server, "Authorization Server", "Auth0", "Issues tokens")
    Container(token_endpoint, "Token Endpoint", "OAuth2", "Token issuance")
    Container(userinfo_endpoint, "UserInfo Endpoint", "OIDC", "User details")
    ContainerDb(oauth_db, "OAuth DB", "PostgreSQL", "Clients, tokens")
  }

  %% External
  System_Ext(google, "Google IDP", "Identity provider")
  System_Ext(github, "GitHub IDP", "Identity provider")

  %% Client to OAuth
  web_app -->|Initiates login| auth_server
  mobile_app -->|Initiates login| auth_server
  desktop_app -->|Initiates login| auth_server

  %% OAuth to Identity Providers
  auth_server -->|Federated login| google
  auth_server -->|Federated login| github

  %% Token Issuance
  auth_server -->|Issues tokens via| token_endpoint
  token_endpoint -->|Stores| oauth_db

  %% Clients to API
  web_app -->|API calls (Bearer token)| api_gateway
  mobile_app -->|API calls (Bearer token)| api_gateway
  desktop_app -->|API calls (Bearer token)| api_gateway

  %% API Token Validation
  api_gateway -->|Validates token| auth_server
  api_gateway -->|Checks cache| session_db
  auth_server -->|Provides user info| userinfo_endpoint

  %% API to Services
  api_gateway -->|Routes to| user_service
  api_gateway -->|Routes to| resource_service
```

## Component Diagram (C3) - API Gateway Token Validation

```c4x
%%{ c4: component }%%
graph TB
  %% External
  MobileApp[Mobile App<br/>Container<br/>External]
  AuthServer[Authorization Server<br/>Container<br/>External]
  UserService[User Service<br/>Container<br/>External]

  subgraph APIGatewayContainer {
    %% Entry Point
    RequestHandler[Request Handler<br/>Component<br/>Express middleware]

    %% Authentication
    TokenExtractor[Token Extractor<br/>Component<br/>Parses Authorization header]
    TokenValidator[Token Validator<br/>Component<br/>JWT verification]
    TokenCache[Token Cache<br/>Component<br/>Redis client]

    %% Authorization
    ScopeChecker[Scope Checker<br/>Component<br/>Permission validation]
    RateLimiter[Rate Limiter<br/>Component<br/>Per-user throttling]

    %% Introspection
    IntrospectionClient[Introspection Client<br/>Component<br/>OAuth2 client]
    JWKSClient[JWKS Client<br/>Component<br/>Public key fetcher]

    %% Routing
    RouteResolver[Route Resolver<br/>Component<br/>Path matcher]

    %% Error Handling
    ErrorHandler[Error Handler<br/>Component<br/>401/403 responses]
    Logger[Audit Logger<br/>Component<br/>Access logs]
  }

  %% Request Flow
  MobileApp -->|HTTP Request + Bearer token| RequestHandler
  RequestHandler -->|Extracts token| TokenExtractor

  TokenExtractor -->|Checks cache| TokenCache
  TokenCache -.->|Cache miss| TokenValidator
  TokenCache -.->|Cache hit| ScopeChecker

  %% Token Validation
  TokenValidator -->|Verifies signature| JWKSClient
  TokenValidator -.->|Complex validation| IntrospectionClient
  IntrospectionClient -.->|Validates with| AuthServer

  JWKSClient -.->|Fetches public keys| AuthServer

  TokenValidator -->|Valid| ScopeChecker
  TokenValidator -.->|Invalid| ErrorHandler

  %% Authorization
  ScopeChecker -->|Checks permissions| RateLimiter
  ScopeChecker -.->|Insufficient scope| ErrorHandler

  RateLimiter -->|Under limit| RouteResolver
  RateLimiter -.->|Rate exceeded| ErrorHandler

  %% Routing
  RouteResolver -->|Forwards request| UserService

  %% Logging
  RequestHandler -->|Logs access| Logger
  ErrorHandler -.->|Logs failures| Logger
```

## OAuth 2.0 Tokens

### Access Token (JWT)
```json
{
  "iss": "https://auth.example.com",
  "sub": "user_12345",
  "aud": "api.example.com",
  "exp": 1709472000,
  "iat": 1709468400,
  "scope": "read:profile write:posts"
}
```

### Token Validation Steps

1. **Extract** token from `Authorization: Bearer <token>` header
2. **Check cache** (Redis) for previously validated token
3. **Verify signature** using JWKS (JSON Web Key Set)
4. **Check expiration** (`exp` claim)
5. **Validate audience** (`aud` claim)
6. **Check scopes** for permission
7. **Rate limit** per user/client
8. **Cache** validated token (TTL = token expiry)

## Security Best Practices

| Practice | Description |
|----------|-------------|
| **PKCE** | Use Proof Key for Code Exchange in mobile/SPA apps |
| **Short-lived tokens** | Access tokens expire in 15-60 minutes |
| **Refresh tokens** | Rotate refresh tokens on each use |
| **HTTPS only** | All OAuth flows over TLS 1.2+ |
| **State parameter** | Prevent CSRF attacks |
| **Token rotation** | Revoke tokens on logout/password change |

## Flow Comparison

| Grant Type | Use Case | Security | Complexity |
|------------|----------|----------|------------|
| **Authorization Code** | Web apps, mobile | High | Medium |
| **PKCE** | SPAs, native apps | Very High | Medium |
| **Client Credentials** | Service-to-service | High | Low |
| **Implicit** ❌ | Deprecated | Low | Low |
| **Password** ❌ | Deprecated | Low | Low |

## Error Handling

```c4x
%%{ c4: dynamic }%%
graph LR
  Person(user, "User", "App user")
  Container(app, "App", "Client")
  Container(api, "API", "Resource server")
  Container(auth, "OAuth", "Auth server")

  %% Error Scenarios
  user -->|Login attempt| app
  app -->|Invalid client_id| auth
  auth -.->|400 Bad Request| app

  app -->|Valid auth| api
  api -->|Expired token| auth
  auth -.->|401 Unauthorized| api
  api -.->|Redirect to login| app
```
