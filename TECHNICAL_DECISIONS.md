# Technical Decision Records (TDR)

> **Project:** Africa Payments MCP  
> **Status:** Active  
> **Review Date:** 2026-02-16

---

## TDR-001: Language Selection

**Decision:** Use TypeScript

**Rationale:**
- Type safety prevents runtime errors in financial operations
- Better IDE support with IntelliSense and autocompletion
- Self-documenting code through interfaces and types
- Industry standard for Node.js enterprise applications
- Easier refactoring with compiler support

**Consequences:**
- Build step required (`tsc` compilation)
- Additional dev dependencies
- Learning curve for developers unfamiliar with TypeScript
- Worthwhile trade-off for financial application safety

**Status:** ✅ Approved

---

## TDR-002: MCP Protocol

**Decision:** Use Model Context Protocol (MCP)

**Rationale:**
- Emerging as "USB-C for AI" - universal standard
- Supported by major AI clients (Claude, Cursor, etc.)
- Standardized tool discovery and execution
- JSON-RPC based protocol is simple and robust
- Eliminates need for custom API integration per client

**Consequences:**
- Limited to AI agents as primary consumers
- Protocol still evolving (v1.0.0 currently)
- Smaller ecosystem than REST/GraphQL
- Target audience aligns with our use case

**Status:** ✅ Approved

---

## TDR-003: HTTP Client

**Decision:** Use axios over native fetch

**Rationale:**
- Better error handling with AxiosError
- Request/response interceptors for auth and logging
- Broader Node.js version support (fetch requires Node 18+)
- Built-in request timeout handling
- Automatic JSON transformation
- Retry logic can be added via interceptors

**Consequences:**
- Additional dependency (~50KB)
- Different API from modern fetch
- Well-maintained and battle-tested

**Status:** ✅ Approved

---

## TDR-004: Provider Selection Strategy

**Decision:** Auto-select provider based on country/phone

**Rationale:**
- Users shouldn't need to know which provider to use
- Reduces cognitive load for AI agents
- Smart defaults based on recipient location
- Still allows explicit override when needed

**Consequences:**
- Need good defaults mapping (country → provider)
- Potential for suboptimal selection
- Must handle provider unavailability gracefully
- Override option preserves flexibility

**Status:** ✅ Approved

---

## TDR-005: Webhook Architecture

**Decision:** Separate webhook event emitter

**Rationale:**
- MCP uses stdio transport, webhooks need HTTP
- Clear separation between sync and async operations
- Event-driven architecture enables loose coupling
- Supports multiple webhook consumers
- Idempotency handling built-in

**Consequences:**
- Two separate processes in production
- Need to manage event emitter lifecycle
- Memory usage for event tracking (bounded)
- Better separation of concerns

**Status:** ✅ Approved

---

## TDR-006: Error Handling

**Decision:** Map all errors to standard error codes

**Rationale:**
- Consistent error handling across providers
- Clients can handle errors predictably
- Enables retry logic based on error type
- Better debugging with structured errors
- Supports internationalization of error messages

**Consequences:**
- More upfront work to map provider errors
- Maintenance overhead when providers change
- Better long-term maintainability
- Improved user experience

**Status:** ✅ Approved

---

## TDR-007: Testing Strategy

**Decision:** Jest with nock for HTTP mocking

**Rationale:**
- Industry standard for JavaScript/TypeScript
- Excellent TypeScript support via ts-jest
- Built-in mocking and spying capabilities
- Nock provides deterministic HTTP mocking
- Good IDE integration

**Consequences:**
- Test files can be large with TypeScript types
- Jest configuration complexity
- Well-documented and supported

**Status:** ✅ Approved

---

## TDR-008: Documentation

**Decision:** Markdown-based documentation

**Rationale:**
- Version controlled with code
- Readable in any text editor
- Easy to maintain
- GitHub renders beautifully
- Can be converted to other formats

**Alternatives Considered:**
- VitePress: Overkill for current needs
- GitBook: External dependency
- Docusaurus: Too complex

**Status:** ✅ Approved

---

## TDR-009: Configuration Format

**Decision:** JSON configuration file

**Rationale:**
- Easy to read and edit
- Schema can be validated
- Standard format
- Works with CLI tools

**Consequences:**
- No comments allowed in JSON
- Less flexible than YAML/TOML
- Type-safe parsing required

**Future Consideration:** Support YAML as alternative

**Status:** ✅ Approved

---

## TDR-010: Logging Strategy

**Decision:** Custom lightweight logger (not Winston)

**Rationale:**
- MCP requires stderr for logging (stdio transport)
- Simple console-based logger sufficient
- Winston in dependencies but not actively used
- Reduces bundle size
- Simpler to reason about

**Consequences:**
- Less features than Winston (no file rotation, etc.)
- Manual log level implementation
- Good enough for MCP server use case

**Status:** ✅ Approved with note: Consider Winston for webhook server

---

## TDR-011: Package Manager

**Decision:** NPM (standard)

**Rationale:**
- Widest compatibility
- No additional tooling required
- Works with all Node.js versions

**Consequences:**
- Slower than pnpm/yarn
- node_modules bloat
- Industry standard

**Status:** ✅ Approved

---

## TDR-012: Module System

**Decision:** ES Modules (type: "module")

**Rationale:**
- Modern JavaScript standard
- Better tree-shaking
- Native async/await
- Future-proof

**Consequences:**
- File extensions required (.js for imports)
- Some older packages may not support ESM
- Better long-term choice

**Status:** ✅ Approved

---

## TDR-013: Authentication Storage

**Decision:** In-memory token cache with expiry

**Rationale:**
- No persistent storage of credentials
- Token refresh handled automatically
- Secure by default
- Good performance

**Implementation:**
```typescript
private accessToken?: string;
private tokenExpiry?: Date;

private async ensureAuthenticated(): Promise<void> {
  if (!this.accessToken || !this.tokenExpiry || this.tokenExpiry < new Date()) {
    await this.authenticate();
  }
}
```

**Status:** ✅ Approved

---

## TDR-014: CLI Framework

**Decision:** Commander.js

**Rationale:**
- Industry standard for Node.js CLI
- TypeScript definitions available
- Simple API for arguments and options
- Built-in help generation
- Battle-tested

**Status:** ✅ Approved

---

## Pending Decisions

### TDR-015: Circuit Breaker Pattern
**Status:** Under Consideration
- Should we implement circuit breaker for failing providers?
- Libraries: opossum, cockatiel
- Prevents cascading failures

### TDR-016: Metrics Collection
**Status:** Under Consideration
- Prometheus vs CloudWatch vs DataDog?
- Should be pluggable

### TDR-017: Caching Strategy
**Status:** Under Consideration
- In-memory vs Redis?
- Exchange rates, provider configs

---

*Technical decisions reviewed and approved by Elder KenyaClaw*
