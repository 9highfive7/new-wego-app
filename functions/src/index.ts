import 'dotenv/config'
import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'
import fetch from 'node-fetch'

if (!admin.apps.length) {
  admin.initializeApp()
}

// Notify other owners when a new list item is added
export const onListItemCreate = functions.firestore
  .document('listItems/{itemId}')
  .onCreate(async (snap, ctx) => {
    const item = snap.data() as any
    const listId = item.listId as string
    const listSnap = await admin.firestore().doc(`lists/${listId}`).get()
    if (!listSnap.exists) return
    const list = listSnap.data() as any
    const owners: string[] = list.ownerUids || []
    const initiator = ctx.auth?.uid
    const targets = owners.filter((u) => u !== initiator)
    if (!targets.length) return
    const userDocs = await Promise.all(targets.map((uid) => admin.firestore().doc(`users/${uid}`).get()))
    const tokens = userDocs.flatMap((d) => ((d.data() as any)?.fcmTokens || []) as string[])
    if (!tokens.length) return
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: '新しい候補が追加されました',
        body: item.title || '新しい場所が追加されました',
      },
      data: { listId },
    })
  })

// AI recommendation (OpenAI) callable
export const aiSuggestPlaces = functions.https.onCall(async (data) => {
  const key = process.env.OPENAI_API_KEY || (functions.config().openai?.key as string | undefined)
  if (!key) throw new functions.https.HttpsError('failed-precondition', 'OPENAI_API_KEY not set')
  const userPrefs = data?.preferences || {}
  const loc = data?.location
  const prompt = `日本の若者向けにおすすめのスポットを3つ提案してください。\n` +
    `出力はJSON配列で、各要素は{\"query\": string, \"reason\": string}。\n` +
    `条件: ${JSON.stringify(userPrefs)} / 現在地: ${loc ? `${loc.lat},${loc.lng}` : '不明'}`

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
  if (!resp.ok) throw new functions.https.HttpsError('internal', 'OpenAI error')
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

// CORS許可のHTTP版（デバッグ/代替用）
export const aiSuggestPlacesHttp = functions.https.onRequest(async (req, res) => {
  const origin = req.headers.origin as string | undefined
  const allowOrigin = origin || '*'
  res.set('Access-Control-Allow-Origin', allowOrigin)
  res.set('Vary', 'Origin')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(204).send('')

  try {
    const key = process.env.OPENAI_API_KEY || (functions.config().openai?.key as string | undefined)
    if (!key) return res.status(400).json({ error: 'OPENAI_API_KEY not set' })
    const { prompt, location, preferences } = (req.body || {}) as {
      prompt?: string
      location?: { lat: number; lng: number }
      preferences?: unknown
    }
    const promptText =
      prompt || `日本の若者向けにおすすめのスポットを3つ提案してください。\n出力はJSON配列で、各要素は{"query": string, "reason": string}`

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
            content:
              `${promptText}\n条件: ${JSON.stringify(preferences || {})} / 現在地: ${location ? `${location.lat},${location.lng}` : '不明'}`,
          },
        ],
        temperature: 0.7,
      }),
    })
    if (!resp.ok) return res.status(500).json({ error: 'OpenAI error' })
    const json: any = await resp.json()
    const text: string = json.choices?.[0]?.message?.content || '[]'
    let suggestions: { query: string; reason?: string }[]
    try {
      suggestions = JSON.parse(text)
    } catch {
      suggestions = []
    }
    return res.json({ suggestions })
  } catch (e) {
    return res.status(500).json({ error: 'internal' })
  }
})
