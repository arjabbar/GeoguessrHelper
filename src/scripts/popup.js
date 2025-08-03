console.log('popup.js');

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const savedKeyDisplay = document.getElementById('savedKeyDisplay');
const maskedKeySpan = document.getElementById('maskedKey');
const editKeyBtn = document.getElementById('editKeyBtn');
const clearKeyBtn = document.getElementById('clearKeyBtn');
const submitBtn = document.getElementById('submitBtn');
const apiKeyForm = document.getElementById('apiKeyForm');

// State
let isEditMode = false;
let savedApiKey = null;

// Helper function to mask API key
function maskApiKey(key) {
  if (!key || key.length < 14) return key;
  const start = key.substring(0, 10); // Show first 10 characters
  const end = key.substring(key.length - 4); // Show last 4 characters
  const middle = '*'.repeat(Math.max(0, key.length - 14)); // Mask the middle
  return start + middle + end;
}

// Helper function to update UI based on API key state
function updateUIState(apiKey) {
  savedApiKey = apiKey;
  
  if (apiKey) {
    // Show masked key display, hide input
    maskedKeySpan.textContent = maskApiKey(apiKey);
    savedKeyDisplay.classList.remove('hidden');
    apiKeyInput.classList.add('hidden');
    submitBtn.textContent = 'Update API Key';
    submitBtn.classList.add('hidden');
  } else {
    // Show input, hide masked display
    savedKeyDisplay.classList.add('hidden');
    apiKeyInput.classList.remove('hidden');
    submitBtn.classList.remove('hidden');
    submitBtn.textContent = 'Save API Key';
    apiKeyInput.value = '';
  }
  
  isEditMode = false;
}

// Helper function to enter edit mode
function enterEditMode() {
  isEditMode = true;
  savedKeyDisplay.classList.add('hidden');
  apiKeyInput.classList.remove('hidden');
  submitBtn.classList.remove('hidden');
  submitBtn.textContent = 'Update API Key';
  apiKeyInput.value = savedApiKey || '';
  apiKeyInput.focus();
  apiKeyInput.select();
}

// Event listeners
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

editKeyBtn.addEventListener('click', function() {
  enterEditMode();
});

clearKeyBtn.addEventListener('click', function() {
  if (confirm('Are you sure you want to clear your saved API key?')) {
    chrome.storage.local.remove('apiKey', function() {
      console.log('apiKey cleared');
      updateUIState(null);
    });
  }
});

apiKeyForm.addEventListener('submit', function(event) {
  console.log('apiKeyForm submitted');
  event.preventDefault();
  
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    alert('Please enter a valid API key');
    return;
  }
  
  // Basic validation for OpenAI API key format
  if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
    alert('Please enter a valid OpenAI API key (should start with "sk-")');
    return;
  }
  
  chrome.storage.local.set({apiKey: apiKey}, function() {
    console.log('apiKey saved');
    updateUIState(apiKey);
    
    // Show success message briefly
    const originalText = submitBtn.textContent;
    submitBtn.textContent = savedApiKey && !isEditMode ? 'Updated!' : 'Saved!';
    submitBtn.classList.add('bg-green-500');
    submitBtn.classList.remove('bg-blue-500');
    
    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.classList.remove('bg-green-500');
      submitBtn.classList.add('bg-blue-500');
    }, 1500);
  });
});

// Load saved API key on popup open
chrome.storage.local.get('apiKey', function(data) {
  updateUIState(data.apiKey);
});