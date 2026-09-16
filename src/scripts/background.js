const GEOGUESSR_ORIGIN = 'https://www.geoguessr.com/';

// Keep in sync with DEFAULT_MODEL in popup.js
const DEFAULT_MODEL = 'gpt-5.6-terra';

// The GPT-5 family are reasoning models; ask for a small amount of thinking so a
// capture stays fast. Older non-reasoning models reject the `reasoning` param.
function supportsReasoning(model) {
  return model.startsWith('gpt-5') || model.startsWith('o3') || model.startsWith('o4');
}



/**
 * Retrieves the vision response from the OpenAI API.
 * 
 * @param {string} dataUrl - The URL of the image to analyze.
 * @returns {Promise<void>} - A promise that resolves when the response is received.
 * 
 * @typedef {Object} VisionResponse - A Responses API (`/v1/responses`) response object.
 * @property {string} id - The ID of the response.
 * @property {string} object - The type of object, which is "response".
 * @property {number} created_at - The timestamp of when the response was created.
 * @property {string} model - The model used for the response.
 * @property {string} status - "completed", "incomplete", "failed", etc.
 * @property {Object} usage - The token usage statistics.
 * @property {number} usage.input_tokens - The number of tokens in the input.
 * @property {number} usage.output_tokens - The number of tokens in the output (includes reasoning tokens).
 * @property {number} usage.total_tokens - The total number of tokens used.
 * @property {Object[]} output - The output items. Reasoning models emit a "reasoning" item
 *   before the "message" item that holds the answer.
 * @property {string} output[].type - "message", "reasoning", etc.
 * @property {Object[]} [output[].content] - For "message" items, parts with `type: "output_text"` and `text`.
 * @property {string} [output_text] - Convenience concatenation of the output text, when present.
 */
async function getVisionResponse(dataUrl, shortAnswer) {
  const { apiKey, selectedModel } = await chrome.storage.local.get([
    'apiKey',
    'selectedModel'
  ]);

  const gptPrompt = shortAnswer
    ? `You are a master Geoguessr expert.
Return ONLY valid JSON that strictly conforms to the provided JSON Schema. Do not include Markdown or HTML.`
    : `You are a helpful Geoguessr Coach.
Return ONLY valid JSON that strictly conforms to the provided JSON Schema. Do not include Markdown or HTML.`;

  const abortController = new AbortController();
  // Abort the request after 60 seconds (reasoning models can take a while on images)
  setTimeout(() => abortController.abort(), 60000);

  // Different schema for short answers vs thorough answers
  const schema = shortAnswer ? {
    type: "object",
    additionalProperties: false,
    required: ["city", "region", "country"],
    properties: {
      city: { type: "string", description: "The most likely city name based on the screenshot" },
      region: { type: "string", description: "The region/state/province" },
      country: { type: "string", description: "The country" }
    }
  } : {
    type: "object",
    additionalProperties: false,
    required: ["mode", "summary", "is_quiz", "quiz_answer", "guesses", "tips"],
    properties: {
      // Pinned to "coach": this schema is only used for coach mode, and the side panel
      // only renders `tips` when mode === 'coach'.
      mode: { type: "string", enum: ["coach"] },
      summary: { type: "string", description: "1–2 line overall take." },
      is_quiz: { type: "boolean" },
      quiz_answer: { type: "string" },
      guesses: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "country", "region", "confidence", "reasons", "clues", "coordinates"],
          properties: {
            label:      { type: "string", description: "City/region/country or final guess label" },
            country:    { type: "string" },
            region:     { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reasons:    { type: "array", items: { type: "string" }, description: "Short bullets: why" },
            clues:      { type: "array", items: { type: "string" }, description: "Evidence spotted" },
            coordinates:{ type: "object", additionalProperties:false, required:["lat","lng"], properties:{
              lat:{type:"number"}, lng:{type:"number"}
            }}
          }
        }
      },
      tips: { type:"array", items:{ type:"string" }, description:"Coach mode: how to get better next time" }
    }
  };

  const userPrompt = shortAnswer
    ? "Look at this Geoguessr screenshot and identify the most likely location. Return the city, region, and country in the JSON format without any explanations or reasoning."
    : `Analyze the screenshot as a coach and reply as JSON only. No commentary.
Set "mode" to "coach". Give 2-3 ranked guesses, most likely first, each with the clues you
spotted (road markings, bollards, plates, signage/language, vegetation, architecture, sun
position, camera generation) and the reasoning that follows from them. If the screenshot
shows a quiz question, set "is_quiz" and answer it in "quiz_answer". Finish with 2-4
concrete "tips" the player can use to read scenes like this faster next time.`;

  const model = selectedModel || DEFAULT_MODEL;

  const requestBody = JSON.stringify({
    model,
    ...(supportsReasoning(model) ? { reasoning: { effort: 'low' } } : {}),
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: gptPrompt }]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: userPrompt
          },
          // dataUrl is already a data: URI (jpeg base64) from captureVisibleTab
          { type: 'input_image', image_url: dataUrl }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "geoguessr_response",
        description: shortAnswer ? "Simple city name response" : "Structured location guesses from a Geoguessr screenshot",
        schema: schema,
        strict: true
      }
    }
  });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: requestBody,
    signal: abortController.signal
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "You have exceeded your API token limit. Please check your Open AI account to ensure you haven't hit your usage limits."
      );
    } else {
      throw new Error(`Failed to get vision API response: ${response.status} ${response.statusText}`);
    }
  }

  const json = await response.json();

  // Usage fields differ slightly on Responses API but still include total tokens
  console.info(json?.usage?.total_tokens, 'tokens used.');

  // Prefer output_text helper; fall back to stitching the message items' text parts
  // (reasoning models put a "reasoning" item in output[] alongside the message).
  const text =
    json.output_text ??
    (Array.isArray(json.output)
      ? json.output
          .filter(m => m.type === 'message')
          .map(m => (m.content || []).map(c => c.text || '').join(''))
          .join('\n')
      : '');

  return text;
};

