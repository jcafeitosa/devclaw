import type { CliId } from "@devclaw/core/bridge"
import {
  type ConsensusObserver,
  type ConsensusResult,
  type ConsensusScorer,
  runConsensus,
} from "@devclaw/core/consensus"
import { type BudgetEnforcer, makeDefaultBudgetEnforcer } from "@devclaw/core/cost"
import { Box, render, Text, useApp } from "ink"
import { useEffect, useState } from "react"

import type { Runtime } from "../runtime.ts"

export interface ConsensusLiveParticipant {
  cli: CliId
  status: "running" | "completed" | "failed" | "scored"
  text: string
  events: number
  score?: number
  feedback?: string
  error?: string
  durationMs?: number
}

export interface ConsensusLiveSnapshot {
  prompt: string
  taskId: string
  startedAt: number
  phase: "running" | "done" | "error"
  participants: Record<string, ConsensusLiveParticipant>
  order: CliId[]
  winner?: CliId
  winnerText?: string
  durationMs?: number
  error?: string
}

export interface ConsensusLiveAppProps {
  runtime: Runtime
  prompt: string
  taskId: string
  sessionId?: string
  scorer: ConsensusScorer
  clis?: CliId[]
  cwd?: string
}

function initialParticipant(cli: CliId): ConsensusLiveParticipant {
  return {
    cli,
    status: "running",
    text: "",
    events: 0,
  }
}

function addParticipant(state: ConsensusLiveSnapshot, cli: CliId): ConsensusLiveSnapshot {
  if (state.participants[cli]) return state
  return {
    ...state,
    order: [...state.order, cli],
    participants: {
      ...state.participants,
      [cli]: initialParticipant(cli),
    },
  }
}

function updateParticipant(
  state: ConsensusLiveSnapshot,
  cli: CliId,
  updater: (current: ConsensusLiveParticipant) => ConsensusLiveParticipant,
): ConsensusLiveSnapshot {
  const current = state.participants[cli] ?? initialParticipant(cli)
  const next = updater(current)
  const base = addParticipant(state, cli)
  return {
    ...base,
    participants: {
      ...base.participants,
      [cli]: next,
    },
  }
}

function appendParticipantText(
  state: ConsensusLiveSnapshot,
  cli: CliId,
  content: string,
): ConsensusLiveSnapshot {
  return updateParticipant(state, cli, (current) => ({
    ...current,
    text: `${current.text}${content}`,
    events: current.events + 1,
  }))
}

function participantFeedback(participant: ConsensusLiveParticipant): string {
  const score = participant.score === undefined ? "--" : participant.score.toFixed(2)
  const status = participant.error ? "failed" : participant.status
  const base = `${participant.cli.padEnd(10)} ${status.padEnd(8)} score=${score} events=${String(
    participant.events,
  ).padStart(2)}`
  if (participant.error) return `${base} error=${participant.error}`
  if (participant.feedback) return `${base} note=${participant.feedback}`
  return base
}

function shorten(text: string, max = 72): string {
  if (text.length <= max) return text
  if (max <= 3) return text.slice(0, max)
  return `${text.slice(0, max - 3)}...`
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = (ms / 1000).toFixed(1)
  return `${seconds}s`
}

function budgetRow(label: string, used: number, limit: number): string {
  return `  ${label}: $${used.toFixed(2)} / $${limit.toFixed(2)}`
}

export function ConsensusLiveView({
  snapshot,
  budget,
}: {
  snapshot: ConsensusLiveSnapshot
  budget?: BudgetEnforcer
}) {
  const elapsedMs = snapshot.durationMs ?? Math.max(0, Date.now() - snapshot.startedAt)
  const usage = budget?.usage()
  const limits = budget?.limitsSnapshot()
  return (
    <Box flexDirection="column">
      <Text>devclaw consensus</Text>
      <Text>{`task: ${snapshot.taskId}`}</Text>
      <Text>{`prompt: ${snapshot.prompt}`}</Text>
      <Text>{`phase: ${snapshot.phase}  elapsed: ${formatElapsed(elapsedMs)}`}</Text>
      {budget && usage && limits ? (
        <Box flexDirection="column">
          <Text>budget:</Text>
          <Text>{budgetRow("task", usage.taskUsd[snapshot.taskId] ?? 0, limits.taskUsd ?? 0)}</Text>
          <Text>
            {budgetRow("session", Object.values(usage.sessionUsd)[0] ?? 0, limits.sessionUsd ?? 0)}
          </Text>
          <Text>{budgetRow("day", usage.dayUsd, limits.dayUsd ?? 0)}</Text>
          {(
            [
              { label: "task", used: usage.taskUsd[snapshot.taskId] ?? 0, limit: limits.taskUsd },
              {
                label: "session",
                used: Object.values(usage.sessionUsd)[0] ?? 0,
                limit: limits.sessionUsd,
              },
              { label: "day", used: usage.dayUsd, limit: limits.dayUsd },
            ] as const
          )
            .filter((row) => row.limit !== undefined)
            .map((row) => {
              const util = row.limit ? row.used / row.limit : 0
              if (util < 0.8) return null
              return (
                <Text key={row.label}>{`  warning: ${row.label} budget ${Math.round(
                  util * 100,
                )}% used`}</Text>
              )
            })}
        </Box>
      ) : null}
      <Text>participants:</Text>
      {snapshot.order.length === 0 ? <Text> (waiting for bridges)</Text> : null}
      {snapshot.order.map((cli) => {
        const participant = snapshot.participants[cli]
        if (!participant) return null
        return (
          <Box key={cli} flexDirection="column">
            <Text>{`  ${participantFeedback(participant)}`}</Text>
            {participant.text.length > 0 ? (
              <Text>{`    text: ${shorten(participant.text)}`}</Text>
            ) : null}
          </Box>
        )
      })}
      {snapshot.winner ? <Text>{`winner: ${snapshot.winner}`}</Text> : null}
      {snapshot.winnerText ? <Text>{`winner text: ${shorten(snapshot.winnerText)}`}</Text> : null}
      {snapshot.error ? <Text>{`error: ${snapshot.error}`}</Text> : null}
    </Box>
  )
}

