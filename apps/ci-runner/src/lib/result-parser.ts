import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const JUNIT_GLOBS = [
  "test-results",
  "test-reports",
  "junit",
  "build/test-results",
  "target/surefire-reports",
  "coverage",
];

const MAX_SCAN_DEPTH = 3;
const MAX_FILE_SIZE = 1_048_576; // 1 MB

/**
 * Scan stdout/stderr and well-known directories for test result artifacts.
 * Returns JUnit XML or TAP output if found.
 */
export function scanForTestResults(
  workDir: string,
  combinedOutput: string,
): { junitXml?: string; tapOutput?: string } {
  const result: { junitXml?: string; tapOutput?: string } = {};

  if (combinedOutput.includes("<testsuite")) {
    const match = combinedOutput.match(/<\?xml[\s\S]*<\/testsuites?>|<testsuites?>[\s\S]*<\/testsuites?>/);
    if (match) {
      result.junitXml = match[0];
      return result;
    }
  }

  if (/^TAP version/m.test(combinedOutput) || /^(not )?ok\s+\d/m.test(combinedOutput)) {
    result.tapOutput = combinedOutput;
    return result;
  }

  const xml = findJUnitXmlFile(workDir, 0);
  if (xml) {
    result.junitXml = xml;
    return result;
  }

  return result;
}

function findJUnitXmlFile(dir: string, depth: number): string | undefined {
  if (depth > MAX_SCAN_DEPTH) return undefined;

  const dirsToSearch = depth === 0
    ? JUNIT_GLOBS.map((d) => join(dir, d)).filter(safeIsDir).concat([dir])
    : [dir];

  for (const searchDir of dirsToSearch) {
    try {
      const entries = readdirSync(searchDir);
      for (const entry of entries) {
        const full = join(searchDir, entry);
        try {
          const stat = statSync(full);
          if (stat.isFile() && entry.endsWith(".xml") && stat.size < MAX_FILE_SIZE) {
            const content = readFileSync(full, "utf-8");
            if (content.includes("<testsuite")) return content;
          }
          if (stat.isDirectory() && depth < MAX_SCAN_DEPTH) {
            const found = findJUnitXmlFile(full, depth + 1);
            if (found) return found;
          }
        } catch {
          // skip inaccessible files
        }
      }
    } catch {
      // skip inaccessible directories
    }
  }

  return undefined;
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
