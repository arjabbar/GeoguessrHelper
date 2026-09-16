const Elements = {
  statusContainer: document.getElementById('statusContainer'),
  status: document.getElementById('status'),
  screenshotPreview: document.getElementById('screenshot'),
  captureButton: document.getElementById('captureButton'),
  response: document.getElementById('response'),
  mapStatus: document.getElementById('mapStatus'),
  autoPlaceMarker: document.getElementById('autoPlaceMarker'),
  hotkey: document.getElementById('captureScreenHotkey')
};
const originalCaptureButtonText = captureButton.textContent;

function validateApiKey(key) {
    const apiKeyIsValid = key && key.length > 36 && key.startsWith('sk-');
    Elements.status.textContent = apiKeyIsValid ? 'Open AI API Key Enabled' : "Your API Key doesn't seem to be valid. Click the extension icon to set or update it.";
    
    // Remove the status colors explicitly. (Looping over classList and removing as
    // you go skips entries — classList is live — which left stale colors behind and
    // also stripped unrelated classes like text-sm.)
    Elements.statusContainer.classList.remove(
      'bg-green-100', 'bg-green-200', 'text-green-800',
      'bg-yellow-100', 'bg-yellow-200', 'text-yellow-800'
    );

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

/**
 * Renders the outcome of the guess-map marker placement as a one-line pill,
 * reusing the same green/yellow classes as the API key status.
 *
 * @param {{placed: boolean, reason?: string} | undefined} mapClick - Absent on
 *   messages from an older build, in which case the pill is cleared.
 */
function setMapClickStatus(mapClick) {
  Elements.mapStatus.classList.remove(
    'bg-green-200', 'text-green-800',
    'bg-yellow-200', 'text-yellow-800'
  );

  if (!mapClick) {
    Elements.mapStatus.textContent = '';
    return;
  }

  const text = mapClick.placed
    ? 'Marker placed on the guess map'
    : (mapClick.reason === 'no-map'
        ? 'No guess map found on this page'
        : `Marker not placed: ${mapClick.reason || 'unknown'}`);

  Elements.mapStatus.innerHTML = escapeHtml(text);
  Elements.mapStatus.classList.add(mapClick.placed ? 'bg-green-200' : 'bg-yellow-200');
  Elements.mapStatus.classList.add(mapClick.placed ? 'text-green-800' : 'text-yellow-800');
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

// Persist on change rather than reading the checkbox at capture time, because
// the service worker (hotkey path) has no DOM and reads the stored value.
Elements.autoPlaceMarker.addEventListener('change', function(event) {
  chrome.storage.local.set({autoPlaceMarker: event.target.checked});
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
    setMapClickStatus(undefined);
  }

  if (request.message === "captureResponseReceived") {
    setThinkingState(false);

    if (request.response) {
      setResponse(request.response);
    }

    if (request.error) {
      setResponse(`Failed to capture screenshot with error: ${request.error}`);
    }

    setMapClickStatus(request.mapClick);
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

  // Default on: an unset key leaves the checkbox checked.
  chrome.storage.local.get('autoPlaceMarker', function(data) {
    Elements.autoPlaceMarker.checked = data.autoPlaceMarker !== false;
  });
};