import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, RotateCcw, Trophy, Users, FileSpreadsheet, Repeat2 } from 'lucide-react'

const formatInLakhs = (amount) => {
  const value = Number(amount || 0)
  if (value >= 100) {
    const crValue = value / 100
    return `${Number.isInteger(crValue) ? crValue : crValue.toFixed(2)} Cr`
  }
  return `${value.toLocaleString('en-IN')} L`
}

export default function ExportView({ masterRoster, onRestart, onReauction }) {
  const [exported, setExported] = useState(false)

  const soldPlayers = masterRoster.filter(p => p.Status === 'Sold')
  const unsoldPlayers = masterRoster.filter(p => p.Status !== 'Sold')

  const originalCaptains = masterRoster.filter(p => p.WasOriginalCaptain)
  const soldCaptains = originalCaptains.filter(p => p.Status === 'Sold')
  const unsoldCaptains = originalCaptains.filter(p => p.Status !== 'Sold')
  const soldRegularPlayers = soldPlayers.filter(p => !p.IsCaptain)
  
  const round1Players = soldPlayers.filter(p => (p.Round || 1) === 1)
  const round2Players = soldPlayers.filter(p => p.Round === 2)

  const teamTally = soldPlayers.reduce((acc, p) => {
    if (!acc[p.WinningTeam]) acc[p.WinningTeam] = { count: 0, spend: 0, captains: 0 }
    acc[p.WinningTeam].count++
    acc[p.WinningTeam].spend += p.WinningBid
    if (p.IsCaptain) acc[p.WinningTeam].captains++
    return acc
  }, {})

  const handleExport = () => {
    const wb = XLSX.utils.book_new()

    const masterSheet = XLSX.utils.json_to_sheet(
      masterRoster.map(p => ({
        'Type': p.IsCaptain ? 'CAPTAIN' : 'PLAYER',
        'Keka ID': p.KekaID,
        'Full Name': p.Name,
        'Role': p.Role,
        'Skill Level': p.IsCaptain ? 'Captain' : p.SkillLevel,
        'Email': p.Email,
        'Base Price (Lakh)': p.BasePrice,
        'Status': p.Status,
        'Winning Team': p.WinningTeam || 'N/A',
        'Winning Bid (Lakh)': p.WinningBid || 0,
        'Round': p.Round || (p.Status === 'Sold' ? 1 : 'N/A')
      }))
    )
    XLSX.utils.book_append_sheet(wb, masterSheet, 'Master Roster')

    const teamSquadData = soldPlayers
      .sort((a, b) => a.WinningTeam.localeCompare(b.WinningTeam))
      .map(p => ({
        'Team': p.WinningTeam,
        'Type': p.IsCaptain ? 'CAPTAIN' : 'PLAYER',
        'Keka ID': p.KekaID,
        'Full Name': p.Name,
        'Role': p.Role,
        'Winning Bid (Lakh)': p.WinningBid,
        'Round': p.Round || 1
      }))

    const squadsSheet = XLSX.utils.json_to_sheet(teamSquadData)
    XLSX.utils.book_append_sheet(wb, squadsSheet, 'Team Squads')

    XLSX.writeFile(wb, 'Auction_Final_Report.xlsx')
    setExported(true)
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '3rem 2rem' }} className="slide-in">
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏆</div>
        <h1 style={{
          fontFamily: 'Bebas Neue',
          fontSize: '3.5rem',
          color: 'var(--gold)',
          margin: 0,
          lineHeight: 1
        }}>
          AUCTION COMPLETE
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: '8px' }}>
          {soldPlayers.length} players sold · {unsoldPlayers.length} unsold
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '2rem'
      }}>
        <SummaryCard icon={<Trophy size={20} />} label="Players Sold" value={soldPlayers.length} color="var(--gold)" />
        <SummaryCard icon={<Users size={20} />} label="Total Teams" value={Object.keys(teamTally).length} color="var(--green)" />
        <SummaryCard icon={<FileSpreadsheet size={20} />} label="Total Bid Value" value={formatInLakhs(soldPlayers.reduce((s, p) => s + p.WinningBid, 0))} color="var(--text)" />
      </div>

      {soldCaptains.length > 0 && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontFamily: 'Bebas Neue', fontSize: '1.1rem',
            margin: '0 0 1rem', color: 'var(--text)'
          }}>
            👑 CAPTAIN AUCTION SUMMARY
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Captains Sold</div>
              <div style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '1.2rem' }}>{soldCaptains.length}</div>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Unsold Captains</div>
              <div style={{ color: 'var(--red)', fontWeight: 700, fontSize: '1.2rem' }}>{unsoldCaptains.length}</div>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--bg3)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Regular Players</div>
              <div style={{ color: 'var(--green)', fontWeight: 700, fontSize: '1.2rem' }}>{soldRegularPlayers.length}</div>
            </div>
          </div>
        </div>
      )}

      {Object.keys(teamTally).length > 0 && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontFamily: 'Bebas Neue', fontSize: '1.1rem',
            margin: '0 0 1rem', color: 'var(--text)'
          }}>
            TEAM BREAKDOWN
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {Object.entries(teamTally)
              .sort((a, b) => b[1].spend - a[1].spend)
              .map(([team, data]) => (
                <div key={team} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: 'var(--bg3)',
                  borderRadius: '8px'
                }}>
                  <div style={{ fontWeight: 600 }}>{team}</div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {data.captains > 0 && (
                      <span style={{ color: 'var(--gold)', fontSize: '0.85rem', fontWeight: 600 }}>
                        👑 {data.captains}
                      </span>
                    )}
                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{data.count} total</span>
                    <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '0.9rem' }}>{formatInLakhs(data.spend)} spent</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {round2Players.length > 0 && (
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontFamily: 'Bebas Neue', fontSize: '1.1rem',
            margin: '0 0 1rem', color: 'var(--text)'
          }}>
            AUCTION ROUNDS
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--bg3)',
              borderRadius: '8px'
            }}>
              <div style={{ fontWeight: 600 }}>Round 1 (Main)</div>
              <span style={{ color: 'var(--gold)', fontWeight: 700, fontSize: '0.9rem' }}>{round1Players.length} players</span>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--bg3)',
              borderRadius: '8px'
            }}>
              <div style={{ fontWeight: 600 }}>Round 2 (Re-auction)</div>
              <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: '0.9rem' }}>{round2Players.length} players</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={handleExport}
          style={{
            flex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '16px',
            background: exported ? 'var(--green-dim)' : 'var(--gold)',
            color: '#000',
            border: 'none',
            borderRadius: '10px',
            fontFamily: 'Bebas Neue',
            fontSize: '1.3rem',
            letterSpacing: '0.08em',
            cursor: 'pointer'
          }}
        >
          <Download size={20} />
          {exported ? 'DOWNLOADED! EXPORT AGAIN' : 'EXPORT AUCTION_FINAL_REPORT.XLSX'}
        </button>

        {unsoldPlayers.length > 0 && (
          <button
            onClick={() => {
              if (onReauction) {
                onReauction(unsoldPlayers)
              }
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '16px',
              background: 'var(--green)',
              color: '#000',
              border: 'none',
              borderRadius: '10px',
              fontFamily: 'Bebas Neue',
              fontSize: '1rem',
              letterSpacing: '0.08em',
              cursor: 'pointer'
            }}
            title={`Re-auction ${unsoldPlayers.length} unsold players`}
          >
            <Repeat2 size={16} />
            RE-AUCTION ({unsoldPlayers.length})
          </button>
        )}

        <button
          onClick={onRestart}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '16px',
            background: 'var(--bg3)',
            color: 'var(--muted)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            fontFamily: 'Bebas Neue',
            fontSize: '1rem',
            letterSpacing: '0.08em',
            cursor: 'pointer'
          }}
        >
          <RotateCcw size={16} />
          NEW AUCTION
        </button>
      </div>

      <p style={{
        textAlign: 'center',
        color: 'var(--muted)',
        fontSize: '0.75rem',
        marginTop: '1rem'
      }}>
        Two sheets: <strong>Master Roster</strong> (all players) + <strong>Team Squads</strong> (sold, sorted by team)
      </p>
    </div>
  )
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '1.25rem',
      textAlign: 'center'
    }}>
      <div style={{ color, marginBottom: '8px', display: 'flex', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{
        fontFamily: 'Bebas Neue',
        fontSize: '1.8rem',
        color,
        lineHeight: 1
      }}>
        {value}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: '4px' }}>
        {label}
      </div>
    </div>
  )
}
