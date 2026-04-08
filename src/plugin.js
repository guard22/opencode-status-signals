import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

const CONFIG_FILE = "opencode-iterm2-signals.json"
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  fallbackToCurrentSession: true,
  colors: {
    started: "#13233A",
    complete: "#143222",
    question: "#3A2A12",
    permission: "#3A1717",
    error: "#3A101C"
  }
})

const childSessionIds = new Set()
let lastAppliedSignature = null
let warnedUnsupportedEnvironment = false

const APPLE_SCRIPT = String.raw`
on hexpair_to_integer(thePair)
  set normalizedPair to do shell script "printf %s " & quoted form of thePair & " | tr '[:lower:]' '[:upper:]'"
  set firstChar to character 1 of normalizedPair
  set secondChar to character 2 of normalizedPair
  set firstValue to (offset of firstChar in "0123456789ABCDEF") - 1
  set secondValue to (offset of secondChar in "0123456789ABCDEF") - 1
  if firstValue < 0 or secondValue < 0 then error "Invalid hex pair: " & normalizedPair
  return (firstValue * 16) + secondValue
end hexpair_to_integer

on hexpair_to_component(thePair)
  return (my hexpair_to_integer(thePair) * 257)
end hexpair_to_component

on hex_to_color(hexValue)
  set cleanHex to do shell script "printf %s " & quoted form of hexValue & " | tr -d '#'"
  if (length of cleanHex) is not 6 then error "Expected a 6 digit hex color"
  set redValue to my hexpair_to_component(text 1 thru 2 of cleanHex)
  set greenValue to my hexpair_to_component(text 3 thru 4 of cleanHex)
  set blueValue to my hexpair_to_component(text 5 thru 6 of cleanHex)
  return {redValue, greenValue, blueValue, 0}
end hex_to_color

on apply_color(targetSessionID, hexValue, shouldFallback)
  tell application "iTerm2"
    repeat with aWindow in windows
      repeat with aTab in tabs of aWindow
        repeat with aSession in sessions of aTab
          if targetSessionID is not "" and (id of aSession as text) is targetSessionID then
            set background color of aSession to my hex_to_color(hexValue)
            return "matched"
          end if
        end repeat
      end repeat
    end repeat

    if shouldFallback is "true" then
      if (exists current window) then
        set background color of current session of current window to my hex_to_color(hexValue)
        return "fallback"
      end if
    end if
  end tell

  return "missing"
end apply_color

on run argv
  set targetSessionID to item 1 of argv
  set hexValue to item 2 of argv
  set shouldFallback to item 3 of argv
  apply_color(targetSessionID, hexValue, shouldFallback)
end run
`

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function mergeConfig(baseConfig, overrideConfig) {
  const merged = {
    ...baseConfig,
    colors: {
      ...baseConfig.colors
    }
  }

  if (!isRecord(overrideConfig)) {
    return merged
  }

  if (typeof overrideConfig.enabled === "boolean") {
    merged.enabled = overrideConfig.enabled
  }

  if (typeof overrideConfig.fallbackToCurrentSession === "boolean") {
    merged.fallbackToCurrentSession = overrideConfig.fallbackToCurrentSession
  }

  if (isRecord(overrideConfig.colors)) {
    for (const state of Object.keys(merged.colors)) {
      const value = overrideConfig.colors[state]
      if (typeof value === "string" && /^#?[0-9a-fA-F]{6}$/.test(value)) {
        merged.colors[state] = value.startsWith("#") ? value : `#${value}`
      }
    }
  }

  return merged
}

function loadConfig() {
  const configPath = path.join(os.homedir(), ".config", "opencode", CONFIG_FILE)

  try {
    const raw = fs.readFileSync(configPath, "utf8")
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw))
  } catch {
    return mergeConfig(DEFAULT_CONFIG, null)
  }
}

function getNestedRecord(root, ...keys) {
  let current = root

  for (const key of keys) {
    if (!isRecord(current) || !(key in current)) {
      return null
    }
    current = current[key]
  }

  return isRecord(current) ? current : null
}