function isGeoguessr(url) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return GEOGUESSR_ORIGIN.startsWith(urlObj.origin);
  } catch (error) {
    console.error('Failed to parse URL', url, error);
    return false;
  }
}

/**
 * Pulls the top guess's coordinates out of the raw response text.
 *
 * Branches on the parsed object's shape the way the side panel's `setResponse`
 * does, rather than being told which mode produced it: coach responses carry the
 * coordinates on `guesses[0]`, short answers carry them at the top level.
 *
 * @param {string} responseText - The raw JSON text broadcast as `response`.
 * @returns {{lat: number, lng: number} | null} Null when the text is not JSON or
 *   has no usable coordinates.
 */
function extractTopCoordinates(responseText) {
  let obj;
  try {
    obj = JSON.parse(responseText);
  } catch {
    // Plain-text / legacy responses (including the "not a Geoguessr website"
    // string) are not an error here — they just have nothing to place.
    return null;
  }

  const coords = obj?.guesses?.[0]?.coordinates ?? obj?.coordinates;
  if (typeof coords?.lat === 'number' && typeof coords?.lng === 'number') {
    return { lat: coords.lat, lng: coords.lng };
  }
  return null;
}

/**
 * Runs inside the Geoguessr page's MAIN world, so it can reach `window.google`
 * and React's fiber internals.
 *
 * `chrome.scripting.executeScript` serializes this function, which drops every
 * closure — it must stay fully self-contained and take only the two numbers.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{placed: boolean, reason?: string}}
 */
