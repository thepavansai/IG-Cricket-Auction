import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import {
  ChevronRight, SkipForward, Gavel, Users,
  TrendingDown, CheckCircle, AlertCircle, RefreshCw, RotateCcw
} from 'lucide-react'

const API = 'http://localhost:8080'
const AUCTION_DRAFT_KEY = 'cricket-auction-auction-draft'
const BIDS_KEY = 'cricket-auction-bid-snapshots'

const readDraft = () => {
  try {
    return JSON.parse(localStorage.getItem(AUCTION_DRAFT_KEY) || 'null')
  } catch {
    return null
  }
}

const readBidSnapshots = () => {
  try {
    return JSON.parse(localStorage.getItem(BIDS_KEY) || '[]')
  } catch {
    return []
  }
}

export default function AuctionView({ masterRoster, config, onDone }) {
  const savedDraft = readDraft()
  const savedBidSnapshots = readBidSnapshots()
  const [roster, setRoster] = useState(savedDraft?.roster || masterRoster)
  const [currentIndex, setCurrentIndex] = useState(savedDraft?.currentIndex || 0)
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(savedDraft?.selectedTeam || '')
  const [bidAmount, setBidAmount] = useState(savedDraft?.bidAmount || '')
  const [bidSnapshots, setBidSnapshots] = useState(Array.isArray(savedBidSnapshots) ? savedBidSnapshots : [])
  const [bidStatus, setBidStatus] = useState(null)
  const [bidMsg, setBidMsg] = useState('')
  const [imgError, setImgError] = useState(false)

  const persistAuctionState = (nextState) => {
    localStorage.setItem(AUCTION_DRAFT_KEY, JSON.stringify({
      roster: nextState.roster,
      currentIndex: nextState.currentIndex,
      selectedTeam: nextState.selectedTeam,
      bidAmount: nextState.bidAmount,
      savedAt: Date.now()
    }))
  }

  useEffect(() => {
    persistAuctionState({
      roster,
      currentIndex,
      selectedTeam,
      bidAmount,
      savedAt: Date.now()
    })
    localStorage.setItem(BIDS_KEY, JSON.stringify(bidSnapshots.slice(0, 20)))
  }, [roster, currentIndex, selectedTeam, bidAmount, bidSnapshots])

  const unsoldPlayers = roster.filter(p => p.Status === 'Unsold')
  const soldCount = roster.filter(p => p.Status === 'Sold').length
  const currentPlayer = roster[currentIndex] || null

  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/teams`)
      setTeams(res.data)
      if (!selectedTeam && res.data.length > 0) {
        setSelectedTeam(res.data[0].id)
      }
    } catch {
    }
  }, [selectedTeam])

  useEffect(() => {
    fetchTeams()
    const interval = setInterval(fetchTeams, 5000)
    return () => clearInterval(interval)
  }, [fetchTeams])

  useEffect(() => {
    setImgError(false)
    setBidStatus(null)
    setBidMsg('')
    setBidAmount('')
  }, [currentIndex])

  const pushBidSnapshot = (snapshot) => {
    setBidSnapshots(currentSnapshots => [snapshot, ...currentSnapshots].slice(0, 20))
  }

  const reversePreviousBid = async () => {
    if (bidSnapshots.length === 0) {
      setBidStatus('error')
      setBidMsg('No previous bid to reverse')
      return
    }

    const previous = bidSnapshots[0]

    setBidStatus('loading')
    try {
      await axios.post(`${API}/api/reverse-bid`)

      setRoster(previous.roster)
      setCurrentIndex(previous.currentIndex)
      setSelectedTeam(previous.selectedTeam)
      setBidAmount(previous.bidAmount)
      setBidSnapshots(currentSnapshots => currentSnapshots.slice(1))

      setBidStatus('skip')
      setBidMsg(`Reversed bid for ${previous.playerName}`)
    } catch (err) {
      setBidStatus('error')
      setBidMsg(err.response?.data || 'Could not reverse previous bid')
    }
  }

  const getPhotoUrl = (player) => {
    if (!player?.ImagePath) return ''
    const filename = decodeURIComponent(
      player.ImagePath.replace(/\\/g, '/').split('/').pop()
    )
    return filename ? `${API}/images/${filename}` : ''
  }

  const handleSell = async () => {
    if (!selectedTeam) { setBidMsg('Select a team'); setBidStatus('error'); return }
    const amount = parseInt(bidAmount)
    if (!amount || amount < 1) { setBidMsg('Enter a valid bid amount'); setBidStatus('error'); return }
    if (!currentPlayer) return

    const team = teams.find(t => t.id === selectedTeam)
    if (team && amount > team.budget) {
      setBidMsg(`${team.name} only has ₹${team.budget.toLocaleString()} left`)
      setBidStatus('error')
      return
    }

    setBidStatus('loading')
    try {
      const previousState = {
        roster,
        currentIndex,
        selectedTeam,
        bidAmount,
        playerName: currentPlayer.Name || 'Unknown Player'
      }
      await axios.post(`${API}/api/bid`, {
        teamId: selectedTeam,
        kekaId: currentPlayer.KekaID,
        amount
      })

      pushBidSnapshot(previousState)

      const updatedRoster = roster.map((p, i) => {
        if (i === currentIndex) {
          return {
            ...p,
            Status: 'Sold',
            WinningTeam: team?.name || selectedTeam,
            WinningBid: amount
          }
        }
        return p
      })
      setRoster(updatedRoster)
      setBidStatus('success')
      setBidMsg(`Sold to ${team?.name} for ₹${amount.toLocaleString()}!`)
      await fetchTeams()

      setTimeout(() => advancePlayer(updatedRoster), 1200)
    } catch (err) {
      setBidStatus('error')
      setBidMsg(err.response?.data || 'Bid failed')
    }
  }

  const handleSkip = () => {
    if (!currentPlayer) return
    const updatedRoster = roster.map((p, i) =>
      i === currentIndex ? { ...p, Status: 'Unsold' } : p
    )
    setRoster(updatedRoster)
    setBidStatus('skip')
    setBidMsg('Player skipped')
    setTimeout(() => advancePlayer(updatedRoster), 600)
  }

  const advancePlayer = (updatedRoster) => {
    let next = currentIndex + 1
    while (next < updatedRoster.length && updatedRoster[next].Status === 'Sold') {
      next++
    }
    if (next >= updatedRoster.length) {
      onDone(updatedRoster)
    } else {
      setCurrentIndex(next)
    }
  }

  const progress = Math.round((soldCount / roster.length) * 100)

  if (!currentPlayer) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏆</div>
          <h2 style={{ fontFamily: 'Bebas Neue', fontSize: '2rem', color: 'var(--gold)' }}>AUCTION COMPLETE</h2>
          <button onClick={() => onDone(roster)} style={btnStyle('var(--gold)', '#000')}>
            GENERATE REPORT →
          </button>
        </div>
      </div>
    )
  }

  const photoUrl = getPhotoUrl(currentPlayer)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: '0',
      height: 'calc(100vh - 56px)',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: '2rem',
        overflowY: 'auto',
        borderRight: '1px solid var(--border)'
      }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
              Player {currentIndex + 1} of {roster.length}
            </span>
            <span style={{ color: 'var(--green)', fontSize: '0.8rem', fontWeight: 600 }}>
              {soldCount} Sold · {unsoldPlayers.length} Remaining
            </span>
          </div>
          <div style={{
            height: '4px', background: 'var(--bg3)', borderRadius: '2px', overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'var(--green)',
              borderRadius: '2px',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>

        <div key={currentIndex} className="pop" style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          overflow: 'hidden',
          marginBottom: '1.5rem',
          display: 'flex',
          gap: '0'
        }}>
          <div style={{
            width: '220px',
            minHeight: '260px',
            background: 'var(--bg3)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'hidden'
          }}>
            {photoUrl && !imgError ? (
              <img
                src={photoUrl}
                alt={currentPlayer.Name}
                onError={() => setImgError(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  top: 0, left: 0
                }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '4rem', minHeight: '260px'
              }}>
                👤
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: '10px', left: '10px',
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              padding: '4px 10px',
              borderRadius: '100px',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: 'var(--gold)',
              border: '1px solid rgba(255,214,0,0.3)'
            }}>
              {currentPlayer.Role || 'N/A'}
            </div>
          </div>

          <div style={{ padding: '1.5rem', flex: 1 }}>
            <div style={{
              fontFamily: 'Bebas Neue',
              fontSize: '2.2rem',
              lineHeight: 1,
              marginBottom: '4px',
              color: 'var(--text)'
            }}>
              {currentPlayer.Name || 'Unknown Player'}
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              {currentPlayer.KekaID} · {currentPlayer.Email}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <StatChip label="SKILL LEVEL" value={currentPlayer.SkillLevel || 'N/A'} />
              <StatChip label="BASE PRICE" value={`₹${currentPlayer.BasePrice.toLocaleString()}`} highlight />
              <StatChip label="ROLE" value={currentPlayer.Role || 'N/A'} />
              <StatChip label="STATUS" value={currentPlayer.Status} />
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem'
        }}>
          <h3 style={{
            fontFamily: 'Bebas Neue', fontSize: '1.2rem',
            margin: '0 0 1rem', color: 'var(--gold)',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <Gavel size={18} /> BIDDING CONSOLE
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                WINNING TEAM
              </label>
              <select
                value={selectedTeam}
                onChange={e => setSelectedTeam(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  fontFamily: 'DM Sans',
                  outline: 'none'
                }}
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} (₹{t.budget.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                BID AMOUNT (₹)
              </label>
              <input
                type="number"
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
                placeholder={`Min ${currentPlayer.BasePrice}`}
                min={currentPlayer.BasePrice}
                step={1000}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '0.9rem',
                  fontFamily: 'DM Sans',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {bidMsg && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '12px',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: bidStatus === 'success' ? 'rgba(0,200,83,0.1)' :
                          bidStatus === 'error' ? 'rgba(255,61,61,0.1)' :
                          'rgba(255,214,0,0.1)',
              border: `1px solid ${bidStatus === 'success' ? 'rgba(0,200,83,0.3)' :
                                    bidStatus === 'error' ? 'rgba(255,61,61,0.3)' :
                                    'rgba(255,214,0,0.3)'}`,
              color: bidStatus === 'success' ? 'var(--green)' :
                     bidStatus === 'error' ? 'var(--red)' :
                     'var(--gold)'
            }}>
              {bidStatus === 'success' ? <CheckCircle size={16} /> :
               bidStatus === 'error' ? <AlertCircle size={16} /> :
               <SkipForward size={16} />}
              {bidMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleSell}
              disabled={bidStatus === 'loading' || bidStatus === 'success'}
              style={{
                ...btnStyle('var(--green)', '#000'),
                flex: 2,
                opacity: (bidStatus === 'loading' || bidStatus === 'success') ? 0.6 : 1
              }}
            >
              <Gavel size={16} />
              {bidStatus === 'loading' ? 'PROCESSING...' : 'SELL'}
            </button>
            <button
              onClick={handleSkip}
              disabled={bidStatus === 'loading' || bidStatus === 'success'}
              style={{
                ...btnStyle('var(--bg3)', 'var(--muted)'),
                flex: 1,
                border: '1px solid var(--border)',
                opacity: (bidStatus === 'loading' || bidStatus === 'success') ? 0.4 : 1
              }}
            >
              <SkipForward size={16} />
              SKIP
            </button>
          </div>

          <button
            onClick={reversePreviousBid}
            disabled={bidStatus === 'loading' || bidSnapshots.length === 0}
            style={{
              ...btnStyle('var(--bg3)', 'var(--text)'),
              width: '100%',
              marginTop: '10px',
              border: '1px solid var(--border)',
              opacity: (bidStatus === 'loading' || bidSnapshots.length === 0) ? 0.45 : 1
            }}
          >
            <RotateCcw size={16} />
            REVERSE PREVIOUS BID
          </button>
        </div>
      </div>

      <div style={{
        background: 'var(--bg2)',
        overflowY: 'auto',
        padding: '1.5rem'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem'
        }}>
          <h3 style={{
            fontFamily: 'Bebas Neue', fontSize: '1.1rem',
            margin: 0, color: 'var(--text)',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}>
            <Users size={16} /> TEAMS
          </h3>
          <button
            onClick={fetchTeams}
            style={{
              background: 'none', border: 'none',
              color: 'var(--muted)', cursor: 'pointer', padding: '4px'
            }}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {teams.map(team => {
            const pct = Math.round((team.budget / (config?.basePurse || 100000)) * 100)
            const barColor = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--gold)' : 'var(--red)'
            return (
              <div
                key={team.id}
                onClick={() => setSelectedTeam(team.id)}
                style={{
                  background: selectedTeam === team.id ? 'var(--bg3)' : 'var(--card)',
                  border: `1px solid ${selectedTeam === team.id ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius: '10px',
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '8px'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{team.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>
                      {team.roster?.length || 0} players
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'Bebas Neue',
                    fontSize: '1rem',
                    color: barColor
                  }}>
                    ₹{team.budget.toLocaleString()}
                  </div>
                </div>

                <div style={{
                  height: '3px', background: 'var(--bg)', borderRadius: '2px', overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: barColor,
                    borderRadius: '2px',
                    transition: 'width 0.5s ease'
                  }} />
                </div>

                {team.roster?.length > 0 && (
                  <div style={{
                    marginTop: '8px',
                    display: 'flex', flexWrap: 'wrap', gap: '4px'
                  }}>
                    {team.roster.slice(-6).map(kid => (
                      <span key={kid} style={{
                        background: 'var(--bg)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.65rem',
                        color: 'var(--muted)',
                        border: '1px solid var(--border)'
                      }}>
                        {kid}
                      </span>
                    ))}
                    {team.roster.length > 6 && (
                      <span style={{
                        fontSize: '0.65rem', color: 'var(--muted)',
                        alignSelf: 'center', paddingLeft: '2px'
                      }}>
                        +{team.roster.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={() => onDone(roster)}
          style={{
            ...btnStyle('var(--bg3)', 'var(--muted)'),
            width: '100%',
            marginTop: '1.5rem',
            border: '1px solid var(--border)',
            fontSize: '0.8rem'
          }}
        >
          <TrendingDown size={14} />
          END AUCTION & EXPORT
        </button>
      </div>
    </div>
  )
}

function StatChip({ label, value, highlight }) {
  return (
    <div style={{
      background: 'var(--bg3)',
      borderRadius: '8px',
      padding: '8px 12px',
      border: highlight ? '1px solid rgba(255,214,0,0.3)' : '1px solid var(--border)'
    }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--muted)', marginBottom: '2px', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{
        fontWeight: 700,
        fontSize: '0.9rem',
        color: highlight ? 'var(--gold)' : 'var(--text)'
      }}>
        {value}
      </div>
    </div>
  )
}

function btnStyle(bg, color) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '11px 16px',
    background: bg,
    color,
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'Bebas Neue',
    fontSize: '1rem',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
}
