# CLAUDE.md

Project instructions live in `AGENTS.md` so every agent (Claude Code, Copilot, Cursor, Gemini CLI)
reads the same file. Do not duplicate rules here.

@AGENTS.md

Three things that always apply:

1. This repo is **Angular 22 + NgModules + zone.js + Bootstrap** (no Material), while the official
   Angular guidance bundled in `.claude/` pushes standalone + signals. Read `AGENTS.md` §3 before
   generating code.
2. New PM screens follow `MODULE-CONVENTIONS.md` and `SIMPLE-DESIGN-RULES.md` exactly.
3. PM modules are **mock-backed**. Replace a mock with a live call only when the endpoint exists in
   `../API`, and keep API field names PascalCase (`AGENTS.md` §4).
