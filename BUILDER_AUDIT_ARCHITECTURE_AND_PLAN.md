# Builly Architecture Map, Risks & Prioritized Audit Plan (`BUILDER_AUDIT_ARCHITECTURE_AND_PLAN.md`)

---

## 1. Architecture & Integration Map

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Builly Visual Builder                           │
│   (React SPA, Vite, Tailwind CSS, Freeform Canvas, Inspector, CMS)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       ▼                            ▼                            ▼
┌──────────────┐             ┌──────────────┐             ┌──────────────┐
│ Supabase Auth│             │ Google Drive │             │ Google Sheets│
│  (Identity & │             │  (Site JSON, │             │ (CMS Records │
│   Session)   │             │   Snapshots, │             │  & Unified   │
│              │             │    Assets)   │             │    Inbox)    │
└──────────────┘             └──────────────┘             └──────────────┘
                                    │
                                    ▼
                             ┌──────────────┐
                             │  Cloudflare  │
                             │  Shared      │
                             │   Runtime    │
                             │  (Edge D1 &  │
                             │   Renderer)  │
                             └──────────────┘
```

---

## 2. Identified Risks & Missing Test Infrastructure
1. **Live Google OAuth Credentials in Local Sandbox**: Live Google Workspace API calls (Drive folder creation, Google Picker, live Sheets sync) require browser-bound user OAuth tokens which cannot be fully automated headlessly without interactive login.
   - *Mitigation*: Robust in-memory mock fallback, offline demo mode, and rigorous unit testing of all client adapters and snapshot security scrubbers.
2. **Cloudflare D1 Worker Testing**: Cloudflare Workers bindings (`env.DB`, `env.ASSETS`) require Miniflare/Wrangler test environments.
   - *Mitigation*: TypeScript typechecking (`tsc --noEmit`) and service function isolation tested via Vitest.

---

## 3. Prioritized Implementation & Audit Plan
- **Phase 0 (Completed)**: Codebase inspection, feature inventory (`BUILDER_FEATURE_INVENTORY.md`), test plan (`BUILDER_QA_TEST_PLAN.md`), and architecture mapping.
- **Phase 1**: Automated test execution (`npx vitest run`, `tsc --noEmit`, `vite build`).
- **Phase 2**: Core persistence & security regression verification (snapshot scrubbing, secret protection, multi-page export).
- **Phase 3**: Final QA review and release recommendation report.
