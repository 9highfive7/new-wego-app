import { useEffect, useState } from 'react'
import { aiDebugEnabled, getLogs, clearLogs } from '../lib/debug'
import { Button } from './ui/button'

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [logs, setLogs] = useState(getLogs())
  const [firebaseStatus, setFirebaseStatus] = useState<'checking' | 'configured' | 'missing'>('checking')
  
  useEffect(() => {
    // デバッグモードでのみ表示
    if (!aiDebugEnabled) return
    
    // ログの定期更新
    const interval = setInterval(() => {
      setLogs(getLogs())
    }, 1000)
    
    // Firebase設定チェック
    const checkFirebase = () => {
      const env = import.meta.env
      const requiredKeys = [
        'VITE_FIREBASE_API_KEY',
        'VITE_FIREBASE_AUTH_DOMAIN',
        'VITE_FIREBASE_PROJECT_ID',
        'VITE_FIREBASE_STORAGE_BUCKET',
        'VITE_FIREBASE_MESSAGING_SENDER_ID',
        'VITE_FIREBASE_APP_ID'
      ]
      
      const hasAllKeys = requiredKeys.every(key => env[key])
      setFirebaseStatus(hasAllKeys ? 'configured' : 'missing')
    }
    
    checkFirebase()
    return () => clearInterval(interval)
  }, [])
  
  if (!aiDebugEnabled) return null
  
  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-24 right-6 z-40 grid h-12 w-12 place-items-center rounded-full bg-yellow-500 text-white shadow-lg hover:bg-yellow-600"
        aria-label="デバッグパネル"
      >
        🐛
      </button>
      
      {isOpen && (
        <div className="fixed bottom-32 right-4 z-40 w-96 max-h-96 overflow-auto rounded-lg bg-white shadow-xl border">
          <div className="sticky top-0 bg-yellow-50 p-3 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">デバッグパネル</h3>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
          </div>
          
          <div className="p-3 space-y-3">
            {/* 環境状態 */}
            <div className="space-y-2">
              <h4 className="font-medium text-sm">環境状態</h4>
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${firebaseStatus === 'configured' ? 'bg-green-500' : firebaseStatus === 'missing' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span>Firebase: {firebaseStatus === 'configured' ? '設定済み' : firebaseStatus === 'missing' ? '未設定（テストモード）' : '確認中'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  <span>AIデバッグ: 有効</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                  <span>モード: {import.meta.env.DEV ? '開発' : '本番'}</span>
                </div>
                {import.meta.env.VITE_AI_ENDPOINT && (
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-purple-500" />
                    <span className="truncate">AIエンドポイント: 設定済み</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* AIログ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">AIログ ({logs.length})</h4>
                <div className="space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      const logText = JSON.stringify(logs, null, 2)
                      navigator.clipboard.writeText(logText)
                    }}
                  >
                    コピー
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      clearLogs()
                      setLogs([])
                    }}
                  >
                    クリア
                  </Button>
                </div>
              </div>
              
              {logs.length > 0 ? (
                <div className="max-h-48 overflow-y-auto bg-gray-50 rounded p-2 text-xs font-mono">
                  {logs.map((log, i) => (
                    <div key={i} className="border-b border-gray-200 pb-1 mb-1">
                      <div className="text-gray-600">
                        [{new Date(log.ts).toLocaleTimeString()}] [{log.scope}]
                      </div>
                      <div className="font-semibold">{log.msg}</div>
                      {log.data && (
                        <div className="text-gray-500 text-xs">
                          {JSON.stringify(log.data, null, 2)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                  ログがありません
                </div>
              )}
            </div>
            
            {/* テストモード通知 */}
            {firebaseStatus === 'missing' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                <p className="text-xs text-yellow-800">
                  <strong>テストモード起動中:</strong> Firebase設定が未完了のため、AI機能はダミーデータを返します。
                  実際のAI機能を使用するには、.envファイルに正しいFirebase認証情報とOpenAI APIキーを設定してください。
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}