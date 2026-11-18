# TOR.md — Terms of Reference

## 1. Project information

**Project name:** IndyShares Portfolio Builder  
**Project type:** Multi-tenant SaaS web application  
**Product category:** Personal website / portfolio visual builder  
**Document status:** Draft baseline for owner approval  
**Primary delivery approach:** Production-oriented phased implementation

## 2. Background

IndyShares intends to build a self-service platform that allows an individual to create, design, manage and publish a personal portfolio website without needing to write code for ordinary page-building tasks. The editing experience should be comparable in concept to WordPress with Elementor: users can place, nest, select, move, configure and style elements freely on a visual canvas.

Advanced users must also be able to work with custom HTML, CSS and JavaScript, subject to strict isolation and security controls.

A defining product characteristic is user-owned storage. Each user connects their own Google account and chooses either to let the platform provision Google Sheets and Google Drive resources or to select existing resources. Google Sheets stores structured data; Google Drive stores builder documents, media, code files and versioned build artifacts.

The public website must not fetch Google Sheets data on every visitor request. Users explicitly control when changes become public through Save, Publish and Update workflows. Publishing creates an immutable versioned build and activates it for public delivery through Cloudflare.

## 3. Project objectives

1. Deliver a professional freeform visual page builder with a familiar Elementor-like interaction model.
2. Support multi-page personal websites, reusable components and theme/template libraries.
3. Give users ownership and control of their source content and website files in their own Google Workspace.
4. Provide structured data management and dynamic data binding from Google Sheets.
5. Separate draft editing from public publishing.
6. Deliver fast public websites using prebuilt artifacts and Cloudflare edge caching.
7. Provide secure multi-tenant identity, authorization, Google OAuth token handling and custom-code isolation.
8. Establish an extensible architecture that can support future website-builder use cases beyond personal portfolios.

## 4. Scope

### 4.1 In scope

- Google sign-in through Supabase Auth.
- Separate Google Workspace authorization for Drive and Sheets APIs.
- Auto-provisioning or selection of existing Spreadsheet and Drive folders.
- Google Sheets schema and collection management.
- Google Drive media library and file management.
- Multi-page website management.
- Freeform visual editor with nested elements and containers.
- Element tree / navigator, selection, reorder, duplicate, delete, hide and lock.
- Content, style and advanced property panels.
- Responsive editing and preview across defined breakpoints.
- Global design tokens and reusable styles.
- Theme and template library.
- Reusable user components / saved blocks.
- Custom HTML, CSS and JavaScript editing.
- Dynamic data sources, fields, repeaters and collections.
- Save, Publish, Update, Unpublish and rollback.
- Versioned build artifacts and Cloudflare caching.
- SEO metadata and public URL routing.
- Export and recovery capabilities for user source data and website documents.
- Operational logging, error handling, monitoring and production QA.

### 4.2 Out of scope for the initial production release unless separately approved

- Full WordPress plugin ecosystem compatibility.
- Arbitrary server-side PHP execution.
- Arbitrary backend code execution by users.
- A marketplace with third-party paid plugins.
- Ecommerce checkout, payments or inventory management.
- Collaborative real-time multi-user editing of the same page.
- Unlimited custom domains before domain verification and certificate automation are designed.
- Guaranteed pixel-perfect import of arbitrary WordPress/Elementor websites.
- Guaranteed compatibility with every third-party JavaScript library.

## 5. Target users

- Developers and software engineers
- UI/UX and graphic designers
- Freelancers and consultants
- Photographers and visual creators
- Students and job seekers
- Writers and independent creators
- Professionals who need a personal brand website

## 6. Product principles

- Visual-first: common tasks should not require code.
- Freeform but constrained: allow flexible composition while maintaining responsive and accessible output.
- User-owned source: canonical content and authored source documents reside in the user's Google Workspace.
- Explicit publishing: saved changes do not silently alter the public website.
- Secure by default: user-authored code is untrusted and must be isolated.
- Recoverable: failed updates must not take down the last successful public version.
- Extensible: builder elements, data types, themes and templates use versioned contracts.
- Honest UX: show storage, save, publish and connection state clearly.

