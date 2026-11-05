---
"CherryStudio": minor
---

Add Collaborative Studio: a multi-agent team orchestration workspace where a Leader decomposes an objective into specialist tasks, executes them concurrently with retry/pause/resume/cancel, and synthesizes the results. Introduces the `@cherrystudio/agent-team` domain package, a SQLite-backed `AgentTeamService` lifecycle service, 16 `agent.team.*` IPC routes and events, and the `/app/studio` page.