import 'dotenv/config'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import fetch from 'node-fetch'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https'
import { setGlobalOptions } from 'firebase-functions/v2/options'

// Optional: region/timeouts
setGlobalOptions({ region: 'us-central1', timeoutSeconds: 60 })

if (!getApps().length) {
  initializeApp()
}
const db = getFirestore()
const messaging = getMessaging()

// Firestore trigger: notify other owners when a new list item is added
export const onListItemCreate = onDocumentCreated('listItems/{itemId}', async (event) => {
  const item = event.data?.data() as any
  if (!item) return

  const listId: string = item.listId
  const listSnap = await db.doc(`lists/${listId}`).get()
  if (!listSnap.exists) return
  const list = listSnap.data() as any
  const owners: string[] = list?.ownerUids || []
  const initiator = (item.createdBy as string | undefined)
  const targets = owners.filter((u) => u !== initiator)
  if (!targets.length) return

  const userDocs = await Promise.all(targets.map((uid) => db.doc(`users/${uid}`).get()))
  const tokens = userDocs.flatMap((d) => (d.data()?.fcmTokens || []) as string[])
  if (!tokens.length) return

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: '新しい候補が追加されました',
      body: item.title || '新しい場所が追加されました',
    },
    data: { listId },
  })
})

// AI recommendation (OpenAI) callable
export const aiSuggestPlaces = onCall(async (request) => {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new HttpsError('failed-precondition', 'OPENAI_API_KEY not set')
  const data = (request.data || {}) as { preferences?: unknown; location?: { lat: number; lng: number } }
  const userPrefs = data.preferences || {}
  const loc = data.location
  const prompt =
    '日本の若者向けにおすすめのスポットを3つ提案してください。' +
    '出力はJSON配列で、各要素は{"query": string, "reason": string} です。' +
    ` 条件: ${JSON.stringify(userPrefs)} / 現在地: ${loc ? `${loc.lat},${loc.lng}` : '不明'}`

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful travel recommender.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  })
  if (!resp.ok) throw new HttpsError('internal', 'OpenAI error')
  const json: any = await resp.json()
  const text: string = json.choices?.[0]?.message?.content || '[]'
  let suggestions: { query: string; reason?: string }[]
  try {
    suggestions = JSON.parse(text)
  } catch {
    suggestions = []
  }
  return { suggestions }
})

// HTTP version with CORS (debug/alternative)
export const aiSuggestPlacesHttp = onRequest(async (req, res) => {
  const origin = (req.headers.origin as string | undefined) || '*'
  res.set('Access-Control-Allow-Origin', origin)
  res.set('Vary', 'Origin')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  try {
    const key = process.env.OPENAI_API_KEY
    if (!key) {
      res.status(400).json({ error: 'OPENAI_API_KEY not set' })
      return
    }
    const { prompt, location, preferences } = (req.body || {}) as {
      prompt?: string
      location?: { lat: number; lng: number }
      preferences?: unknown
    }
    const promptText =
      prompt || '日本の若者向けにおすすめのスポットを3つ提案してください。出力はJSON配列で、各要素は{"query": string, "reason": string} です。'

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful travel recommender.' },
          {
            role: 'user',
            content: `${promptText}\n条件: ${JSON.stringify(preferences || {})} / 現在地: ${
              location ? `${location.lat},${location.lng}` : '不明'
            }`,
          },
        ],
        temperature: 0.7,
      }),
    })
    if (!resp.ok) {
      res.status(500).json({ error: 'OpenAI error' })
      return
    }
    const json: any = await resp.json()
    const text: string = json.choices?.[0]?.message?.content || '[]'
    let suggestions: { query: string; reason?: string }[]
    try {
      suggestions = JSON.parse(text)
    } catch {
      suggestions = []
    }
    res.json({ suggestions })
  } catch (e) {
    res.status(500).json({ error: 'internal' })
  }
})
