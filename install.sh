#!/usr/bin/env bash
set -euo pipefail

REPO_RAW_BASE="https://raw.githubusercontent.com/guard22/opencode-status-signals/main"
PLUGIN_NAME="opencode-status-signals"
PLUGIN_FILENAME="${PLUGIN_NAME}.js"

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-${HOME}/.config/opencode}"
PLUGIN_DIR="${CONFIG_DIR}/plugins"
TUI_CONFIG_PATH="${OPENCODE_TUI_CONFIG:-${CONFIG_DIR}/tui.json}"
PLUGIN_PATH="${PLUGIN_DIR}/${PLUGIN_FILENAME}"
PLUGIN_SOURCE_URL="${REPO_RAW_BASE}/src/tui.js"

mkdir -p "${PLUGIN_DIR}"

curl -fsSL "${PLUGIN_SOURCE_URL}" -o "${PLUGIN_PATH}"

TUI_CONFIG_PATH="${TUI_CONFIG_PATH}" PLUGIN_PATH="${PLUGIN_PATH}" node <<'EOF'
const fs = require("node:fs")
const path = require("node:path")

const configPath = process.env.TUI_CONFIG_PATH
const pluginPath = process.env.PLUGIN_PATH
const pluginNames = new Set([
  pluginPath,
  "@guard22/opencode-status-signals",
  "opencode-status-signals",
  "/Users/guard2/Projects/opencode-status-signals/src/tui.js",
  "/Users/guard2/Projects/opencode-iterm2-signals/src/tui.js",
])

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function defaultConfig() {
  return {
    $schema: "https://opencode.ai/tui.json",
    theme: "opencode",
    plugin: [],
  }
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultConfig()
  }

  return {
    $schema: typeof raw.$schema === "string" ? raw.$schema : "https://opencode.ai/tui.json",
    theme: typeof raw.theme === "string" ? raw.theme : "opencode",
    ...raw,
    plugin: Array.isArray(raw.plugin) ? raw.plugin : [],
  }
}

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    return defaultConfig()
  }

  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(configPath, "utf8")))
  } catch (error) {
    console.error(`Could not parse ${configPath} as JSON.`)
    console.error("Please remove comments or fix the file, then re-run install.sh.")
    throw error
  }
}

function isManagedEntry(entry) {
  if (typeof entry === "string") {
    return pluginNames.has(entry)
  }

  if (Array.isArray(entry) && typeof entry[0] === "string") {
    return pluginNames.has(entry[0])
  }

  return false
}

function installEntry() {
  return [
    pluginPath,
    {
      defaultTheme: "opencode",
      startedTheme: "tokyonight",
      completeTheme: "opencode",
      questionTheme: "matrix",
      permissionTheme: "orng",
      errorTheme: "dracula",
    },
  ]
}

const config = loadConfig()
const nextPlugins = config.plugin.filter((entry) => !isManagedEntry(entry))
nextPlugins.push(installEntry())
config.plugin = nextPlugins

ensureDir(configPath)
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")

console.log(`Updated ${configPath}`)
console.log(`Installed plugin file at ${pluginPath}`)
EOF

printf '\nInstalled OpenCode Status Signals.\n'
printf 'Restart OpenCode and run /theme-states to customize mappings.\n'
