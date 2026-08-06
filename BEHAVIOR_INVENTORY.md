# BEHAVIOR INVENTORY — Shopee Purchase History Extractor

> **Purpose**: This document provides an exhaustive reference of the application's runtime behavior, architecture, data flow, security model, and error recovery mechanisms. Any future AI or human developer should read this file to gain a complete understanding of how the system functions.

---

## 1. System Architecture & Context Boundaries

Web extensions operate across isolated runtime environments. Understanding these execution contexts is essential for maintaining or extending this codebase:

```
+-----------------------------------------------------------------------------+
|                               PAGE CONTEXT                                  |
|  - Shares DOM & Window with Shopee React SPA                               |
|  - Executes `injectInterceptionScript()` code                               |
|  - Monkey-patches `window.fetch` and `XMLHttpRequest.prototype`             |
|  - Intercepts `/api/v4/order/get_all_order_and_checkout_list`               |
|  - Dispatches DOM `CustomEvent('shopeeDataCollected')` with `{ newData }`   |
+-----------------------------------------------------------------------------+
                                     |
                          CustomEvent ('shopeeDataCollected')
                                     v
+-----------------------------------------------------------------------------+
|                              CONTENT SCRIPT                                 |
|  - Execution Environment: `content.js` (Isolated World)                    |
|  - Manages UI Overlay (`#shopee-extension-container`)                      |
|  - Listens for `shopeeDataCollected` events                                 |
|  - Aggregates page responses in `allOrderData`                              |
|  - Normalizes legacy vs modern Shopee JSON payload schemas                  |
|  - Triggers linear fast auto-scrolling (`behavior: 'auto'`)                 |
|  - Converts structured orders into CSV & formatted JSON downloads           |
+-----------------------------------------------------------------------------+
                                     |
                            chrome.storage.local
                                     v
+-----------------------------------------------------------------------------+
|                           POPUP EXTENSION UI                                |
|  - Environment: `popup.html` + `popup.js`                                   |
|  - Displays cached purchase stats, search filtering, and item lists         |
+-----------------------------------------------------------------------------+
```

---

## 2. Component-by-Component Behavior

### 2.1. `manifest.json`
* **Manifest Version**: 3
* **Extension ID**: `shopee-order-extractor@extension` (Gecko/Firefox compatible).
* **Content Scripts**: Injects `content.js` at `document_idle` on `*://shopee.com.my/*` and `*://*.shopee.com.my/*`.
* **Permissions**: `activeTab`, `storage`, and host permissions for `shopee.com.my`.

---

### 2.2. Page Interception Script (`injectInterceptionScript()` in `content.js`)
* **Execution**: Injected via a temporary `<script>` tag into `document.head` / `document.documentElement` during initialization.
* **Mechanism**:
  1. Overrides `window.fetch`: Clones any response matching `/api/v4/order/get_all_order_and_checkout_list`, parses JSON, extracts page `offset` parameter, and stores unique pages in `window.shopeeCollectedData`.
  2. Overrides `XMLHttpRequest.prototype.open` & `.send`: Attaches a `load` listener to capture identical XHR requests.
  3. Dispatches DOM Event:
     ```javascript
     window.dispatchEvent(new CustomEvent('shopeeDataCollected', {
       detail: { offset, totalPages: window.shopeeCollectedData.length, newData: data }
     }));
     ```
* **Why Interception is Mandatory**: Shopee enforces server-side anti-bot security (`403 Forbidden` / `error: 90309999`). Direct extension-initiated `fetch()` calls lack dynamic signatures (`x-sap-ri`, `x-sap-sec`, `af-ac-enc-dat`). Intercepting native browser calls reuses Shopee’s authenticated request pipeline.

---

### 2.3. Event Receiver & Data Pipeline (`content.js`)
* **Event Listener**: Listens for `shopeeDataCollected` on `window`.
* **Deduplication**: Uses `collectedPages` (a `Set`) keyed by URL `offset` to avoid duplicate pages.
* **Storage**: Appends unparsed page response JSON to global `allOrderData` array and populates `window.currentCollectedData`.
* **Live UI Triggers**: Automatically updates UI progress status and re-calculates the order summary table via `window.liveUpdateSummary(allOrderData, false)`.

---

