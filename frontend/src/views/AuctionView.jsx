import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import {
  ChevronRight, SkipForward, Gavel, Users,
  TrendingDown, CheckCircle, AlertCircle, RefreshCw, RotateCcw
} from 'lucide-react'

const API = 'http://localhost:8080'
const AUCTION_DRAFT_KEY = 'cricket-auction-auction-draft'
const BIDS_KEY = 'cricket-auction-bid-snapshots'

const formatInLakhs = (amount) => {
  const value = Number(amount || 0)
  if (value >= 100) {
    const crValue = value / 100
    return `${Number.isInteger(crValue) ? crValue : crValue.toFixed(2)} Cr`
  }
  return `${value.toLocaleString('en-IN')} L`
}

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

export default function AuctionView({ masterRoster, config, onDone, isReauction }) {
  const savedDraft = readDraft()
  const savedBidSnapshots = isReauction ? [] : readBidSnapshots()
  
  // Filter roster: if re-auction, only show unsold players; otherwise show all
  const initialRoster = isReauction 
    ? masterRoster
      .filter(p => p.Status === 'Unsold')
      .map(p => ({ ...p, Visited: false }))
    : masterRoster
  
  const [roster, setRoster] = useState((!isReauction && savedDraft?.roster) ? savedDraft.roster : initialRoster)
  const [currentPlayerKekaID, setCurrentPlayerKekaID] = useState(
    (!isReauction && (savedDraft?.currentPlayerKekaID || initialRoster[savedDraft?.currentIndex || 0]?.KekaID))
      || initialRoster[0]?.KekaID
      || null
  )
  const [auctionPhase, setAuctionPhase] = useState(
    isReauction ? 'player' : (savedDraft?.auctionPhase || 'captain')
  ) // 'captain' or 'player'
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(isReauction ? '' : (savedDraft?.selectedTeam || ''))
  const [bidAmount, setBidAmount] = useState(isReauction ? '' : (savedDraft?.bidAmount || ''))
  const [bidSnapshots, setBidSnapshots] = useState(Array.isArray(savedBidSnapshots) ? savedBidSnapshots : [])
  const [bidStatus, setBidStatus] = useState(null)
  const [bidMsg, setBidMsg] = useState('')
  const [imgError, setImgError] = useState(false)
  const [storageWarning, setStorageWarning] = useState({ message: '', persistent: false })
  const [phaseNotice, setPhaseNotice] = useState({ visible: false, message: '' })
  const [showCaptainTransitionConfirm, setShowCaptainTransitionConfirm] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('ok')
  const failCountRef = useRef(0)
  const warningTimerRef = useRef(null)
  const phaseNoticeTimerRef = useRef(null)
  const advanceTimerRef = useRef(null)
  const captainTransitionPendingRef = useRef(null)
  const preserveBidAmountOnNextPlayerChangeRef = useRef(false)
  const advancePlayerRef = useRef(null)
  const selectedTeamRef = useRef(selectedTeam)

  const clearAdvanceTimer = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }

  const scheduleAdvance = (updatedRoster, previousPlayerKekaID, delayMs) => {
    clearAdvanceTimer()
    advanceTimerRef.current = setTimeout(() => {
      advancePlayerRef.current(updatedRoster, previousPlayerKekaID)
      advanceTimerRef.current = null
    }, delayMs)
  }

  const showToast = (message, options = {}) => {
    const persistent = Boolean(options.persistent)

    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }

    setStorageWarning({ message, persistent })

    if (!persistent) {
      warningTimerRef.current = setTimeout(() => {
        setStorageWarning({ message: '', persistent: false })
        warningTimerRef.current = null
      }, 2600)
    }
  }

  const showPhaseNotice = (message) => {
    if (phaseNoticeTimerRef.current) {
      clearTimeout(phaseNoticeTimerRef.current)
      phaseNoticeTimerRef.current = null
    }

    setPhaseNotice({ visible: true, message })
    phaseNoticeTimerRef.current = setTimeout(() => {
      setPhaseNotice({ visible: false, message: '' })
      phaseNoticeTimerRef.current = null
    }, 2600)
  }

  const safeSetItem = (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (e) {
      if (e?.name === 'QuotaExceededError') {
        localStorage.removeItem('cricket-auction-bid-snapshots')
        setBidSnapshots([])
        try {
          localStorage.setItem(key, value)
          showToast('Storage full — bid history cleared.', { persistent: false })
        } catch {
          showToast(
            'Storage full — bid history cleared. Auction state is safe.',
            { persistent: true }
          )
        }
      }
    }
  }

  const persistAuctionState = (nextState) => {
    safeSetItem(AUCTION_DRAFT_KEY, JSON.stringify({
      roster: nextState.roster,
      currentPlayerKekaID: nextState.currentPlayerKekaID,
      selectedTeam: nextState.selectedTeam,
      bidAmount: nextState.bidAmount,
      auctionPhase: nextState.auctionPhase,
      savedAt: Date.now()
    }))
  }

  useEffect(() => {
    persistAuctionState({
      roster,
      currentPlayerKekaID,
      selectedTeam,
      bidAmount,
      auctionPhase,
      savedAt: Date.now()
    })
    safeSetItem(BIDS_KEY, JSON.stringify(bidSnapshots.slice(0, 20)))
  }, [roster, currentPlayerKekaID, selectedTeam, bidAmount, auctionPhase, bidSnapshots])

  useEffect(() => {
    return () => {
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current)
      }
      if (phaseNoticeTimerRef.current) {
        clearTimeout(phaseNoticeTimerRef.current)
      }
      clearAdvanceTimer()
    }
  }, [])

  useEffect(() => {
    selectedTeamRef.current = selectedTeam
  }, [selectedTeam])

  useEffect(() => {
    if (auctionPhase !== 'captain') {
      setShowCaptainTransitionConfirm(false)
      captainTransitionPendingRef.current = null
    }
  }, [auctionPhase])

  // Filter roster based on current phase
  const phaseRoster = auctionPhase === 'captain'
    ? roster.filter(p => p.IsCaptain)
    : roster.filter(p => !p.IsCaptain)

  const activePlayers = auctionPhase === 'captain'
    ? phaseRoster.filter(p => p.Status !== 'Sold')
    : phaseRoster.filter(p => p.Status !== 'Sold' && !p.Visited)
  const isTransitioningPlayer = bidStatus === 'loading' || bidStatus === 'success'
  const playerPoolForCurrent = isTransitioningPlayer ? phaseRoster : activePlayers

  const unsoldPlayers = activePlayers.filter(p => p.Status === 'Unsold')
  const soldCount = phaseRoster.filter(p => p.Status === 'Sold').length
  const currentPlayer = playerPoolForCurrent.find(p => p.KekaID === currentPlayerKekaID) || activePlayers[0] || null
  const currentPhaseIndex = phaseRoster.findIndex(p => p.KekaID === currentPlayerKekaID)
  const remainingCount = Math.max(phaseRoster.length - soldCount, 0)
  const displayTotal = phaseRoster.length
  const displayPosition = ((currentPhaseIndex >= 0 ? currentPhaseIndex : 0) + 1)

  useEffect(() => {
    if (activePlayers.length === 0) {
      if (currentPlayerKekaID !== null) {
        setCurrentPlayerKekaID(null)
      }
      return
    }

    if (isTransitioningPlayer) {
      return
    }

    if (!activePlayers.some(player => player.KekaID === currentPlayerKekaID)) {
      setCurrentPlayerKekaID(activePlayers[0].KekaID)
    }
  }, [activePlayers, currentPlayerKekaID, isTransitioningPlayer])

  const fetchTeams = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/teams`)
      failCountRef.current = 0
      setConnectionStatus('ok')
      setTeams(res.data)
      if (!selectedTeamRef.current && res.data.length > 0) {
        setSelectedTeam(res.data[0].id)
      }
    } catch {
      failCountRef.current += 1
      if (failCountRef.current >= 3) {
        setConnectionStatus('lost')
      } else {
        setConnectionStatus('retrying')
      }
    }
  }, [])

  useEffect(() => {
    fetchTeams()
    const interval = setInterval(fetchTeams, 5000)
    return () => clearInterval(interval)
  }, [fetchTeams])

  useEffect(() => {
    if (auctionPhase !== 'captain' || teams.length === 0) return

    const selectedTeamName = teams.find(team => team.id === selectedTeam)?.name || ''
    const eligibleTeam = teams.find(team => !roster.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === team.name
    ))

    if (!eligibleTeam) return

    if (!selectedTeamName || selectedTeamName === '' || roster.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === selectedTeamName
    )) {
      setSelectedTeam(eligibleTeam.id)
    }
  }, [auctionPhase, teams, roster, selectedTeam])

  useEffect(() => {
    setImgError(false)
    setBidStatus(null)
    setBidMsg('')
    if (preserveBidAmountOnNextPlayerChangeRef.current) {
      preserveBidAmountOnNextPlayerChangeRef.current = false
      return
    }
    setBidAmount(currentPlayer?.BasePrice ? String(currentPlayer.BasePrice) : '')
  }, [currentPlayerKekaID, currentPlayer?.BasePrice])

  const pushBidSnapshot = (snapshot) => {
    setBidSnapshots(currentSnapshots => [snapshot, ...currentSnapshots].slice(0, 20))
  }

  const resolveCaptainTransitionChoice = (moveToPlayerAuction) => {
    const pending = captainTransitionPendingRef.current
    captainTransitionPendingRef.current = null
    setShowCaptainTransitionConfirm(false)

    if (!pending) return

    if (moveToPlayerAuction) {
      showPhaseNotice('Moving to player auction...')
      scheduleAdvance(pending.updatedRoster, pending.previousPlayerKekaID, 120)
    } else {
      showPhaseNotice('Staying on last captain bid.')
    }
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
      clearAdvanceTimer()
      setShowCaptainTransitionConfirm(false)
      captainTransitionPendingRef.current = null
      await axios.post(`${API}/api/reverse-bid`)

      const restoredRoster = roster.map(player =>
        player.KekaID === previous.changedPlayerKekaID
          ? {
              ...player,
              Status: previous.previousPlayerState.Status,
              WinningTeam: previous.previousPlayerState.WinningTeam,
              WinningBid: previous.previousPlayerState.WinningBid,
              Round: previous.previousPlayerState.Round,
              Visited: previous.previousPlayerState.Visited
            }
          : player
      )
      const restoredPhaseRoster = auctionPhase === 'captain'
        ? restoredRoster.filter(player => player.IsCaptain && player.Status !== 'Sold')
        : restoredRoster.filter(player => !player.IsCaptain && player.Status !== 'Sold')

      preserveBidAmountOnNextPlayerChangeRef.current = true
      setRoster(restoredRoster)
      if (previous.auctionPhase && previous.auctionPhase !== auctionPhase) {
        setAuctionPhase(previous.auctionPhase)
      }
      setCurrentPlayerKekaID(previous.currentPlayerKekaID || restoredPhaseRoster[0]?.KekaID || null)
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

  const teamsWithoutCaptain = teams.filter(team => !roster.some(player =>
    player.IsCaptain &&
    player.Status === 'Sold' &&
    player.WinningTeam === team.name
  ))

  const allTeamsHaveCaptain = (rosterSnapshot) =>
    teams.length > 0 && teams.every(team => rosterSnapshot.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === team.name
    ))

  const teamHasCaptain = (teamName) =>
    roster.some(player =>
      player.IsCaptain &&
      player.Status === 'Sold' &&
      player.WinningTeam === teamName
    )

  const handleSell = async (options = {}) => {
    const forceSell = Boolean(options.forceSell)

    if (!selectedTeam) { setBidMsg('Select a team'); setBidStatus('error'); return }
    const parsedBid = parseInt(bidAmount, 10)
    if (!currentPlayer) return
    const amount = Number.isFinite(parsedBid) && parsedBid > 0
      ? parsedBid
      : (forceSell ? currentPlayer.BasePrice : NaN)

    if (!amount || amount <= 0) {
      setBidMsg('Enter a valid bid amount')
      setBidStatus('error')
      return
    }

    if (!forceSell && amount < currentPlayer.BasePrice) {
      setBidMsg(`Minimum bid is ${formatInLakhs(currentPlayer.BasePrice)}`)
      setBidStatus('error')
      return
    }

    const team = teams.find(t => t.id === selectedTeam)
    if (auctionPhase === 'captain' && teamHasCaptain(team?.name || selectedTeam)) {
      setBidMsg(`${team?.name || 'This team'} already has a captain`)
      setBidStatus('error')
      return
    }

    if (!forceSell && team && amount > team.budget) {
      setBidMsg(`${team.name} only has ${formatInLakhs(team.budget)} left`)
      setBidStatus('error')
      return
    }

    setBidStatus('loading')
    try {
      const previousState = {
        changedPlayerKekaID: currentPlayer.KekaID,
        previousPlayerState: {
          Status: currentPlayer.Status,
          WinningTeam: currentPlayer.WinningTeam,
          WinningBid: currentPlayer.WinningBid,
          Round: currentPlayer.Round,
          Visited: currentPlayer.Visited
        },
        currentPlayerKekaID: currentPlayer.KekaID,
        selectedTeam,
        bidAmount,
        auctionPhase: auctionPhase,
        playerName: currentPlayer.Name || 'Unknown Player'
      }
      await axios.post(`${API}/api/bid`, {
        teamId: selectedTeam,
        kekaId: currentPlayer.KekaID,
        amount,
        ignoreBudget: forceSell
      })

      pushBidSnapshot(previousState)

      const updatedRoster = roster.map((p) => {
        if (p.KekaID === currentPlayer.KekaID) {
          return {
            ...p,
            Status: 'Sold',
            WinningTeam: team?.name || selectedTeam,
            WinningBid: amount,
            Round: isReauction ? 2 : 1
          }
        }
        return p
      })
      setRoster(updatedRoster)
      setBidStatus('success')
      setBidMsg(`${forceSell ? 'Force sold' : 'Sold'} to ${team?.name} for ${formatInLakhs(amount)}!`)
      await fetchTeams()

      if (auctionPhase === 'captain' && allTeamsHaveCaptain(updatedRoster)) {
        captainTransitionPendingRef.current = {
          updatedRoster,
          previousPlayerKekaID: currentPlayer.KekaID
        }
        setShowCaptainTransitionConfirm(true)
        return
      }

      scheduleAdvance(updatedRoster, currentPlayer.KekaID, 1200)
    } catch (err) {
      setBidStatus('error')
      setBidMsg(err.response?.data || 'Bid failed')
    }
  }

  const handleSkip = () => {
    if (!currentPlayer) return

    if (auctionPhase === 'captain') {
      setBidStatus('skip')
      setBidMsg('Captain skipped — will appear again')
      scheduleAdvance(roster, currentPlayer.KekaID, 600)
      return
    }

    const updatedRoster = roster.map((p) =>
      p.KekaID === currentPlayer.KekaID ? { ...p, Status: 'Unsold', Visited: true } : p
    )
    setRoster(updatedRoster)
    setBidStatus('skip')
    setBidMsg('Player skipped')
    scheduleAdvance(updatedRoster, currentPlayer.KekaID, 600)
  }

  const advancePlayer = (updatedRoster, previousPlayerKekaID = currentPlayerKekaID) => {
    if (auctionPhase === 'captain') {
      const allCaptains = updatedRoster.filter(player => player.IsCaptain)
      const pendingCaptains = allCaptains.filter(player => player.Status !== 'Sold')

      if (allTeamsHaveCaptain(updatedRoster)) {
        const rosterAfterCaptains = updatedRoster.map(p => {
          if (p.IsCaptain && p.Status === 'Unsold') {
            return {
              ...p,
              IsCaptain: false,
              SkillLevel: 'Expert',
              BasePrice: 6,
              Visited: false
            }
          }
          return p
        })

        setRoster(rosterAfterCaptains)
        setAuctionPhase('player')
        const firstPlayer = rosterAfterCaptains.find(player =>
          !player.IsCaptain && player.Status !== 'Sold' && !player.Visited
        )
        if (firstPlayer) {
          setCurrentPlayerKekaID(firstPlayer.KekaID)
        } else {
          onDone(rosterAfterCaptains)
        }
        setSelectedTeam('')
        setBidAmount('')
        return
      }

      if (pendingCaptains.length > 0) {
        const currentPosition = allCaptains.findIndex(player => player.KekaID === previousPlayerKekaID)
        let nextPosition = currentPosition >= 0 ? currentPosition + 1 : 0

        while (nextPosition < allCaptains.length && allCaptains[nextPosition].Status === 'Sold') {
          nextPosition++
        }

        if (nextPosition >= allCaptains.length) {
          nextPosition = 0
          while (nextPosition < allCaptains.length && allCaptains[nextPosition].Status === 'Sold') {
            nextPosition++
          }
        }

        setCurrentPlayerKekaID(allCaptains[nextPosition]?.KekaID || pendingCaptains[0].KekaID)
        return
      }

      onDone(updatedRoster)
      return
    }

    const phasePlayers = updatedRoster.filter(p => !p.IsCaptain)

    const currentPos = phasePlayers.findIndex(p => p.KekaID === previousPlayerKekaID)
    let next = currentPos >= 0 ? currentPos + 1 : 0

    // First pass: find next unvisited, unsold player
    while (next < phasePlayers.length && (phasePlayers[next].Status === 'Sold' || phasePlayers[next].Visited)) {
      next++
    }

    if (next < phasePlayers.length) {
      // Found a fresh player, go to them
      setCurrentPlayerKekaID(phasePlayers[next].KekaID)
      return
    }

    // No fresh players left — check if any skipped (Visited + Unsold) players remain
    const skippedPlayers = phasePlayers.filter(p => p.Visited && p.Status !== 'Sold')

    if (skippedPlayers.length === 0) {
      // Truly done — no fresh, no skipped
      onDone(updatedRoster)
      return
    }

    // Re-queue skipped players by resetting their Visited flag
    const rosterWithSkippedReset = updatedRoster.map(p =>
      (!p.IsCaptain && p.Visited && p.Status !== 'Sold')
        ? { ...p, Visited: false }
        : p
    )
    setRoster(rosterWithSkippedReset)
    setCurrentPlayerKekaID(skippedPlayers[0].KekaID)
  }

  const progress = phaseRoster.length > 0 ? Math.round((soldCount / phaseRoster.length) * 100) : 100
  const isActionLocked = bidStatus === 'loading' || bidStatus === 'success' || bidStatus === 'skip'

  advancePlayerRef.current = advancePlayer

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
  const playerByKekaID = new Map(masterRoster.map(player => [player.KekaID, player]))
  roster.forEach(player => {
    playerByKekaID.set(player.KekaID, player)
  })

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
              {auctionPhase === 'captain' ? '👑 CAPTAIN' : '🎯 PLAYER'} {displayPosition} of {displayTotal}
            </span>
            <span style={{ color: 'var(--green)', fontSize: '0.8rem', fontWeight: 600 }}>
              {soldCount} Sold · {remainingCount} Remaining
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

        <div key={currentPlayerKekaID || 'no-player'} className="pop" style={{
          background: 'var(--grad-card)',
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
              <StatChip label="SKILL LEVEL" value={currentPlayer.IsCaptain ? 'Captain' : (currentPlayer.SkillLevel || 'N/A')} />
              <StatChip label="BASE PRICE" value={formatInLakhs(currentPlayer.BasePrice)} highlight />
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
                className="themed-control"
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
                  <option key={t.id} value={t.id} disabled={auctionPhase === 'captain' && teamHasCaptain(t.name)}>
                    {t.name} ({formatInLakhs(t.budget)}){auctionPhase === 'captain' && teamHasCaptain(t.name) ? ' - Captain assigned' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                BID AMOUNT (L)
              </label>
              <input
                className="themed-control"
                type="number"
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
                placeholder={`Min ${formatInLakhs(currentPlayer.BasePrice)}`}
                min={currentPlayer.BasePrice}
                step={1}
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
              onClick={() => handleSell()}
              disabled={isActionLocked}
              style={{
                ...btnStyle('var(--green)', '#000'),
                flex: 2,
                opacity: isActionLocked ? 0.6 : 1
              }}
            >
              <Gavel size={16} />
              {bidStatus === 'loading' ? 'PROCESSING...' : 'SELL'}
            </button>
            <button
              onClick={handleSkip}
              disabled={isActionLocked}
              style={{
                ...btnStyle('var(--bg3)', 'var(--muted)'),
                flex: 1,
                border: '1px solid var(--border)',
                opacity: isActionLocked ? 0.4 : 1
              }}
            >
              <SkipForward size={16} />
              SKIP
            </button>
            {isReauction && (
              <button
                onClick={() => handleSell({ forceSell: true })}
                disabled={isActionLocked}
                style={{
                  ...btnStyle('var(--gold)', '#111'),
                  flex: 1.25,
                  opacity: isActionLocked ? 0.6 : 1
                }}
                title="Force sell allows selling below base price in re-auction"
              >
                <Gavel size={16} />
                FORCE SELL
              </button>
            )}
          </div>

          <button
            onClick={reversePreviousBid}
            disabled={isActionLocked || bidSnapshots.length === 0}
            style={{
              ...btnStyle('var(--bg3)', 'var(--text)'),
              width: '100%',
              marginTop: '10px',
              border: '1px solid var(--border)',
              opacity: (isActionLocked || bidSnapshots.length === 0) ? 0.45 : 1
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {connectionStatus === 'ok' && (
              <span
                title="Backend connected"
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  display: 'inline-block',
                  background: 'var(--green)'
                }}
              />
            )}
            {connectionStatus === 'retrying' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--gold)', fontSize: '0.72rem' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    display: 'inline-block',
                    background: 'var(--gold)'
                  }}
                />
                Reconnecting...
              </span>
            )}
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
        </div>

        {connectionStatus === 'lost' && (
          <div style={{
            marginBottom: '10px',
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(255,61,61,0.3)',
            background: 'rgba(255,61,61,0.1)',
            color: 'var(--red)',
            fontSize: '0.75rem'
          }}>
            Backend lost — budgets may be stale
          </div>
        )}

        {storageWarning.message && (
          <div style={{
            marginBottom: '10px',
            padding: '8px 10px',
            borderRadius: '8px',
            border: storageWarning.persistent ? '1px solid rgba(255,61,61,0.3)' : '1px solid rgba(255,214,0,0.3)',
            background: storageWarning.persistent ? 'rgba(255,61,61,0.1)' : 'rgba(255,214,0,0.1)',
            color: storageWarning.persistent ? 'var(--red)' : 'var(--gold)',
            fontSize: '0.75rem'
          }}>
            {storageWarning.message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {teams.map(team => {
            const pct = Math.round((team.budget / (config?.basePurse || 100)) * 100)
            const barColor = pct > 50 ? 'var(--green)' : pct > 20 ? 'var(--gold)' : 'var(--red)'
            return (
              <div
                key={team.id}
                onClick={() => setSelectedTeam(team.id)}
                style={{
                  background: selectedTeam === team.id ? 'var(--grad-selected-card)' : 'var(--card)',
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
                    {formatInLakhs(team.budget)}
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
                    {team.roster.map((kid) => {
                      const player = playerByKekaID.get(kid)
                      const isCaptain = Boolean(player?.IsCaptain)
                      return (
                        <span
                          key={`${team.id}-${kid}`}
                          style={{
                            background: 'var(--bg)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            color: isCaptain ? 'var(--gold)' : 'var(--text)',
                            border: isCaptain ? '1px solid rgba(255,214,0,0.3)' : '1px solid var(--border)'
                          }}
                        >
                          {player?.Name || kid}
                        </span>
                      )
                    })}
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

      {phaseNotice.visible && (
        <div style={{
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          zIndex: 1200,
          background: 'var(--grad-gold)',
          color: 'var(--text)',
          border: '1px solid rgba(255,214,0,0.35)',
          borderLeft: '3px solid var(--gold)',
          borderRadius: '10px',
          padding: '10px 12px',
          fontSize: '0.82rem',
          maxWidth: '320px',
          boxShadow: '0 10px 26px rgba(0,0,0,0.35)'
        }}>
          {phaseNotice.message}
        </div>
      )}

      {showCaptainTransitionConfirm && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1300,
          padding: '1rem'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '420px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1rem'
          }}>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: '1.35rem', color: 'var(--gold)', marginBottom: '0.5rem' }}>
              Captain Auction Complete?
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.88rem', marginBottom: '0.9rem' }}>
              All teams now have captains. Move to player auction now?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => resolveCaptainTransitionChoice(false)}
                style={{
                  ...btnStyle('var(--bg3)', 'var(--muted)'),
                  border: '1px solid var(--border)',
                  padding: '9px 12px',
                  fontSize: '0.88rem'
                }}
              >
                No, stay in captains
              </button>
              <button
                onClick={() => resolveCaptainTransitionChoice(true)}
                style={{
                  ...btnStyle('var(--gold)', '#111'),
                  padding: '9px 12px',
                  fontSize: '0.88rem'
                }}
              >
                Yes, move to players
              </button>
            </div>
          </div>
        </div>
      )}
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
