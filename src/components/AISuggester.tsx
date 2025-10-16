import { useState } from 'react'
import { api } from '../lib/firebase'
import { dlog } from '../lib/debug'
import { Button } from './ui/button'

export function AISuggester() {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<{ query: string; reason?: string }[]>([])
  const run = async () => {
    setLoading(true)
    try {
      const pos = await new Promise<GeolocationPosition | null>((res) => {
        if (!navigator.geolocation) return res(null)
        navigator.geolocation.getCurrentPosition((p) => res(p), () => res(null), { enableHighAccuracy: true, timeout: 5000 })
      })
      const loc = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : undefined
      const endpoint = (import.meta as any).env?.VITE_AI_ENDPOINT as string | undefined
      const canFetchDirect = endpoint && !/cloudfunctions\.net|firebaseapp\.com/.test(endpoint)
      let answered = false
      if (canFetchDirect && endpoint) {
        try {
          const t0 = performance.now()
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preferences: {}, location: loc }),
          })
          dlog('suggest', 'fetch endpoint done', { endpoint, status: resp.status, elapsed: Math.round(performance.now() - t0) })
          if (resp.ok) {
            const json = await resp.json()
            setSuggestions(json.suggestions || [])
            answered = true
          }
        } catch {
          dlog('suggest', 'fetch failed, fallback to callable', { endpoint })
          // fall through
        }
      }
      if (!answered) {
        const t1 = performance.now()
        const result = await api.aiSuggest({ preferences: {}, location: loc })
        dlog('suggest', 'callable done', { elapsed: Math.round(performance.now() - t1) })
        setSuggestions(result.data.suggestions || [])
      }
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">AIおすすめ</h3>
        <Button onClick={run} disabled={loading}>{loading ? '考え中…' : '提案を取得'}</Button>
      </div>
      <ul className="space-y-2">
        {suggestions.map((s, i) => (
          <li key={i} className="rounded-md border p-2">
            <p className="font-medium">{s.query}</p>
            {s.reason && <p className="text-xs text-muted-foreground">{s.reason}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
