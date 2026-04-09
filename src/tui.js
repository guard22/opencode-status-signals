const SETTING_KEY = "guard22.session-themes.settings"

const DEFAULT_OPTIONS = Object.freeze({
  debug: false,
  pollMs: 250,
  defaultTheme: "opencode",
  startedTheme: "tokyonight",
  completeTheme: "everforest",
  questionTheme: "matrix",
  permissionTheme: "orng",
  errorTheme: "dracula"
})

const STATE_ORDER = ["default", "started", "complete", "question", "permission", "error"]

const STATE_META = Object.freeze({
  default: {
    label: "Default / Home",
    description: "Used when you are not looking at a session route."
  },
  started: {
    label: "Started / Busy",
    description: "Used while the current session is actively working."
  },
  complete: {
    label: "Complete / Idle",
    description: "Used when the current session is idle and ready for review."
  },
  question: {
    label: "Question",
    description: "Used when OpenCode asks you to answer a question."
  },
  permission: {
    label: "Permission",
    description: "Used when OpenCode is blocked on a permission request."
  },
  error: {
    label: "Error",
    description: "Used when the current session fails with a real error."
  }
})

const KNOWN_THEMES = [
  "opencode",
  "system",
  "tokyonight",
  "everforest",
  "matrix",
  "orng",
  "dracula",
  "material",
  "kanagawa",
  "nord",
  "gruvbox",
  "ayu",
  "one-dark",
  "catppuccin",
  "catppuccin-macchiato",
  "catppuccin-frappe",
  "rosepine",
  "solarized",
  "github",
  "flexoki",
  "carbonfox",
  "monokai",
  "nightowl",
  "palenight",
  "synthwave84",
  "vercel",
  "vesper",
  "cursor",
  "lucent-orng",
  "mercury",
  "osaka-jade",
  "cobalt2",
  "aura",
  "zenburn"
]

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function pickString(value, fallback) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback
}

function pickNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeOptions(options) {
  if (!isRecord(options)) {
    return { ...DEFAULT_OPTIONS }
  }

  return {
    debug: Boolean(options.debug),
    pollMs: pickNumber(options.pollMs, DEFAULT_OPTIONS.pollMs),
    defaultTheme: pickString(options.defaultTheme, DEFAULT_OPTIONS.defaultTheme),
    startedTheme: pickString(options.startedTheme, DEFAULT_OPTIONS.startedTheme),
    completeTheme: pickString(options.completeTheme, DEFAULT_OPTIONS.completeTheme),
    questionTheme: pickString(options.questionTheme, DEFAULT_OPTIONS.questionTheme),
    permissionTheme: pickString(options.permissionTheme, DEFAULT_OPTIONS.permissionTheme),
    errorTheme: pickString(options.errorTheme, DEFAULT_OPTIONS.errorTheme)
  }
}

function defaultMappings(options) {
  return {
    default: options.defaultTheme,
    started: options.startedTheme,
    complete: options.completeTheme,
    question: options.questionTheme,
    permission: options.permissionTheme,
    error: options.errorTheme
  }
}

function sanitizeOverrides(value) {
  if (!isRecord(value)) {
    return {}
  }

  const next = {}
  for (const key of STATE_ORDER) {
    const item = value[key]
    if (typeof item === "string" && item.trim().length > 0) {
      next[key] = item.trim()
    }
  }
  return next
}

function routeSessionId(api) {
  const route = api.route.current
  if (route?.name !== "session") {
    return null
  }

  const params = isRecord(route.params) ? route.params : null
  const sessionID = params?.sessionID
  return typeof sessionID === "string" && sessionID.length > 0 ? sessionID : null
}

function errorNameFromEvent(event) {
  if (!isRecord(event?.properties)) {
    return null
  }

  const error = event.properties.error
  return isRecord(error) && typeof error.name === "string" ? error.name : null
}

function themeOrFallback(api, desiredTheme, fallbackTheme) {
  if (api.theme.has(desiredTheme)) {
    return desiredTheme
  }

  if (api.theme.has(fallbackTheme)) {
    return fallbackTheme
  }

  return api.theme.selected || "opencode"
}

