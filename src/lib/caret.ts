// Finds the character position in a textarea that sits under a screen point.
// It builds an invisible copy of the text so the browser can measure where each character is drawn.
export function caretAt(el: HTMLTextAreaElement, x: number, y: number): { pos: number; top: number } {
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const mirror = document.createElement('div')
  for (const p of [
    'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-sizing',
  ]) {
    mirror.style.setProperty(p, cs.getPropertyValue(p))
  }
  Object.assign(mirror.style, {
    position: 'fixed',
    top: `${r.top}px`,
    left: `${r.left}px`,
    width: `${r.width}px`,
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  })
  const text = document.createTextNode(el.value || ' ')
  mirror.appendChild(text)
  document.body.appendChild(mirror)

  const range = document.createRange()
  let pos = el.value.length
  let top = r.top + parseFloat(cs.paddingTop)
  let prev: DOMRect | null = null
  let found = false

  for (let i = 0; i < el.value.length; i++) {
    range.setStart(text, i)
    range.setEnd(text, i + 1)
    const c = range.getBoundingClientRect()
    if (c.height === 0) {
      // A line break: if we are already on this line, the point is past its end.
      if (prev && prev.bottom > y) {
        pos = i
        top = prev.top
        found = true
        break
      }
      continue
    }
    if (c.bottom > y && (c.top > y || c.left + c.width / 2 > x)) {
      pos = i
      top = c.top
      found = true
      break
    }
    prev = c
  }
  if (!found && prev) top = prev.bottom

  mirror.remove()
  return { pos, top }
}