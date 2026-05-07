export interface MetricEntry {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private entries: MetricEntry[] = [];

  counter(name: string, labels: Record<string, string> = {}): void {
    const existing = this.entries.find(
      (e) =>
        e.name === name && JSON.stringify(e.labels) === JSON.stringify(labels),
    );
    if (existing) {
      existing.value++;
      existing.timestamp = Date.now();
    } else {
      this.entries.push({ name, value: 1, labels, timestamp: Date.now() });
    }
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const existing = this.entries.find(
      (e) =>
        e.name === name && JSON.stringify(e.labels) === JSON.stringify(labels),
    );
    if (existing) {
      existing.value = value;
      existing.timestamp = Date.now();
    } else {
      this.entries.push({ name, value, labels, timestamp: Date.now() });
    }
  }

  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    this.entries.push({ name, value, labels, timestamp: Date.now() });
  }

  getMetrics(): MetricEntry[] {
    return [...this.entries];
  }

  toPrometheus(): string {
    const lines: string[] = [];
    for (const entry of this.entries) {
      const labelStr = Object.entries(entry.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      const labelPart = labelStr ? `{${labelStr}}` : "";
      lines.push(`${entry.name}${labelPart} ${entry.value} ${entry.timestamp}`);
    }
    return lines.join("\n");
  }

  reset(): void {
    this.entries = [];
  }
}

export const metrics = new MetricsCollector();
