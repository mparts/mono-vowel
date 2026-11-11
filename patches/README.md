# patches

Fixes to dependencies, applied by `patch-package` from the `postinstall` script on every `npm install`.

- `speechstate+2.15.0.patch` makes speechstate's `asr.js` send `LISTEN_COMPLETE` when recognition fails. After `RECOGNISED`, speechstate aborts the recognition. If Azure starts a new speech turn during that abort (the player keeps talking, or noise), the abort fails with "Another turn started before current completed" and fires `error` but no `end`. `asr.js` only listens to `onend` and `onabort`, so without the patch speechstate waits forever and the game freezes. Where an `end` does follow the `error`, the second `LISTEN_COMPLETE` arrives after the listener has stopped and is ignored.

The same fix, with the full story, is in [movie-assistant](https://github.com/mparts/movie-assistant/blob/master/docs/speechstate-asr-hang.md). speechstate 2.18.0 still has no `onerror` handler.

The patch is tied to speechstate 2.15.0. After an upgrade, `npm install` says so if it no longer applies: make the same edit in `node_modules/speechstate/dist/asr.js` and run `npx patch-package speechstate`. Drop the patch once speechstate handles `onerror` itself.
