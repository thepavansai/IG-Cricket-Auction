import { useState, useEffect, useRef } from 'react'
import SetupView from './views/SetupView.jsx'
import AuctionView from './views/AuctionView.jsx'
import ExportView from './views/ExportView.jsx'
import { Moon, Sun, Trash2 } from 'lucide-react'

const SESSION_KEY = 'cricket-auction-session'
const APP_KEYS = [
  SESSION_KEY,
  'cricket-auction-setup-draft',
  'cricket-auction-auction-draft',
  'cricket-auction-auction-history',
  'cricket-auction-bid-snapshots'
]

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

const loadSession = () => safeParse(localStorage.getItem(SESSION_KEY), null)

export default function App() {
  const savedSession = loadSession()
  const [view, setView] = useState(savedSession?.view || 'setup')
  const [masterRoster, setMasterRoster] = useState(savedSession?.masterRoster || [])
  const [config, setConfig] = useState(savedSession?.config || null)
  const [theme, setTheme] = useState(() => savedSession?.theme || localStorage.getItem('theme') || 'dark')
  const [toast, setToast] = useState({ visible: false, message: '' })
  const [refreshStep, setRefreshStep] = useState(0)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [isReauction, setIsReauction] = useState(false)
  const lastSessionRef = useRef(null)
  const toastTimerRef = useRef(null)
  const allowReloadRef = useRef(false)

  const showToast = (message, options = {}) => {
    const persistent = Boolean(options.persistent)

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }

    setToast({ visible: true, message, persistent })
    if (!persistent) {
      toastTimerRef.current = setTimeout(() => {
        setToast({ visible: false, message: '', persistent: false })
      }, 2600)
    }
  }

  const safeSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      if (e?.name === 'QuotaExceededError') {
        localStorage.removeItem('cricket-auction-bid-snapshots')
        try {
          localStorage.setItem(key, value)
        } catch {
          showToast(
            'Storage full — bid history cleared. Auction state is safe.',
            { persistent: true }
          )
        }
      }
    }
  }

  useEffect(() => {
    if (refreshStep === 0) return

    const stepMessages = [
      'Refresh confirmation 1/3: Click Continue to start refresh flow.',
      'Refresh confirmation 2/3: Unsaved progress may be interrupted.',
      'Refresh confirmation 3/3: Final confirmation before reload.'
    ]
    showToast(stepMessages[refreshStep - 1], { persistent: true })
  }, [refreshStep])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    safeSetItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const nextSession = { view, masterRoster, config, theme }

    lastSessionRef.current = nextSession
    safeSetItem(SESSION_KEY, JSON.stringify(nextSession))
  }, [view, masterRoster, config, theme])

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (allowReloadRef.current) {
        return
      }

      if (view !== 'setup' || masterRoster.length > 0 || config) {
        event.preventDefault()
        event.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [view, masterRoster.length, config])

  useEffect(() => {
    const handleRefreshShortcut = (event) => {
      const key = event.key.toLowerCase()
      const isRefreshShortcut = event.key === 'F5' || ((event.ctrlKey || event.metaKey) && key === 'r')

      if (!isRefreshShortcut) {
        return
      }

      event.preventDefault()
      if (refreshStep === 0) {
        setRefreshStep(1)
      } else {
        showToast(`Refresh confirmation ${refreshStep}/3 pending.`, { persistent: true })
      }
    }

    window.addEventListener('keydown', handleRefreshShortcut)
    return () => window.removeEventListener('keydown', handleRefreshShortcut)
  }, [refreshStep])

  const handleRefreshContinue = () => {
    if (refreshStep < 3) {
      setRefreshStep(current => current + 1)
      return
    }

    allowReloadRef.current = true
    setRefreshStep(0)
    showToast('Refreshing...')
    setTimeout(() => window.location.reload(), 120)
  }

  const handleRefreshCancel = () => {
    setRefreshStep(0)
    showToast('Refresh cancelled.')
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const clearSavedData = () => {
    setClearConfirm(true)
    showToast('Clear all saved auction data from this browser?', { persistent: true })
  }

  const handleClearConfirm = () => {
    APP_KEYS.forEach(key => localStorage.removeItem(key))
    setView('setup')
    setMasterRoster([])
    setConfig(null)
    setTheme('dark')
    setClearConfirm(false)
    showToast('Saved data cleared.')
  }

  const handleClearCancel = () => {
    setClearConfirm(false)
    showToast('Clear data cancelled.')
  }

  const clearSession = () => {
    setView('setup')
    setMasterRoster([])
    setConfig(null)
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem('cricket-auction-setup-draft')
    localStorage.removeItem('cricket-auction-auction-draft')
    localStorage.removeItem('cricket-auction-auction-history')
  }

  const handleSetupComplete = (roster, cfg) => {
    setMasterRoster(roster)
    setConfig(cfg)
    setView('auction')
  }

  const handleAuctionDone = (updatedRoster) => {
    if (isReauction) {
      // Merge re-auctioned players back into master roster
      const mergedRoster = masterRoster.map(originalPlayer => {
        const reauctionedVersion = updatedRoster.find(p => p.KekaID === originalPlayer.KekaID)
        return reauctionedVersion || originalPlayer
      })
      setMasterRoster(mergedRoster)
      setIsReauction(false)
    } else {
      setMasterRoster(updatedRoster)
    }
    setView('export')
  }

  const handleReauction = (unsoldPlayers) => {
    // Reset auction state for re-auctioning unsold players
    localStorage.removeItem('cricket-auction-auction-draft')
    localStorage.removeItem('cricket-auction-bid-snapshots')
    
    setIsReauction(true)
    // Re-enter auction view with only unsold players
    setView('auction')
  }

  const handleRestart = () => {
    clearSession()
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header style={{
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        padding: '0 2rem',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.5rem' }}>🏏</span>
          <span style={{
            fontFamily: 'Bebas Neue',
            fontSize: '1.5rem',
            letterSpacing: '0.1em',
            color: 'var(--green)'
          }}>CRICKET AUCTION</span>
          <span style={{
            fontSize: '0.65rem',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            padding: '2px 8px',
            borderRadius: '100px',
            color: 'var(--muted)',
            letterSpacing: '0.1em'
          }}>Beta</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {['Setup', 'Auction', 'Export'].map((label, i) => {
            const steps = ['setup', 'auction', 'export']
            const active = view === steps[i]
            const done = steps.indexOf(view) > i
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '100px',
                  background: active ? 'var(--green)' : done ? 'var(--bg3)' : 'transparent',
                  border: `1px solid ${active ? 'var(--green)' : done ? 'var(--border)' : 'var(--border)'}`,
                  color: active ? '#000' : done ? 'var(--muted)' : 'var(--muted)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  transition: 'all 0.3s'
                }}>
                  <span>{done && !active ? '✓' : i + 1}</span>
                  <span>{label}</span>
                </div>
                {i < 2 && <span style={{ color: 'var(--border)' }}>→</span>}
              </div>
            )
          })}

          <button
            onClick={toggleTheme}
            className="theme-toggle"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            onClick={clearSavedData}
            className="theme-toggle"
            title="Clear saved auction data"
            style={{ color: 'var(--red)' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {view === 'setup' && (
        <SetupView onComplete={handleSetupComplete} />
      )}
      {view === 'auction' && (
        <AuctionView
          masterRoster={masterRoster}
          config={config}
          onDone={handleAuctionDone}
          onClearSession={clearSession}
          isReauction={isReauction}
        />
      )}
      {view === 'export' && (
        <ExportView
          masterRoster={masterRoster}
          onRestart={handleRestart}
          onReauction={handleReauction}
          onClearSession={clearSession}
        />
      )}

      {toast.visible && (
        <div style={{
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          zIndex: 9999,
          background: 'var(--bg3)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid var(--gold)',
          borderRadius: '8px',
          padding: '10px 12px',
          fontSize: '0.82rem',
          maxWidth: '320px',
          boxShadow: '0 8px 22px rgba(0,0,0,0.35)'
        }}>
          <div>{toast.message}</div>
          {refreshStep > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                onClick={handleRefreshCancel}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRefreshContinue}
                style={{
                  background: 'var(--gold)',
                  border: 'none',
                  color: '#000',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}
              >
                Continue ({refreshStep}/3)
              </button>
            </div>
          )}

          {clearConfirm && refreshStep === 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                onClick={handleClearCancel}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '0.75rem'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleClearConfirm}
                style={{
                  background: 'var(--red)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}
              >
                Clear Data
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
