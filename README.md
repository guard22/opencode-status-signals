# OpenCode Status Signals

Visual status signals for OpenCode sessions, powered by OpenCode's own TUI theme system.

![OpenCode Status Signals demo](https://raw.githubusercontent.com/guard22/opencode-status-signals/main/assets/opencode-status-signals-demo.gif)

This plugin does not touch `iTerm2` or any other terminal emulator. It changes the **OpenCode theme itself** based on the current session state, so the behavior works at the OpenCode layer instead of the terminal layer.

The repository name is `opencode-status-signals`, and the published package name is `@guard22/opencode-status-signals`.

## What it does

The plugin maps these states to themes:

- `default`
- `started`
- `complete`
- `question`
- `permission`
- `error`

By default it uses stable built-in OpenCode themes:

| State | Default theme |
| --- | --- |
| `default` | `opencode` |
| `started` | `tokyonight` |
| `complete` | `opencode` |
| `question` | `matrix` |
| `permission` | `orng` |
| `error` | `dracula` |

## Why this approach

This project started as a terminal-color experiment, but the correct long-term solution is to use OpenCode's own theme system.

That gives you:

- no terminal-specific hacks
- no AppleScript
- no dependency on `iTerm2`
- the same behavior in any terminal that can run OpenCode
- a cleaner mental model: **session state -> OpenCode theme**

## Interactive setup inside OpenCode

The plugin includes an in-app mapping flow, so you can configure themes directly inside OpenCode.

Commands:

- `/theme-states`
- `/theme-states-reset`

The main flow lets you:

1. pick a state
2. choose a built-in theme
3. preview it immediately
4. confirm or revert
5. save the mapping

Mappings are stored in the plugin KV store as local user preferences.

## How it works

The plugin listens to native OpenCode session events and derives the current theme from the active session view.

Signals used:

- `session.status`
- `session.idle`
- `permission.asked`
- `permission.replied`
- `question.asked`
- `question.replied`
- `question.rejected`
- `session.error`

Theme priority is:

1. `error`
2. `permission`
3. `question`
4. `started`
5. `complete`
6. `default`

## Install

### Recommended install

Use OpenCode's native plugin installer:

```bash
opencode plugin @guard22/opencode-status-signals@latest --global
```

That command will install the plugin and patch your global OpenCode TUI config automatically.

Then restart OpenCode and use `/theme-states` to customize it.

### GitHub fallback

```bash
curl -fsSL https://raw.githubusercontent.com/guard22/opencode-status-signals/main/install.sh | bash
```

That command will:

- download the plugin into `~/.config/opencode/plugins/opencode-status-signals.js`
- patch `~/.config/opencode/tui.json`
- install the default status-to-theme mapping automatically

Then restart OpenCode and use `/theme-states` to customize it.

### Manual install

If you want to manage the files yourself, copy `src/tui.js` into your OpenCode plugin directory and reference that file from `tui.json`.

Global config path:

```text
~/.config/opencode/tui.json
```

Example:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "theme": "opencode",
  "plugin": [
    [
      "~/.config/opencode/plugins/opencode-status-signals.js",
      {
        "defaultTheme": "opencode",
        "startedTheme": "tokyonight",
        "completeTheme": "opencode",
        "questionTheme": "matrix",
        "permissionTheme": "orng",
        "errorTheme": "dracula"
      }
    ]
  ]
}
```

Then restart OpenCode.

## Configuration options

Plugin options supported in `tui.json`:

- `defaultTheme`
- `startedTheme`
- `completeTheme`
- `questionTheme`
- `permissionTheme`
- `errorTheme`
- `pollMs`
- `debug`

The interactive `/theme-states` flow can override these defaults and save user mappings locally.

OpenCode's top-level `theme` in `tui.json` should usually match your plugin `defaultTheme`, otherwise the plugin will intentionally override the global theme whenever session state changes.

## Development

Validate the plugin locally:

```bash
npm run check
```

Dry-run the npm package contents:

```bash
npm run package:check
```

## Open Source

This is an open source project and contributions are very welcome.

If you want to help, the most useful things are:

- report bugs
- suggest UX or workflow improvements
- propose new session-state features
- submit fixes or cleanup PRs
- improve documentation

If you have an idea, found a bug, or want to add functionality, please open an issue or submit a pull request.

Even small improvements are helpful and make the project easier to maintain over time.

See `CONTRIBUTING.md` for the lightweight contribution guide.

## Limitations

- This is a plugin-only solution, not an OpenCode core patch.
- Theme state is **derived locally** from shared session state and events.
- That means it avoids release-to-release patch maintenance, but it is not a new server-side theme state primitive inside OpenCode.

## License

MIT
