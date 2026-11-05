---
title: "Kokoro TTS Extension"
summary: "Read selected text or articles aloud using your own Kokoro-FastAPI service."
repository: "https://github.com/Fooftilly/kokoro-extension"
order: 2
license: "MIT"
tags: ["Browser extension", "Text to speech", "Chrome", "Firefox"]
highlights:
  - "Send selected text or article text to a configured TTS endpoint"
  - "Stream playback in an overlay or download audio"
  - "Mix voices and use an EPUB reading mode"
links:
  - label: "Chrome Web Store"
    url: "https://chromewebstore.google.com/detail/kokoro-tts-sender/befhghjhbjpjnbamdginljoiaafoclmf"
  - label: "Firefox Add-ons"
    url: "https://addons.mozilla.org/en-US/firefox/addon/kokoro-tts-sender/"
---

A browser extension for Chrome and Firefox that connects to a user-configured [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) service.

Speech generation requires a reachable endpoint. Text is sent to whichever server the user configures; check the [README and privacy notes](https://github.com/Fooftilly/kokoro-extension#readme) before using a remote host.
