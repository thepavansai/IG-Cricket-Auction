import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import axios from 'axios'
import { Upload, FolderOpen, Users, DollarSign, CheckCircle, AlertCircle } from 'lucide-react'

// ─── Skill Level to Base Price Enum ───────────────────────────────────────
const SKILL_LEVEL_PRICES = {
  BEGINNER: 2,
  INTERMEDIATE: 4,
  EXPERT: 6
}

// ─── Captain Base Price Enum ─────────────────────────────────────────────
const CAPTAIN_BASE_PRICE = 10 // All captains have same base price (10 Lakhs)

const getBasePriceFromSkillLevel = (skillLevel) => {
  if (!skillLevel) return SKILL_LEVEL_PRICES.BEGINNER
  
  const normalized = skillLevel.toLowerCase().trim()
  
  if (normalized.includes('beginner')) return SKILL_LEVEL_PRICES.BEGINNER
  if (normalized.includes('intermediate')) return SKILL_LEVEL_PRICES.INTERMEDIATE
  if (normalized.includes('expert')) return SKILL_LEVEL_PRICES.EXPERT
  
  return SKILL_LEVEL_PRICES.BEGINNER // default
}

export default function SetupView({ onComplete }) {
  const setupDraftKey = 'cricket-auction-setup-draft'
  const savedSetupDraft = (() => {
    try {
      return JSON.parse(localStorage.getItem(setupDraftKey) || 'null')
    } catch {
      return null
    }
  })()

  const [imagePath, setImagePath] = useState(savedSetupDraft?.imagePath || '')
  const [teamsInput, setTeamsInput] = useState(savedSetupDraft?.teamsInput || '')
  const [basePurse, setBasePurse] = useState(savedSetupDraft?.basePurse || 100)
  const [rosterFile, setRosterFile] = useState(savedSetupDraft?.rosterFileName ? { name: savedSetupDraft.rosterFileName } : null)
  const [parsedCount, setParsedCount] = useState(savedSetupDraft?.parsedCount || 0)
  const [parsedRoster, setParsedRoster] = useState(savedSetupDraft?.parsedRoster || [])
  const [captainKekaIdsInput, setCaptainKekaIdsInput] = useState(savedSetupDraft?.captainKekaIdsInput || '')
  const [captainNamesInput, setCaptainNamesInput] = useState(savedSetupDraft?.captainNamesInput || '')
  const [status, setStatus] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef()

  useEffect(() => {
    localStorage.setItem(setupDraftKey, JSON.stringify({
      imagePath,
      teamsInput,
      basePurse,
      rosterFileName: rosterFile?.name || '',
      parsedCount,
      parsedRoster,
      captainKekaIdsInput,
      captainNamesInput
    }))
  }, [imagePath, teamsInput, basePurse, rosterFile, parsedCount, parsedRoster, captainKekaIdsInput, captainNamesInput])

  const normalizeHeader = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const readColumn = (row, aliases) => {
    const normalizedAliases = aliases.map(normalizeHeader)

    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = normalizeHeader(key)

      if (
        normalizedAliases.includes(normalizedKey) ||
        normalizedAliases.some(alias => normalizedKey.includes(alias) || alias.includes(normalizedKey))
      ) {
        return value
      }
    }

    return ''
  }

  const parseList = (value) =>
    value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean)

  const normalizeText = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setRosterFile(file)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const [headerRow = [], ...dataRows] = rows

        const headerIndexMap = new Map(
          headerRow.map((header, index) => [normalizeHeader(header), index])
        )

        const findIndex = (aliases) => {
          for (const alias of aliases) {
            const normalizedAlias = normalizeHeader(alias)
            if (headerIndexMap.has(normalizedAlias)) return headerIndexMap.get(normalizedAlias)
          }

          for (let index = 0; index < headerRow.length; index++) {
            const normalizedHeader = normalizeHeader(headerRow[index])
            if (
              aliases.some(alias => {
                const normalizedAlias = normalizeHeader(alias)
                return normalizedHeader.includes(normalizedAlias) || normalizedAlias.includes(normalizedHeader)
              })
            ) {
              return index
            }
          }

          return -1
        }

        const kekaIdIndex = findIndex(['KEKA ID', 'Keka ID', 'KEKAID'])
        const nameIndex = findIndex(['FULL NAME', 'Full Name', 'Name'])
        const roleIndex = findIndex(['Select your cricket category', 'Cricket Category', 'Role'])
        const skillLevelIndex = findIndex([
          'Select your SKILL level',
          'Select your skill level',
          'Skill Level',
          'Skill',
          'SKILL LEVEL'
        ])
        const emailIndex = findIndex(['Email', 'E-mail'])
        const photoIndex = findIndex([
          'PLEASE UPLOAD YOUR RECENT PHOTO FOR THE AUCTION PROCESS.',
          'PLEASE UPLOAD YOUR RECENT PHOTO FOR THE AUCTION PROCESS',
          'Recent Photo for the Auction Process'
        ])

        const cleanData = dataRows.map(row => {
          const skillLevel = String(skillLevelIndex >= 0 ? row[skillLevelIndex] : '').trim()
          return {
            KekaID: String(kekaIdIndex >= 0 ? row[kekaIdIndex] : '').trim(),
            Name: String(nameIndex >= 0 ? row[nameIndex] : '').trim(),
            Role: String(roleIndex >= 0 ? row[roleIndex] : '').trim(),
            SkillLevel: skillLevel,
            Email: String(emailIndex >= 0 ? row[emailIndex] : '').trim(),
            ImagePath: String(photoIndex >= 0 ? row[photoIndex] : '').trim(),
            BasePrice: getBasePriceFromSkillLevel(skillLevel),
            Status: "Unsold",
            WinningTeam: "None",
            WinningBid: 0
          }
        }).filter(p => p.KekaID !== "")

        setParsedRoster(cleanData)
        setParsedCount(cleanData.length)
        setRosterFile({ name: file.name })
      } catch (err) {
        setErrorMsg('Failed to parse Excel file: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleSubmit = async () => {
    if (!imagePath.trim()) { setErrorMsg('Image directory path is required'); return }
    if (!teamsInput.trim()) { setErrorMsg('At least one team name is required'); return }
    if (parsedRoster.length === 0) { setErrorMsg('Please upload a valid roster Excel file'); return }

    const captainKekaIds = parseList(captainKekaIdsInput)
    const captainNames = parseList(captainNamesInput)
    if (captainKekaIds.length === 0 && captainNames.length === 0) {
      setErrorMsg('Please provide captain Keka IDs or captain names')
      return
    }

    setErrorMsg('')
    setStatus('loading')

    const teamNames = teamsInput.split(',').map(t => t.trim()).filter(Boolean)
    const captainKekaIdSet = new Set(captainKekaIds.map(normalizeText))
    const captainNameSet = new Set(captainNames.map(normalizeText))
    
    // Mark captains in roster and set their base price
    const rosterWithCaptains = parsedRoster.map(player => {
      const isCaptain =
        captainKekaIdSet.has(normalizeText(player.KekaID)) ||
        captainNameSet.has(normalizeText(player.Name))

      return {
        ...player,
        IsCaptain: isCaptain,
        WasOriginalCaptain: isCaptain,
        SkillLevel: isCaptain ? 'Captain' : player.SkillLevel,
        BasePrice: isCaptain ? CAPTAIN_BASE_PRICE : player.BasePrice
      }
    })

    try {
      await axios.post('http://localhost:8080/api/set-config', {
        imagePath: imagePath.trim(),
        teams: teamNames,
        basePurse: parseInt(basePurse),
        captainKekaIds,
        captainNames
      })
      setStatus('success')
      setTimeout(() => {
        onComplete(rosterWithCaptains, {
          imagePath: imagePath.trim(),
          teams: teamNames,
          basePurse: parseInt(basePurse),
          captainKekaIds,
          captainNames
        })
      }, 800)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.response?.data || 'Could not connect to backend. Make sure Go server is running on :8080')
    }
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '3rem 2rem' }} className="slide-in">
      <div style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '3rem', color: 'var(--green)', margin: 0, lineHeight: 1 }}>
          AUCTION SETUP
        </h1>
        <p style={{ color: 'var(--muted)', margin: '8px 0 0', fontSize: '0.95rem' }}>
          Configure your tournament before the bidding begins
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <Field icon={<FolderOpen size={16} />} label="Image Directory Path" hint="Full local path to player photos folder">
          <input
            className="themed-control"
            type="text"
            value={imagePath}
            onChange={e => setImagePath(e.target.value)}
            placeholder="C:\Photos\Players"
            style={inputStyle}
          />
        </Field>

        <Field icon={<Users size={16} />} label="Tournament Teams" hint="Comma-separated team names">
          <input
            className="themed-control"
            type="text"
            value={teamsInput}
            onChange={e => setTeamsInput(e.target.value)}
            placeholder="Hawks, Bulls, Eagles, Lions"
            style={inputStyle}
          />
        </Field>

        <Field icon={<DollarSign size={16} />} label="Starting Purse per Team" hint="Use lakhs (100 = 1 Cr)">
          <input
            className="themed-control"
            type="number"
            value={basePurse}
            onChange={e => setBasePurse(e.target.value)}
            min={1}
            step={1}
            style={inputStyle}
          />
        </Field>

        <Field icon={<Upload size={16} />} label="Master Roster (.xlsx)" hint="Upload the player registration Excel file">
          <div
            onClick={() => fileRef.current.click()}
            style={{
              border: `2px dashed ${rosterFile ? 'var(--green)' : 'var(--border)'}`,
              borderRadius: '8px',
              padding: '1.25rem',
              textAlign: 'center',
              cursor: 'pointer',
              background: rosterFile ? 'rgba(0,200,83,0.05)' : 'var(--bg2)',
              transition: 'all 0.2s'
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {rosterFile ? (
              <div>
                <div style={{ color: 'var(--green)', fontWeight: 600, fontSize: '0.95rem' }}>
                  ✓ {rosterFile.name}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: '4px' }}>
                  {parsedCount} players parsed
                </div>
              </div>
            ) : (
              <div>
                <Upload size={24} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                  Click to upload Excel file
                </div>
              </div>
            )}
          </div>
        </Field>

        {errorMsg && (
          <div style={{
            display: 'flex', gap: '8px', alignItems: 'flex-start',
            padding: '12px 16px',
            background: 'rgba(255,61,61,0.1)',
            border: '1px solid rgba(255,61,61,0.3)',
            borderRadius: '8px',
            color: 'var(--red)',
            fontSize: '0.875rem'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            {errorMsg}
          </div>
        )}

        <Field icon={<Users size={16} />} label="Captain Keka IDs" hint="Comma- or newline-separated IDs from backend">
          <textarea
            className="themed-control"
            value={captainKekaIdsInput}
            onChange={e => setCaptainKekaIdsInput(e.target.value)}
            placeholder="IG0227, IG0310, IG0441"
            style={{ ...inputStyle, minHeight: '88px', resize: 'vertical' }}
          />
        </Field>

        <Field icon={<Users size={16} />} label="Captain Names" hint="Optional fallback if IDs are not available">
          <textarea
            className="themed-control"
            value={captainNamesInput}
            onChange={e => setCaptainNamesInput(e.target.value)}
            placeholder="Rahul Sharma, Arjun Patel, Vikram Singh"
            style={{ ...inputStyle, minHeight: '88px', resize: 'vertical' }}
          />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={status === 'loading' || status === 'success'}
          style={{
            marginTop: '0.5rem',
            padding: '14px',
            background: status === 'success' ? 'var(--green-dim)' : 'var(--green)',
            color: '#000',
            border: 'none',
            borderRadius: '8px',
            fontFamily: 'Bebas Neue',
            fontSize: '1.25rem',
            letterSpacing: '0.1em',
            cursor: status === 'loading' ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            opacity: status === 'loading' ? 0.7 : 1
          }}
        >
          {status === 'loading' && <span className="pulse">⏳</span>}
          {status === 'success' && <CheckCircle size={18} />}
          {status === 'loading' ? 'CONNECTING TO BACKEND...' :
           status === 'success' ? 'LAUNCHING AUCTION...' :
           'START AUCTION →'}
        </button>

        <p style={{ color: 'var(--muted)', fontSize: '0.75rem', textAlign: 'center', margin: 0 }}>
          Make sure sure your backend Go server is running on <code style={{ background: 'var(--bg2)', padding: '2px 4px', borderRadius: '4px' }}>http://localhost:8080</code> for the setup to work.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.75rem', textAlign: 'center', margin: '6px 0 0' }}>
          Setup autosaves locally and keeps the last 3 backups so you can recover after a refresh.
        </p>
      </div>
    </div>
  )
}

function Field({ icon, label, hint, children }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        marginBottom: '6px'
      }}>
        <span style={{ color: 'var(--green)' }}>{icon}</span>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>{label}</label>
        {hint && <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>— {hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '0.9rem',
  outline: 'none',
  fontFamily: 'DM Sans',
  transition: 'border-color 0.2s'
}
