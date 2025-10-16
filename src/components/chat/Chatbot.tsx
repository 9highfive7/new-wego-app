import { useEffect, useRef, useState } from 'react'
import { Bot, Send } from 'lucide-react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { api } from '../../lib/firebase'
import { aiDebugEnabled, clearLogs, dlog, getLogs } from '../../lib/debug'

type Msg = { role: 'user' | 'assistant'; text: string }

export function Chatbot() {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open && <ChatModal onClose={() => setOpen(false)} />}
      <button
        aria-label="AI チャットを開く"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90"
      >
        <Bot className="h-6 w-6" />
      </button>
    </>
  )
}

function ChatModal({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: 'こんにちは！行きたいところ探しをお手伝いします。例:「池袋で午後に時間を潰せるおすすめ」' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, loading])

  const send = async () => {
    const content = input.trim()
    if (!content) return
    setMsgs((m) => [...m, { role: 'user', text: content }])
    setInput('')
    setLoading(true)
    try {
      const loc = await getCurrentLoc()
      dlog('chat', 'send start', { content, loc })
      const endpoint = (import.meta as any).env?.VITE_AI_ENDPOINT as string | undefined
      const canFetchDirect = endpoint && !/cloudfunctions\.net|firebaseapp\.com/.test(endpoint)
      let answered = false
      if (canFetchDirect && endpoint) {
        try {
          const t0 = performance.now()
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: content, location: loc }),
          })
          const elapsed = Math.round(performance.now() - t0)
          dlog('chat', 'fetch endpoint done', { endpoint, status: resp.status, elapsed })
          if (resp.ok) {
            const json = await resp.json()
            const txt =
              formatSuggestions(json?.suggestions, 'おすすめの場所') || json?.message || 'うまく提案できませんでした。'
            setMsgs((m) => [...m, { role: 'assistant', text: txt }])
            answered = true
          }
        } catch {
          // fall through to callable
          dlog('chat', 'fetch failed, fallback to callable', { endpoint })
        }
      }
      if (!answered) {
        const t1 = performance.now()
        try {
          const result = await api.aiSuggest({ preferences: { prompt: content }, location: loc })
          dlog('chat', 'callable done', { elapsed: Math.round(performance.now() - t1) })
          const txt = formatSuggestions(result.data.suggestions, 'おすすめの場所')
          setMsgs((m) => [...m, { role: 'assistant', text: txt }])
        } catch (callableError: any) {
          dlog('chat', 'callable failed', { error: callableError?.message })
          // テスト用のフォールバック応答
          if (import.meta.env.DEV) {
            const testSuggestions = generateTestSuggestions(content)
            const txt = formatSuggestions(testSuggestions, 'おすすめの場所 (テストモード)')
            setMsgs((m) => [...m, { role: 'assistant', text: txt }])
          } else {
            setMsgs((m) => [...m, { role: 'assistant', text: 'AIサービスに接続できませんでした。設定を確認するか、時間をおいてお試しください。' }])
          }
        }
      }
    } catch (error: any) {
      setMsgs((m) => [...m, { role: 'assistant', text: 'エラーが発生しました。時間をおいてお試しください。' }])
      dlog('chat', 'unexpected error in send', { error: error?.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[72vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <span className="font-medium">Wego AI</span>
          </div>
          <Button variant="outline" onClick={onClose}>閉じる</Button>
        </div>
        <div ref={bodyRef} className="flex-1 space-y-2 overflow-y-auto p-3">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'} max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-muted-foreground">考え中…</div>
          )}
          {aiDebugEnabled && showDebug && (
            <div className="rounded-md border bg-muted/40 p-2 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">デバッグログ</span>
                <div className="space-x-2">
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(JSON.stringify(getLogs(), null, 2))}>コピー</Button>
                  <Button variant="outline" size="sm" onClick={() => { clearLogs(); }}>クリア</Button>
                </div>
              </div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap">{JSON.stringify(getLogs(), null, 2)}</pre>
            </div>
          )}
        </div>
        <form
          className="flex items-center gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <Input
            placeholder="例: 池袋で午後に時間を潰せる場所"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {aiDebugEnabled && (
            <Button type="button" variant="outline" className="shrink-0" onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? 'ログ非表示' : 'ログ表示'}
            </Button>
          )}
          <Button type="submit" disabled={loading || !input.trim()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

function formatSuggestions(sugs?: { query: string; reason?: string }[], title = 'おすすめ') {
  if (!sugs || !sugs.length) return '候補が見つかりませんでした。条件を変えて試してください。'
  const lines = sugs.map((s, i) => `${i + 1}. ${s.query}${s.reason ? ` — ${s.reason}` : ''}`)
  return `${title}：\n${lines.join('\n')}`
}

function getCurrentLoc(): Promise<{ lat: number; lng: number } | undefined> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(undefined)
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(undefined),
      { enableHighAccuracy: true, timeout: 5000 },
    )
  })
}

// テスト用の提案生成関数
function generateTestSuggestions(prompt: string): { query: string; reason?: string }[] {
  const lowerPrompt = prompt.toLowerCase()
  
  // キーワードに基づいた提案
  if (lowerPrompt.includes('池袋') || lowerPrompt.includes('いけぶくろ')) {
    return [
      { query: 'サンシャイン水族館', reason: '屋上のペンギンやアシカが人気' },
      { query: '池袋パルコ', reason: 'ショッピングやカフェを楽しめます' },
      { query: 'ナンジャタウン', reason: 'アニメ・ゲームショップが充実' }
    ]
  } else if (lowerPrompt.includes('渋谷') || lowerPrompt.includes('しぶや')) {
    return [
      { query: '渋谷スクランブルスクエア', reason: '展望台からの景色が最高' },
      { query: 'ミヤシタパーク', reason: 'イベントやカフェが楽しめる公園' },
      { query: '渋谷パルコ', reason: '最新のファッションや雑貨' }
    ]
  } else if (lowerPrompt.includes('カフェ') || lowerPrompt.includes('コーヒー')) {
    return [
      { query: 'ブルーボトルコーヒー', reason: '世界各地のコーヒーが楽しめる' },
      { query: 'スターバックス リザーブ', reason: '高級感ある空間とコーヒー' },
      { query: '猫カフェてまりや', reason: '猫と触れ合える癒しカフェ' }
    ]
  } else {
    // デフォルトの提案
    return [
      { query: '東京スカイツリー', reason: '高さ634mの展望台' },
      { query: '浅草寺', reason: '伝統的な観光地と仲見世通り' },
      { query: 'チームラボ プラネッツ', reason: 'デジタルアートミュージアム' }
    ]
  }
}
