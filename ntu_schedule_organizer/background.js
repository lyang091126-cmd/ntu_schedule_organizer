// NTU Learn Schedule Organizer - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('[NTU Schedule Organizer] Extension installed successfully.');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SYNC_SCHEDULE_DATA') {
    // Save updated schedule data to storage
    chrome.storage.local.set({ 
      ntu_schedule_items: request.data,
      last_updated: new Date().toISOString()
    }, () => {
      // Update extension badge count for urgent items (< 3 days)
      const urgentCount = request.data.filter(item => {
        if (!item.due_at || item.completed) return false;
        const diffMs = new Date(item.due_at).getTime() - Date.now();
        return diffMs > 0 && diffMs <= 3 * 24 * 60 * 60 * 1000;
      }).length;

      if (urgentCount > 0) {
        chrome.action.setBadgeText({ text: urgentCount.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#FF3B30' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
      sendResponse({ status: 'success', count: request.data.length });
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'GET_SCHEDULE_DATA') {
    chrome.storage.local.get(['ntu_schedule_items', 'last_updated'], (result) => {
      sendResponse({
        items: result.ntu_schedule_items || [],
        lastUpdated: result.last_updated || null
      });
    });
    return true;
  }
});
