# IndyShares Portfolio Builder

เอกสารชุดนี้เป็น Product & Engineering baseline สำหรับ IndyShares Portfolio Builder ซึ่งเป็น SaaS สำหรับสร้างเว็บไซต์ส่วนตัวด้วย Visual Page Builder แนว Elementor โดยใช้ Google Workspace ของผู้ใช้เป็นพื้นที่จัดเก็บข้อมูลต้นฉบับ

## เอกสารในชุดนี้

| File | Purpose |
|---|---|
| `TOR.md` | Terms of Reference: เป้าหมาย ขอบเขต หลักการ และกรอบการดำเนินโครงการ |
| `PRD.md` | Product Requirements Document |
| `USER_STORY_AND_EPIC.md` | Epics, user stories และ acceptance criteria |
| `BACKLOG.md` | ลำดับงานระดับ product/engineering พร้อม dependency และ Definition of Done |
| `requirements.txt` | Functional, non-functional และ technical requirements แบบมีรหัสอ้างอิง |
| `README.md` | ภาพรวมและแนวทางใช้เอกสาร |

## Product direction ที่ยืนยันแล้ว

- Product: Personal Portfolio Website Builder SaaS
- Editing experience: Freeform visual page builder, Elementor-inspired
- Builder engine candidate: GrapesJS, subject to a technical proof of concept and license/security review
- User-owned source storage:
  - Google Sheets: structured portfolio data and collection records
  - Google Drive: page-builder project documents, media, custom code source files, templates and versioned published artifacts
- Platform services:
  - Supabase Auth: identity and sessions
  - Supabase PostgreSQL: platform metadata, workspace registry, connection metadata, publication pointers and operational state
  - Cloudflare Workers: API, orchestration, publishing, public delivery and media services
  - Cloudflare cache: public delivery acceleration
- Publishing model:
  - Save = persist draft/source
  - Publish = first public release
  - Update = rebuild from latest saved source and Google data, then activate a new version
  - Public visitors do not query Google Sheets on normal page requests
- Multi-page websites, reusable components, dynamic collections and custom HTML/CSS/JavaScript are in the intended production scope.

## Important architecture clarification

“User-owned storage” means the canonical source data and user-authored website files live in the user's Google Workspace. The platform still needs minimal operational metadata in Supabase to authenticate users, resolve domains/slugs, locate Google files, manage encrypted OAuth credentials, and identify the active published version.

Published artifacts and caches may contain copies of public content. This must be disclosed in the privacy policy and controlled through publish, unpublish, retention and deletion workflows.

## How to use these documents

1. Treat `TOR.md` and `PRD.md` as the product baseline.
2. Treat `requirements.txt` as the traceable requirement register, not as a Python dependency file.
3. Use `USER_STORY_AND_EPIC.md` to define implementation slices and acceptance tests.
4. Use `BACKLOG.md` to plan delivery. Do not start all tasks at once.
5. Update all relevant documents when an architecture or product decision changes.

## Decisions still requiring validation

The following are intentionally not treated as fully settled implementation facts:

- GrapesJS version, plugin compatibility, commercial usage/licensing obligations and whether its component model fully supports the desired Elementor-like experience.
- Exact public-hostname strategy for tenant isolation and custom JavaScript.
- Google OAuth consent/verification requirements for the final scopes.
- Whether Google Drive can meet the required public delivery latency and availability without a durable delivery copy such as Cloudflare R2.
- Exact semantics of “Update”: this baseline defines it as publishing a new immutable build from the latest saved page documents and latest Google Sheets data.
- Whether custom JavaScript is enabled for every account tier or subject to plan/security restrictions.

## Status

Document baseline: Draft for architecture and product review. Not yet an implementation-ready API or database migration specification.
