import { useState } from 'react'
import type { Question, QuestionOption } from '@/types'

interface QuestionInputProps {
  questions: Question[]
  onSubmit: (answers: Record<string, string>) => void
}

export function QuestionInput({ questions, onSubmit }: QuestionInputProps) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})

  const total = questions.length
  const current = questions[step]
  const progress = ((step + 1) / total) * 100

  const getLabel = (opt: string | QuestionOption) =>
    typeof opt === 'string' ? opt : opt.label
  const getDesc = (opt: string | QuestionOption) =>
    typeof opt === 'object' ? opt.description : undefined

  const key = `q${step}`
  const currentAnswer = answers[key]
  const isStepDone = currentAnswer
    ? currentAnswer === '__custom__' ? !!customInputs[key]?.trim() : true
    : false

  const allDone = questions.every((_, i) => {
    const a = answers[`q${i}`]
    if (!a) return false
    return a === '__custom__' ? !!customInputs[`q${i}`]?.trim() : true
  })

  const handleSelect = (value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
    if (value !== '__custom__') {
      setCustomInputs((prev) => ({ ...prev, [key]: '' }))
    }
  }

  const handleCustom = (value: string) => {
    setCustomInputs((prev) => ({ ...prev, [key]: value }))
    setAnswers((prev) => ({ ...prev, [key]: '__custom__' }))
  }

  const handleSubmit = () => {
    const result: Record<string, string> = {}
    questions.forEach((q, i) => {
      const a = answers[`q${i}`]
      result[q.header || q.question] =
        a === '__custom__' ? customInputs[`q${i}`] || '' : a || ''
    })
    onSubmit(result)
  }

  return (
    <div className="border-t border-border bg-card/50 backdrop-blur-sm px-4 py-4">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-xl border border-primary/30 bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Questions from AI</span>
            <span className="text-xs text-muted-foreground">{step + 1}/{total}</span>
          </div>

          {total > 1 && (
            <div className="h-1 bg-secondary rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          {current.header && (
            <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 mb-2">
              {current.header}
            </span>
          )}

          <p className="text-sm text-foreground mb-3">{current.question}</p>

          {current.options && current.options.length > 0 ? (
            <div className="space-y-2 mb-4">
              {current.options.map((opt, i) => {
                const label = getLabel(opt)
                const desc = getDesc(opt)
                const selected = currentAnswer === label
                return (
                  <button
                    key={i}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      selected
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-border hover:border-primary/30 hover:bg-card'
                    }`}
                    onClick={() => handleSelect(label)}
                  >
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      selected ? 'border-primary' : 'border-muted-foreground/40'
                    }`}>
                      {selected && <div className="h-2 w-2 rounded-full bg-primary" />}
                    </div>
                    <div>
                      <div className="text-sm text-foreground">{label}</div>
                      {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
                    </div>
                  </button>
                )
              })}

              <button
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  currentAnswer === '__custom__'
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border hover:border-primary/30 hover:bg-card'
                }`}
                onClick={() => handleSelect('__custom__')}
              >
                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  currentAnswer === '__custom__' ? 'border-primary' : 'border-muted-foreground/40'
                }`}>
                  {currentAnswer === '__custom__' && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm text-foreground">Other</div>
                  {currentAnswer === '__custom__' && (
                    <textarea
                      className="mt-2 w-full resize-none bg-input/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                      value={customInputs[key] || ''}
                      onChange={(e) => handleCustom(e.target.value)}
                      placeholder="Type your answer..."
                      autoFocus
                      rows={2}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>
              </button>
            </div>
          ) : (
            <textarea
              className="w-full resize-none bg-input/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 mb-4"
              value={customInputs[key] || ''}
              onChange={(e) => {
                setCustomInputs((prev) => ({ ...prev, [key]: e.target.value }))
                setAnswers((prev) => ({ ...prev, [key]: e.target.value }))
              }}
              placeholder="Type your answer..."
              autoFocus
              rows={3}
            />
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Back
            </button>
            {step < total - 1 ? (
              <button
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={() => setStep((s) => s + 1)}
                disabled={!isStepDone}
              >
                Next
              </button>
            ) : (
              <button
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={handleSubmit}
                disabled={!allDone}
              >
                Submit
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
