console.log('popup.js');

document.getElementById('openSidePanel').addEventListener('click', function() {
  console.log('openSidePanel clicked');
  
  chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
    chrome.sidePanel.open({
      tabId: tabs[0]?.id,
    });

    // Close the popup
    window.close();
  });
});

document.getElementById('apiKeyForm').addEventListener('submit', function(event) {
  console.log('apiKeyForm');
  event.preventDefault();
  
  const apiKey = document.getElementById('apiKey').value;
  
  chrome.storage.local.set({apiKey: apiKey}, function() {
    console.log('apiKey saved');
    document.getElementById('apiKey').value = '';
  });
});