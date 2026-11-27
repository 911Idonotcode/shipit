/**
 * Bluesky handle look-up: suggests accounts as the runner types, using
 * Bluesky's public typeahead search (no sign-in needed).
 */
const SEARCH = 'https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead'

interface Actor {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function attachHandleTypeahead(input: HTMLInputElement, search = defaultSearch) {
  const wrap = input.parentElement!
  wrap.classList.add('ta-wrap')
  const list = document.createElement('ul')
  list.className = 'ta-list'
  list.id = 'handle-suggestions'
  list.setAttribute('role', 'listbox')
  list.hidden = true
  wrap.append(list)
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', list.id)
  input.setAttribute('aria-expanded', 'false')
  input.autocomplete = 'off'

  let results: Actor[] = []
  let active = -1
  let timer: number | undefined
  let seq = 0

  const close = () => {
    list.hidden = true
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
    active = -1
  }

  const highlight = (i: number) => {
    active = i
    list.querySelectorAll<HTMLElement>('li').forEach((li, j) => li.setAttribute('aria-selected', String(j === i)))
    if (i >= 0) input.setAttribute('aria-activedescendant', `ta-opt-${i}`)
  }

  const choose = (a: Actor) => {
    input.value = a.handle
    close()
    input.dispatchEvent(new Event('change'))
  }

  const render = () => {
    if (!results.length) return close()
    list.innerHTML = results
      .map(
        (a, i) => `<li id="ta-opt-${i}" role="option" aria-selected="false" data-i="${i}">
          ${a.avatar ? `<img src="${esc(a.avatar)}" alt="" />` : `<span class="ta-av">${esc((a.displayName || a.handle)[0].toUpperCase())}</span>`}
          <span><b>${esc(a.displayName || a.handle)}</b><small>@${esc(a.handle)}</small></span>
        </li>`,
      )
      .join('')
    list.hidden = false
    input.setAttribute('aria-expanded', 'true')
    active = -1
  }

  input.addEventListener('input', () => {
    clearTimeout(timer)
    const q = input.value.trim().replace(/^@/, '')
    if (q.length < 2) {
      results = []
      return close()
    }
    timer = window.setTimeout(async () => {
      const mine = ++seq
      try {
        const found = await search(q)
        if (mine !== seq) return // a newer keystroke won
        results = found
        render()
      } catch {
        close() // search is a convenience; typing the handle still works
      }
    }, 180)
  })

  input.addEventListener('keydown', (e) => {
    if (list.hidden) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      highlight((active + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlight((active - 1 + results.length) % results.length)
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      close()
    }
  })

  // pointerdown so the choice lands before the input loses focus
  list.addEventListener('pointerdown', (e) => {
    const li = (e.target as HTMLElement).closest('li')
    if (!li) return
    e.preventDefault()
    choose(results[Number(li.dataset.i)])
  })
  input.addEventListener('blur', () => setTimeout(close, 120))
}

async function defaultSearch(q: string): Promise<Actor[]> {
  const r = await fetch(`${SEARCH}?${new URLSearchParams({ q, limit: '6' })}`)
  if (!r.ok) throw new Error(String(r.status))
  return (await r.json()).actors ?? []
}
