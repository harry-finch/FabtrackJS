---
name: agent-learnings-manager
description: Use this skill to read, apply, and update the ../fabtrack-dev/SKILL.md file. Trigger when starting a new session, resolving a complex bug, or when the user asks to "remember this" or "update learnings".
---

# Agent Learnings & Continuous Memory

## Purpose
Transforms the agent into a self-improving entity that never makes the same mistake twice. The goal is to dynamically read project-specific context, architectural decisions, and resolved bugs from an `AGENT_LEARNINGS.md` file, and proactively update this file when new conventions are established.

## Instructions
1. **Pre-flight Check:** At the start of any significant architectural task, refactoring, or bug fix, assume the existence of an `AGENT_LEARNINGS.md` file at the project root and align all proposed solutions with its contents.
2. **Strict Application:** Treat the contents of this file as absolute ground truth for the current project. Override standard generic best practices if a specific custom convention is documented here.
3. **Capture & Synthesize:** When a complex issue is resolved, a tricky integration is stabilized, or a specific workflow is agreed upon, synthesize the takeaway into a single, concise, actionable rule.
4. **Active Updating:** Proactively suggest appending the new rule to `AGENT_LEARNINGS.md`, or execute the update directly if you have file-system write access. Include the date and context.

## Rules
- **Actionable Conciseness:** Entries must be brief directives, not long explanations (e.g., "Use Prisma `createMany` instead of loops for batch inserts").
- **Categorization:** Classify learnings into logical blocks (e.g., `Architecture`, `Tooling`, `Known Gotchas`, `Deployment`).
- **Context Window Optimization:** Keep the file lean. If a new architectural decision invalidates an old learning (e.g., moving from a local SQLite to a Dockerized database), delete or explicitly deprecate the old rule.
- **No Hallucination:** Only append rules that have been explicitly proven to work in the current project's environment during the session.

## End State
The project maintains a living, strictly formatted memory file that acts as a custom system prompt. This drastically reduces regressions, eliminates repetitive prompt corrections, and preserves deep context across different development sessions.