### 2.4. Data Schema Normalizer & Parsers

Shopee backend responses exist in two primary schema formats. All parsers (`convertToCSV` and `updateSummary`) execute standard fallback logic:

#### Payload Schema Mapping Rules:
1. **Legacy Format**:
   - Array location: `pageData.data.order_data.details_list` or `pageData.data.details_list`
   - Order fields: Directly attached to the item object.
2. **Modern Format (Current)**:
   - Array location: `pageData.new_data.order_or_checkout_data`
   - Order fields: Nested inside `item.order_list_detail`.

#### Normalization Logic:
```javascript
let orders = pageData.data?.order_data?.details_list 
          || pageData.new_data?.order_data?.details_list 
          || pageData.data?.details_list 
          || pageData.new_data?.details_list;

if (!orders) {
  const wrappers = pageData.data?.order_or_checkout_data || pageData.new_data?.order_or_checkout_data;
  if (wrappers && Array.isArray(wrappers)) {
    orders = wrappers.map(w => w.order_list_detail).filter(Boolean);
  }
}
```

#### Field Extraction Specs:
* **Order ID**: `order.info_card.order_id`
* **Status**: `order.status.list_view_status_label.text`
* **Subtotal**: `order.info_card.subtotal / 100000` (Shopee stores currency as integer x 100,000)
* **Final Total**: `order.info_card.final_total / 100000`
* **Order Date**:
  - Primary: `order.shipping.tracking_info.ctime * 1000` (Unix timestamp)
  - Fallback: Parsed from first 10-13 digits of `order_id` string.
* **Items Breakdown**: `order.info_card.order_list_cards[].product_info.item_groups[].items[]`
  - Item Name: `item.name`
  - Variant: `item.model_name`
  - Quantity: `item.amount`
  - Item Price: `item.item_price / 100000`
  - Item Total: `item.order_price / 100000`

---

### 2.5. UI Overlay Container (`addFetchButton()`)
* **Container ID**: `#shopee-extension-container`
* **Position**: Fixed `top: 80px`, `right: 20px`, `z-index: 10000`.
* **Elements**:
  - `actionButton`: **⚡ Auto-Collect Orders**
  - `progressDiv`: `#shopee-progress-status` (Displays live counts & warning state)
  - `summaryContainer`: `#shopee-summary` (Dark green table with Total Orders, Total Items, Total Amount)
  - `downloadButton`: `#shopee-download-btn` (Triggers CSV & raw JSON download)

---

### 2.6. Fast Auto-Scroll Collector Mode
* **Trigger**: User clicks **⚡ Auto-Collect Orders**.
* **Behavior**:
  1. Issues instant scrolling calls: `window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' })`.
  2. Executes on a fast **650ms tick interval**.
  3. Triggers native page rendering which causes Shopee to issue authenticated pagination requests.
  4. Interceptors catch responses in real-time, updating `allOrderData` and the UI summary.
* **Termination Conditions**:
  - `scrollAttempts >= 150` (Safety maximum).
  - Scroll position saturation: `currentScrollPos === lastScrollPos` while at document bottom.
  - No new data increment after 5 consecutive scroll ticks (`noNewDataCounter >= 5`).

---

## 3. SPA Navigation Handling
Shopee is a Single Page Application (SPA). To ensure the UI overlay persists accurately across tab switches:
* **URL Polling**: Checks `window.location.href` every 500ms.
* **DOM Observer**: Uses `MutationObserver` on `document.body` for container node additions.
* **History Overrides**: Intercepts `history.pushState`, `history.replaceState`, `popstate`, and `hashchange`.
* **Visibility Check**: Re-initializes UI overlay if on `/user/purchase` and removes it when navigating away.

---

## 4. Troubleshooting & Guidance for AI Assistants
1. **Never use active extension `fetch()` calls** to Shopee API endpoints. They will fail with 403 due to missing `x-sap-ri` signatures.
2. **If total amounts/counts display 0**, check if Shopee changed the root key under `new_data` or `data` in the raw JSON file exported by the download button. Update `convertToCSV` and `updateSummary` normalizer functions accordingly.
3. **If interceptor doesn't fire**, verify that `injectInterceptionScript()` is appended directly to `document.head` or `document.documentElement` early enough during page load.
