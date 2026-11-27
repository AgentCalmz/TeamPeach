# PeachChat browser voice chat

Voice Chat is a hands-free, turn-based mode inside the existing PeachChat widget.

1. The visitor starts Voice Chat and grants microphone permission.
2. The browser speech-recognition service displays interim transcription while the visitor speaks.
3. When the browser finalises an utterance, PeachChat sends its text through the existing public or preview message endpoint. The current AI provider, owner credit check/charge, history rules and optional Premium conversation saving remain unchanged.
4. The browser speaks the AI reply automatically using the visitor's available speech-synthesis voices. If a matching Google voice is installed in the browser/device, PeachChat prefers it.
5. After the reply finishes, the browser resumes listening for the next turn.

Speech recognition and spoken output are handled by the visitor's browser/device. The recognition provider may process microphone audio to produce the transcript. PeachChat does not relay the audio through Render, and this mode does not provision Gemini Live sessions or require a new Google API key. The ordinary text request still uses the existing TeamPeach server and DeepSeek/credit workflow.

Voice recognition support varies by browser and device. Chrome/Edge generally expose the Web Speech recognition interface; other browsers/devices may not. The existing text chat and push-to-dictate button remain available when live recognition is unsupported or microphone permission is denied.
