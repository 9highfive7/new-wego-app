import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth'
import { getFirestore, serverTimestamp, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, collection, addDoc, type Firestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getMessaging, isSupported, getToken } from 'firebase/messaging'
import { getFunctions, httpsCallable } from 'firebase/functions'
import type { UserDoc } from '../types'

type Env = {
  VITE_FIREBASE_API_KEY: string
  VITE_FIREBASE_AUTH_DOMAIN: string
  VITE_FIREBASE_PROJECT_ID: string
  VITE_FIREBASE_STORAGE_BUCKET: string
  VITE_FIREBASE_MESSAGING_SENDER_ID: string
  VITE_FIREBASE_APP_ID: string
}

function readEnv(): Env {
  const e = import.meta.env
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
  ] as const
  for (const k of required) {
    if (!e[k]) throw new Error(`Missing env: ${k}`)
  }
  // Type assertion is safe after checks
  return e as unknown as Env
}

const env = readEnv()

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

let app: FirebaseApp
if (!getApps().length) app = initializeApp(firebaseConfig)
else app = getApps()[0]!

export const auth = getAuth(app)
export const db: Firestore = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

export const googleProvider = new GoogleAuthProvider()

export async function signInWithGoogle() {
  await signInWithPopup(auth, googleProvider)
}

export async function signOutApp() {
  await signOut(auth)
}

export function watchAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb)
}

export async function ensureUserDoc(user: User) {
  const ref = doc(db, 'users', user.uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const data: UserDoc = {
      displayName: user.displayName || user.email || 'User',
      photoURL: user.photoURL || undefined,
      partnerUid: null,
      preferences: {},
      fcmTokens: [],
    }
    await setDoc(ref, data)
  }
}

export async function saveFcmToken(token: string) {
  const user = auth.currentUser
  if (!user) return
  const ref = doc(db, 'users', user.uid)
  await updateDoc(ref, { fcmTokens: arrayUnion(token) })
}

export async function removeFcmToken(token: string) {
  const user = auth.currentUser
  if (!user) return
  const ref = doc(db, 'users', user.uid)
  await updateDoc(ref, { fcmTokens: arrayRemove(token) })
}

export async function initMessagingAndGetToken(): Promise<string | null> {
  try {
    if (!(await isSupported())) return null
  } catch {
    return null
  }
  const messaging = getMessaging(app)
  // Ensure dedicated FCM SW is registered
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  // Init SW messaging bridge
  reg.active?.postMessage({ type: 'INIT_MESSAGING', payload: firebaseConfig })
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  const vapidKey = undefined // Optional: set if you use Web Push certificates (VAPID)
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg })
  await saveFcmToken(token)
  return token
}

export const api = {
  // Cloud Function: AI recommendations
  aiSuggest: httpsCallable<{ preferences?: unknown; location?: { lat: number; lng: number } }, { suggestions: { query: string; reason?: string }[] }>(
    functions,
    'aiSuggestPlaces',
  ),
}

export const fs = {
  serverTimestamp,
  addList: (name: string, ownerUids: string[]) =>
    addDoc(collection(db, 'lists'), { name, ownerUids, createdAt: serverTimestamp() }),
}
