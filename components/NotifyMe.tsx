import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useData } from '../lib/tanqory/index'
import { isEditorPreview } from '../lib/runtime'
import { isRtl, notifyMeCopy } from '../lib/notify-me-copy'

/**
 * "Notify me when it's back" — shown where a sold-out variant would otherwise be a dead end.
 *
 * CONSENT: the address is used for ONE email about THIS variant's restock — there is deliberately no
 * marketing opt-in here (an opt-in would need a consent-recording path; until that exists nothing on this
 * form subscribes anyone to marketing), and the note says so in the shopper's language. The form is not
 * pre-filled and keeps nothing after submit. Inert in the editor/preview plane.
 *
 * Renders nothing when the data layer has no `notifyBackInStock` (mock/older backend): a form that posts
 * nowhere is worse than no form.
 */
export function NotifyMe({ variantId }: { variantId: string | undefined }): JSX.Element | null {
  const data = useData()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'available' | 'invalid' | 'error'>('idle')
  const submitted = useRef(false)
  const locale = typeof document !== 'undefined' ? document.documentElement.lang : ''
  const { copy, lang, fellBack } = useMemo(() => notifyMeCopy(locale), [locale])
  if (fellBack && typeof console !== 'undefined' && !submitted.current) {
    // A missing translation is visible in telemetry, never silent (rendered in English meanwhile).
    // eslint-disable-next-line no-console
    console.warn(`[theme] notify-me: no copy for locale "${locale}", showing English`)
    submitted.current = true
  }
  if (!data.notifyBackInStock || !variantId || variantId.startsWith('mock:')) return null

  const country = data.localization?.country?.isoCode
  const preview = isEditorPreview()

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (preview || state === 'sending') return
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 320) {
      setState('invalid')
      return
    }
    setState('sending')
    try {
      const status = await data.notifyBackInStock!({
        variantId: variantId!,
        email: value,
        ...(locale ? { locale } : {}),
        ...(country ? { country } : {}),
      })
      setEmail('') // keep nothing once it has been sent
      setState(status === 'available' ? 'available' : 'done')
    } catch {
      setState('error')
    }
  }

  return (
    <form
      className="notify-me"
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      dir={isRtl(lang) ? 'rtl' : 'ltr'}
      lang={lang}
      style={{ marginTop: 'var(--space-3)' }}
    >
      <p className="notify-me__title" style={{ fontWeight: 600, margin: '0 0 var(--space-2)' }}>{copy.title}</p>
      {state === 'done' || state === 'available' ? (
        <p role="status" className="notify-me__status">{state === 'done' ? copy.success : copy.available}</p>
      ) : (
        <>
          <div className="notify-me__row" style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <label className="u-visually-hidden" htmlFor="notify-me-email">{copy.label}</label>
            <input
              id="notify-me-email"
              className="field__input"
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder={copy.placeholder}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (state === 'invalid' || state === 'error') setState('idle')
              }}
              aria-invalid={state === 'invalid'}
              aria-describedby="notify-me-note"
              maxLength={320}
            />
            <button className="btn btn--primary" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? copy.sending : copy.button}
            </button>
          </div>
          <small id="notify-me-note" className="notify-me__note" style={{ display: 'block', marginTop: 'var(--space-2)' }}>
            {copy.note}
          </small>
          {(state === 'invalid' || state === 'error') && (
            <p role="alert" className="u-text-error">{state === 'invalid' ? copy.invalid : copy.error}</p>
          )}
        </>
      )}
    </form>
  )
}
