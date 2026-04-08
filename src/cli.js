#!/usr/bin/env node

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const PACKAGE_NAME = "opencode-iterm2-signals"
const CONFIG_FILE = `${PACKAGE_NAME}.json`
const PLUGIN_FILE = `${PACKAGE_NAME}.js`
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const homeDir = os.homedir()
const opencodeDir = path.join(homeDir, ".config", "opencode")
const pluginsDir = path.join(opencodeDir, "plugins")
const pluginDestination = path.join(pluginsDir, PLUGIN_FILE)
const configPath = path.join(opencodeDir, CONFIG_FILE)
const sourcePluginPath = path.join(__dirname, "plugin.js")

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

function printUsage() {
  console.log(`OpenCode iTerm2 Signals

Usage:
  ${PACKAGE_NAME} install
  ${PACKAGE_NAME} uninstall
  ${PACKAGE_NAME} doctor
  ${PACKAGE_NAME} preview [started|complete|question|permission|error|all]
`)
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function writeDefaultConfigIfMissing() {
  if (fs.existsSync(configPath)) {
    return false
  }

  ensureDirectory(opencodeDir)
  fs.writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8")
  return true
}

function syncConfigDefaults() {
  const config = loadConfig()
  ensureDirectory(opencodeDir)
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

function loadConfig() {
  try {
    return mergeConfig(DEFAULT_CONFIG, JSON.parse(fs.readFileSync(configPath, "utf8")))
  } catch {
    return mergeConfig(DEFAULT_CONFIG, null)
  }
}

function applyColor(hexColor, sessionId = process.env.ITERM_SESSION_ID || "") {
  const result = spawnSync("osascript", ["-e", APPLE_SCRIPT, sessionId, hexColor, "true"], {
    encoding: "utf8"
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "osascript exited with a non-zero status")
  }
}

function commandInstall() {
  ensureDirectory(pluginsDir)
  fs.copyFileSync(sourcePluginPath, pluginDestination)
  const createdConfig = writeDefaultConfigIfMissing()
  if (!createdConfig) {
    syncConfigDefaults()
  }

  console.log(`Installed ${PLUGIN_FILE} to ${pluginDestination}`)
  if (createdConfig) {
    console.log(`Created default config at ${configPath}`)
  } else {
    console.log(`Updated existing config defaults at ${configPath}`)
  }

  console.log("Restart OpenCode if it is already running.")
  console.log(`Preview the palette with: ${PACKAGE_NAME} preview all`)
}

function commandUninstall() {
  if (fs.existsSync(pluginDestination)) {
    fs.unlinkSync(pluginDestination)
    console.log(`Removed ${pluginDestination}`)
  } else {
    console.log(`Nothing to remove at ${pluginDestination}`)
  }

  console.log(`Config file left in place: ${configPath}`)
}

function commandDoctor() {
  const checks = []
  checks.push(["Platform", process.platform === "darwin", process.platform])

  const termProgram = process.env.TERM_PROGRAM || ""
  checks.push(["TERM_PROGRAM", termProgram === "iTerm.app" || termProgram === "iTerm2", termProgram || "not set"])
  checks.push(["ITERM_SESSION_ID", Boolean(process.env.ITERM_SESSION_ID), process.env.ITERM_SESSION_ID || "not set"])

  let osascriptOk = false
  try {
    execFileSync("osascript", ["-e", 'return "ok"'], { stdio: "ignore" })
    osascriptOk = true
  } catch {}
  checks.push(["osascript", osascriptOk, osascriptOk ? "available" : "missing or blocked"])

  let currentSessionId = "unavailable"
  try {
    currentSessionId = execFileSync("osascript", ["-e", 'tell application "iTerm2" to tell current session of current window to get id'], {
      encoding: "utf8"
    }).trim()
  } catch {}
  checks.push(["iTerm2 scripting", currentSessionId !== "unavailable", currentSessionId])
  checks.push(["Plugin file", fs.existsSync(pluginDestination), pluginDestination])
  checks.push(["Config file", fs.existsSync(configPath), configPath])

  console.log("OpenCode iTerm2 Signals Doctor\n")
  for (const [label, passed, value] of checks) {
    console.log(`${passed ? "[ok]" : "[warn]"} ${label}: ${value}`)
  }

  const config = loadConfig()
  console.log("\nConfigured colors:")
  for (const [state, color] of Object.entries(config.colors || {})) {
    console.log(`- ${state}: ${color}`)
  }
}

async function commandPreview(stateName) {
  const config = loadConfig()
  const states = ["started", "complete", "question", "permission", "error"]

  if (!stateName || stateName === "all") {
    for (const state of states) {
      applyColor(config.colors[state])
      console.log(`Applied ${state} -> ${config.colors[state]}`)
      await new Promise((resolve) => setTimeout(resolve, 900))
    }
    return
  }

  if (!states.includes(stateName)) {
    throw new Error(`Unknown state: ${stateName}`)
  }

  applyColor(config.colors[stateName])
  console.log(`Applied ${stateName} -> ${config.colors[stateName]}`)
}

const [, , command, arg] = process.argv

try {
  switch (command) {
    case "install":
      commandInstall()
      break
    case "uninstall":
      commandUninstall()
      break
    case "doctor":
      commandDoctor()
      break
    case "preview":
      await commandPreview(arg)
      break
    default:
      printUsage()
      process.exitCode = command ? 1 : 0
      break
  }
} catch (error) {
  console.error(`[${PACKAGE_NAME}] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
