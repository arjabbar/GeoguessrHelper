const Elements = {
  statusContainer: document.getElementById('statusContainer'),
  status: document.getElementById('status'),
  screenshotPreview: document.getElementById('screenshot'),
  captureButton: document.getElementById('captureButton'),
  response: document.getElementById('response'),
  hotkey: document.getElementById('captureScreenHotkey')
};
const originalCaptureButtonText = captureButton.textContent;

function validateApiKey(key) {
    const apiKeyIsValid = key && key.length > 36 && key.startsWith('sk-');
    Elements.status.textContent = apiKeyIsValid ? 'Open AI API Key Enabled' : "Your API Key doesn't seem to be valid. Click the extension icon to set or update it.";
    
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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderFromJson(obj) {
  const parts = [];

  if (obj.summary) {
    parts.push(`<p><i>${escapeHtml(obj.summary)}</i></p>`);
  }

  if (obj.is_quiz && obj.quiz_answer) {
    parts.push(`<p><b>Quiz answer:</b> ${escapeHtml(obj.quiz_answer)}</p>`);
  }

  if (Array.isArray(obj.guesses) && obj.guesses.length) {
    parts.push(`<ol>`);
    for (const g of obj.guesses) {
      const titleBits = [
        g.label ? `<b>${escapeHtml(g.label)}</b>` : '',
        g.region ? `, ${escapeHtml(g.region)}` : '',
        g.country ? `, ${escapeHtml(g.country)}` : ''
      ].join('');

      const conf = typeof g.confidence === 'number'
        ? ` <span style="opacity:.75">(${Math.round(g.confidence*100)}%)</span>` : '';

      parts.push(`<li>${titleBits}${conf}`);

      if (g.reasons?.length) {
        parts.push(`<div><u>Why:</u><ul>${g.reasons.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul></div>`);
      }
      if (g.clues?.length) {
        parts.push(`<div><u>Clues:</u> ${g.clues.map(escapeHtml).join('; ')}</div>`);
      }
      parts.push(`</li>`);
    }
    parts.push(`</ol>`);
  }

  if (obj.mode === 'coach' && obj.tips?.length) {
    parts.push(`<p><b>Tips:</b></p><ul>${obj.tips.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul>`);
  }

  return parts.join('\n');
}

function setResponse(response) {
  if (!response) { Elements.response.innerHTML = ''; return; }

  // If background returns JSON string, parse here.
  let obj = null;
  if (typeof response === 'string') {
    try { obj = JSON.parse(response); } catch { /* legacy / plain text */ }
  } else if (typeof response === 'object') {
    obj = response;
  }

  // Handle simple location response for "Just Answer" mode
  if (obj && obj.city && obj.region && obj.country && !obj.guesses) {
    const locationParts = [
      obj.city ? `<b>${escapeHtml(obj.city)}</b>` : '',
      obj.region ? `, ${escapeHtml(obj.region)}` : '',
      obj.country ? `, ${escapeHtml(obj.country)}` : ''
    ].join('');
    Elements.response.innerHTML = `<p>${locationParts}</p>`;
    return;
  }

  // Handle detailed response for "Explain Thoroughly" mode
  if (obj && obj.guesses) {
    Elements.response.innerHTML = renderFromJson(obj);
    return;
  }

  // Legacy: keep your per-word animation for plain text
  const words = String(response).split(' ');
  Elements.response.innerHTML = words.map((word, index) => `<span style="--index: ${index}">${escapeHtml(word)}</span>`).join(' ');
}

Elements.captureButton.addEventListener('click', function() {
  const checked = document.querySelector('input[name="answerType"]:checked');
  const value = checked ? checked.value : 'short';
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