function ConsensusLiveApp({
  runtime,
  prompt,
  taskId,
  sessionId,
  scorer,
  clis,
  cwd = process.cwd(),
}: ConsensusLiveAppProps) {
  const { exit } = useApp() as { exit: (value?: number) => void }
  const [budget] = useState(() => runtime.budget ?? makeDefaultBudgetEnforcer())
  const currentSessionId = sessionId ?? taskId
  const [snapshot, setSnapshot] = useState<ConsensusLiveSnapshot>(() => ({
    prompt,
    taskId,
    startedAt: Date.now(),
    phase: "running",
    participants: {},
    order: [],
  }))
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [, bump] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      bump((n) => n + 1)
    }, 250)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const observer: ConsensusObserver = {
      onParticipantStart(cli) {
        if (cancelled) return
        setSnapshot((current) => addParticipant(current, cli))
      },
      onParticipantEvent(cli, event) {
        if (cancelled) return
        if (event.type !== "text") {
          setSnapshot((current) =>
            updateParticipant(current, cli, (participant) => ({
              ...participant,
              events: participant.events + 1,
            })),
          )
          return
        }
        setSnapshot((current) => appendParticipantText(current, cli, event.content))
      },
      onParticipantComplete(participant) {
        if (cancelled) return
        setSnapshot((current) =>
          updateParticipant(current, participant.cli, (currentParticipant) => ({
            ...currentParticipant,
            status: participant.error ? "failed" : "completed",
            text: participant.text,
            events: participant.events.length,
            error: participant.error?.message,
            durationMs: participant.durationMs,
          })),
        )
      },
      onScore(score) {
        if (cancelled) return
        setSnapshot((current) =>
          updateParticipant(current, score.cli, (currentParticipant) => ({
            ...currentParticipant,
            score: score.score,
            feedback: score.feedback,
            status: currentParticipant.error ? "failed" : "scored",
          })),
        )
      },
    }

    void (async () => {
      try {
        const result: ConsensusResult = await runConsensus(
          {
            bridges: runtime.bridges,
            scorer,
            clis,
            budget,
            observer,
          },
          {
            taskId,
            sessionId: currentSessionId,
            agentId: "cli",
            cli: "claude",
            cwd,
            prompt,
          },
        )
        if (cancelled) return
        setSnapshot((current) => ({
          ...current,
          phase: "done",
          winner: result.winner,
          winnerText: result.winnerText,
          durationMs: result.durationMs,
        }))
        setExitCode(0)
      } catch (err) {
        if (cancelled) return
        setSnapshot((current) => ({
          ...current,
          phase: "error",
          error: err instanceof Error ? err.message : String(err),
          durationMs: Math.max(0, Date.now() - current.startedAt),
        }))
        setExitCode(1)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [budget, clis, cwd, currentSessionId, prompt, runtime.bridges, scorer, taskId])

  useEffect(() => {
    if (exitCode === null) return
    const timer = setTimeout(() => exit(exitCode), 25)
    return () => clearTimeout(timer)
  }, [exit, exitCode])

  return <ConsensusLiveView snapshot={snapshot} budget={budget} />
}

export async function renderConsensusLive(props: ConsensusLiveAppProps): Promise<number> {
  const instance = render(<ConsensusLiveApp {...props} />, {
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    interactive: process.stdout.isTTY,
    alternateScreen: process.stdout.isTTY,
  })
  try {
    const exitCode = await instance.waitUntilExit()
    return typeof exitCode === "number" ? exitCode : 0
  } finally {
    instance.cleanup()
  }
}
