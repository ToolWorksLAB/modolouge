"use client";
const labels = {
  implemented: "Available",
  needs_information: "Needs your input",
  unsupported: "Not supported yet",
};
// Stable across reordering so an old answer cannot attach to a different question.
function questionId(text) {
  let hash = 2166136261;
  for (const char of text)
    hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
export default function AppRequirements({
  plan,
  onAnswers,
  onContinue,
  disabled,
  consent,
}) {
  const requirements = plan.requirements || [];
  const questions = requirements
    .filter((r) => r.question)
    .map((r) => ({ id: r.id, question: r.question }));
  for (const q of plan.questions || [])
    if (!questions.some((r) => r.question === q))
      questions.push({ id: "question-" + questionId(q), question: q });
  function answer(q, value) {
    const answers = [
      ...(plan.answers || []).filter((a) => a.id !== q.id),
      { ...q, value },
    ];
    onAnswers(answers.slice(-20));
  }
  if (!requirements.length && !questions.length) return null;
  return (
    <section className="app-requirements" aria-label="Project requirements">
      <details>
        <summary>
          Your brief, accounted for{" "}
          <span>
            {requirements.filter((r) => r.status === "implemented").length}/
            {requirements.length} available · {questions.length} questions
          </span>
        </summary>
        <div className="app-requirement-list">
          {requirements.map((r) => (
            <article key={r.id}>
              <span className={"requirement-status " + r.status}>
                {labels[r.status]}
              </span>
              <strong>{r.title}</strong>
              <p>{r.detail}</p>
            </article>
          ))}
        </div>
        {!!questions.length && (
          <div className="app-questions">
            <h3>A few details will help.</h3>
            <p>
              Answer what you know. You can also reply in the conversation; the
              agent will carry the answers into the next draft.
            </p>
            {questions.slice(0, 6).map((q) => (
              <label key={q.id}>
                {q.question}
                <textarea
                  rows={2}
                  maxLength={1500}
                  disabled={disabled}
                  value={
                    (plan.answers || []).find((a) => a.id === q.id)?.value || ""
                  }
                  onChange={(e) => answer(q, e.target.value)}
                />
              </label>
            ))}
            <button
              className="button quiet"
              disabled={
                disabled ||
                !consent ||
                !(plan.answers || []).some((a) => a.value.trim())
              }
              onClick={onContinue}
            >
              Save answers & continue ↗
            </button>
            {!consent && (
              <small>
                Enable AI consent in the conversation to continue with these
                answers.
              </small>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
