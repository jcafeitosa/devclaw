# Design: Communication OS (Channels + Threads + Notifications)

> Vault: `05_communication_os/`. Phase 2 (último item).

## 🎯 Goal

Primitivas de comunicação: Channels (5 types) · Threads (tópicos dentro de channel) · AgentComm router (4 modos) · NotificationCenter (6 types + delivery).

## 🧩 Componentes

1. Types + errors: `ChannelType`, `Channel`, `Thread`, `CommMessage`, `Notification`, `Subscription`, `DeliveryChannel`.
2. `ChannelRegistry`: create/join/leave/post/subscribe; access policy; link to project/task.
3. `ThreadStore`: create thread com parent channel, reply, close, required links (project/task/decision).
4. `AgentCommRouter`: 4 modos — `direct(from,to)`, `broadcast(roles?)`, `channel(channelId)`, `event(type)`; uses existing `EventEmitter`.
5. `NotificationCenter`: emit + delivery dispatchers (in-app default + pluggable external); types + priority.
6. Barrel + `@devclaw/core/comm` subpath.

## 📋 Plan (6 tasks)

| # | Task |
|---|---|
| 1 | Types + errors |
| 2 | ChannelRegistry + access policy |
| 3 | ThreadStore + required-links validation |
| 4 | AgentCommRouter (4 modes) |
| 5 | NotificationCenter + delivery |
| 6 | Barrel + subpath |

## ✅ DoD

- 0 skip/fail/info/suppressions
- Access-denied policies tested (read/write)
- Notification with multi-delivery aggregates results
