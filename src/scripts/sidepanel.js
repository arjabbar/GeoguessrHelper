function validateApiKey(key) {
    const apiKeyIsValid = key && key.length > 36 && key.startsWith('sk-');
    var status = document.getElementById('status');
    status.textContent = apiKeyIsValid ? 'Open AI API Key Enabled' : "Your API Key doesn't seem to be valid. Click the extension to update it.";
    
    var statusContainer = document.getElementById('statusContainer');
    statusContainer.classList = apiKeyIsValid ? 'bg-green-200 text-green-800 p-3 mb-3 w-full' : 'bg-yellow-200 text-yellow-800 p-3 mb-3 w-full';
}

const captureButton = document.getElementById('captureButton');
let captureButtonContent = captureButton.textContent;

captureButton.addEventListener('click', function() {
  captureButton.disabled = true;
  captureButton.textContent = 'Thinking...';

  // Get the checked radio button
  var checkedRadioButton = document.querySelector('input[name="answerType"]:checked');

  // Get the value of the checked radio button
  var value = checkedRadioButton.value;

  // send a message to the backend that the user wants to capture the screen
  chrome.runtime.sendMessage({message: "captureScreen", shortAnswer: value === 'short'});
});

// When the local storage api key is updated, update the status
chrome.storage.onChanged.addListener(function(changes, namespace) {
  for (key in changes) {
    if (key === 'apiKey') {
      validateApiKey(changes[key].newValue);
    }
  }
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('sidepanel.js', request.message);
  
  if (request.message === "updateScreenshot") {
    document.getElementById('screenshot').src = request.dataUrl;
  }

  if (request.message === "captureResponseReceived") {
    captureButton.disabled = false;
    captureButton.textContent = captureButtonContent;

    if (request.response) {
      document.getElementById('response').textContent = request.response;
    }

    if (request.error) {
      document.getElementById('response').textContent = 'Failed to capture screenshot.';
    }
  }
});

window.onload = function() {
  // The side panel was opened, trigger your action here
  console.log("Side panel was opened");

  // Get the captureScreen hotkey and update the UI
  chrome.commands.getAll(function(commands) {
    const captureScreenCommand = commands.find(function(command) {
      return command.name === 'captureScreen';
    });

    if (captureScreenCommand) {
      document.getElementById('captureScreenHotkey').textContent = captureScreenCommand.shortcut;
    }
  });
  
  chrome.storage.local.get('apiKey', function(data) {
    validateApiKey(data.apiKey);
  });
};