# GEMINI.md — Instructions & Architecture Guide for AI Coding Assistants

This repository contains the **Shopee Purchase History Extractor** Firefox/Chrome web extension. 

When working on this codebase, any AI coding assistant **MUST** adhere strictly to the guidelines, architectural rules, and behavior specifications detailed below and in [`BEHAVIOR_INVENTORY.md`](file:///BEHAVIOR_INVENTORY.md).

---

## 1. Primary Directives & Architecture Rules

1. **NEVER use extension-context `fetch()` to call Shopee internal APIs**:
   - Shopee's API (`/api/v4/order/get_all_order_and_checkout_list`) requires dynamic dynamic signatures (`x-sap-ri`, `x-sap-sec`, `af-ac-enc-dat`) generated deep inside Shopee's client SDK.
   - Any extension-initiated fetch will be rejected with `HTTP 403 Forbidden` (`error: 90309999`).
   - **ALWAYS** rely on **Passive Context Interception** (`window.fetch` and `XMLHttpRequest` monkey-patching injected into page context) combined with fast linear page scrolling.

2. **Always support Dual-Schema Payload Normalization**:
   - Shopee periodically updates its backend JSON schemas.
   - Always map orders using the normalizer that handles both legacy `details_list` and modern `order_or_checkout_data[].order_list_detail`.
   - Refer to `convertToCSV` and `updateSummary` in `content.js` for standard normalizer patterns.

3. **Bridge Page Context and Isolated Content Script Context**:
   - `content.js` runs in an isolated extension world and cannot access variables directly on `window` from the page context.
   - All network interception data **MUST** be passed across context boundaries via `CustomEvent('shopeeDataCollected', { detail: { ..., newData } })`.

4. **Preserve Fast Auto-Scroll Rules**:
   - Auto-scroll **MUST** use `window.scrollTo({ top: documentHeight, behavior: 'auto' })` on a fast tick (650ms–750ms).
   - Never use slow smooth scrolling or long timeouts as it degrades user experience and stalls network requests.
   - Always retain termination checks for scroll position saturation (`currentScrollPos === lastScrollPos`) to prevent infinite scroll loops.

---

## 2. Key File Sitemap

- [`content.js`](file:///content.js): Main content script, network interceptor injector, data collector, UI overlay injector, CSV/JSON exporter, and auto-scroll engine.
- [`BEHAVIOR_INVENTORY.md`](file:///BEHAVIOR_INVENTORY.md): Complete technical blueprint of data structures, execution contexts, DOM selectors, event listeners, and API field mappings.
- [`CHANGELOG.md`](file:///CHANGELOG.md): Historical record of major bug fixes, anti-bot bypass strategies, and schema migrations.
- [`manifest.json`](file:///manifest.json): Extension configuration (Manifest V3) with Gecko extension ID and host permissions.
- [`popup.html`](file:///popup.html) & [`popup.js`](file:///popup.js): Extension popup UI for local history viewing and searching.

---

## 3. How to Debug & Verify Changes

1. **Verify UI & Capture**:
   - Open `about:debugging#/runtime/this-firefox` in Firefox.
   - Click **Reload** under "Shopee Purchase History Extractor".
   - Navigate to `https://shopee.com.my/user/purchase/`.
   - Click **⚡ Auto-Collect Orders**.
2. **Verify Order Parsing**:
   - Ensure the overlay summary box updates Total Orders, Total Items, and Total Amount correctly.
   - Click **Download CSV File** and verify both `.csv` and `.json` download cleanly.
