export type UserDoc = {
  displayName: string
  photoURL?: string
  partnerUid?: string | null
  preferences?: Record<string, unknown>
  fcmTokens?: string[]
}

export type ListDoc = {
  name: string
  ownerUids: string[]
  createdAt: import('firebase/firestore').Timestamp
}

export type GeoPointLike = {
  latitude: number
  longitude: number
}

export type ListItemDoc = {
  listId: string
  placeId: string
  title: string
  category?: string
  status: 'want' | 'done'
  notes?: string
  rating?: number
  photos?: string[]
  address?: string
  location?: GeoPointLike
  createdAt: import('firebase/firestore').Timestamp
  updatedAt: import('firebase/firestore').Timestamp
}

export type PlaceSuggestion = {
  query: string
  reason?: string
}

