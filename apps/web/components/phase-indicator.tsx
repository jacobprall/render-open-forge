"use client";

const phases = ["understand", "spec", "execute", "verify", "deliver", "complete"] as const;
type Phase = (typeof phases)[number];

const phaseConfig: Record<Phase, { label: string; color: string; bgColor: string }> = {
  understand: { label: "Understand", color: "text-purple-400", bgColor: "bg-purple-400" },
  spec: { label: "Spec", color: "text-amber-400", bgColor: "bg-amber-400" },
  execute: { label: "Execute", color: "text-emerald-400", bgColor: "bg-emerald-400" },
  verify: { label: "Verify", color: "text-cyan-400", bgColor: "bg-cyan-400" },
  deliver: { label: "Deliver", color: "text-blue-400", bgColor: "bg-blue-400" },
  complete: { label: "Complete", color: "text-zinc-400", bgColor: "bg-zinc-400" },
};

interface PhaseIndicatorProps {
  phase: string;
  compact?: boolean;
}

export function PhaseIndicator({ phase, compact }: PhaseIndicatorProps) {
  const currentIndex = phases.indexOf(phase as Phase);
  const config = phaseConfig[phase as Phase] ?? phaseConfig.execute;

  if (compact) {
    return (
      <span className={`text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {phases.map((p, i) => {
        const isActive = i === currentIndex;
        const isPast = i < currentIndex;
        const pConfig = phaseConfig[p];

        return (
          <div key={p} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center">
              <div
                className={`h-2 w-2 rounded-full transition-all ${
                  isActive
                    ? `${pConfig.bgColor} ring-2 ring-offset-1 ring-offset-zinc-900 ring-current`
                    : isPast
                      ? `${pConfig.bgColor} opacity-60`
                      : "bg-zinc-700"
                }`}
              />
              {!compact && (
                <span
                  className={`mt-1 text-[10px] font-medium ${
                    isActive ? pConfig.color : isPast ? "text-zinc-500" : "text-zinc-700"
                  }`}
                >
                  {pConfig.label}
                </span>
              )}
            </div>
            {i < phases.length - 1 && (
              <div
                className={`h-px w-4 ${isPast ? "bg-zinc-600" : "bg-zinc-800"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
