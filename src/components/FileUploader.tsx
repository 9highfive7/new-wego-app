import { useRef, useState } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../lib/firebase'
import { Button } from './ui/button'

type Props = {
  path: string
  onUploaded?: (url: string) => void
}

export function FileUploader({ path, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const onPick = () => inputRef.current?.click()
  const onFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const key = `${path}/${Date.now()}-${file.name}`
      const r = ref(storage, key)
      await uploadBytes(r, file)
      const url = await getDownloadURL(r)
      onUploaded?.(url)
    } finally {
      setLoading(false)
    }
  }
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <Button onClick={onPick} disabled={loading}>{loading ? 'アップロード中…' : '写真を追加'}</Button>
    </div>
  )
}

