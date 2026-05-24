# Gradio LTX Speech Runner

Chrome extension for a Gradio LTX audio-to-video/lip-sync page.

It keeps `[VISUAL]` and `[SOUND]` fixed, changes only `[SPEECH]`, uploads the matching audio file, starts generation, waits for a new MP4, downloads it, and continues to the next item.

## Install

1. Unzip this folder.
2. Open Chrome/Opera at `chrome://extensions`.
3. Enable Developer Mode.
4. Click **Load unpacked**.
5. Select this folder.
6. Open your Gradio LTX page.
7. Click the extension icon and choose **Open / Focus Panel**.

## Base prompt format

```txt
[VISUAL] A realistic woman talking directly to camera...
[SPEECH] {{speech}}
[SOUND] Clear female voice, studio quality, natural pacing, clean microphone, no background noise.
```

Only `{{speech}}` changes.

## Queue format

```txt
audio: voice-01.wav
speech: Hello everyone, welcome to this video.

audio: voice-02.wav
speech: Today I want to show you something important.
```

Audio filenames must exactly match the files you selected in the panel.

## Output

Downloads go to:

```txt
gradian-ltx or gradio-ltx/001_voice-01.mp4
```

Chrome may create the folder automatically in your default Downloads directory.
