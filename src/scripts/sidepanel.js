const Elements = {
  statusContainer: document.getElementById('statusContainer'),
  status: document.getElementById('status'),
  screenshotPreview: document.getElementById('screenshot'),
  captureButton: document.getElementById('captureButton'),
  response: document.getElementById('response'),
  checkedRadioButton: document.querySelector('input[name="answerType"]:checked'),
  hotkey: document.getElementById('captureScreenHotkey')
};
const originalCaptureButtonText = captureButton.textContent;

function validateApiKey(key) {
    const apiKeyIsValid = key && key.length > 36 && key.startsWith('sk-');
    Elements.status.textContent = apiKeyIsValid ? 'Open AI API Key Enabled' : "Your API Key doesn't seem to be valid. Click the extension to update it.";
    
    Elements.statusContainer.classList.forEach(className => {
      if (className.startsWith('bg-') || className.startsWith('text-')) {
        Elements.statusContainer.classList.remove(className);
      }
    });

    Elements.statusContainer.classList.add(apiKeyIsValid ? 'bg-green-200' : 'bg-yellow-200');
    Elements.statusContainer.classList.add(apiKeyIsValid ? 'text-green-800' : 'text-yellow-800');
}

function setThinkingState(isThinking) {
  Elements.captureButton.disabled = isThinking;
  Elements.captureButton.textContent = isThinking ? 'Thinking...' : originalCaptureButtonText;
  if (isThinking) {
    Elements.screenshotPreview.classList.add('glowing-border');
  } else {
    Elements.screenshotPreview.classList.remove('glowing-border');
  }
}

function setResponse(response) {
  const words = response.split(' ');
  Elements.response.innerHTML = words.map((word, index) => `<span style="--index: ${index}">${word}</span>`).join(' ');
}

Elements.captureButton.addEventListener('click', function() {
  // Get the value of the checked radio button
  var value = Elements.checkedRadioButton.value;

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
    Elements.screenshotPreview.src = request.dataUrl;
  }

  if (request.message === "startThinking") {
    setThinkingState(true);
    setResponse('');
  }

  if (request.message === "captureResponseReceived") {
    setThinkingState(false);

    if (request.response) {
      setResponse(request.response);
    }

    if (request.error) {
      setResponse(`Failed to capture screenshot with error: ${request.error}`);
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
      Elements.hotkey.textContent = captureScreenCommand.shortcut;
    }
  });
  
  chrome.storage.local.get('apiKey', function(data) {
    validateApiKey(data.apiKey);
  });
};