"use client"

import type { RecommendationIntake } from "@workspace/db"
import { CircleAlert, LoaderCircle, Sparkles, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition } from "react"

import { createRecommendationAction } from "../actions"

/* Preset option groups offered in the form (page spec §7). The engine scores
 * free text, so these are UX convenience — a custom value is always valid. */
const PRESETS = {
  experienceLevel: [
    "Just starting out",
    "Built a few small projects",
    "Junior professional",
    "Career-changer with other experience",
  ],
  knownStackSuggestions: [
    "JavaScript",
    "TypeScript",
    "React",
    "Next.js",
    "Node",
    "Python",
    "HTML/CSS",
    "Tailwind",
    "SQL",
    "Git",
  ],
  jobTarget: [
    "Frontend developer",
    "Full-stack developer",
    "Backend developer",
    "AI / LLM engineer",
    "Not sure yet",
  ],
  timeBudget: ["A weekend", "A few weeks", "A couple of months", "Open-ended"],
  complexityTolerance: [
    "Low — keep it simple",
    "Moderate",
    "High — I want a challenge",
  ],
  projectType: [
    "A web app",
    "A full-stack app with an API",
    "An AI / LLM-powered app",
    "A developer tool / workflow",
    "Not sure yet",
  ],
  aiToolPreference: [
    "Claude Code",
    "Cursor",
    "GitHub Copilot",
    "ChatGPT / other chat",
    "No preference",
  ],
}

const EMPTY_INTAKE: RecommendationIntake = {
  goal: "",
  experienceLevel: "",
  knownStack: [],
  jobTarget: "",
  timeBudget: "",
  complexityTolerance: "",
  projectType: "",
  aiToolPreference: "",
  learningFocus: "",
}

/** The intake fields that must be filled before the form can be submitted. */
const REQUIRED: { key: keyof RecommendationIntake; message: string }[] = [
  { key: "experienceLevel", message: "Pick the experience level that fits." },
  { key: "jobTarget", message: "Tell us the kind of role you're aiming at." },
  { key: "goal", message: "Tell us your goal so we can match it." },
  { key: "projectType", message: "Pick the rough shape of the project." },
  {
    key: "learningFocus",
    message: "Add one thing you want to be able to explain afterwards.",
  },
  {
    key: "timeBudget",
    message: "Pick the time budget that fits — there's no wrong answer.",
  },
  { key: "complexityTolerance", message: "Pick your complexity tolerance." },
  { key: "aiToolPreference", message: "Pick the AI tool you'll reach for." },
]

type Errors = Partial<Record<keyof RecommendationIntake, string>>

/**
 * The `/recommend` intake form (page spec §6–§12). A Client Component island:
 * it owns the nine-field form state, light client-side validation, and the
 * submit-to-engine flow. On success it navigates to `/recommend/[id]`.
 */
