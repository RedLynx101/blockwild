#!/usr/bin/env node

import fs from "node:fs/promises";
import process from "node:process";

const KINDS = new Set([
  "session.status", "session.pause", "session.resume", "session.stop", "capabilities.list",
  "observe", "inspect_area", "inspect_target", "wiki_lookup", "bestiary_lookup", "recipe_lookup",
  "move_to", "move_relative", "follow_player", "face", "wait", "stop",
  "chat_read", "chat_send", "speak", "emote", "inventory_get", "inventory_move", "inventory_drop",
  "agent_inventory_open_for_host", "interact", "open_container", "container_get", "container_transfer",
  "use_workstation", "harvest_area", "gather_resource", "build_plan", "build_commit", "build_cancel",
  "memory_pin", "memory_list", "memory_remove", "task_pin", "task_update", "waypoint_pin",
  "world_list", "world_create", "world_load", "world_export", "world_delete",
  "diagnostics_start", "diagnostics_stop", "diagnostics_export",
]);
const ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

function validate(command) {
  const errors = [];
  if (!command || typeof command !== "object" || Array.isArray(command)) errors.push("command must be an object");
  else {
    if (command.schema !== 1) errors.push("schema must equal 1");
    if (!ID.test(command.commandId ?? "")) errors.push("commandId is invalid");
    if (!ID.test(command.agentId ?? "")) errors.push("agentId is invalid");
    if (!KINDS.has(command.kind)) errors.push("kind is not in command-v1");
    if (!Number.isSafeInteger(command.expectedWorldRevision) || command.expectedWorldRevision < 0) errors.push("expectedWorldRevision must be a nonnegative safe integer");
    if (!Number.isFinite(command.issuedAt) || !Number.isFinite(command.expiresAt) || command.expiresAt < command.issuedAt) errors.push("timestamps are invalid");
    if (command.expiresAt - command.issuedAt > 600_000) errors.push("command lifetime exceeds ten minutes");
    if (!command.arguments || typeof command.arguments !== "object" || Array.isArray(command.arguments)) errors.push("arguments must be an object");
    if (JSON.stringify(command).length > 128 * 1024) errors.push("command exceeds the 128 KiB limit");
    if (command.kind === "build_plan" && (!Array.isArray(command.arguments?.placements) || command.arguments.placements.length < 1 || command.arguments.placements.length > 2048)) errors.push("build_plan requires 1-2048 placements");
    if (command.kind === "world_delete" && command.arguments?.confirm !== true) errors.push("world_delete requires confirm:true");
  }
  return errors;
}

const source = process.argv[2];
if (!source) {
  fail("Usage: node validate-command.mjs COMMAND.json | -");
} else {
  try {
    const text = source === "-" ? await new Promise((resolve, reject) => {
      let data = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { data += chunk; });
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", reject);
    }) : await fs.readFile(source, "utf8");
    const command = JSON.parse(text);
    const errors = validate(command);
    if (errors.length) fail(errors.map((error) => `- ${error}`).join("\n"));
    else process.stdout.write(`${JSON.stringify(command)}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

