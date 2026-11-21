# Voice lab

Three tests before building voice control into Mise.

## 1 and 2: on the tablet

1. Install Mise 0.9.1 or later in Decaid.
2. Open **Chrome** on the tablet (not Decaid) and go to `http://localhost:3000/lab/`.
3. Allow the microphone when Chrome asks.
4. **Hearing:** measure each noise and your voice. The table on the right shows how far your voice stands out.
5. **Words:** pick the situation and distance, read each phrase, and repeat under a few situations (quiet, grinder, steam).
6. **Your phrases:** say what each card describes the way you naturally would.
7. **Results:** download the file.

Chrome's speech recognition sends audio to Google, so the tablet needs internet.

## 3: Jev, on a computer

Needs Node 20+ and a TypeSafe API key.

```
export TYPESAFE_API_KEY=...        # from https://console.typesafe.ai/keys
node tools/voicelab/jev-eval.mjs --lab ~/Downloads/mise-voicelab-YYYY-MM-DD.json
```

`--limit 10` for a cheap first run, `--dry` to see a request without sending it.
The report lands in `voicelab-out/report.md`. Only the phrase text and your
recipe and coffee names are sent; no audio.
