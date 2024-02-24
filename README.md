# Geoguessr Helper

Geoguessr Helper is a Chrome extension that helps improve your Geoguessr skills and provides answers. It captures the current state of the game and sends the image to the OpenAI Vision API to get a response.

## Installation

- Visit the Chrome Web Store and install the extension [here](https://chromewebstore.google.com/detail/geoguessr-helper/kackikpmidpcjgikkbheojmmgjmepldg)

## Features

- Capture the current state of the game with a hotkey (default: Alt+Shift+C)
- Open a side panel to view the screenshot and the response from the OpenAI Vision API
- Save your OpenAI API key locally

## Getting Started

1. Clone this repository: `git clone https://github.com/yourusername/geoguessrhelper.git`
2. Navigate to the project directory: `cd geoguessrhelper`
3. Install the dependencies: `npm install`
4. Build the project: `npm run build`
5. Load the extension into Chrome:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable Developer mode (toggle switch in the top right)
   - Click "Load unpacked" and select the `geoguessrhelper` directory

## Usage

1. Open Geoguessr in a tab.
2. Press Alt+Shift+C to capture the current state of the game.
3. Open the side panel to view the screenshot and the response from the OpenAI Vision API.

## Warning

Using this extension may incur high costs (roughly $0.06 per screen capture). Please use it responsibly.

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[ISC](https://choosealicense.com/licenses/isc/)