export interface TestCase {
  name: string
  className: string
  time: number
  status: "pass" | "fail" | "error" | "skip"
  message?: string
  stackTrace?: string
}

export interface TestSuite {
  name: string
  tests: number
  failures: number
  errors: number
  time: number
  testCases: TestCase[]
}

export interface TestResultSummary {
  testSuites: TestSuite[]
}

// ---------------------------------------------------------------------------
// JUnit XML parser
// ---------------------------------------------------------------------------

function getAttr(tag: string, attr: string): string {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`)
  const m = tag.match(re)
  if (m) return m[1]
  const re2 = new RegExp(`${attr}\\s*=\\s*'([^']*)'`)
  const m2 = tag.match(re2)
  return m2 ? m2[1] : ""
}

function numAttr(tag: string, attr: string, fallback = 0): number {
  const v = getAttr(tag, attr)
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function extractText(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)
  const m = xml.match(re)
  return m ? m[1].trim() : undefined
}

export function parseJUnitXML(xml: string): TestResultSummary {
  const testSuites: TestSuite[] = []

  // Match both <testsuite> and <testsuites> wrappers
  const suiteRegex = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g
  let suiteMatch: RegExpExecArray | null

  while ((suiteMatch = suiteRegex.exec(xml)) !== null) {
    const attrs = suiteMatch[1]
    const body = suiteMatch[2]

    const testCases: TestCase[] = []
    const caseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g
    let caseMatch: RegExpExecArray | null

    while ((caseMatch = caseRegex.exec(body)) !== null) {
      const caseAttrs = caseMatch[1]
      const caseBody = caseMatch[2] ?? ""

      let status: TestCase["status"] = "pass"
      let message: string | undefined
      let stackTrace: string | undefined

      if (/<failure\b/.test(caseBody)) {
        status = "fail"
        message = getAttr(caseBody.match(/<failure\b([^>]*)/)![0], "message") || undefined
        stackTrace = extractText(caseBody, "failure")
      } else if (/<error\b/.test(caseBody)) {
        status = "error"
        message = getAttr(caseBody.match(/<error\b([^>]*)/)![0], "message") || undefined
        stackTrace = extractText(caseBody, "error")
      } else if (/<skipped/.test(caseBody)) {
        status = "skip"
        message = getAttr(caseBody.match(/<skipped\b([^>]*)/)![0], "message") || undefined
      }

      testCases.push({
        name: getAttr(caseAttrs, "name"),
        className: getAttr(caseAttrs, "classname"),
        time: numAttr(caseAttrs, "time"),
        status,
        message,
        stackTrace,
      })
    }

    testSuites.push({
      name: getAttr(attrs, "name"),
      tests: numAttr(attrs, "tests", testCases.length),
      failures: numAttr(attrs, "failures"),
      errors: numAttr(attrs, "errors"),
      time: numAttr(attrs, "time"),
      testCases,
    })
  }

  return { testSuites }
}

// ---------------------------------------------------------------------------
// TAP (Test Anything Protocol) parser
// ---------------------------------------------------------------------------

export function parseTAPOutput(tap: string): TestResultSummary {
  const lines = tap.split("\n")
  const testCases: TestCase[] = []
  let currentFailMessage: string[] = []
  let lastFailCase: TestCase | null = null

  for (const raw of lines) {
    const line = raw.trim()

    // Plan line (e.g. "1..5") — skip
    if (/^\d+\.\.\d+$/.test(line)) continue
    // TAP version line
    if (/^TAP version/i.test(line)) continue
    // Comment / diagnostic
    if (line.startsWith("#")) continue

    // Flush any accumulated YAML/diagnostic block for the last failure
    if (lastFailCase && currentFailMessage.length > 0 && !line.startsWith("  ")) {
      lastFailCase.stackTrace = currentFailMessage.join("\n")
      currentFailMessage = []
      lastFailCase = null
    }

    // YAML-ish diagnostic block for failures
    if (lastFailCase && (line.startsWith("  ") || line === "---" || line === "...")) {
      if (line !== "---" && line !== "...") {
        currentFailMessage.push(line)
      }
      continue
    }

    const okMatch = line.match(/^(not ok|ok)\s+(\d+)?\s*[-–]?\s*(.*)$/)
    if (!okMatch) continue

    const passed = okMatch[1] === "ok"
    const description = okMatch[3]?.trim() ?? ""

    const isSkip = /# skip/i.test(description) || /# todo/i.test(description)
    const cleanName = description.replace(/#\s*(skip|todo)\b.*/i, "").trim()

    let status: TestCase["status"] = passed ? "pass" : "fail"
    if (isSkip) status = "skip"

    const tc: TestCase = {
      name: cleanName || `test ${testCases.length + 1}`,
      className: "",
      time: 0,
      status,
    }

    if (!passed && !isSkip) {
      lastFailCase = tc
    }

    testCases.push(tc)
  }

  // Flush remaining diagnostics
  if (lastFailCase && currentFailMessage.length > 0) {
    lastFailCase.stackTrace = currentFailMessage.join("\n")
  }

  const failures = testCases.filter((t) => t.status === "fail").length
  const errors = testCases.filter((t) => t.status === "error").length

  const suite: TestSuite = {
    name: "TAP",
    tests: testCases.length,
    failures,
    errors,
    time: 0,
    testCases,
  }

  return { testSuites: [suite] }
}