## 7. High-level solution

### 7.1 Platform layer

- Supabase Auth: identity and session management.
- Supabase PostgreSQL: minimal platform metadata, tenant registry, Google connection metadata, encrypted token references, workspace and site registry, active build pointer, operational jobs and audit metadata.
- Cloudflare Workers: authenticated API, Google API orchestration, build orchestration, public runtime, media delivery and cache control.
- Cloudflare static assets: application frontend.
- Cloudflare cache: public HTML and static asset delivery.

### 7.2 User storage layer

- Google Sheets: structured content and custom collection records.
- Google Drive: builder project documents, page documents, reusable component source documents, custom code files, media and versioned published artifacts.
- Google Picker: user selection of existing Google files and folders.

### 7.3 Builder layer

GrapesJS is the leading candidate for the page-builder engine. It must be validated through a proof of concept before being locked. The platform will provide a custom editor shell, custom components, custom property controls, dynamic data components, save/load adapters and a publishing compiler. Do not assume the default GrapesJS UI alone satisfies the product requirements.

## 8. Core workflows

1. Sign in.
2. Connect Google Workspace.
3. Choose Auto Setup or Existing Storage.
4. Create or connect a portfolio site.
5. Create pages and design them in the visual editor.
6. Manage structured content and media.
7. Bind page elements to Google Sheets collections.
8. Save drafts to Google Drive and Google Sheets.
9. Preview the saved draft.
10. Publish for the first time or Update an existing public release.
11. Serve public pages from immutable build artifacts and Cloudflare cache.
12. Unpublish or roll back when required.

## 9. Save and publishing definitions

- **Save:** persist the latest editor project/page documents and related structured draft data to the user's Google Workspace. It does not change the active public build.
- **Publish:** validate, resolve data, compile and create the first public release.
- **Update:** perform the same build process using the latest saved source and latest Google Sheets data, then atomically activate a new immutable build.
- **Unpublish:** disable public access while retaining source documents and, subject to retention policy, previous build history.
- **Rollback:** reactivate a previously successful build after verifying its dependencies and assets.

A failed build must leave the previous active version available.

## 10. Key deliverables

- Approved product and requirements baseline.
- System architecture and threat model.
- Google Workspace integration and storage schema.
- Page-builder proof of concept and selected engine decision.
- Visual editor and element system.
- Dynamic data binding and collection system.
- Publishing compiler and versioned artifact model.
- Public runtime and cache invalidation.
- Production security, QA, monitoring and deployment documentation.
- User-facing privacy, terms, storage and custom-code disclosures.

## 11. Constraints and assumptions

- Google API quotas, OAuth verification and token lifecycle affect reliability and onboarding.
- Google Drive is not a CDN and may have higher latency than purpose-built object storage.
- Cache is disposable and must never be the only copy of a build.
- The platform cannot guarantee availability of user-owned Google resources.
- Custom JavaScript can be malicious; isolation must be architectural, not based only on input filtering.
- Google Sheets is suitable for structured, moderate-volume user content, not high-volume transactional workloads.
- “Production from the start” means production-grade architecture and quality gates, not implementing all features in one unreviewed coding pass.

## 12. Success criteria

- A user can connect their Google account and complete storage setup without manual developer intervention.
- A user can create a multi-page site using freeform drag-and-drop editing.
- A user can save and reload their builder documents from their Google Drive.
- A user can bind supported elements to Google Sheets data.
- A user can publish and update without visitor requests querying Google Sheets.
- A failed update does not interrupt the previous published website.
- Public content is isolated by tenant and custom code cannot access platform secrets.
- Users can export or recover their source documents and data.
- Production monitoring can identify Google API, build, cache and public-runtime failures.

## 13. Governance and change control

Any change affecting storage ownership, editor engine, custom-code execution, publishing semantics, public hostname isolation, or canonical data model requires an architecture decision record (ADR) and updates to this TOR, PRD, requirements register and backlog.

## 14. Approval

This document is a working baseline. Product owner approval is required before implementation commitments are treated as final.
