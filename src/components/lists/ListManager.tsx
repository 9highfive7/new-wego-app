import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'
import type { ListDoc, ListItemDoc } from '../../types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'

export function ListManager() {
  const user = auth.currentUser!
  const [lists, setLists] = useState<(ListDoc & { id: string })[]>([])
  const [name, setName] = useState('')
  useEffect(() => {
    const q = query(collection(db, 'lists'), where('ownerUids', 'array-contains', user.uid))
    return onSnapshot(q, (snap) => {
      setLists(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ListDoc) })))
    })
  }, [user.uid])

  const createList = async () => {
    if (!name.trim()) return
    await addDoc(collection(db, 'lists'), { name, ownerUids: [user.uid], createdAt: serverTimestamp() })
    setName('')
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="リスト名" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={createList}>作成</Button>
      </div>
      <div className="mt-6">
        <UnifiedItemsTable listDefs={lists.map((l) => ({ id: l.id, name: l.name }))} />
      </div>
    </div>
  )
}

function UnifiedItemsTable({ listDefs }: { listDefs: { id: string; name: string }[] }) {
  const [status, setStatus] = useState<'want' | 'done'>('want')
  const [rows, setRows] = useState<(ListItemDoc & { id: string })[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const listMap = Object.fromEntries(listDefs.map((l) => [l.id, l.name]))

  useEffect(() => {
    const unsubs = listDefs.map((l) =>
      onSnapshot(query(collection(db, 'listItems'), where('listId', '==', l.id)), (snap) => {
        setRows((prev) => {
          const others = prev.filter((r) => r.listId !== l.id)
          const newOnes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ListItemDoc) }))
          return [...others, ...newOnes]
        })
      }),
    )
    return () => unsubs.forEach((u) => u())
  }, [listDefs.map((l) => l.id).join(',')])

  useEffect(() => {
    const uids = Array.from(new Set(rows.map((r) => (r as any).creatorUid).filter(Boolean))) as string[]
    const fetchAll = async () => {
      const entries: [string, string][] = []
      for (const uid of uids) {
        if (userNames[uid]) continue
        const snap = await getDoc(doc(db, 'users', uid))
        const dn = (snap.data() as any)?.displayName || uid
        entries.push([uid, dn])
      }
      if (entries.length) setUserNames((m) => ({ ...m, ...Object.fromEntries(entries) }))
    }
    fetchAll().catch(() => {})
  }, [rows])

  const filtered = rows
    .filter((r) => r.status === status)
    .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))

  const remove = async (id: string) => {
    if (!confirm('このアイテムを削除しますか？')) return
    await deleteDoc(doc(db, 'listItems', id))
  }

  const markDone = async (id: string) => {
    await updateDoc(doc(db, 'listItems', id), { status: 'done', updatedAt: serverTimestamp() })
  }

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="border-b">
        <div className="-mb-px flex gap-4">
          <button
            className={`px-3 py-2 text-sm ${status === 'want' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
            onClick={() => setStatus('want')}
          >
            行きたい
          </button>
          <button
            className={`px-3 py-2 text-sm ${status === 'done' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'}`}
            onClick={() => setStatus('done')}
          >
            行った
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-2">場所</th>
              <th className="p-2">分類</th>
              <th className="p-2">追加したユーザ</th>
              <th className="p-2 w-32">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b hover:bg-accent/30">
                <td className="p-2">{r.title}</td>
                <td className="p-2">{r.category || listMap[r.listId] || '-'}</td>
                <td className="p-2">{userNames[(r as any).creatorUid as string] || '-'}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    {status === 'want' && (
                      <Button variant="outline" onClick={() => markDone(r.id)}>行った</Button>
                    )}
                    <Button variant="outline" onClick={() => remove(r.id)}>削除</Button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>データがありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

