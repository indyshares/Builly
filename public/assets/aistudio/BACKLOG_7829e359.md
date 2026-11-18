# BACKLOG.md — Product and Engineering Backlog

## 1. Backlog conventions

- **P0:** required for the production baseline.
- **P1:** important follow-on capability.
- **P2:** future expansion.
- Estimates are intentionally omitted until technical spikes and acceptance criteria are reviewed.
- Dependencies are listed to prevent parallel work that creates rework.
- Each epic should be split into small, independently testable tasks before implementation.

## 2. Delivery sequence

| Wave | Focus | Exit condition |
|---|---|---|
| W0 | Discovery and technical validation | Engine, OAuth, hosting and storage decisions validated |
| W1 | Platform foundation | Authenticated multi-tenant skeleton deployed |
| W2 | Google Workspace | Auto and existing storage workflows pass |
| W3 | Builder core | Editor can create, edit, save and reload project documents |
| W4 | Advanced builder | Responsive, code editing and reusable components pass |
| W5 | Dynamic data | Collections resolve from Sheets at build time |
| W6 | Publishing | Versioned builds, activation and rollback pass |
| W7 | Public runtime | Public site and cache work without Sheets reads |
| W8 | Production hardening | Security, reliability, recovery and release checks pass |

## 3. W0 — Discovery and technical spikes

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-001 | P0 | Validate GrapesJS license, current release, plugin ecosystem and production suitability | None | Engine decision record |
| BL-002 | P0 | Build GrapesJS proof of concept with custom editor shell | BL-001 | POC demonstrating nested drag/drop, style editing, save/load |
| BL-003 | P0 | Validate custom HTML/CSS/JS execution isolation model | None | Threat model and security POC |
| BL-004 | P0 | Validate Google OAuth scopes, refresh-token flow and consent verification | None | OAuth decision record |
| BL-005 | P0 | Benchmark Drive file reads and public artifact delivery | None | Storage/delivery benchmark |
| BL-006 | P0 | Decide public hostname and tenant isolation model | BL-003 | Domain/origin architecture decision |
| BL-007 | P0 | Define page document, element and build manifest schemas | BL-001, BL-002 | Versioned schema specifications |
| BL-008 | P0 | Define Google Sheets tabs, collection model and Drive folder layout | None | Storage specification |
| BL-009 | P0 | Define Save/Publish/Update state machine and failure behavior | None | Publishing state model |

## 4. W1 — Platform foundation

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-010 | P0 | Create TypeScript monorepo and shared package conventions | W0 | Buildable repository |
| BL-011 | P0 | Configure Cloudflare Workers and static frontend deployment | BL-010 | Staging deployment |
| BL-012 | P0 | Configure Supabase Auth Google provider | BL-010 | Login/logout flow |
| BL-013 | P0 | Create platform metadata schema and migrations | BL-010 | Database migrations |
| BL-014 | P0 | Implement RLS and tenant ownership tests | BL-013 | Security-tested policies |
| BL-015 | P0 | Implement authenticated API middleware and request IDs | BL-011, BL-012 | API foundation |
| BL-016 | P0 | Implement server-side secret and token encryption strategy | BL-011 | Credential service |
| BL-017 | P0 | Add structured logging, error taxonomy and monitoring hooks | BL-015 | Operational baseline |

## 5. W2 — Google Workspace integration

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-018 | P0 | Implement separate Google Workspace OAuth authorization | BL-004, BL-016 | Connect/reconnect flow |
| BL-019 | P0 | Implement token refresh, revocation and invalid-grant handling | BL-018 | Token lifecycle service |
| BL-020 | P0 | Implement Google Picker integration | BL-018 | Existing resource selection |
| BL-021 | P0 | Implement idempotent Drive folder provisioning | BL-018 | Auto Setup folders |
| BL-022 | P0 | Implement Spreadsheet provisioning and schema tabs | BL-008, BL-018 | Auto Setup spreadsheet |
| BL-023 | P0 | Implement existing Sheet/Folder validation | BL-020, BL-022 | Storage validation |
| BL-024 | P0 | Create Drive manifest and file registry | BL-021 | Recoverable file index |
| BL-025 | P0 | Implement media upload/list/delete operations | BL-021 | Media library API |
| BL-026 | P0 | Add quota-aware batching, retries and idempotency | BL-021, BL-022 | Resilient Google adapter |
| BL-027 | P0 | Add storage health checks and reconnect UX | BL-019, BL-023 | Storage status page |