export function IntakeForm() {
  const router = useRouter()
  const [values, setValues] = useState<RecommendationIntake>(EMPTY_INTAKE)
  const [errors, setErrors] = useState<Errors>({})
  const [engineError, setEngineError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof RecommendationIntake>(
    key: K,
    value: RecommendationIntake[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  function submit() {
    const next: Errors = {}
    for (const { key, message } of REQUIRED) {
      if (String(values[key] ?? "").trim() === "") next[key] = message
    }
    setErrors(next)
    const firstInvalid = REQUIRED.find(({ key }) => next[key])
    if (firstInvalid) {
      requestAnimationFrame(() =>
        document.getElementById(`rf-${firstInvalid.key}`)?.focus(),
      )
      return
    }
    setEngineError(null)
    startTransition(async () => {
      const result = await createRecommendationAction(values)
      if (result.ok) {
        router.push(`/recommend/${result.id}`)
      } else {
        setEngineError(result.error)
      }
    })
  }

  if (engineError) {
    return (
      <div className="error-state" role="alert" style={{ marginTop: 32 }}>
        <div className="error-head">
          <div className="error-icon" aria-hidden="true">
            <CircleAlert size={18} />
          </div>
          <div className="error-title">
            Couldn&apos;t build your recommendation
          </div>
        </div>
        <div className="error-body">
          Something failed while saving the recommendation. Your answers are
          still here — this usually clears on a retry.
        </div>
        <div className="error-actions">
          <button type="button" className="btn btn-primary" onClick={submit}>
            Try again
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setEngineError(null)}
          >
            Edit your answers
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <fieldset className="r-fieldset" disabled={pending}>
        <legend>About you</legend>
        <p className="r-fieldset-intro">
          Where you&apos;re starting from. This helps us calibrate the
          difficulty.
        </p>

        <RadioField
          name="experienceLevel"
          label="Experience level"
          helper="How much hands-on coding experience do you have?"
          options={PRESETS.experienceLevel}
          value={values.experienceLevel}
          onChange={(v) => set("experienceLevel", v)}
          error={errors.experienceLevel}
        />
        <ChipField
          label="Known stack"
          helper="Tech you're already comfortable with — add as many as you like. Leave blank if you're brand new."
          suggestions={PRESETS.knownStackSuggestions}
          value={values.knownStack}
          onChange={(v) => set("knownStack", v)}
        />
        <SelectField
          name="jobTarget"
          label="Job target"
          helper="The kind of role you're aiming at. We'll tilt the recommendation toward what that job interviews on."
          options={PRESETS.jobTarget}
          value={values.jobTarget}
          onChange={(v) => set("jobTarget", v)}
          error={errors.jobTarget}
          freeText
        />
      </fieldset>

      <fieldset className="r-fieldset" disabled={pending}>
        <legend>Your project</legend>
        <p className="r-fieldset-intro">
          What you want to build, and what you want to learn from building it.
        </p>

        <TextareaField
          name="goal"
          label="Goal"
          helper="What do you want to build or achieve?"
          placeholder="Build a portfolio web app I can explain in interviews."
          value={values.goal}
          onChange={(v) => set("goal", v)}
          error={errors.goal}
          required
        />
        <SelectField
          name="projectType"
          label="Project type"
          helper="The rough shape of the project. We use this to filter Golden Paths."
          options={PRESETS.projectType}
          value={values.projectType}
          onChange={(v) => set("projectType", v)}
          error={errors.projectType}
          freeText
        />
        <TextareaField
          name="learningFocus"
          label="Learning focus"
          helper="What do you most want to be able to explain afterwards?"
          placeholder="How routing and the server/client split work."
          value={values.learningFocus}
          onChange={(v) => set("learningFocus", v)}
          error={errors.learningFocus}
          required
        />
      </fieldset>

      <fieldset className="r-fieldset" disabled={pending}>
        <legend>Your constraints</legend>
        <p className="r-fieldset-intro">
          How much room you have, and which AI tool you&apos;ll be reaching for.
        </p>

        <RadioField
          name="timeBudget"
          label="Time budget"
          helper="How much time can you put into this in the next few weeks?"
          options={PRESETS.timeBudget}
          value={values.timeBudget}
          onChange={(v) => set("timeBudget", v)}
          error={errors.timeBudget}
        />
        <RadioField
          name="complexityTolerance"
          label="Complexity tolerance"
          helper="How much friction are you willing to take on?"
          options={PRESETS.complexityTolerance}
          value={values.complexityTolerance}
          onChange={(v) => set("complexityTolerance", v)}
          error={errors.complexityTolerance}
        />
        <SelectField
          name="aiToolPreference"
          label="AI tool preference"
          helper="The assistant you'll most likely build alongside. Affects template suggestions, not the core path."
          options={PRESETS.aiToolPreference}
          value={values.aiToolPreference}
          onChange={(v) => set("aiToolPreference", v)}
          error={errors.aiToolPreference}
        />
      </fieldset>

      <div className="r-submit">
        <div className="r-submit-reassure">
          {pending
            ? "Scoring Golden Paths and writing your coaching notes — a few seconds."
            : "This takes a few seconds while we write your coaching notes."}
        </div>
        <button
          className="btn btn-primary btn-lg"
          type="submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <LoaderCircle size={14} className="recommend-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          {pending
            ? "Writing your recommendation…"
            : "Get my recommendation"}
        </button>
      </div>
    </form>
  )
}

/* ---------- Field primitives ---------- */

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <div className="r-field-error" id={id}>
      <CircleAlert size={13} />
      {message}
    </div>
  )
}

function TextareaField({
  name,
  label,
  helper,
  placeholder,
  value,
  onChange,
  error,
  required,
}: {
  name: string
  label: string
  helper: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
}) {
  const id = `rf-${name}`
  return (
    <div className="r-field" data-invalid={error ? "true" : "false"}>
      <label className="r-field-label" htmlFor={id}>
        {label}
        {required && <span className="req">required</span>}
      </label>
      <div className="r-field-helper" id={`${id}-help`}>
        {helper}
      </div>
      <textarea
        className="r-textarea"
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-help${error ? ` ${id}-err` : ""}`}
        aria-invalid={error ? "true" : "false"}
      />
      {error && <FieldError id={`${id}-err`} message={error} />}
    </div>
  )
}

function RadioField({
  name,
  label,
  helper,
  options,
  value,
  onChange,
  error,
}: {
  name: string
  label: string
  helper: string
  options: string[]
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const groupId = `rf-${name}`
  return (
    <div
      className="r-field"
      data-invalid={error ? "true" : "false"}
      role="radiogroup"
      aria-labelledby={`${groupId}-l`}
    >
      <div className="r-field-label" id={`${groupId}-l`}>
        {label}
      </div>
      <div className="r-field-helper">{helper}</div>
      <div className="r-radios">
        {options.map((option, index) => (
          <label key={option} className="r-radio">
            <input
              type="radio"
              name={name}
              value={option}
              id={index === 0 ? groupId : undefined}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            {option}
          </label>
        ))}
      </div>
      {error && <FieldError id={`${groupId}-err`} message={error} />}
    </div>
  )
}

function SelectField({
  name,
  label,
  helper,
  options,
  value,
  onChange,
  error,
  freeText,
}: {
  name: string
  label: string
  helper: string
  options: string[]
  value: string
  onChange: (value: string) => void
  error?: string
  freeText?: boolean
}) {
  const id = `rf-${name}`
  // Custom mode: a free-text value that is not one of the presets.
  const [custom, setCustom] = useState(
    Boolean(freeText && value !== "" && !options.includes(value)),
  )
  const selectValue = custom ? "__custom" : options.includes(value) ? value : ""

  return (
    <div className="r-field" data-invalid={error ? "true" : "false"}>
      <label className="r-field-label" htmlFor={id}>
        {label}
        {freeText && <span className="req">custom value allowed</span>}
      </label>
      <div className="r-field-helper" id={`${id}-help`}>
        {helper}
      </div>
      <select
        className="r-select"
        id={id}
        name={name}
        value={selectValue}
        aria-describedby={`${id}-help`}
        aria-invalid={error ? "true" : "false"}
        onChange={(event) => {
          if (event.target.value === "__custom") {
            setCustom(true)
            onChange("")
          } else {
            setCustom(false)
            onChange(event.target.value)
          }
        }}
      >
        <option value="" disabled>
          Choose one…
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {freeText && <option value="__custom">Something else…</option>}
      </select>
      {custom && (
        <input
          className="r-input"
          type="text"
          aria-label={`${label} — custom value`}
          placeholder={`Type your ${label.toLowerCase()}…`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={{ marginTop: 8 }}
        />
      )}
      {error && <FieldError id={`${id}-err`} message={error} />}
    </div>
  )
}

function ChipField({
  label,
  helper,
  suggestions,
  value,
  onChange,
}: {
  label: string
  helper: string
  suggestions: string[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const groupId = useId()

  function add(tech: string) {
    const trimmed = tech.trim()
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed])
    setDraft("")
  }
  function remove(tech: string) {
    onChange(value.filter((item) => item !== tech))
  }

  return (
    <div className="r-field">
      <div className="r-field-label" id={groupId}>
        {label}
        <span className="req">optional</span>
      </div>
      <div className="r-field-helper">{helper}</div>
      <div className="r-chips" role="group" aria-labelledby={groupId}>
        {value.map((tech) => (
          <span className="r-chip" key={tech}>
            {tech}
            <button
              type="button"
              aria-label={`Remove ${tech}`}
              onClick={() => remove(tech)}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          aria-label="Add a technology"
          placeholder={
            value.length ? "Add another…" : "Type a tech and press Enter…"
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add(draft)
            } else if (
              event.key === "Backspace" &&
              draft === "" &&
              value.length
            ) {
              remove(value[value.length - 1] as string)
            }
          }}
        />
      </div>
      <div className="r-chips-suggestions" aria-label="Suggestions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="r-suggest"
            disabled={value.includes(suggestion)}
            onClick={() => add(suggestion)}
          >
            + {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
