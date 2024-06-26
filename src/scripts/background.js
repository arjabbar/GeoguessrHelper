const GEOGUESSR_ORIGIN = 'https://www.geoguessr.com/';

const HTML_FORMATTING_INSTRUCTIONS = `Also your answer should use html to call out important parts of the response. For instance, if you are claiming that the location is in a specific region in a city, then go ahead and bold those parts of your response using the <b> HTML tags.
  This is optional, so only include the html tags if you are certain it will add clarity for the user. Only use html tags like <b> and <i> and <br /> to add clarity to your response.`;

/**
 * Retrieves the vision response from the OpenAI API.
 * 
 * @param {string} dataUrl - The URL of the image to analyze.
 * @returns {Promise<void>} - A promise that resolves when the response is received.
 * 
 * @typedef {Object} VisionResponse
 * @property {string} id - The ID of the chat completion.
 * @property {string} object - The type of object, which is "chat.completion".
 * @property {number} created - The timestamp of when the response was created.
 * @property {string} model - The model used for the completion.
 * @property {Object} usage - The token usage statistics.
 * @property {number} usage.prompt_tokens - The number of tokens used in the prompt.
 * @property {number} usage.completion_tokens - The number of tokens used in the completion.
 * @property {number} usage.total_tokens - The total number of tokens used.
 * @property {Object[]} choices - The choices made by the model.
 * @property {Object} choices.message - The message generated by the model.
 * @property {string} choices.message.role - The role of the message, which can be "assistant" or "user".
 * @property {string} choices.message.content - The content of the message.
 * @property {string} choices.finish_reason - The reason for finishing the completion.
 * @property {number} choices.index - The index of the choice.
 */
async function getVisionResponse(dataUrl, shortAnswer) {
  const { apiKey, maxTokens } = await chrome.storage.local.get(['apiKey', 'maxTokens']);

  const gptPrompt = shortAnswer ? `You are a master Geoguessr expert. I will send you a screenshot and I want you to concisely respond with where you think the locations could be.
  Give me your three best guesses, ranked from most confident to least confident. If you have absolutely no confidence in the answer, say so, but still give it your best shot.
  Keep responses super concise. No need to give insight into your answer, what led you to it, tips or advice, or anything else. Just where you think the location is.
  If there is a quiz on the screen, just give it your best guess answer. Please, be as concise as possible. The user doesn't like to waste time and needs an answer immediately. ${HTML_FORMATTING_INSTRUCTIONS}` : `You are a helpful Geoguessr Coach. You are casual, a little stern and short, but always polite and respectful. You will help me find out where I am by analyzing the image.
  If there are any signs or landmarks, please let me know how you use those to indicate where we are so I can become better at Geoguessr myself.
  If there are questions in the screenshot provided by the user, please help answer those as well. If you do not have enough information to answer the question, please let me know, but take a best guess at it anyway.
  Include only things that are relevant to the location in the image, and please be as specific and concise as possible.
  If you're answering a quiz question be even more concise. No need to wish me well, or ask how I'm doing, or anything like that. Just get to the point.
  ${HTML_FORMATTING_INSTRUCTIONS}
  Thank you!`;

  const abortController = new AbortController();
  // Abort the request after 20 seconds
  setTimeout(() => abortController.abort(), 30000);

  const requestBody = JSON.stringify({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: gptPrompt
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: "Help me with this on Goeguessr please! Please respond in html format as if I'm going to render the output into a <div> tag." + (shortAnswer ? " I need a short answer." : "")
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
              detail: "auto"
            }
          }
        ]
      },

    ],
    max_tokens: maxTokens || 300
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: requestBody,
    signal: abortController.signal
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("You have exceeded your API token limit. Please check your Open AI account to ensure you haven't hit your usage limits.");
    } else {
      throw new Error(`Failed to get vision API response: ${response.status} ${response.statusText}`);
    }
  }
  
  /** @type VisionResponse */
  const json = await response.json();

  console.info(json.usage.total_tokens, 'tokens used.');
  
  return json.choices[0].message.content;
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

      chrome.runtime.sendMessage({message: "captureResponseReceived", response});
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