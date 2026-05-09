"use client"

import { useCallback, useEffect, useState } from "react"
import type { TestCase, TestResultSummary, TestSuite } from "@openforge/shared/lib/ci/test-results";

type Props = {
  owner: string
  repo: string
  runId: string
}

export function TestResultsPanel({ owner, repo, runId }: Props) {
  const [results, setResults] = useState<TestResultSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(runId)}/test-results`
      const res = await fetch(url, { cache: "no-store" })
      const json = (await res.json()) as { testResults: TestResultSummary | null; error?: string }
      if (!res.ok) throw new Error(json.error ?? "Failed to load test results")
      setResults(json.testResults)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [owner, repo, runId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="text-sm text-text-tertiary">Loading test results…</p>
  }

  if (error) {
    return <p className="text-sm text-danger" role="alert">{error}</p>
  }

  if (!results || results.testSuites.length === 0) {
    return <p className="text-sm text-text-tertiary">No test results available for this run.</p>
  }

  const totalTests = results.testSuites.reduce((s, ts) => s + ts.tests, 0)
  const totalFailures = results.testSuites.reduce((s, ts) => s + ts.failures, 0)
  const totalErrors = results.testSuites.reduce((s, ts) => s + ts.errors, 0)
  const totalSkips = results.testSuites.reduce(
    (s, ts) => s + ts.testCases.filter((tc) => tc.status === "skip").length,
    0,
  )
  const totalPassed = totalTests - totalFailures - totalErrors - totalSkips

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <CountBadge label="Passed" count={totalPassed} color="emerald" />
        <CountBadge label="Failed" count={totalFailures} color="red" />
        <CountBadge label="Errors" count={totalErrors} color="orange" />
        <CountBadge label="Skipped" count={totalSkips} color="zinc" />
      </div>

      {results.testSuites.map((suite, i) => (
        <SuiteSection key={i} suite={suite} />
      ))}
    </div>
  )
}

function CountBadge({ label, count, color }: { label: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "bg-accent-bg text-accent border-accent/20",
    red: "bg-danger/15 text-danger border-danger/20",
    orange: "bg-orange-500/15 text-orange-300 border-orange-500/20",
    zinc: "bg-text-tertiary/15 text-text-secondary border-text-tertiary/20",
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colorMap[color] ?? colorMap.zinc}`}>
      <span className="tabular-nums">{count}</span> {label}
    </span>
  )
}

function SuiteSection({ suite }: { suite: TestSuite }) {
  const [expanded, setExpanded] = useState(suite.failures > 0 || suite.errors > 0)

  return (
    <div className="border border-stroke-subtle bg-surface-1/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-text-primary hover:bg-surface-2/50"
      >
        <span className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          {suite.name || "Test Suite"}
        </span>
        <span className="text-xs text-text-tertiary">
          {suite.tests} tests · {suite.time.toFixed(2)}s
        </span>
      </button>

      {expanded && (
        <div className="border-t border-stroke-subtle">
          {suite.testCases.length === 0 ? (
            <p className="px-4 py-3 text-sm text-text-tertiary">No test cases recorded.</p>
          ) : (
            <ul className="divide-y divide-stroke-subtle/60">
              {suite.testCases.map((tc, i) => (
                <TestCaseRow key={i} tc={tc} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const statusIcons: Record<TestCase["status"], { icon: string; color: string }> = {
  pass: { icon: "✓", color: "text-accent-text" },
  fail: { icon: "✗", color: "text-danger" },
  error: { icon: "!", color: "text-orange-400" },
  skip: { icon: "–", color: "text-text-tertiary" },
}

function TestCaseRow({ tc }: { tc: TestCase }) {
  const [expanded, setExpanded] = useState(false)
  const { icon, color } = statusIcons[tc.status]
  const hasDetails = tc.message || tc.stackTrace

  return (
    <li>
      <button
        type="button"
        disabled={!hasDetails}
        onClick={() => hasDetails && setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-surface-2/30 disabled:cursor-default"
      >
        <span className={`font-mono font-bold ${color}`}>{icon}</span>
        <span className="flex-1 truncate text-text-primary">
          {tc.className ? `${tc.className} › ` : ""}
          {tc.name}
        </span>
        {tc.time > 0 && (
          <span className="shrink-0 text-xs tabular-nums text-text-tertiary">{tc.time.toFixed(3)}s</span>
        )}
        {hasDetails && (
          <svg
            className={`h-3 w-3 text-text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        )}
      </button>
      {expanded && hasDetails && (
        <div className="mx-4 mb-3 border border-stroke-subtle bg-surface-0 p-3">
          {tc.message && (
            <p className="mb-1 text-xs font-medium text-danger">{tc.message}</p>
          )}
          {tc.stackTrace && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap wrap-break-words font-mono text-xs leading-relaxed text-text-tertiary">
              {tc.stackTrace}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}