function placeGuessInPage(lat, lng) {
  const node =
    document.querySelector('[class*="guess-map_canvas"]') ??
    document.querySelector('[class*="guess-map"]');
  if (!node) return { placed: false, reason: 'no-map' };

  const fiberKey = Object.keys(node).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return { placed: false, reason: 'no-fiber' };

  const isMap = value =>
    !!value &&
    typeof value === 'object' &&
    typeof value.panTo === 'function' &&
    typeof value.setCenter === 'function' &&
    (!window.google?.maps?.Map || value instanceof window.google.maps.Map);

  // Geoguessr hangs the map instance on a component a few levels above the
  // canvas node, so walk up the fiber's parent chain. The cap keeps a DOM change
  // from turning this into a long walk to the root on every capture.
  let map = null;
  let fiber = node[fiberKey];
  for (let hops = 0; fiber && hops < 25; hops++) {
    const props = fiber.memoizedProps;
    if (props) {
      if (isMap(props.map)) {
        map = props.map;
        break;
      }
      const candidate = Object.values(props).find(isMap);
      if (candidate) {
        map = candidate;
        break;
      }
    }
    fiber = fiber.return;
  }
  if (!map) return { placed: false, reason: 'no-handler' };

  if (!window.google?.maps?.LatLng) return { placed: false, reason: 'no-google-maps' };
  const latLng = new window.google.maps.LatLng(lat, lng);

  // Preferred path: the public Maps event API, which runs Geoguessr's own click
  // handler exactly as a real click on the map would.
  let clicked = false;
  try {
    window.google.maps.event.trigger(map, 'click', { latLng });
    clicked = true;
  } catch (error) {
    console.error('Geoguessr Helper: google.maps.event.trigger failed.', error);
  }

  // Fallback: call the minified handler Geoguessr attaches to the map directly.
  // It is the most brittle path (the name differs between game modes), so it
  // only runs when the public API did not work.
  if (!clicked) {
    try {
      map.__e3_?.click?.({ latLng });
      clicked = true;
    } catch (error) {
      console.error('Geoguessr Helper: direct map click handler failed.', error);
    }
  }

  if (!clicked) return { placed: false, reason: 'no-handler' };

  // Pan so the marker is actually on screen for the user to confirm.
  try {
    map.panTo(latLng);
  } catch (error) {
    console.error('Geoguessr Helper: failed to pan the map.', error);
  }

  return { placed: true };
}

/**
 * Injects `placeGuessInPage` into the game tab and normalizes the result.
 *
 * @param {number} tabId
 * @param {{lat: number, lng: number}} coords
 * @returns {Promise<{placed: boolean, reason?: string}>}
 */
async function placeGuess(tabId, { lat, lng }) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: placeGuessInPage,
    args: [lat, lng]
  });

  return results?.[0]?.result ?? { placed: false, reason: 'no-result' };
}

chrome.runtime.onMessage.addListener(async function(request, sender, sendResponse) {
  console.log('background.js', request.message);

  if (request.message === 'captureScreen') {
    try {
      chrome.runtime.sendMessage({message: "startThinking"});

      // Get the active tab's url and make sure that we're on the Geoguessr site
      const tab = (await chrome.tabs.query({active: true, currentWindow: true}))[0];
      if (!isGeoguessr(tab.url)) {
        chrome.runtime.sendMessage({message: "captureResponseReceived", response: "This is not a Geoguessr website. Please navigate to a Geoguessr website to use this extension."});
        return true;
      }

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {format: "jpeg", quality: 80});
      console.log(dataUrl);
      chrome.runtime.sendMessage({message: "updateScreenshot", dataUrl: dataUrl});
  
      // send this image to Open AI Vision API and log the response
      const response = await getVisionResponse(dataUrl, request.shortAnswer);

      console.log(response);

      // Placing the marker is best-effort: a Geoguessr DOM change or a missing
      // map must never hide the answer the user just paid for, so this step has
      // its own catch and only ever adds a status field to the broadcast.
      let mapClick;
      try {
        const coords = extractTopCoordinates(response);
        mapClick = coords
          ? await placeGuess(tab.id, coords)
          : {placed: false, reason: 'no-coordinates'};
      } catch (error) {
        console.error('Failed to place guess marker.', error);
        mapClick = {placed: false, reason: (error?.message || String(error))};
      }

      chrome.runtime.sendMessage({message: "captureResponseReceived", response, mapClick});
    } catch (error) {
      console.error('Failed to capture screenshot.', error);
      chrome.runtime.sendMessage({message: "captureResponseReceived", error: (error?.message || error)});
    }
  }

  return true;
});

// Add a hotkey to trigger something
chrome.commands.onCommand.addListener(function(command) {
  console.log('Command:', command);
  if (command === 'captureScreen') {
    chrome.runtime.sendMessage({message: "captureScreen"});
  }
});