## 6. W3 — Builder core

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-028 | P0 | Integrate selected builder engine behind an adapter | BL-001, BL-002 | Builder adapter |
| BL-029 | P0 | Build custom editor shell and toolbar | BL-028 | Editor layout |
| BL-030 | P0 | Implement categorized element/block library | BL-028 | Element panel |
| BL-031 | P0 | Implement Navigator/layers panel | BL-028 | Element tree UI |
| BL-032 | P0 | Implement selection and property panel framework | BL-028 | Property controls |
| BL-033 | P0 | Implement core layout elements and nested containers | BL-028, BL-030 | Container/flex/grid |
| BL-034 | P0 | Implement text, image, button, link and media elements | BL-030, BL-025 | Basic elements |
| BL-035 | P0 | Implement move, reorder, duplicate, copy/paste, hide and lock | BL-031, BL-033 | Element operations |
| BL-036 | P0 | Implement undo/redo and bounded history | BL-028 | History controls |
| BL-037 | P0 | Implement page project save/load adapter to Drive | BL-024, BL-028 | Durable page documents |
| BL-038 | P0 | Implement revision checks and conflict detection | BL-037 | Concurrent edit protection |
| BL-039 | P0 | Implement page manager and multi-page navigation | BL-037 | Site pages |

## 7. W4 — Advanced builder

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-040 | P0 | Implement responsive device manager and breakpoint overrides | BL-033 | Responsive editor |
| BL-041 | P0 | Implement global design tokens and reusable styles | BL-032 | Global style system |
| BL-042 | P0 | Implement custom HTML element and validation | BL-034 | HTML editing |
| BL-043 | P0 | Integrate Monaco/CodeMirror for CSS and JS editing | BL-003, BL-042 | Code editor |
| BL-044 | P0 | Implement element/page/site CSS scopes | BL-043 | Scoped CSS |
| BL-045 | P0 | Implement custom JavaScript storage and isolated runtime contract | BL-003, BL-043, BL-006 | Secure JS execution |
| BL-046 | P0 | Implement reusable component save/insert/update behavior | BL-035, BL-037 | My Components |
| BL-047 | P0 | Implement accessibility and keyboard alternatives for editor operations | BL-029, BL-035 | Accessible editor controls |

## 8. W5 — Dynamic data and collections

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-048 | P0 | Define collection and field schema | BL-008 | Collection schema |
| BL-049 | P0 | Implement collection CRUD backed by Sheets | BL-022, BL-048 | Data manager |
| BL-050 | P0 | Implement field type validation and stable record IDs | BL-049 | Data integrity |
| BL-051 | P0 | Implement dynamic text/image/link bindings | BL-034, BL-049 | Dynamic elements |
| BL-052 | P0 | Implement repeater and collection grid components | BL-051 | Repeated content |
| BL-053 | P0 | Implement filtering/sorting/item limit resolution at build time | BL-052 | Build-time query resolver |
| BL-054 | P0 | Implement Drive asset reference resolution | BL-025, BL-051 | Asset resolver |
| BL-055 | P0 | Implement missing-field and missing-asset preflight validation | BL-053, BL-054 | Publish diagnostics |

