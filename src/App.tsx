import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { BrowserRouter } from 'react-router-dom'
import { ensureUserDoc, initMessagingAndGetToken, watchAuth, auth, db } from './lib/firebase'
import { addDoc, collection, onSnapshot, query, serverTimestamp, where, getDocs, limit } from 'firebase/firestore'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { NavBar } from './components/NavBar'
import { loadGoogle } from './lib/maps'
import { AISuggester } from './components/AISuggester'
import { ListManager } from './components/lists/ListManager'
import { Chatbot } from './components/chat/Chatbot'

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth')
      try {
        await signInWithEmailAndPassword(auth, email, password)
      } catch {
        await createUserWithEmailAndPassword(auth, email, password)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Sign in error')
    }
  }
  const signInWithGoogle = async () => {
    setError(null)
    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (err: any) {
      setError(err?.message ?? 'Google sign-in error')
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Wego にログイン</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full">ログイン / 新規登録</Button>
        </form>
        <Button variant="outline" className="w-full" onClick={signInWithGoogle}>Googleでログイン</Button>
      </div>
    </div>
  )
}

type SelectedPlace = { placeId: string; name: string; address?: string; lat: number; lng: number } | null

function Dashboard() {
  const [gReady, setGReady] = useState(false)
  const [selected, setSelected] = useState<SelectedPlace>(null)
  const [lists, setLists] = useState<{ id: string; name: string }[]>([])
  const [activeListId, setActiveListId] = useState<string>('')
  const [otherName, setOtherName] = useState('')
  const defaultCategories = ['食事', '娯楽', 'ショッピング', '観光', '景色', '宿泊'] as const

  useEffect(() => {
    loadGoogle().then(() => setGReady(true)).catch(console.error)
  }, [])

  // 自分のリストを購読
  useEffect(() => {
    const u = auth.currentUser
    if (!u) return
    const q = query(collection(db, 'lists'), where('ownerUids', 'array-contains', u.uid))
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name as string }))
      setLists(data)
      if (!activeListId && data.length) setActiveListId(data[0].id)
    })
  }, [activeListId])

  // 名前でリストを取得/作成
  const ensureListByName = async (name: string) => {
    const u = auth.currentUser
    if (!u) return null
    const ql = query(collection(db, 'lists'), where('ownerUids', 'array-contains', u.uid), where('name', '==', name))
    const snap = await getDocs(ql)
    if (!snap.empty) return snap.docs[0].id
    const ref = await addDoc(collection(db, 'lists'), { name, ownerUids: [u.uid], createdAt: serverTimestamp() })
    return ref.id
  }

  const addToList = async () => {
    if (!selected) return
    let targetListId = activeListId
    if (!targetListId) {
      // 未選択なら「その他」で作成した名前 or 最初のデフォルトを使う
      const fallbackName = otherName.trim() || 'その他'
      const id = await ensureListByName(fallbackName)
      if (!id) return
      targetListId = id
      setActiveListId(id)
    }
    // 既存チェック（同じ listId + placeId は重複追加しない）
    if (selected.placeId) {
      const dupQ = query(
        collection(db, 'listItems'),
        where('listId', '==', targetListId),
        where('placeId', '==', selected.placeId),
        limit(1),
      )
      const dup = await getDocs(dupQ)
      if (!dup.empty) {
        alert('同じ場所はすでにこのリストにあります')
        return
      }
    }
    await addDoc(collection(db, 'listItems'), {
      listId: targetListId,
      placeId: selected.placeId,
      title: selected.name,
      address: selected.address,
      location: { latitude: selected.lat, longitude: selected.lng },
      creatorUid: auth.currentUser?.uid,
      status: 'want',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    // 追加後は軽くフィードバック（アラート簡易版）
    alert(`「${selected.name}」をリストに追加しました`)
  }

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-6">
      <section>
        <h2 className="mb-4 text-xl font-semibold">行きたいところを見つけよう</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border p-3 space-y-3">
            <PlaceSearch />
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-2">
                {defaultCategories.map((cat) => (
                  <Button
                    key={cat}
                    variant={lists.find((l) => l.name === cat) && activeListId && lists.find((l) => l.id === activeListId)?.name === cat ? 'default' : 'outline'}
                    onClick={async () => {
                      const id = await ensureListByName(cat)
                      if (id) setActiveListId(id)
                    }}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={activeListId}
                onChange={(e) => setActiveListId(e.target.value)}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
                {!lists.length && <option value="">リストがありません</option>}
              </select>
              <Button onClick={addToList} disabled={!selected || !activeListId}>行きたい所に追加</Button>
              {selected && (
                <span className="text-xs text-muted-foreground">選択中: {selected.name}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
                placeholder="その他（新規作成名を入力）"
                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
              />
              <Button
                variant="outline"
                onClick={async () => {
                  if (!otherName.trim()) return
                  const id = await ensureListByName(otherName.trim())
                  if (id) {
                    setActiveListId(id)
                    setOtherName('')
                  }
                }}
              >作成</Button>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            {gReady ? <MapView onPlaceSelected={setSelected} /> : <p>地図を読み込み中...</p>}
          </div>
        </div>
        <div className="mt-6">
          <AISuggester />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-semibold">私のリスト</h2>
        <ListManager />
      </section>
    </div>
  )
}

function MapView({ onPlaceSelected }: { onPlaceSelected?: (p: SelectedPlace) => void }) {
  const id = useMemo(() => 'map-' + Math.random().toString(36).slice(2), [])
  useEffect(() => {
    let map: google.maps.Map
    let marker: google.maps.Marker | null = null
    loadGoogle().then(() => {
      const el = document.getElementById(id)!
      map = new google.maps.Map(el, { center: { lat: 35.681236, lng: 139.767125 }, zoom: 12 })
      const acInput = document.getElementById('place-autocomplete') as HTMLInputElement | null
      if (acInput) {
        const ac = new google.maps.places.Autocomplete(acInput, { fields: ['geometry', 'name', 'place_id', 'formatted_address'] })
        ac.addListener('place_changed', () => {
          const place = ac.getPlace()
          const loc = place.geometry?.location
          if (loc) {
            map.panTo(loc)
            map.setZoom(15)
            marker?.setMap(null)
            marker = new google.maps.Marker({ position: loc, map, title: place.name })
            onPlaceSelected?.({
              placeId: place.place_id || '',
              name: place.name || '',
              address: place.formatted_address,
              lat: loc.lat(),
              lng: loc.lng(),
            })
          }
        })
      }
    })
    return () => {
      marker?.setMap(null)
    }
  }, [id])
  return <div id={id} className="h-[360px] w-full rounded-md" />
}

function PlaceSearch() {
  return (
    <div className="space-y-2">
      <label htmlFor="place-autocomplete" className="text-sm text-muted-foreground">場所を検索</label>
      <Input id="place-autocomplete" placeholder="渋谷カフェ など" />
    </div>
  )
}

function AuthedApp({ user }: { user: import('firebase/auth').User }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    ensureUserDoc(user).finally(() => setReady(true))
    initMessagingAndGetToken().catch(() => {})
  }, [user])
  if (!ready) return <p className="p-6">読み込み中...</p>
  return (
    <>
      <NavBar userName={user.displayName || user.email} />
      <Dashboard />
      <Chatbot />
    </>
  )
}

function Root() {
  const [user, setUser] = useState<import('firebase/auth').User | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    return watchAuth((u) => {
      setUser(u)
      setLoading(false)
    })
  }, [])
  if (loading) return <p className="p-6">読み込み中...</p>
  return <BrowserRouter>{user ? <AuthedApp user={user} /> : <SignIn />}</BrowserRouter>
}

function App() {
  return <Root />
}

export default App
