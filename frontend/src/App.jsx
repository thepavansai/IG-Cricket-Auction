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
  const [theme, setTheme] = useState(() => savedSession?.theme || localStorage.getItem('theme') || 'light')
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
    setTheme('light')
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
    <div className="min-h-screen" style={{ background: 'var(--grad-bg)' }}>
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
          <div style={{ display: 'flex', alignItems: 'center', height: '22px', flexShrink: 0, transform: 'translateY(1px)' }}>
          <svg
            viewBox="0 0 161 37"
            aria-label="InsightGlobal logo"
            role="img"
            style={{ display: 'block', height: '22px', width: 'auto', color: 'var(--text)' }}
          >
            <path d="M3.04763 0.323469H0.0722656V20.6155H3.04763V0.323469Z" fill="currentColor"></path>
            <path d="M12.878 6.72385C11.4806 6.69149 10.1169 7.155 9.02869 8.03219V6.95117H6.03817V20.5903H9.01353L9.03879 12.6645C9.11816 11.7897 9.52816 10.9782 10.1852 10.3953C10.8423 9.81235 11.6969 9.50199 12.5749 9.52745H12.6052C13.0216 9.51385 13.4366 9.58323 13.826 9.73153C14.2154 9.87982 14.5714 10.1041 14.8733 10.3913C15.2362 10.7874 15.5165 11.2518 15.6978 11.7575C15.879 12.2632 15.9577 12.7999 15.9291 13.3363V20.5903H18.9045V13.109C18.8994 9.29509 16.4797 6.72385 12.878 6.72385Z" fill="currentColor"></path>
            <path d="M26.8708 12.2301L26.5222 12.1442L26.4061 12.1088C24.3854 11.5633 24.052 11.2147 24.052 10.6792C24.052 9.58306 25.5675 9.49719 26.0727 9.49719C27.3237 9.46825 28.5521 9.83412 29.5835 10.5429L30.0331 10.8156L31.4121 8.44647L31.0232 8.17368C29.6171 7.20717 27.9398 6.71352 26.2343 6.7643C23.1731 6.7643 21.1171 8.39089 21.1171 10.8055C21.1171 13.402 23.4357 14.3416 25.9413 15.0034C28.4469 15.6651 28.5681 16.0996 28.5681 16.7512C28.5681 17.9434 27.1082 18.1252 26.2343 18.1252C24.8266 18.1576 23.4496 17.7105 22.3295 16.8573L21.8748 16.5138L20.3594 18.9941L20.7938 19.2669C22.4102 20.3324 24.3085 20.8901 26.2444 20.8682C29.3562 20.8682 31.5283 19.1608 31.5283 16.7108C31.5283 14.2608 30.2856 13.1242 26.8708 12.2301Z" fill="currentColor"></path>
            <path d="M35.034 3.54636C35.3777 3.54636 35.7137 3.44444 35.9995 3.2535C36.2852 3.06255 36.508 2.79116 36.6395 2.47363C36.771 2.1561 36.8054 1.80669 36.7384 1.46961C36.6713 1.13252 36.5058 0.822893 36.2628 0.579867C36.0198 0.336841 35.7101 0.171331 35.373 0.10428C35.036 0.0372296 34.6866 0.0716498 34.369 0.203175C34.0515 0.334699 33.7801 0.557421 33.5892 0.843189C33.3982 1.12896 33.2963 1.46493 33.2963 1.80862C33.2963 2.2695 33.4794 2.71151 33.8053 3.03739C34.1312 3.36328 34.5732 3.54636 35.034 3.54636ZM33.5186 20.5499V20.6105H36.5242V6.9713H33.5489L33.5186 20.5499Z" fill="currentColor"></path>
            <path d="M61.5143 6.724C60.0865 6.69478 58.698 7.19297 57.6145 8.12327V0.293377H54.6896V20.5804H57.6701V12.9526C57.6719 12.4934 57.7654 12.0393 57.9451 11.6168C58.1247 11.1942 58.3869 10.8118 58.7162 10.4919C59.0455 10.172 59.4354 9.92099 59.8629 9.75368C60.2905 9.58637 60.7472 9.50607 61.2061 9.51751H61.2415C61.6588 9.50439 62.0744 9.57496 62.464 9.72505C62.8535 9.87515 63.2091 10.1017 63.5096 10.3914C63.8731 10.7855 64.1545 11.2479 64.3375 11.7518C64.5205 12.2557 64.6014 12.7909 64.5755 13.3264V20.5804H67.5559V13.1092C67.5408 9.29525 65.1413 6.724 61.5143 6.724Z" fill="currentColor"></path>
            <path d="M151.639 8.08275C150.583 7.31848 149.337 6.86076 148.038 6.76014C146.738 6.65952 145.436 6.91992 144.276 7.51256C143.115 8.1052 142.141 9.00704 141.46 10.1185C140.78 11.23 140.419 12.5079 140.419 13.8112C140.419 15.1145 140.78 16.3924 141.46 17.5039C142.141 18.6154 143.115 19.5172 144.276 20.1099C145.436 20.7025 146.738 20.9629 148.038 20.8623C149.337 20.7616 150.583 20.3039 151.639 19.5397V20.6409H154.554V7.00171H151.634L151.639 8.08275ZM147.482 18.0444C146.641 18.0444 145.82 17.7952 145.121 17.3284C144.423 16.8616 143.878 16.1981 143.557 15.4218C143.235 14.6455 143.151 13.7913 143.315 12.9672C143.479 12.1431 143.883 11.3862 144.477 10.792C145.072 10.1979 145.829 9.79325 146.653 9.62933C147.477 9.4654 148.331 9.54953 149.107 9.87108C149.884 10.1926 150.547 10.7372 151.014 11.4358C151.481 12.1344 151.73 12.9558 151.73 13.7961C151.729 14.9224 151.281 16.0022 150.484 16.7986C149.688 17.595 148.608 18.0431 147.482 18.0444Z" fill="currentColor"></path>
            <path d="M106.514 0.323469H103.538V20.6155H106.514V0.323469Z" fill="currentColor"></path>
            <path d="M131.731 6.72379C130.25 6.72168 128.807 7.18855 127.609 8.0574V0.323469H124.689V20.6105H127.609V19.5092C128.512 20.1685 129.559 20.604 130.664 20.7799C131.769 20.9559 132.899 20.8673 133.963 20.5215C135.027 20.1756 135.994 19.5824 136.784 18.7904C137.574 17.9985 138.164 17.0305 138.508 15.9659C138.851 14.9013 138.937 13.7704 138.758 12.6662C138.579 11.562 138.141 10.5159 137.48 9.61384C136.818 8.71178 135.952 7.97949 134.953 7.47709C133.954 6.9747 132.849 6.71652 131.731 6.72379ZM131.731 18.0342C130.89 18.0342 130.069 17.785 129.37 17.3182C128.672 16.8514 128.127 16.1879 127.806 15.4116C127.484 14.6353 127.4 13.7811 127.564 12.957C127.728 12.1329 128.133 11.376 128.727 10.7818C129.321 10.1877 130.078 9.78305 130.902 9.61913C131.726 9.4552 132.58 9.53934 133.356 9.86088C134.133 10.1824 134.796 10.7269 135.263 11.4256C135.73 12.1242 135.979 12.9456 135.979 13.7859C135.98 14.3444 135.87 14.8976 135.657 15.4139C135.444 15.9302 135.131 16.3995 134.737 16.7949C134.342 17.1904 133.874 17.5042 133.358 17.7186C132.842 17.933 132.289 18.0436 131.731 18.0443V18.0342Z" fill="currentColor"></path>
            <path d="M160.515 0.323469H157.539V20.6155H160.515V0.323469Z" fill="currentColor"></path>
            <path d="M78.7502 17.211L78.5431 17.3575C77.964 17.8307 77.2401 18.091 76.4922 18.095C74.8807 18.095 74.1887 17.4635 74.1887 15.9834V9.59829H78.9068V6.98159H74.1887V2.65241H71.2638V5.37014C71.2638 5.58152 71.2221 5.79082 71.1411 5.98605C71.06 6.18127 70.9412 6.35859 70.7915 6.50782C70.6418 6.65705 70.4642 6.77527 70.2687 6.8557C70.0732 6.93613 69.8638 6.9772 69.6524 6.97653H68.6421V9.59829H71.2184V15.9885C71.2184 18.9487 73.1531 20.8582 76.1436 20.8582C77.5584 20.9054 78.9439 20.4489 80.0535 19.57L80.2253 19.4387C79.6657 18.7434 79.1719 17.9976 78.7502 17.211Z" fill="currentColor"></path>
            <path d="M101.482 9.59821H91.1365V12.4018H98.2591C97.8129 14.0517 96.8086 15.496 95.4172 16.4886C94.0258 17.4813 92.3334 17.961 90.6281 17.846C88.9228 17.7311 87.31 17.0286 86.0644 15.8583C84.8188 14.6879 84.0174 13.1219 83.7966 11.4271C83.5758 9.73222 83.9492 8.01323 84.8534 6.56278C85.7576 5.11234 87.1365 4.02011 88.7555 3.4721C90.3744 2.92409 92.1333 2.95416 93.7325 3.5572C95.3318 4.16023 96.6726 5.29893 97.5267 6.77944L100.128 5.26398C98.872 3.08169 96.8654 1.43039 94.4821 0.61764C92.0989 -0.195114 89.5014 -0.113918 87.1736 0.846107C84.8458 1.80613 82.9462 3.57955 81.8288 5.83604C80.7113 8.09253 80.4521 10.6783 81.0994 13.1117C81.7467 15.5451 83.2565 17.6602 85.3474 19.0632C87.4384 20.4662 89.968 21.0614 92.4652 20.7378C94.9623 20.4143 97.2568 19.1942 98.9212 17.3047C100.586 15.4152 101.506 12.9851 101.512 10.4671C101.512 10.1741 101.512 9.88615 101.482 9.59821Z" fill="currentColor"></path>
            <path d="M45.5969 36.6241C49.4971 36.6241 52.6589 33.4623 52.6589 29.562C52.6589 25.6617 49.4971 22.5 45.5969 22.5C41.6966 22.5 38.5348 25.6617 38.5348 29.562C38.5348 33.4623 41.6966 36.6241 45.5969 36.6241Z" fill="#FF0069"></path>
            <path d="M45.5969 20.8582C49.4971 20.8582 52.6589 17.6964 52.6589 13.7962C52.6589 9.89589 49.4971 6.7341 45.5969 6.7341C41.6966 6.7341 38.5348 9.89589 38.5348 13.7962C38.5348 17.6964 41.6966 20.8582 45.5969 20.8582Z" fill="#FFD700"></path>
            <path d="M115.591 20.8582C119.491 20.8582 122.653 17.6964 122.653 13.7962C122.653 9.89589 119.491 6.7341 115.591 6.7341C111.691 6.7341 108.529 9.89589 108.529 13.7962C108.529 17.6964 111.691 20.8582 115.591 20.8582Z" fill="#00D6F2"></path>
          </svg>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', height: '22px' }}>
            <span style={{
              fontFamily: 'Bebas Neue',
              fontSize: '1.5rem',
              lineHeight: 1,
              letterSpacing: '0.1em',
              color: 'var(--green)'
            }}>CRICKET AUCTION</span>
          </div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
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
          config={config}
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
