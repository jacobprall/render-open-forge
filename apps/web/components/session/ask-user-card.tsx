"use client";

export function AskUserCard({
  ask,
  onRespond,
}: {
  ask: { question?: string; options?: string[] };
  onRespond: (answer: string) => void;
}) {
  const question = "question" in ask ? (ask as { question: string }).question : "";
  const options = "options" in ask ? ((ask as { options?: string[] }).options ?? []) : [];

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="mb-1 text-xs font-medium text-amber-400/70">Agent needs your input</p>
      <p className="mb-3 text-sm text-amber-200">{question}</p>
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {options.map((opt: string) => (
            <button
              key={opt}
              type="button"
              onClick={() => onRespond(opt)}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const answer = formData.get("answer") as string;
            if (answer?.trim()) onRespond(answer);
          }}
          className="flex gap-2"
        >
          <input
            name="answer"
            className="flex-1 rounded-lg border border-amber-500/30 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
            placeholder="Type your answer…"
          />
          <button
            type="submit"
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
          >
            Reply
          </button>
        </form>
      )}
    </div>
  );
}