## 9. W6 — Themes, templates and publishing

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-056 | P0 | Implement theme registry and version contracts | BL-041 | Theme system |
| BL-057 | P0 | Implement theme/template catalog and previews | BL-056 | Theme library |
| BL-058 | P0 | Implement page/section template import and compatibility checks | BL-046, BL-056 | Template workflow |
| BL-059 | P0 | Define build manifest and immutable artifact layout | BL-007, BL-009 | Build contract |
| BL-060 | P0 | Implement build orchestrator and job state | BL-059 | Build service |
| BL-061 | P0 | Implement data resolver and HTML/CSS/JS compiler | BL-053, BL-054, BL-060 | Static build |
| BL-062 | P0 | Implement artifact upload to Drive and integrity verification | BL-024, BL-061 | Versioned build storage |
| BL-063 | P0 | Implement atomic active-version pointer switch | BL-013, BL-062 | Safe activation |
| BL-064 | P0 | Implement Save/Publish/Update/Unpublish workflows | BL-037, BL-060, BL-063 | Publishing UX |
| BL-065 | P0 | Implement build failure recovery and rollback | BL-063, BL-064 | Release recovery |

## 10. W7 — Public runtime and cache

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-066 | P0 | Implement public hostname and tenant route resolution | BL-006, BL-063 | Public routing |
| BL-067 | P0 | Implement public artifact loader with no Sheets dependency | BL-062, BL-066 | Public runtime |
| BL-068 | P0 | Implement public media delivery strategy | BL-005, BL-054 | Media delivery |
| BL-069 | P0 | Implement version-aware cache keys and cache policies | BL-067 | Edge cache |
| BL-070 | P0 | Implement cache invalidation on Update/Unpublish/Rollback | BL-064, BL-069 | Revalidation |
| BL-071 | P0 | Implement SEO, sitemap, robots and social metadata | BL-061, BL-067 | Search/social metadata |
| BL-072 | P0 | Implement custom domain verification and routing | BL-066 | Custom domains |

## 11. W8 — Production hardening

| ID | Priority | Task | Dependencies | Deliverable |
|---|---|---|---|---|
| BL-073 | P0 | Run cross-tenant authorization and RLS penetration tests | BL-014, BL-066 | Security report |
| BL-074 | P0 | Test custom-code sandbox escape and origin isolation | BL-045, BL-066 | Security sign-off |
| BL-075 | P0 | Run Google quota, retry and token revocation tests | BL-019, BL-026 | Integration test report |
| BL-076 | P0 | Run build interruption, rollback and cache consistency tests | BL-064, BL-070 | Publishing reliability report |
| BL-077 | P0 | Run responsive, accessibility and browser compatibility tests | BL-040, BL-047 | UX QA report |
| BL-078 | P0 | Implement export, account deletion and retention workflows | BL-008, BL-024, BL-064 | Data lifecycle |
| BL-079 | P0 | Add alerts, dashboards and incident runbooks | BL-017, BL-060 | Operations readiness |
| BL-080 | P0 | Perform production load and performance testing | All core workstreams | Performance report |
| BL-081 | P0 | Complete release checklist and production deployment | BL-073–BL-080 | Production release |

## 12. P1 / P2 expansion backlog

| ID | Priority | Task |
|---|---|---|
| BL-082 | P1 | Real-time collaborative editing |
| BL-083 | P1 | Advanced animation/timeline editor |
| BL-084 | P1 | Third-party widget/plugin marketplace |
| BL-085 | P1 | Built-in analytics dashboard |
| BL-086 | P1 | Advanced collection relations and query capabilities |
| BL-087 | P1 | Scheduled publishing |
| BL-088 | P1 | Additional public delivery replication options |
| BL-089 | P2 | AI-assisted page generation |
| BL-090 | P2 | AI-assisted design suggestions |
| BL-091 | P2 | Template marketplace and creator submissions |

## 13. Definition of Done

A backlog item is Done only when:
- Acceptance criteria are met.
- TypeScript types and validation are updated.
- Relevant unit/integration/e2e tests pass.
- Authorization and tenant ownership are tested where relevant.
- Error, loading and empty states are handled.
- Logs do not expose secrets or private user data.
- Documentation and schema versions are updated.
- Changes are reviewed and deployed to the expected environment.
