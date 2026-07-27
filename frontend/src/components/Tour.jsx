import { useState, useLayoutEffect } from 'react'

const TIP_WIDTH = 320

// Full-screen guided tour overlay. Dims the page and cuts a highlighted
// "spotlight" hole around the DOM node matched by the current step's
// `selector`, with a small tooltip card pointing at it. Steps with no
// selector render as a centered modal (used for intro/outro screens).
export default function Tour({ steps, stepIndex, onNext, onPrev, onSkip, onFinish }) {
  const [rect, setRect] = useState(null)
  const step = steps?.[stepIndex]

  useLayoutEffect(() => {
    if (!step?.selector) { setRect(null); return }
    let cancelled = false
    let scrolledOnce = false
    // Only scroll the target into view once per step. Re-measuring on
    // subsequent scroll/resize events must NOT scroll again, otherwise a
    // scroll event triggers scrollIntoView which triggers another scroll
    // event, causing an infinite scroll/measure loop for tall elements.
    const measure = (shouldScroll) => {
      if (cancelled) return
      const el = document.querySelector(step.selector)
      if (!el) { setRect(null); return }
      if (shouldScroll && !scrolledOnce) {
        scrolledOnce = true
        el.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
      setRect(el.getBoundingClientRect())
    }
    // Give the screen a moment to switch/render before measuring.
    const t = setTimeout(() => measure(true), 80)
    const onReflow = () => measure(false)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      cancelled = true
      clearTimeout(t)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [step, stepIndex])

  if (!step) return null

  const pad  = 8
  const spot = rect ? {
    top: rect.top - pad, left: rect.left - pad,
    width: rect.width + pad * 2, height: rect.height + pad * 2,
  } : null

  // Reserve room for the tooltip's own height when clamping to the viewport
  // (its content is variable, so this is a generous upper-bound estimate).
  const EST_TIP_HEIGHT = 220

  const tipStyle = { position: 'fixed', width: TIP_WIDTH, zIndex: 10001 }
  if (spot) {
    // Clamp to the portion of the spotlight actually visible in the viewport —
    // large elements (e.g. Coverage gaps, opening sidebar, move list) can be
    // taller than the screen. We always resolve to a single `top` pixel value
    // and clamp it to the safe viewport range at the end, so the tooltip can
    // never end up positioned (partially or fully) off-screen.
    const visibleTop    = Math.max(0, spot.top)
    const visibleBottom = Math.min(window.innerHeight, spot.top + spot.height)
    const spaceBelow    = window.innerHeight - visibleBottom
    const spaceAbove    = visibleTop

    const top = (spaceBelow >= EST_TIP_HEIGHT + 20 || spaceBelow >= spaceAbove)
      ? visibleBottom + 14
      : visibleTop - EST_TIP_HEIGHT - 14

    tipStyle.top  = Math.max(12, Math.min(top, window.innerHeight - EST_TIP_HEIGHT - 12))
    tipStyle.left = Math.min(Math.max(14, spot.left), window.innerWidth - TIP_WIDTH - 14)
  } else {
    tipStyle.top = '50%'
    tipStyle.left = '50%'
    tipStyle.transform = 'translate(-50%, -50%)'
  }

  const isLast = stepIndex === steps.length - 1

  return (
    <>
      {/* Dim background, with a cut-out around the spotlighted element */}
      {spot ? (
        <div
          style={{
            position: 'fixed',
            top: spot.top, left: spot.left, width: spot.width, height: spot.height,
            borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(8,8,10,0.72)',
            border: '1.5px solid var(--green)',
            pointerEvents: 'none',
            transition: 'top .2s ease, left .2s ease, width .2s ease, height .2s ease',
            zIndex: 10000,
          }}
        />
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,10,0.72)', zIndex: 10000 }} />
      )}

      {/* Click-blocker so the tour can't be dismissed by interacting with the app underneath */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }} onClick={onSkip} />

      {/* Tooltip / modal card */}
      <div
        style={{
          ...tipStyle,
          background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 10,
          padding: 14, boxShadow: '0 8px 28px rgba(0,0,0,.45)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 11, color: 'var(--text4)', marginBottom: 6 }}>
          {stepIndex + 1} / {steps.length}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text0)', marginBottom: 6 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 14 }}>
          {step.body}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onSkip}
            style={{
              fontSize: 12, color: 'var(--text4)', background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', padding: '4px 2px',
            }}
          >
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {stepIndex > 0 && (
              <button
                onClick={onPrev}
                style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  background: 'transparent', border: '0.5px solid var(--border)', color: 'var(--text2)',
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? onFinish : onNext}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 500, background: 'var(--green-bg)', border: '0.5px solid var(--green-border)',
                color: 'var(--green)',
              }}
            >
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
