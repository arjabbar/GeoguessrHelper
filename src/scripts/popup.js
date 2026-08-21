console.log('popup.js');

// DOM elements
const apiKeyInput = document.getElementById('apiKey');
const savedKeyDisplay = document.getElementById('savedKeyDisplay');
const maskedKeySpan = document.getElementById('maskedKey');
const editKeyBtn = document.getElementById('editKeyBtn');
const clearKeyBtn = document.getElementById('clearKeyBtn');
const submitBtn = document.getElementById('submitBtn');
const apiKeyForm = document.getElementById('apiKeyForm');
const modelSelect = document.getElementById('modelSelect');

// State
let isEditMode = false;
let savedApiKey = null;

// Default available models
const availableModels = [
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra (Default)' },
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
  { id: 'gpt-5.5', name: 'GPT-5.5' },
  { id: 'gpt-5.4', name: 'GPT-5.4' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
  { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
  { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
  { id: 'gpt-4.1', name: 'GPT-4.1' }
];

const DEFAULT_MODEL = 'gpt-5.6-terra';

// Helper function to populate model dropdown
function populateModelDropdown(selectedModel = DEFAULT_MODEL) {
  // Clear existing options
  modelSelect.innerHTML = '';
  
  // Add models to dropdown
  availableModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name;
    modelSelect.appendChild(option);
  });
  
  // Set selected model, fallback to default. A previously saved model may have been
  // retired from the list, so write the fallback back to storage too.
  if (availableModels.find(m => m.id === selectedModel)) {
    modelSelect.value = selectedModel;
  } else {
    modelSelect.value = DEFAULT_MODEL;
    chrome.storage.local.set({ selectedModel: DEFAULT_MODEL });
  }
}

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
    submitBtn.textContent = 'Update Settings';
    submitBtn.classList.add('hidden');
  } else {
    // Show input, hide masked display
    savedKeyDisplay.classList.add('hidden');
    apiKeyInput.classList.remove('hidden');
    submitBtn.classList.remove('hidden');
    submitBtn.textContent = 'Save Settings';
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
  submitBtn.textContent = 'Update Settings';
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
    chrome.storage.local.remove(['apiKey', 'selectedModel'], function() {
      console.log('apiKey and model cleared');
      updateUIState(null);
    });
  }
});

// Save model selection when it changes
modelSelect.addEventListener('change', function() {
  const selectedModel = modelSelect.value;
  chrome.storage.local.set({ selectedModel: selectedModel }, function() {
    console.log('Model updated to:', selectedModel);
  });
});

apiKeyForm.addEventListener('submit', function(event) {
  console.log('apiKeyForm submitted');
  event.preventDefault();
  
  const apiKey = apiKeyInput.value.trim();
  const selectedModel = modelSelect.value;
  
  if (!apiKey) {
    alert('Please enter a valid API key');
    return;
  }
  
  // Basic validation for OpenAI API key format
  if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
    alert('Please enter a valid OpenAI API key (should start with "sk-")');
    return;
  }
  
  chrome.storage.local.set({
    apiKey: apiKey,
    selectedModel: selectedModel
  }, function() {
    console.log('apiKey and model saved', { apiKey: 'hidden', selectedModel });
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

// Load saved API key and model on popup open
chrome.storage.local.get(['apiKey', 'selectedModel'], function(data) {
  updateUIState(data.apiKey);
  
  // Set up models with saved selection or default
  populateModelDropdown(data.selectedModel || DEFAULT_MODEL);
});