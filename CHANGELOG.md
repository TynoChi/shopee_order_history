# CHANGELOG — Shopee Purchase History Extractor

## [1.1.0] - 2026-08-07

### Added
- **Passive Context Interception**: Added network monkey-patching for `window.fetch` and `XMLHttpRequest.prototype.send` in page context to capture native browser requests.
- **Payload Schema Normalizer**: Added dual-schema parsing support for both legacy (`details_list`) and updated Shopee API schemas (`order_or_checkout_data[].order_list_detail`).
- **Custom Event Pipeline**: Configured `shopeeDataCollected` DOM event with `newData` in `detail` to bridge the page context script and content script isolated worlds.
- **Fast Auto-Collector Workflow**: Replaced flaky extension `fetch()` calls with a 650ms linear auto-scroll trigger (`window.scrollTo({ behavior: 'auto' })`) that fires native requests without getting blocked.
- **Dual Export**: Added automated raw JSON export alongside CSV export on download click.

### Changed
- **Anti-Bot Error Handling**: Deprecated active extension `fetch()` calls due to missing dynamic server signatures (`x-sap-ri`, `x-sap-sec`, `af-ac-enc-dat`) which caused HTTP 403 (`error: 90309999`).
- **UI Button Action**: Action button converted to `⚡ Auto-Collect Orders` for seamless one-click scrolling and real-time summary calculation.
- **Scroll Bounds Detection**: Improved scroll boundary detection (`currentScrollPos === lastScrollPos`) to terminate the auto-collector cleanly when reaching the bottom of the page.

### Fixed
- Fixed bug where intercepted network data wasn't being transferred to `allOrderData`, causing the UI summary and CSV exporter to display 0 orders and 0 items.
- Fixed CSV field mappings for order dates, prices (`final_total / 100000`), shop info, and nested product items.
