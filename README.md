# Steam capture tools

Small, game-independent tools extracted from the 2K5Remade Steam Deck shadow
experiment. Uses Steam's **native continuous recorder**, not screenshot sampling.
No game patch, launcher, assets, AI, root install or external capture service.

## Requirements

Node.js 22+ on the controlling machine, Steam Game Recording, and an already
enabled Steam CEF debug endpoint. This tool does not enable debugging or expose
ports. Steam's private UI APIs can change; unsupported clients fail with an error.
The original workflow was exercised on Steam Deck on October 16, 2026. The
extracted CLI has offline regression tests; it has not yet been rerun live.

For an existing remote debug endpoint, forward it only to your own loopback:

```sh
ssh -N -L 127.0.0.1:18988:127.0.0.1:8080 deck@steamdeck.local
node capture.mjs record FULL_STEAM_GAME_ID 20 ./capture-recovery.json http://127.0.0.1:18988
```

Run the game first. Use the full numeric rungameid from its Steam shortcut,
not a hardcoded title ID. The endpoint provides control of Steam; never expose
it publicly. Close the SSH forward afterward.

The command refuses an existing enabled recording configuration, creates an
exclusive recovery receipt before mutation, temporarily enables on-demand
recording, records for 1–120 seconds, stops, and restores the prior mode. It
does not change FPS, audio, launcher, game files or saves. SIGINT/SIGTERM attempt
cleanup. A crash, killed process, network loss or changed client can still require:

```sh
node capture.mjs recover ./capture-recovery.json
```

Retained receipts mean cleanup needs attention. Do not delete one to bypass it.
Run only one controller per Steam client; other Steam recording actions during
capture are unsupported. The receipt prevents reusing its path, not multiple
controllers using different paths.

## Video output

Steam saves its native clips under its own recording directory. Prefer remuxing
a bounded segment of the corresponding `session.mpd` over exporting a long clip:

```sh
ffmpeg -n -i /path/to/session.mpd -t 20 -map 0:v:0 -an -c:v copy -movflags +faststart capture.mp4
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,avg_frame_rate,width,height -show_entries format=duration capture.mp4
```

Use the clip from your recording session; this tool does not guess or delete
recordings. This example deliberately removes audio. Stream-copy boundaries can
follow existing keyframes. Verify decoded frame count and duration; an FPS header
alone does not prove smooth capture. A 60 FPS recording does not imply every
animated effect or the game itself updates at 60 Hz.

## Tests and provenance

```sh
npm test
```

No dependencies. Tests cover lifecycle and failure cleanup offline. No live
recording or paid services run in CI.

Extracted from original recording work in `cosmokay1/2K5Remade`, branch
`codex/ray-traced-shadow-proof`, commit `4cea284`. Steam and its recording UI
belong to Valve; no Steam source, game data, keys or video is included. Original code is licensed under the MIT License; see LICENSE. This is experimental
unofficial tooling, not a supported Valve API.

Renderer inspection belongs in `cosmokay1/xboxrecomp` (commit `484a568`), and
application companion transport belongs in `cosmokay1/engine-sidecar`. Neither
is a dependency of this recorder.

## License and credit

Created by [Cosmo Kay](https://github.com/cosmokay1). Copyright (c) 2026 Cosmo Kay.
Licensed under the [MIT License](LICENSE). Preserve the copyright and permission
notice in copies or substantial portions. Community issues and pull requests
are welcome.
