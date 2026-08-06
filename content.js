// Shopee Purchase History Extractor - Content Script

let allOrderData = [];
let isCollecting = false;
let collectedPages = new Set();
let capturedHeaders = null;
let isCapturingHeaders = false;

// Inject interception code into the page context
function injectInterceptionScript() {
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      console.log('🚀 Injecting network interception into page context...');
      
      // Store collected data in window object for content script access
      window.shopeeCollectedData = window.shopeeCollectedData || [];
      window.shopeeCollectedPages = window.shopeeCollectedPages || new Set();
      
      // Store original methods
      const originalFetch = window.fetch;
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      // Intercept fetch requests
      window.fetch = function(...args) {
        const url = typeof args[0] === 'string' ? args[0] : args[0].url;
        
        return originalFetch.apply(this, args).then(response => {
          // Check if this is the order API we want
          if (url && url.includes('/api/v4/order/get_all_order_and_checkout_list')) {
            console.log('🎯 Intercepted order API via fetch:', url);
            
            // Clone response to avoid consuming it
            const clonedResponse = response.clone();
            clonedResponse.json().then(data => {
              console.log('📦 Fetch response data:', data);
              const detailsList = data?.data?.order_data?.details_list || data?.new_data?.order_data?.details_list || data?.data?.details_list || data?.new_data?.details_list;
              
              if (data && (detailsList || data.data || data.new_data)) {
                // Extract offset from URL to track pages
                const offsetMatch = url.match(/offset=(\\d+)/);
                const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;
                
                if (!window.shopeeCollectedPages.has(offset)) {
                  window.shopeeCollectedData.push(data);
                  window.shopeeCollectedPages.add(offset);
                  console.log('✅ Stored data for offset', offset, 'Total pages:', window.shopeeCollectedData.length);
                  
                  // Trigger custom event for content script
                  window.dispatchEvent(new CustomEvent('shopeeDataCollected', {
                    detail: { 
                      offset, 
                      totalPages: window.shopeeCollectedData.length,
                      newData: data
                    }
                  }));
                }
              }
            }).catch(err => {
              console.log('❌ Failed to parse fetch response:', err);
            });
          }
          
          return response;
        });
      };
      
      // Intercept XMLHttpRequest
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._interceptedUrl = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        const xhr = this;
        
        // Add load event listener
        xhr.addEventListener('load', function() {
          const url = xhr._interceptedUrl;
          if (url && url.includes('/api/v4/order/get_all_order_and_checkout_list')) {
            console.log('🎯 Intercepted order API via XHR:', url);
            
            try {
              const data = JSON.parse(xhr.responseText);
              console.log('📦 XHR response data:', data);
              
              const detailsList = data?.data?.order_data?.details_list || data?.new_data?.order_data?.details_list || data?.data?.details_list || data?.new_data?.details_list;
              
              if (data && (detailsList || data.data || data.new_data)) {
                // Extract offset from URL to track pages
                const offsetMatch = url.match(/offset=(\\d+)/);
                const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;
                
                if (!window.shopeeCollectedPages.has(offset)) {
                  window.shopeeCollectedData.push(data);
                  window.shopeeCollectedPages.add(offset);
                  console.log('✅ Stored XHR data for offset', offset, 'Total pages:', window.shopeeCollectedData.length);
                  
                  // Trigger custom event for content script
                  window.dispatchEvent(new CustomEvent('shopeeDataCollected', {
                    detail: { 
                      offset, 
                      totalPages: window.shopeeCollectedData.length,
                      newData: data
                    }
                  }));
                }
              }
            } catch (err) {
              console.log('❌ Failed to parse XHR response:', err);
            }
          }
        });
        
        return originalXHRSend.apply(this, args);
      };
      
      console.log('✅ Network interception setup complete in page context');
    })();
  `;
  
  // Inject at the very beginning of the document
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  
  console.log('🎯 Injected interception script into page');
}

// Listen for data collection events from injected script
window.addEventListener('shopeeDataCollected', (event) => {
  const { offset, totalPages, newData } = event.detail;
  console.log(`🎉 Content script received data collection event: offset ${offset}, total pages: ${totalPages}`);
  
  // Add new data to our tracking
  if (newData && !collectedPages.has(offset)) {
    allOrderData.push(newData);
    collectedPages.add(offset);
  }
  
  console.log(`📊 Current collection status: ${allOrderData.length} pages collected`);
  
  // Prepare data for download
  window.currentCollectedData = {
    total_pages: allOrderData.length,
    collected_at: new Date().toISOString(),
    collection_method: 'passive_interception',
    all_data: allOrderData
  };
  
  // Update UI if available
  if (window.liveUpdateSummary) {
    window.liveUpdateSummary(allOrderData, false);
    if (window.updateShopeeProgress) {
      window.updateShopeeProgress(`✅ Passively captured ${allOrderData.length} pages of orders! Keep scrolling for more, or download now.`, 'success');
    }
  }
});

// Function to download JSON data (kept for compatibility)
function downloadJSON(data, filename) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log('Downloaded JSON file:', filename);
  } catch (err) {
    console.error('Failed to download JSON:', err);
  }
}

// Function to convert data to CSV format (each row = one item)
function convertToCSV(data) {
  const csvRows = [];
  
  // CSV Headers
  const headers = [
    'Order ID',
    'Order Date',
    'Order Status',
    'Shop Name',
    'Shop ID',
    'Item Name',
    'Model/Variant',
    'Quantity',
    'Item Price (RM)',
    'Item Total (RM)',
    'Order Subtotal (RM)',
    'Order Final Total (RM)',
    'Item ID',
    'Tracking Info'
  ];
  csvRows.push(headers.join(','));
  
  data.all_data.forEach(pageData => {
    let orders = pageData.data?.order_data?.details_list || pageData.new_data?.order_data?.details_list || pageData.data?.details_list || pageData.new_data?.details_list;
    if (!orders) {
      const wrappers = pageData.data?.order_or_checkout_data || pageData.new_data?.order_or_checkout_data;
      if (wrappers && Array.isArray(wrappers)) {
        orders = wrappers.map(w => w.order_list_detail).filter(Boolean);
      }
    }
    
    if (orders && Array.isArray(orders)) {
      
      orders.forEach(order => {
        // Extract order-level information
        const orderId = order.info_card?.order_id || 'N/A';
        const orderStatus = order.status?.list_view_status_label?.text || 'N/A';
        const orderSubtotal = order.info_card?.subtotal ? (order.info_card.subtotal / 100000).toFixed(2) : '0.00';
        const orderFinalTotal = order.info_card?.final_total ? (order.info_card.final_total / 100000).toFixed(2) : '0.00';
        const trackingInfo = order.shipping?.tracking_info?.description || 'N/A';
        
        // Extract date from order ID or shipping info
        let orderDate = 'N/A';
        
        // Method 1: Try to extract from shipping tracking info timestamp
        if (order.shipping?.tracking_info?.ctime) {
          const timestamp = order.shipping.tracking_info.ctime * 1000; // Convert to milliseconds
          orderDate = new Date(timestamp).toISOString().split('T')[0];
        }
        // Method 2: Try to parse Shopee order ID (contains timestamp in first digits)
        else if (orderId && orderId !== 'N/A' && String(orderId).length >= 15) {
          try {
            // Shopee order IDs typically start with timestamp-like numbers
            // Take first 10-13 digits and try to parse as timestamp
            const orderIdStr = String(orderId);
            const timestampPart = orderIdStr.substring(0, 10); // First 10 digits
            const timestamp = parseInt(timestampPart) * 1000; // Convert to milliseconds
            
            // Validate if this gives us a reasonable date (between 2015-2030)
            const date = new Date(timestamp);
            const year = date.getFullYear();
            if (year >= 2015 && year <= 2030) {
              orderDate = date.toISOString().split('T')[0];
            }
          } catch (e) {
            // If parsing fails, try shorter timestamp
            try {
              const orderIdStr = String(orderId);
              const timestampPart = orderIdStr.substring(0, 13); // First 13 digits (milliseconds)
              const timestamp = parseInt(timestampPart);
              
              const date = new Date(timestamp);
              const year = date.getFullYear();
              if (year >= 2015 && year <= 2030) {
                orderDate = date.toISOString().split('T')[0];
              }
            } catch (e2) {
              // Keep as 'N/A' if all parsing fails
            }
          }
        }
        
        // Process items in this order
        if (order.info_card?.order_list_cards && Array.isArray(order.info_card.order_list_cards)) {
          order.info_card.order_list_cards.forEach(card => {
            const shopName = card.shop_info?.shop_name || 'N/A';
            const shopId = card.shop_info?.shop_id || 'N/A';
            
            if (card.product_info?.item_groups && Array.isArray(card.product_info.item_groups)) {
              card.product_info.item_groups.forEach(group => {
                if (group.items && Array.isArray(group.items)) {
                  group.items.forEach(item => {
                    // Extract item information
                    const itemName = item.name || 'N/A';
                    const modelName = item.model_name || 'N/A';
                    const quantity = item.amount || 1;
                    const itemPrice = item.item_price ? (item.item_price / 100000).toFixed(2) : '0.00';
                    const itemTotal = item.order_price ? (item.order_price / 100000).toFixed(2) : '0.00';
                    const itemId = item.item_id || 'N/A';
                    
                    // Escape CSV values (handle commas and quotes)
                    const escapeCSV = (value) => {
                      if (typeof value !== 'string') value = String(value);
                      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        return '"' + value.replace(/"/g, '""') + '"';
                      }
                      return value;
                    };
                    
                    // Create CSV row for this item
                    const row = [
                      escapeCSV(orderId),
                      escapeCSV(orderDate),
                      escapeCSV(orderStatus),
                      escapeCSV(shopName),
                      escapeCSV(shopId),
                      escapeCSV(itemName),
                      escapeCSV(modelName),
                      quantity,
                      itemPrice,
                      itemTotal,
                      orderSubtotal,
                      orderFinalTotal,
                      escapeCSV(itemId),
                      escapeCSV(trackingInfo)
                    ];
                    
                    csvRows.push(row.join(','));
                  });
                }
              });
            }
          });
        }
      });
    }
  });
  
  return csvRows.join('\n');
}

// Function to download CSV data
function downloadCSV(data, filename) {
  try {
    const csvContent = convertToCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log('Downloaded CSV file:', filename);
  } catch (err) {
    console.error('Failed to download CSV:', err);
  }
}

// Function to download text data
function downloadText(text, filename) {
  try {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log('Downloaded text file:', filename);
  } catch (err) {
    console.error('Failed to download text:', err);
  }
}

// Function to trigger data collection by scrolling (natural behavior)
async function collectAllOrderData() {
  if (isCollecting) {
    console.log('Already collecting data...');
    return;
  }
  
  isCollecting = true;
  allOrderData = [];
  collectedPages.clear();
  
  console.log('Starting natural data collection by slow scrolling...');
  
  let scrollAttempts = 0;
  const maxScrollAttempts = 100; // More attempts since we're going slower
  let noNewDataCounter = 0;
  const maxNoNewDataAttempts = 8; // More patient with slower loading
  
  try {
    while (scrollAttempts < maxScrollAttempts && noNewDataCounter < maxNoNewDataAttempts) {
      const currentDataCount = allOrderData.length;
      
      // Slow, natural scrolling behavior
      const currentScroll = window.pageYOffset;
      const documentHeight = document.body.scrollHeight;
      const viewportHeight = window.innerHeight;
      
      // Scroll gradually, not all the way to bottom at once
      const scrollStep = viewportHeight * 0.7; // Scroll about 70% of viewport
      const targetScroll = Math.min(currentScroll + scrollStep, documentHeight - viewportHeight);
      
      window.scrollTo({
        top: targetScroll,
        behavior: 'smooth'
      });
      
      console.log(`Natural scroll attempt ${scrollAttempts + 1}, scrolled to ${targetScroll}, pages collected: ${allOrderData.length}`);
      
      // Longer wait to mimic natural reading/browsing behavior
      const waitTime = 3000 + Math.random() * 2000; // 3-5 seconds
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Check if we got new data
      if (allOrderData.length === currentDataCount) {
        noNewDataCounter++;
        console.log(`No new data on attempt ${scrollAttempts + 1}, no-new-data counter: ${noNewDataCounter}`);
        
        // If no new data, try a small scroll back up and then down (natural user behavior)
        if (noNewDataCounter % 2 === 0) {
          window.scrollTo({
            top: Math.max(0, currentScroll - 200),
            behavior: 'smooth'
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
          window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } else {
        noNewDataCounter = 0; // Reset counter if we got new data
        console.log(`Got new data! Total pages now: ${allOrderData.length}`);
      }
      
      scrollAttempts++;
      
      // Occasionally scroll to very bottom to trigger end-of-list loading
      if (scrollAttempts % 10 === 0) {
        console.log('Checking if we can load more by scrolling to very bottom...');
        window.scrollTo({
          top: documentHeight,
          behavior: 'smooth'
        });
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    }
    
    // Download all collected data
    if (allOrderData.length > 0) {
      const combinedData = {
        total_pages: allOrderData.length,
        collected_at: new Date().toISOString(),
        collection_method: 'natural_scrolling',
        all_data: allOrderData
      };
      
      downloadJSON(combinedData, `shopee_all_orders_${Date.now()}.json`);
      console.log(`Successfully collected ${allOrderData.length} pages of order data via natural scrolling`);
    } else {
      console.log('No order data was collected. The page might not be loading data yet, or you might need to be logged in.');
    }
    
  } catch (error) {
    console.error('Error during data collection:', error);
  } finally {
    isCollecting = false;
  }
}


// Add single action button
function addFetchButton() {
  const container = document.createElement('div');
  container.id = 'shopee-extension-container'; // Add ID for detection
  container.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 10000;
    width: 320px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  // Single action button - black design
  const actionButton = document.createElement('button');
  actionButton.textContent = 'Fetch Orders';
  actionButton.style.cssText = `
    background: #2c2c2c;
    color: white;
    border: none;
    padding: 14px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    font-family: inherit;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transition: all 0.2s ease;
    white-space: nowrap;
    width: 100%;
    margin-bottom: 8px;
  `;
  
  // Progress status div
  const progressDiv = document.createElement('div');
  progressDiv.style.cssText = `
    background: rgba(44, 44, 44, 0.95);
    color: white;
    padding: 12px;
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    border: none;
    width: 100%;
    box-sizing: border-box;
    display: none;
    line-height: 1.4;
    margin-bottom: 8px;
  `;
  progressDiv.id = 'shopee-progress-status';
  
  // Summary table container - Dark Green Theme
  const summaryContainer = document.createElement('div');
  summaryContainer.style.cssText = `
    background: linear-gradient(135deg, #1a2f1a 0%, #0f1f0f 100%);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
    border: none;
    overflow: hidden;
    display: none;
    margin-bottom: 8px;
  `;
  summaryContainer.id = 'shopee-summary';
  
  // Summary table
  const summaryTable = document.createElement('table');
  summaryTable.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: inherit;
  `;
  
  // Table header
  const tableHeader = document.createElement('thead');
  tableHeader.innerHTML = `
    <tr style="background: linear-gradient(135deg, #2d5a2d 0%, #1a4a1a 100%);">
      <th style="padding: 12px; text-align: left; font-weight: 600; color: #e8f5e8;">Summary</th>
      <th style="padding: 12px; text-align: right; font-weight: 600; color: #e8f5e8;">Count</th>
    </tr>
  `;
  
  // Table body
  const tableBody = document.createElement('tbody');
  tableBody.innerHTML = `
    <tr style="background: rgba(255,255,255,0.03);">
      <td style="padding: 10px 12px; color: #b8d4b8;">📦 Total Orders</td>
      <td style="padding: 10px 12px; text-align: right; font-weight: 500; color: #e8f5e8;" id="total-orders">-</td>
    </tr>
    <tr style="background: rgba(255,255,255,0.05);">
      <td style="padding: 10px 12px; color: #b8d4b8;">📋 Total Items</td>
      <td style="padding: 10px 12px; text-align: right; font-weight: 500; color: #e8f5e8;" id="total-items">-</td>
    </tr>
    <tr style="background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); position: relative;">
      <td style="padding: 10px 12px; color: white; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,0.3);">💰 Total Amount</td>
      <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: white; font-size: 14px; text-shadow: 0 1px 2px rgba(0,0,0,0.3);" id="total-amount">RM 0.00</td>
    </tr>
  `;
  
  summaryTable.appendChild(tableHeader);
  summaryTable.appendChild(tableBody);
  summaryContainer.appendChild(summaryTable);
  
  // Download button
  const downloadButton = document.createElement('button');
  downloadButton.textContent = '📊 Download CSV File';
  downloadButton.style.cssText = `
    background: #059669;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    width: 100%;
    transition: all 0.2s ease;
    display: none;
  `;
  downloadButton.id = 'shopee-download-btn';
  
  // Hover effects
  actionButton.addEventListener('mouseenter', () => {
    if (!actionButton.disabled) {
      actionButton.style.background = '#3c3c3c';
      actionButton.style.transform = 'translateY(-1px)';
      actionButton.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
    }
  });
  
  actionButton.addEventListener('mouseleave', () => {
    if (!actionButton.disabled) {
      actionButton.style.background = '#2c2c2c';
      actionButton.style.transform = 'translateY(0)';
      actionButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    }
  });
  
  downloadButton.addEventListener('mouseenter', () => {
    downloadButton.style.background = '#047857';
    downloadButton.style.transform = 'translateY(-1px)';
  });
  
  downloadButton.addEventListener('mouseleave', () => {
    downloadButton.style.background = '#059669';
    downloadButton.style.transform = 'translateY(0)';
  });
  
  // Store collected data for download
  let collectedOrderData = null;
  
  // Download button click handler
  downloadButton.onclick = () => {
    const dataToDownload = collectedOrderData || window.currentCollectedData;
    if (dataToDownload) {
      downloadCSV(dataToDownload, `shopee_orders_${Date.now()}.csv`);
      updateProgress('🎯 CSV file downloaded to your downloads folder!', 'success');
    } else {
      updateProgress('⚠️ No data available to download yet.', 'warning');
    }
  };
  
  // Function to calculate and update summary (with live updates)
  function updateSummary(allData, isLiveUpdate = false) {
    let totalOrders = 0;
    let totalItems = 0;
    let totalAmount = 0;
    
    allData.forEach(pageData => {
      let orders = pageData.data?.order_data?.details_list || pageData.new_data?.order_data?.details_list || pageData.data?.details_list || pageData.new_data?.details_list;
      if (!orders) {
        const wrappers = pageData.data?.order_or_checkout_data || pageData.new_data?.order_or_checkout_data;
        if (wrappers && Array.isArray(wrappers)) {
          orders = wrappers.map(w => w.order_list_detail).filter(Boolean);
        }
      }
      
      if (orders && Array.isArray(orders)) {
        totalOrders += orders.length;
        
        orders.forEach(order => {
          // Count items - correct structure: order.info_card.order_list_cards[].product_info.item_groups[].items[]
          if (order.info_card?.order_list_cards && Array.isArray(order.info_card.order_list_cards)) {
            order.info_card.order_list_cards.forEach(card => {
              if (card.product_info?.item_groups && Array.isArray(card.product_info.item_groups)) {
                card.product_info.item_groups.forEach(group => {
                  if (group.items && Array.isArray(group.items)) {
                    group.items.forEach(item => {
                      totalItems += item.amount || 1;
                    });
                  }
                });
              }
            });
          }
          
          // Add order total amount - final_total is under info_card
          if (order.info_card?.final_total) {
            totalAmount += order.info_card.final_total;
          }
        });
      }
    });
    
    // Update UI
    document.getElementById('total-orders').textContent = totalOrders.toLocaleString();
    document.getElementById('total-items').textContent = totalItems.toLocaleString();
    document.getElementById('total-amount').textContent = `RM ${(totalAmount / 100000).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Show summary table immediately when called
    summaryContainer.style.display = 'block';
    
    // Only show download button when complete
    if (!isLiveUpdate) {
      downloadButton.style.display = 'block';
    }
  }
  
  // Action button - Fast passive capture
  actionButton.textContent = '⚡ Auto-Collect Orders';
  
  actionButton.onclick = async () => {
    if (actionButton.disabled) return;
    
    actionButton.disabled = true;
    actionButton.style.background = '#1a1a1a';
    actionButton.style.cursor = 'not-allowed';
    actionButton.textContent = '⚡ Collecting...';
    
    updateProgress('🚀 Starting fast passive collection...', 'info');
    summaryContainer.style.display = 'block';
    
    try {
      let scrollAttempts = 0;
      const maxScrollAttempts = 150;
      let noNewDataCounter = 0;
      const maxNoNewDataAttempts = 5;
      let previousDataCount = typeof allOrderData !== 'undefined' ? allOrderData.length : 0;
      let lastScrollPos = -1;
      
      while (scrollAttempts < maxScrollAttempts && noNewDataCounter < maxNoNewDataAttempts) {
        const documentHeight = document.body.scrollHeight;
        const currentScrollPos = window.pageYOffset || document.documentElement.scrollTop;
        
        // Fast instant scroll to bottom
        window.scrollTo({ top: documentHeight, behavior: 'auto' });
        
        const currentCount = typeof allOrderData !== 'undefined' ? allOrderData.length : 0;
        updateProgress(`⚡ Fast Auto-Scrolling... (${currentCount} pages captured)`, 'info');
        
        // Live update summary table
        if (allOrderData && allOrderData.length > 0) {
          updateSummary(allOrderData, true);
        }
        
        // Check if scroll position is stuck at the bottom
        if (Math.ceil(currentScrollPos + window.innerHeight) >= documentHeight - 20 && currentScrollPos === lastScrollPos) {
          noNewDataCounter++;
        }
        lastScrollPos = currentScrollPos;
        
        // Fast scroll tick (650ms)
        await new Promise(resolve => setTimeout(resolve, 650));
        
        const newCount = typeof allOrderData !== 'undefined' ? allOrderData.length : 0;
        if (newCount === previousDataCount) {
          noNewDataCounter++;
        } else {
          noNewDataCounter = 0;
          previousDataCount = newCount;
        }
        scrollAttempts++;
      }
      
      if (allOrderData && allOrderData.length > 0) {
        actionButton.textContent = '✓ Complete!';
        actionButton.style.background = '#22c55e';
        updateProgress(`🎉 Collection complete! Captured ${allOrderData.length} pages of orders.`, 'success');
        updateSummary(allOrderData, false);
      } else {
        actionButton.textContent = '⚠️ No Data';
        actionButton.style.background = '#f59e0b';
        updateProgress('⚠️ No orders captured. Try scrolling down manually or refreshing.', 'warning');
      }
      
    } catch (error) {
      console.error('Error during auto collection:', error);
      actionButton.textContent = '✗ Error';
      actionButton.style.background = '#ef4444';
      updateProgress('❌ Error during collection.', 'error');
    }
    
    setTimeout(() => {
      actionButton.textContent = '⚡ Auto-Collect Orders';
      actionButton.style.background = '#2c2c2c';
      actionButton.style.cursor = 'pointer';
      actionButton.disabled = false;
    }, 4000);
  };
  
  // Helper function to update progress status
  function updateProgress(message, type = 'info') {
    progressDiv.style.display = 'block';
    progressDiv.innerHTML = message;
    
    // Color coding based on type
    switch(type) {
      case 'success':
        progressDiv.style.borderLeft = '4px solid #22c55e';
        break;
      case 'error':
        progressDiv.style.borderLeft = '4px solid #ef4444';
        break;
      case 'warning':
        progressDiv.style.borderLeft = '4px solid #f59e0b';
        break;
      default:
        progressDiv.style.borderLeft = '4px solid #3b82f6';
    }
  }
  
  // Helper function to hide progress
  function hideProgress() {
    progressDiv.style.display = 'none';
  }
  
  // Make functions globally available
  window.updateShopeeProgress = updateProgress;
  window.liveUpdateSummary = updateSummary;

  container.appendChild(actionButton);
  container.appendChild(progressDiv);
  container.appendChild(summaryContainer);
  container.appendChild(downloadButton);
  document.body.appendChild(container);
}

// Skip script injection due to CSP restrictions
console.log('🔧 Content script loaded, using direct fetch approach');

// Function to check if we're on the purchase history page
function isPurchaseHistoryPage() {
  return window.location.href.includes('/user/purchase');
}

// Function to initialize or remove extension based on current page
function handlePageChange() {
  if (isPurchaseHistoryPage()) {
    // Check if extension is already initialized
    if (!document.getElementById('shopee-extension-container')) {
      console.log('🔄 Purchase history page detected, initializing extension...');
      init();
    }
  } else {
    // Remove extension UI if we're not on purchase page
    const container = document.getElementById('shopee-extension-container');
    if (container) {
      console.log('🚫 Left purchase page, removing extension UI...');
      container.remove();
    }
  }
}

function init() {
  console.log('Shopee Purchase History Extractor loaded');
  console.log('Current URL:', window.location.href);
  console.log('Page title:', document.title);
  
  // Inject network interception script into page context
  try {
    injectInterceptionScript();
  } catch (err) {
    console.error('Failed to inject interception script:', err);
  }
  
  // Add the fetch button
  addFetchButton();
}

// More aggressive URL monitoring for SPAs
let currentUrl = window.location.href;
let urlCheckInterval;

// Function to start URL polling
function startUrlPolling() {
  // Clear any existing interval
  if (urlCheckInterval) {
    clearInterval(urlCheckInterval);
  }
  
  // Poll every 500ms for URL changes
  urlCheckInterval = setInterval(() => {
    if (currentUrl !== window.location.href) {
      const oldUrl = currentUrl;
      currentUrl = window.location.href;
      console.log('🔍 URL changed from:', oldUrl, 'to:', currentUrl);
      
      // Multiple checks with different delays to ensure page content is loaded
      setTimeout(handlePageChange, 500);
      setTimeout(handlePageChange, 1000);
      setTimeout(handlePageChange, 2000);
    }
  }, 500);
}

// Enhanced MutationObserver for DOM changes
const pageObserver = new MutationObserver((mutations) => {
  // Check for significant page changes
  let significantChange = false;
  
  mutations.forEach((mutation) => {
    // Look for changes that might indicate page navigation
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check for main content containers or navigation elements
          if (node.classList && (
            node.classList.contains('page-content') ||
            node.classList.contains('main-content') ||
            node.tagName === 'MAIN' ||
            node.id === 'main' ||
            (node.innerHTML && node.innerHTML.includes('purchase'))
          )) {
            significantChange = true;
          }
        }
      });
    }
  });
  
  if (significantChange) {
    console.log('📄 Significant page change detected');
    setTimeout(handlePageChange, 1000);
    setTimeout(handlePageChange, 2000);
  }
});

// Start observing with broader scope
if (document.body) {
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    attributeOldValue: false,
    characterData: false,
    characterDataOldValue: false
  });
}

// Listen for various navigation events
window.addEventListener('popstate', () => {
  console.log('🔙 Popstate event detected');
  setTimeout(handlePageChange, 500);
  setTimeout(handlePageChange, 1500);
});

// Listen for pushstate/replacestate (common in SPAs)
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(history, args);
  console.log('🔄 PushState detected');
  setTimeout(handlePageChange, 500);
  setTimeout(handlePageChange, 1500);
};

history.replaceState = function(...args) {
  originalReplaceState.apply(history, args);
  console.log('🔄 ReplaceState detected');
  setTimeout(handlePageChange, 500);
  setTimeout(handlePageChange, 1500);
};

// Listen for hashchange
window.addEventListener('hashchange', () => {
  console.log('🔗 Hash change detected');
  setTimeout(handlePageChange, 500);
});

// Start URL polling
startUrlPolling();

// Initial check and setup with multiple attempts
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    handlePageChange();
    setTimeout(handlePageChange, 1000);
    setTimeout(handlePageChange, 3000);
  });
} else {
  handlePageChange();
  setTimeout(handlePageChange, 1000);
  setTimeout(handlePageChange, 3000);
}

// Also check periodically in case we miss navigation
setInterval(() => {
  if (isPurchaseHistoryPage() && !document.getElementById('shopee-extension-container')) {
    console.log('🔄 Periodic check: Extension missing on purchase page, reinitializing...');
    handlePageChange();
  }
}, 5000); // Check every 5 seconds