function currentStatus(api, sessionID) {
  const value = api.state.session.status(sessionID)
  return isRecord(value) && typeof value.type === "string" ? value.type : null
}

function permissionCount(api, sessionID) {
  const value = api.state.session.permission(sessionID)
  return Array.isArray(value) ? value.length : 0
}

function questionCount(api, sessionID) {
  const value = api.state.session.question(sessionID)
  return Array.isArray(value) ? value.length : 0
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]
}

function sortThemes(themes) {
  const rank = new Map(KNOWN_THEMES.map((theme, index) => [theme, index]))
  return [...themes].sort((left, right) => {
    const leftRank = rank.has(left) ? rank.get(left) : Number.MAX_SAFE_INTEGER
    const rightRank = rank.has(right) ? rank.get(right) : Number.MAX_SAFE_INTEGER

    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    return left.localeCompare(right)
  })
}

function logDebug(enabled, message, details) {
  if (!enabled) {
    return
  }

  if (details === undefined) {
    console.log(`[opencode-session-themes] ${message}`)
    return
  }

  console.log(`[opencode-session-themes] ${message}`, details)
}

const tui = async (api, rawOptions) => {
  const options = normalizeOptions(rawOptions)
  const errorSessions = new Set()
  const configuredDefaults = defaultMappings(options)
  let appliedTheme = null
  let lastRouteKey = null
  let settingsOpen = false
  let overridesLoaded = false
  let themeOverrides = {}

  function ensureOverridesLoaded() {
    if (overridesLoaded || !api.kv.ready) {
      return
    }

    themeOverrides = sanitizeOverrides(api.kv.get(SETTING_KEY, {}))
    overridesLoaded = true
    logDebug(options.debug, "loaded theme overrides", themeOverrides)
  }

  function currentMappings() {
    ensureOverridesLoaded()
    return {
      ...configuredDefaults,
      ...themeOverrides
    }
  }

  function persistOverrides() {
    overridesLoaded = true
    api.kv.set(SETTING_KEY, themeOverrides)
    logDebug(options.debug, "saved theme overrides", themeOverrides)
  }

  function setOverride(stateKey, themeName) {
    if (themeName === configuredDefaults[stateKey]) {
      delete themeOverrides[stateKey]
    } else {
      themeOverrides[stateKey] = themeName
    }
    persistOverrides()
  }

  function resetOverrides() {
    themeOverrides = {}
    persistOverrides()
  }

  function clearError(sessionID) {
    if (typeof sessionID === "string" && sessionID.length > 0) {
      errorSessions.delete(sessionID)
    }
  }

  function desiredThemeForSession(sessionID) {
    const mappings = currentMappings()
    if (!sessionID) {
      return themeOrFallback(api, mappings.default, configuredDefaults.default)
    }

    if (errorSessions.has(sessionID)) {
      return themeOrFallback(api, mappings.error, configuredDefaults.error)
    }

    if (permissionCount(api, sessionID) > 0) {
      return themeOrFallback(api, mappings.permission, configuredDefaults.permission)
    }

    if (questionCount(api, sessionID) > 0) {
      return themeOrFallback(api, mappings.question, configuredDefaults.question)
    }

    const status = currentStatus(api, sessionID)
    if (status === "busy" || status === "retry") {
      return themeOrFallback(api, mappings.started, configuredDefaults.started)
    }

    if (status === "idle") {
      return themeOrFallback(api, mappings.complete, configuredDefaults.complete)
    }

    return themeOrFallback(api, mappings.complete, configuredDefaults.complete)
  }

  function applyTheme(reason, force = false) {
    if (!api.theme.ready) {
      return
    }

    if (settingsOpen && !force) {
      return
    }

    const sessionID = routeSessionId(api)
    const route = api.route.current
    const routeKey = sessionID ? `session:${sessionID}` : route?.name || "home"
    const desiredTheme = desiredThemeForSession(sessionID)

    lastRouteKey = routeKey
    if (appliedTheme === desiredTheme) {
      return
    }

    const ok = api.theme.set(desiredTheme)
    logDebug(options.debug, "theme update", {
      reason,
      routeKey,
      sessionID,
      desiredTheme,
      ok
    })

    if (ok) {
      appliedTheme = desiredTheme
    }
  }

  function restoreCurrentTheme(reason) {
    appliedTheme = null
    applyTheme(reason, true)
  }

  function applyIfCurrentSession(sessionID, reason) {
    const currentSessionID = routeSessionId(api)
    if (currentSessionID && currentSessionID === sessionID) {
      applyTheme(reason)
    }
  }

  function availableThemes() {
    const mappings = currentMappings()
    const candidates = uniqueStrings([
      ...KNOWN_THEMES,
      api.theme.selected,
      ...Object.values(mappings)
    ])

    return sortThemes(candidates.filter((theme) => api.theme.has(theme)))
  }

  function finishSettings() {
    settingsOpen = false
    api.ui.dialog.clear()
    restoreCurrentTheme("settings.done")
  }

  function openHub() {
    const mappings = currentMappings()
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: "Theme Mappings",
        placeholder: "Choose a state to configure",
        options: [
          ...STATE_ORDER.map((stateKey) => ({
            title: `${STATE_META[stateKey].label} -> ${mappings[stateKey]}`,
            description: STATE_META[stateKey].description,
            value: {
              kind: "state",
              stateKey
            }
          })),
          {
            title: "Reset all to defaults",
            description: "Clear all overrides and go back to the built-in mapping.",
            value: {
              kind: "reset"
            }
          },
          {
            title: "Done",
            description: "Close the theme mapping dialog.",
            value: {
              kind: "done"
            }
          }
        ],
        onSelect: (option) => {
          if (!isRecord(option?.value)) {
            return
          }

          if (option.value.kind === "state") {
            openThemePicker(option.value.stateKey)
            return
          }

          if (option.value.kind === "reset") {
            openResetConfirm()
            return
          }

          if (option.value.kind === "done") {
            finishSettings()
          }
        }
      })
    )
  }

  function openResetConfirm() {
    api.ui.dialog.replace(() =>
      api.ui.DialogConfirm({
        title: "Reset Theme Mappings",
        message: "Reset all state mappings back to the built-in defaults?",
        onConfirm: () => {
          resetOverrides()
          restoreCurrentTheme("settings.reset")
          api.ui.toast({
            variant: "success",
            title: "Theme mappings reset",
            message: "Session themes are back on the default mapping."
          })
          openHub()
        },
        onCancel: () => {
          restoreCurrentTheme("settings.reset.cancel")
          openHub()
        }
      })
    )
  }

  function openCustomThemePrompt(stateKey) {
    const mappings = currentMappings()
    api.ui.dialog.replace(() =>
      api.ui.DialogPrompt({
        title: `Custom Theme for ${STATE_META[stateKey].label}`,
        placeholder: "Enter a theme name",
        value: mappings[stateKey],
        onConfirm: (value) => {
          const themeName = pickString(value, "")
          if (!themeName || !api.theme.has(themeName)) {
            api.ui.toast({
              variant: "error",
              title: "Theme not found",
              message: `OpenCode does not know a theme named \"${themeName || "(empty)"}\".`
            })
            openCustomThemePrompt(stateKey)
            return
          }

          previewThemeSelection(stateKey, themeName, themeName)
        },
        onCancel: () => {
          restoreCurrentTheme("settings.custom.cancel")
          openThemePicker(stateKey)
        }
      })
    )
  }

  function previewThemeSelection(stateKey, previewTheme, storedTheme) {
    const ok = api.theme.set(previewTheme)
    if (!ok) {
      api.ui.toast({
        variant: "error",
        title: "Preview failed",
        message: `OpenCode could not switch to \"${previewTheme}\".`
      })
      restoreCurrentTheme("settings.preview.failed")
      openThemePicker(stateKey)
      return
    }

    api.ui.dialog.replace(() =>
      api.ui.DialogConfirm({
        title: `Preview ${previewTheme}`,
        message: `Keep ${previewTheme} for ${STATE_META[stateKey].label}?`,
        onConfirm: () => {
          setOverride(stateKey, storedTheme)
          restoreCurrentTheme("settings.preview.saved")
          api.ui.toast({
            variant: "success",
            title: "Theme mapping saved",
            message: `${STATE_META[stateKey].label} now uses ${previewTheme}.`
          })
          openHub()
        },
        onCancel: () => {
          restoreCurrentTheme("settings.preview.cancel")
          openThemePicker(stateKey)
        }
      })
    )
  }

  function openThemePicker(stateKey) {
    const themes = availableThemes()
    const mappings = currentMappings()
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: `Theme for ${STATE_META[stateKey].label}`,
        placeholder: "Choose a built-in theme",
        current: mappings[stateKey],
        options: [
          {
            title: `Use plugin default -> ${configuredDefaults[stateKey]}`,
            description: "Remove any custom override for this state.",
            value: {
              kind: "default"
            }
          },
          ...themes.map((themeName) => ({
            title: themeName,
            description: themeName === mappings[stateKey] ? "Currently mapped" : undefined,
            value: {
              kind: "theme",
              themeName
            }
          })),
          {
            title: "Type a custom theme name",
            description: "Use this if you have a theme installed that is not listed here.",
            value: {
              kind: "custom"
            }
          },
          {
            title: "Back",
            description: "Return to the mapping overview.",
            value: {
              kind: "back"
            }
          }
        ],
        onSelect: (option) => {
          if (!isRecord(option?.value)) {
            return
          }

          if (option.value.kind === "default") {
            previewThemeSelection(stateKey, configuredDefaults[stateKey], configuredDefaults[stateKey])
            return
          }

          if (option.value.kind === "theme") {
            previewThemeSelection(stateKey, option.value.themeName, option.value.themeName)
            return
          }

          if (option.value.kind === "custom") {
            openCustomThemePrompt(stateKey)
            return
          }

          if (option.value.kind === "back") {
            restoreCurrentTheme("settings.theme.back")
            openHub()
          }
        }
      })
    )
  }

  function openSettings() {
    settingsOpen = true
    openHub()
  }

  api.command.register(() => [
    {
      title: "Theme: Map Session States to Themes",
      value: "guard22.theme-states",
      category: "Theme",
      slash: {
        name: "theme-states"
      },
      onSelect: openSettings
    },
    {
      title: "Theme: Reset Session State Mappings",
      value: "guard22.theme-states-reset",
      category: "Theme",
      slash: {
        name: "theme-states-reset"
      },
      onSelect: () => {
        settingsOpen = true
        openResetConfirm()
      }
    }
  ])

  api.event.on("session.status", (event) => {
    clearError(event?.properties?.sessionID)
    applyIfCurrentSession(event?.properties?.sessionID, "session.status")
  })

  api.event.on("session.idle", (event) => {
    clearError(event?.properties?.sessionID)
    applyIfCurrentSession(event?.properties?.sessionID, "session.idle")
  })

  api.event.on("permission.asked", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "permission.asked")
  })

  api.event.on("permission.replied", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "permission.replied")
  })

  api.event.on("question.asked", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "question.asked")
  })

  api.event.on("question.replied", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "question.replied")
  })

  api.event.on("question.rejected", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "question.rejected")
  })

  api.event.on("session.error", (event) => {
    const sessionID = event?.properties?.sessionID
    if (typeof sessionID !== "string" || sessionID.length === 0) {
      return
    }

    if (errorNameFromEvent(event) === "MessageAbortedError") {
      return
    }

    errorSessions.add(sessionID)
    applyIfCurrentSession(sessionID, "session.error")
  })

  const poll = setInterval(() => {
    if (settingsOpen && !api.ui.dialog.open) {
      settingsOpen = false
      restoreCurrentTheme("settings.closed")
      return
    }

    const sessionID = routeSessionId(api)
    const routeKey = sessionID ? `session:${sessionID}` : api.route.current?.name || "home"

    if (routeKey !== lastRouteKey) {
      appliedTheme = null
    }

    applyTheme("poll")
  }, options.pollMs)

  api.lifecycle.onDispose(() => {
    clearInterval(poll)
  })

  applyTheme("init")
}

const plugin = {
  id: "guard22.session-themes",
  tui
}

export default plugin
