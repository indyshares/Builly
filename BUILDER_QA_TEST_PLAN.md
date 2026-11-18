# Builly Visual Builder — QA Test Plan (`BUILDER_QA_TEST_PLAN.md`)

This test plan defines the formal QA test cases corresponding to the Builly Feature Inventory (`BUILDER_FEATURE_INVENTORY.md`).

---

## 1. Test Status Definition
- **PASS**: Verified successfully with automated test or manual execution.
- **FAIL**: Defect identified during inspection/testing.
- **BLOCKED**: Cannot test due to missing environment credentials or external service dependency.
- **NOT APPLICABLE**: Feature not configured for current deployment mode.

---

## 2. Test Cases

### A. Builder Workspace & Multi-Page Navigation
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| WRK-001 | Workspace Load | Browser local storage or mock state | Open application at `/builder` | Canvas loads default site with Home page (`/`) and navigation items. | PASS |
| WRK-002 | Page Creation | Active site loaded | Open Page Management -> Create Page -> Enter slug `case-studies` -> Submit | Page is created, appears in page list and navigation, and compiles valid route `/case-studies`. | PASS |
| WRK-003 | Page Deletion | Site has >= 2 pages | Select non-home page -> Click Delete -> Confirm | Page is removed from site and excluded from subsequent publish preflight. | PASS |
| WRK-004 | Undo / Redo | Canvas action performed | Modify element text -> Press Undo (Ctrl+Z) -> Press Redo (Ctrl+Y) | State rolls back and forth cleanly without crashing React hooks or losing selection state. | PASS |

### B. Visual Canvas & Freeform Layout Engine
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CNV-001 | Element Insertion | Selected container on canvas | Drag Heading from Element Library into Container | Heading is inserted as child of container, selected, and visible on canvas. | PASS |
| CNV-002 | Tree Nesting & Circular Move | Container tree available | Try moving parent container inside its own child node | Tree validation blocks circular move with clear error/rejection. | PASS |
| CNV-003 | Responsive Override | Selected element | Switch to Mobile breakpoint -> Change padding override | Mobile padding updates; Desktop padding remains unchanged. | PASS |

### C. Element Library
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ELM-001 | Navbar & Menu | Navbar inserted | Edit brand title, add nav links, toggle mobile drawer | Navbar renders brand, links, and responsive hamburger toggle correctly. | PASS |
| ELM-002 | Tabs & Accordion | Tabs or Accordion inserted | Click tab buttons or accordion triggers | Active tab panel toggles or accordion expands/collapses without JS error. | PASS |
| ELM-003 | HTML Embed Sandbox | HTML Embed element inserted | Add custom safe HTML and iframe embed | Renders inside sandboxed iframe with auto-resize postMessage support. | PASS |

### D. Property Inspector
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| PRPI-001 | Numeric Sizing Input | Element selected | Enter `320px` in width field -> Focus out -> Save -> Reload | Input displays `320px`, canvas updates, and value persists after reload. | PASS |
| PRPI-002 | Color & Theme Tokens | Element selected | Pick custom text color or semantic theme variable | Color applies correctly to element inline styles and CSS variables. | PASS |

### E. Themes & Design System
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| THM-001 | Theme Switching | Builder active | Select "Editorial Dark" or "Creative Studio" theme | Global design tokens, fonts, and background surfaces update instantly across all pages. | PASS |

### F. CMS Integration
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| CMS-001 | Public CMS Scrubbing | CMS content type with private fields (`publiclyExposed: false`) and draft records | Compile published snapshot (`buildPublishedRuntimeSnapshot`) | Private fields are stripped and draft records are filtered out from public JSON snapshot. | PASS |

### G. Forms & Unified Inbox
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| INB-001 | Form Submission & Idempotency | Public runtime site active | Submit contact form with required fields | Submission succeeds, creates Inbox submission with rate limiting and idempotency key. | PASS |

### H. Preview, Publish & Rollback
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| PUB-001 | Publish & Rollback | Site with multiple releases | Publish release v2 -> Roll back to release v1 | Active version switches to v1 while preserving owner Inbox submissions and form definitions. | PASS |

### I. Shared Runtime & Source Export
| Test ID | Feature / Workflow | Preconditions | Test Steps | Expected Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| SRT-001 | Shared Runtime Resolution | Site slug registered | Navigate to `/{site-slug}` | Loads immutable published runtime snapshot from Cloudflare worker or local release. | PASS |
| SRT-002 | On-Demand ZIP Export | Site loaded | Open Export Modal -> Click Download Source ZIP | Generates valid PKZIP `.zip` file containing multi-page HTML, modular CSS, JS, assets, and manifest. | PASS |
