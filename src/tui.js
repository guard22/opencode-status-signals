const SETTING_KEY = "guard22.session-themes.settings"
const MIN_POLL_MS = 500
const ERROR_SESSION_TTL_MS = 30 * 60 * 1000

const DEFAULT_OPTIONS = Object.freeze({
  debug: false,
  pollMs: 500,
  forceThemeMode: "dark",
  defaultTheme: "opencode",
  startedTheme: "tokyonight",
  completeTheme: "opencode",
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

function pickThemeMode(value, fallback) {
  return value === "dark" || value === "light" || value === "system" ? value : fallback
}

function normalizeOptions(options) {
  if (!isRecord(options)) {
    return { ...DEFAULT_OPTIONS }
  }

  return {
    debug: Boolean(options.debug),
    pollMs: Math.max(pickNumber(options.pollMs, DEFAULT_OPTIONS.pollMs), MIN_POLL_MS),
    forceThemeMode: pickThemeMode(options.forceThemeMode, DEFAULT_OPTIONS.forceThemeMode),
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

function routeKey(api) {
  const sessionID = routeSessionId(api)
  return sessionID ? `session:${sessionID}` : api.route.current?.name || "home"
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

  return "opencode"
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

function syncForcedThemeMode(api, options) {
  const desiredMode = options.forceThemeMode
  if (!desiredMode) {
    return
  }

  if (desiredMode === "system") {
    if (typeof api.theme.unlock === "function") {
      api.theme.unlock()
      return
    }

    if (api.kv.ready && api.kv.get("theme_mode_lock") !== undefined) {
      api.kv.set("theme_mode_lock", undefined)
    }
    return
  }

  if (typeof api.theme.setMode === "function") {
    if (api.theme.mode() !== desiredMode || (typeof api.theme.locked === "function" && !api.theme.locked())) {
      api.theme.setMode(desiredMode)
    }
    return
  }

  if (!api.kv.ready) {
    return
  }

  if (api.kv.get("theme_mode") !== desiredMode) {
    api.kv.set("theme_mode", desiredMode)
  }

  if (api.kv.get("theme_mode_lock") !== desiredMode) {
    api.kv.set("theme_mode_lock", desiredMode)
  }
}

const tui = async (api, rawOptions) => {
  const options = normalizeOptions(rawOptions)
  const errorSessions = new Map()
  const configuredDefaults = defaultMappings(options)
  const disposers = []
  let appliedTheme = null
  let lastRouteKey = null
  let settingsOpen = false
  let overridesLoaded = false
  let previewTheme = null
  let themeOverrides = {}

  function trackDisposer(dispose) {
    if (typeof dispose === "function") {
      disposers.push(dispose)
    }
    return dispose
  }

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

  function pruneErrors(now = Date.now()) {
    for (const [sessionID, seenAt] of errorSessions.entries()) {
      if (now - seenAt > ERROR_SESSION_TTL_MS) {
        errorSessions.delete(sessionID)
      }
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

    if (status !== null) {
      logDebug(options.debug, "unknown session status", { sessionID, status })
    }

    return themeOrFallback(api, mappings.default, configuredDefaults.default)
  }

  function applyTheme(reason, force = false) {
    if (!api.theme.ready) {
      return
    }

    syncForcedThemeMode(api, options)

    if (settingsOpen && !force) {
      return
    }

    const sessionID = routeSessionId(api)
    const currentRouteKey = routeKey(api)
    const desiredTheme = desiredThemeForSession(sessionID)

    lastRouteKey = currentRouteKey
    if (appliedTheme === desiredTheme) {
      return
    }

    const ok = api.theme.set(desiredTheme)
    logDebug(options.debug, "theme update", {
      reason,
      routeKey: currentRouteKey,
      sessionID,
      desiredTheme,
      ok
    })

    if (ok) {
      appliedTheme = desiredTheme
    }
  }

  function restoreCurrentTheme(reason) {
    previewTheme = null
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

  function previewThemeSelection(stateKey, previewThemeName, storedTheme) {
    const ok = api.theme.set(previewThemeName)
    if (!ok) {
      api.ui.toast({
        variant: "error",
        title: "Preview failed",
        message: `OpenCode could not switch to \"${previewThemeName}\".`
      })
      restoreCurrentTheme("settings.preview.failed")
      openThemePicker(stateKey)
      return
    }

    previewTheme = previewThemeName

    api.ui.dialog.replace(() =>
      api.ui.DialogConfirm({
        title: `Preview ${previewThemeName}`,
        message: `Keep ${previewThemeName} for ${STATE_META[stateKey].label}?`,
        onConfirm: () => {
          setOverride(stateKey, storedTheme)
          restoreCurrentTheme("settings.preview.saved")
          api.ui.toast({
            variant: "success",
            title: "Theme mapping saved",
            message: `${STATE_META[stateKey].label} now uses ${previewThemeName}.`
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

  trackDisposer(api.command.register(() => [
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
  ]))

  trackDisposer(api.event.on("session.status", (event) => {
    clearError(event?.properties?.sessionID)
    applyIfCurrentSession(event?.properties?.sessionID, "session.status")
  }))

  trackDisposer(api.event.on("session.idle", (event) => {
    clearError(event?.properties?.sessionID)
    applyIfCurrentSession(event?.properties?.sessionID, "session.idle")
  }))

  trackDisposer(api.event.on("permission.asked", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "permission.asked")
  }))

  trackDisposer(api.event.on("permission.replied", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "permission.replied")
  }))

  trackDisposer(api.event.on("question.asked", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "question.asked")
  }))

  trackDisposer(api.event.on("question.replied", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "question.replied")
  }))

  trackDisposer(api.event.on("question.rejected", (event) => {
    applyIfCurrentSession(event?.properties?.sessionID, "question.rejected")
  }))

  trackDisposer(api.event.on("session.error", (event) => {
    const sessionID = event?.properties?.sessionID
    if (typeof sessionID !== "string" || sessionID.length === 0) {
      return
    }

    if (errorNameFromEvent(event) === "MessageAbortedError") {
      return
    }

    errorSessions.set(sessionID, Date.now())
    applyIfCurrentSession(sessionID, "session.error")
  }))

  // OpenCode exposes route.current but not a route change event, so polling is the
  // smallest reliable way to react when the user navigates between session screens.
  const poll = setInterval(() => {
    pruneErrors()

    if (settingsOpen && !api.ui.dialog.open) {
      settingsOpen = false
      if (previewTheme !== null) {
        restoreCurrentTheme("settings.closed")
      } else {
        applyTheme("settings.closed", true)
      }
      return
    }

    const currentRouteKey = routeKey(api)

    if (currentRouteKey !== lastRouteKey) {
      appliedTheme = null
    }

    applyTheme("poll")
  }, options.pollMs)

  api.lifecycle.onDispose(() => {
    clearInterval(poll)
    for (const dispose of disposers.splice(0)) {
      dispose()
    }
  })

  syncForcedThemeMode(api, options)
  applyTheme("init")
}

const plugin = {
  id: "guard22.session-themes",
  tui
}

export default plugin
