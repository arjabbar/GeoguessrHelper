// Runs in the page's MAIN world on geoguessr.com (see manifest.json) at document_start.
//
// Geoguessr draws its guess map with the Google Maps JS API and places the guess marker
// from the map's `click` event. The map instance is never exposed, so we wrap the
// `google.maps.Map` constructor before the page constructs it and remember every
// instance. Background then calls `window.__geoguessrHelperPlaceGuess(lat, lng)`
// (via chrome.scripting in the MAIN world) to fire a synthetic click at the guessed
// coordinates, which Geoguessr handles exactly like a real click on the map.
(() => {
  if (window.__geoguessrHelperPlaceGuess) return;

  const mapInstances = new Set();
  let hooked = false;

  function hookMapConstructor(maps) {
    if (hooked || !maps || typeof maps.Map !== 'function') return;
    const OriginalMap = maps.Map;

    class HelperMap extends OriginalMap {
      constructor(...args) {
        super(...args);
        mapInstances.add(this);
      }
    }

    Object.defineProperty(maps, 'Map', {
      value: HelperMap,
      configurable: true,
      writable: true,
      enumerable: true
    });
    hooked = true;
    console.debug('[Geoguessr Helper] google.maps.Map hooked');
  }

  // Replace `obj[prop]` with an accessor so we're notified the moment the page (or the
  // Google Maps loader) assigns it. If it's already set, notify immediately.
  function watch(obj, prop, onSet) {
    if (obj[prop] !== undefined) {
      onSet(obj[prop]);
      return;
    }
    let value;
    Object.defineProperty(obj, prop, {
      configurable: true,
      enumerable: true,
      get() { return value; },
      set(v) {
        value = v;
        if (v !== undefined && v !== null) onSet(v);
      }
    });
  }

  try {
    watch(window, 'google', google =>
      watch(google, 'maps', maps =>
        watch(maps, 'Map', () => hookMapConstructor(maps))));
  } catch (error) {
    console.warn('[Geoguessr Helper] Could not install google.maps watcher', error);
  }

  // Belt and braces: if the accessor chain didn't fire (e.g. the loader defined the
  // properties in a way our setters didn't see), poll for the constructor instead.
  const poll = setInterval(() => {
    const maps = window.google?.maps;
    if (maps?.Map) {
      hookMapConstructor(maps);
      clearInterval(poll);
    }
  }, 250);

  function isVisible(map) {
    const div = typeof map.getDiv === 'function' ? map.getDiv() : null;
    return !!div && div.isConnected && div.offsetWidth > 0 && div.offsetHeight > 0;
  }

  // The most recently created, currently visible map is the guess map for the active
  // round (results screens create their own maps, which are gone by the next round).
  function pickGuessMap() {
    const instances = [...mapInstances];
    for (let i = instances.length - 1; i >= 0; i--) {
      if (isVisible(instances[i])) return instances[i];
    }
    return instances[instances.length - 1] || null;
  }

  window.__geoguessrHelperPlaceGuess = function (lat, lng) {
    const maps = window.google?.maps;
    if (!maps || !maps.event || !maps.LatLng) {
      return { ok: false, error: 'Google Maps is not loaded on this page yet.' };
    }
    if (!hooked || mapInstances.size === 0) {
      return { ok: false, error: 'No guess map found. Reload the Geoguessr tab and start a round.' };
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: 'The response did not include valid coordinates.' };
    }

    const map = pickGuessMap();
    if (!map) {
      return { ok: false, error: 'No guess map found on this page.' };
    }

    try {
      const latLng = new maps.LatLng(lat, lng);
      // Geoguessr's click handler reads `event.latLng` to place the guess marker.
      maps.event.trigger(map, 'click', {
        latLng,
        domEvent: new MouseEvent('click'),
        stop() {}
      });
      map.panTo(latLng);
      if (typeof map.getZoom === 'function' && (map.getZoom() ?? 0) < 6) {
        map.setZoom(6);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  };
})();
