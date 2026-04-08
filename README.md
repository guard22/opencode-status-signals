# OpenCode iTerm2 Signals

Ambient background colors for `OpenCode` sessions in `iTerm2`.

This plugin paints your current iTerm2 pane based on the moment your OpenCode session is in:

- `started` -> deep blue
- `complete` -> deep green
- `question` -> warm amber
- `permission` -> dark red
- `error` -> dark crimson

It is designed for the exact workflow where you want a passive, glanceable signal in the terminal itself instead of relying only on sounds or desktop notifications.

## Why this exists

When OpenCode is running in the background, the most useful signals are usually:

- it started working again
- it finished
- it asked you a question
- it is blocked on permission

`OpenCode iTerm2 Signals` maps those moments directly to terminal background colors, so you can tell the state of the session from peripheral vision.

## Default palette

| Event | Meaning | Default color |
| --- | --- | --- |
| `started` | OpenCode is actively working | `#13233A` |
| `complete` | The session went idle and is ready for review | `#143222` |
| `question` | OpenCode needs an answer from you | `#3A2A12` |
| `permission` | OpenCode is blocked on permission | `#3A1717` |
| `error` | OpenCode failed with a real error | `#3A101C` |

The defaults are intentionally dark, so the terminal stays readable for long sessions.

## How it works

The plugin listens to native OpenCode events and applies colors to the current `iTerm2` session through AppleScript:

- `session.status` with `busy` -> `started`
- `session.idle` -> `complete`
- `permission.asked` -> `permission`
- `session.error` -> `error`
- `tool.execute.before` for the `question` tool -> `question`

Subagent sessions are ignored so your top-level terminal pane does not flicker because of nested work.

User-cancelled sessions are also ignored for the `error` color, so hitting escape does not paint the pane like a failure.

## Requirements

- macOS
- iTerm2
- OpenCode running in iTerm2
- Node.js 18+

## Install with npx from GitHub

This repository is packaged so you can install it directly from GitHub without waiting for npm publication:

```bash
npx github:guard22/opencode-iterm2-signals install
```

That command will:

1. Copy the plugin into `~/.config/opencode/plugins/opencode-iterm2-signals.js`
2. Create a default config at `~/.config/opencode/opencode-iterm2-signals.json` if it does not already exist
3. Backfill any newly added default keys into an existing config without overwriting your colors

Restart OpenCode if it is already running.

## Install from npm

Once published, the shortest install path is:

```bash
npx opencode-iterm2-signals install
```

You can also install it globally first:

```bash
npm install -g opencode-iterm2-signals
opencode-iterm2-signals install
```

After installation, restart OpenCode if it is already running.

## Preview the palette

Cycle all four states on your current iTerm2 pane:

```bash
npx github:guard22/opencode-iterm2-signals preview all
```

Or preview a single state:

```bash
npx github:guard22/opencode-iterm2-signals preview question
```

There is also an explicit error preview:

```bash
npx github:guard22/opencode-iterm2-signals preview error
```

## Check your setup

```bash
npx github:guard22/opencode-iterm2-signals doctor
```

## Uninstall

```bash
npx github:guard22/opencode-iterm2-signals uninstall
```

This removes the installed plugin file and keeps your config JSON in place.

## Configuration

Config file:

```text
~/.config/opencode/opencode-iterm2-signals.json
```

Default config:

```json
{
  "enabled": true,
  "fallbackToCurrentSession": true,
  "colors": {
    "started": "#13233A",
    "complete": "#143222",
    "question": "#3A2A12",
    "permission": "#3A1717",
    "error": "#3A101C"
  }
}
```

### Options

- `enabled`: Master on/off switch.
- `fallbackToCurrentSession`: If the exact `ITERM_SESSION_ID` cannot be found, apply the color to the current iTerm2 session of the current window.
- `colors.started`: Background color for active work.
- `colors.complete`: Background color for finished work.
- `colors.question`: Background color when OpenCode needs an answer.
- `colors.permission`: Background color when OpenCode needs permission.
- `colors.error`: Background color when OpenCode hits an actual error.

## Manual install

If you prefer to clone the repository:

```bash
git clone https://github.com/guard22/opencode-iterm2-signals.git
cd opencode-iterm2-signals
node src/cli.js install
```

## Notes

- This plugin is intentionally focused on ambient color only.
- It changes the pane background, not your desktop wallpaper or macOS accent color.
- The last state remains visible until the next tracked event changes it.
- The plugin does nothing outside iTerm2 on macOS.

## Future-friendly package layout

This repository is structured as a normal npm package with a CLI entrypoint and a plugin export, so it can be published to npm later without changing the user-facing workflow.

It also includes `publishConfig.access=public` and is safe to validate with:

```bash
npm run package:check
```

## License

MIT
