---
name: anyagents-authoring
description: Author AnyAgents project configuration, skills, MCP definitions, plugins, and marketplace catalogs, or set up their CI validation.
---

Edit canonical sources and generate native outputs with the installed AnyAgents CLI.

Read [definitions](references/definitions.md) before adding plugins or marketplaces. Read [CI recipes](references/ci.md) when configuring GitHub Actions or GitLab CI.

Use `anyagents explain authoring`, `anyagents schema <config|mcp|skill|marketplace|plugin>`, and `anyagents template <topic>` from the installed CLI for its supported format. These work offline outside an initialized project. Do not infer supported fields from a newer vendor document: this CLI pins its validation coverage.

Project configuration is `anyagents.yaml`. Follow its source and marketplace paths. Plugin MCP and local project MCP are independent; never copy one into the other implicitly. Never author generated catalogs or manifests directly.

Run `anyagents apply --dry-run` to validate and preview, `anyagents apply` to generate, then `anyagents check --strict`. Commit canonical inputs and generated outputs together through the user's normal workflow. CI runs only `check --strict`; applying in CI can hide stale committed outputs. Ownership state in `.anyagents/` stays local.

A failed check identifies the file and field or generated destination. Fix canonical input for validation errors. For drift, regenerate locally. For an unmanaged-output conflict, preserve that content and resolve the collision explicitly; `--force` does not grant ownership.

AnyAgents only authors local files. Marketplace registration, installation, publishing, and executing bundled hooks or MCP servers are separate actions and are not performed by these commands.