function getStringField(record, key) {
  if (!isRecord(record)) {
    return null
  }

  const value = record[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function getSessionLifecycleInfo(event) {
  const info = getNestedRecord(event, "properties", "info")
  return {
    id: getStringField(info, "id"),
    parentID: getStringField(info, "parentID")
  }
}

function getEventSessionId(event) {
  const properties = getNestedRecord(event, "properties")
  return getStringField(properties, "sessionID")
}

function getEventErrorName(event) {
  const errorRecord = getNestedRecord(event, "properties", "error")
  return getStringField(errorRecord, "name")
}

function isIterm2Session() {
  if (process.platform !== "darwin") {
    return false
  }

  const termProgram = String(process.env.TERM_PROGRAM || "").toLowerCase()
  return termProgram === "iterm.app" || termProgram === "iterm2"
}

function warnUnsupportedEnvironmentOnce() {
  if (warnedUnsupportedEnvironment) {
    return
  }

  warnedUnsupportedEnvironment = true
  console.warn("[opencode-iterm2-signals] Skipping color updates because this session is not running inside iTerm2 on macOS.")
}

function runAppleScript(script, args) {
  return new Promise((resolve) => {
    const child = spawn("osascript", ["-e", script, ...args], {
      stdio: "ignore"
    })

    child.once("error", () => resolve(false))
    child.once("exit", (code) => resolve(code === 0))
  })
}

async function applyStateColor(state) {
  const config = loadConfig()
  if (!config.enabled) {
    return
  }

  if (!isIterm2Session()) {
    warnUnsupportedEnvironmentOnce()
    return
  }

  const sessionId = String(process.env.ITERM_SESSION_ID || "")
  const hexColor = config.colors[state]
  const signature = `${sessionId || "current"}:${state}:${hexColor}`

  if (signature === lastAppliedSignature) {
    return
  }

  lastAppliedSignature = signature
  const ok = await runAppleScript(APPLE_SCRIPT, [sessionId, hexColor, String(config.fallbackToCurrentSession)])

  if (!ok) {
    lastAppliedSignature = null
  }
}

function isChildSession(sessionId) {
  return typeof sessionId === "string" && childSessionIds.has(sessionId)
}

export const Iterm2SignalsPlugin = async () => {
  if (!isIterm2Session()) {
    warnUnsupportedEnvironmentOnce()
  }

  return {
    event: async ({ event }) => {
      if (!event || typeof event.type !== "string") {
        return
      }

      if (event.type === "session.created" || event.type === "session.updated") {
        const info = getSessionLifecycleInfo(event)
        if (info.parentID && info.id) {
          childSessionIds.add(info.id)
        }
        return
      }

      if (event.type === "session.deleted") {
        const info = getSessionLifecycleInfo(event)
        if (info.id) {
          childSessionIds.delete(info.id)
        }
        return
      }

      if (event.type === "session.status") {
        const sessionId = getEventSessionId(event)
        if (isChildSession(sessionId)) {
          return
        }

        const status = getNestedRecord(event, "properties", "status")
        if (getStringField(status, "type") === "busy") {
          await applyStateColor("started")
        }
        return
      }

      if (event.type === "session.idle") {
        const sessionId = getEventSessionId(event)
        if (isChildSession(sessionId)) {
          return
        }

        await applyStateColor("complete")
        return
      }

      if (event.type === "permission.asked") {
        const sessionId = getEventSessionId(event)
        if (isChildSession(sessionId)) {
          return
        }

        await applyStateColor("permission")
        return
      }

      if (event.type === "session.error") {
        const sessionId = getEventSessionId(event)
        if (isChildSession(sessionId)) {
          return
        }

        if (getEventErrorName(event) === "MessageAbortedError") {
          return
        }

        await applyStateColor("error")
      }
    },

    "tool.execute.before": async (input) => {
      if (input?.tool === "question") {
        await applyStateColor("question")
      }
    }
  }
}

export default Iterm2SignalsPlugin
