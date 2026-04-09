# OpenCode Session Themes

Session-aware OpenCode theme switching driven by OpenCode's own TUI state.

This plugin does not touch `iTerm2` or any other terminal emulator. It changes the **OpenCode theme itself** based on the current session state, so the behavior works at the OpenCode layer instead of the terminal layer.

The GitHub repository still uses the older `opencode-iterm2-signals` name for now, but the plugin itself is now a pure OpenCode TUI plugin.

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
| `complete` | `everforest` |
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

Add the plugin to your OpenCode `tui.json`.

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
      "/absolute/path/to/opencode-session-themes/src/tui.js",
      {
        "defaultTheme": "opencode",
        "startedTheme": "tokyonight",
        "completeTheme": "everforest",
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

## Limitations

- This is a plugin-only solution, not an OpenCode core patch.
- Theme state is **derived locally** from shared session state and events.
- That means it avoids release-to-release patch maintenance, but it is not a new server-side theme state primitive inside OpenCode.

## License

MIT
