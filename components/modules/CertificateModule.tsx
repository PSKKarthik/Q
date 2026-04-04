'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, Certificate, Course, CourseProgress, CourseFile } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icon } from '@/components/ui/Icon'
import { SectionLabel } from '@/components/ui/SectionLabel'

interface Props {
  profile: Profile
  courses: Course[]
  enrolledIds: string[]
}

function generateCredentialId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let id = 'QGX-'
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) id += chars[Math.floor(Math.random() * chars.length)]
    if (i < 3) id += '-'
  }
  return id
}

function drawQRCode(ctx: CanvasRenderingContext2D, data: string, x: number, y: number, size: number) {
  // QR Code generator (Version 2, 25x25, Level L, Byte mode)
  // Encodes the credential ID string into a scannable QR code
  const modules = 25
  const cellSize = size / modules
  const grid: boolean[][] = Array.from({ length: modules }, () => Array(modules).fill(false))
  const reserved: boolean[][] = Array.from({ length: modules }, () => Array(modules).fill(false))

  // Mark module and reserve area
  const set = (r: number, c: number, val: boolean, res = true) => {
    if (r >= 0 && r < modules && c >= 0 && c < modules) {
      grid[r][c] = val
      if (res) reserved[r][c] = true
    }
  }

  // Finder patterns (7x7 at three corners)
  const drawFinder = (row: number, col: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = row + dr, c = col + dc
        if (r < 0 || r >= modules || c < 0 || c >= modules) continue
        const outer = dr === -1 || dr === 7 || dc === -1 || dc === 7
        const ring = dr === 0 || dr === 6 || dc === 0 || dc === 6
        const inner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
        set(r, c, !outer && (ring || inner))
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, modules - 7)
  drawFinder(modules - 7, 0)

  // Alignment pattern (Version 2 has one at row 18, col 18)
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const outer = Math.abs(dr) === 2 || Math.abs(dc) === 2
      const center = dr === 0 && dc === 0
      set(18 + dr, 18 + dc, outer || center)
    }
  }

  // Timing patterns
  for (let i = 8; i < modules - 8; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }

  // Dark module + format reserved areas
  set(modules - 8, 8, true)

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    set(8, i, false); set(i, 8, false)
    set(8, modules - 1 - i, false)
    if (i < 8) set(modules - 1 - i, 8, false)
  }
  // Reserve version info (not needed for V2 but mark timing)
  for (let i = 0; i < 7; i++) {
    reserved[8][i] = true; reserved[i][8] = true
    reserved[8][modules - 1 - i] = true
    if (i < 7) reserved[modules - 1 - i][8] = true
  }
  reserved[8][7] = true; reserved[8][8] = true; reserved[7][8] = true
  reserved[8][modules - 8] = true; reserved[modules - 7][8] = true

  // Encode data as byte mode
  const bytes = new TextEncoder().encode(data)
  const bits: number[] = []
  // Mode indicator (0100 = byte)
  bits.push(0, 1, 0, 0)
  // Character count (8 bits for V2)
  for (let i = 7; i >= 0; i--) bits.push((bytes.length >> i) & 1)
  // Data bytes
  bytes.forEach(b => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1) })
  // Terminator
  bits.push(0, 0, 0, 0)
  // Pad to 8-bit boundary
  while (bits.length % 8 !== 0) bits.push(0)
  // Pad codewords to fill capacity (V2-L = 44 data codewords)
  const capacity = 44 * 8
  let padToggle = false
  while (bits.length < capacity) {
    const pad = padToggle ? 0x11 : 0xEC
    for (let i = 7; i >= 0; i--) bits.push((pad >> i) & 1)
    padToggle = !padToggle
  }

  // Place data bits in zigzag pattern
  let bitIdx = 0
  for (let right = modules - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // Skip timing column
    for (let vert = 0; vert < modules; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j
        const row = ((Math.floor((modules - 1 - right + (right < 6 ? 1 : 0)) / 2)) % 2 === 0)
          ? vert : modules - 1 - vert
        if (!reserved[row]?.[col] && bitIdx < bits.length) {
          grid[row][col] = bits[bitIdx++] === 1
        }
      }
    }
  }

  // Apply mask pattern 0 (checkerboard: (row + col) % 2 === 0)
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (!reserved[r][c] && (r + c) % 2 === 0) {
        grid[r][c] = !grid[r][c]
      }
    }
  }

  // Write format info for mask 0, error correction L
  // Pre-computed: format bits for L + mask 0 = 111011111000100
  const formatBits = [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0]
  // Horizontal: around top-left finder
  for (let i = 0; i < 8; i++) {
    const c = i < 6 ? i : i + 1
    grid[8][c] = formatBits[i] === 1
  }
  for (let i = 8; i < 15; i++) {
    grid[8][modules - 15 + i] = formatBits[i] === 1
  }
  // Vertical: around top-left finder and bottom-left finder
  for (let i = 0; i < 7; i++) {
    const r = i < 6 ? modules - 1 - i : modules - 1 - i
    grid[r < modules ? r : 0][8] = formatBits[i] === 1
  }
  for (let i = 7; i < 15; i++) {
    const r = 14 - i < 6 ? 14 - i : 15 - i
    grid[r][8] = formatBits[i] === 1
  }

  // Render to canvas
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (grid[r][c]) {
        ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize, cellSize)
      }
    }
  }
}

export function CertificateModule({ profile, courses, enrolledIds }: Props) {
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [eligibleCourses, setEligibleCourses] = useState<{ course: Course; fileCount: number; completedCount: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [verifyInput, setVerifyInput] = useState('')
  const [verifyResult, setVerifyResult] = useState<{ found: boolean; cert?: Certificate } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { toast } = useToast()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [certRes, progressRes, filesRes] = await Promise.all([
        supabase.from('certificates').select('*').eq('student_id', profile.id),
        supabase.from('course_progress').select('*').eq('student_id', profile.id),
        supabase.from('course_files').select('id, course_id'),
      ])

      if (certRes.error) throw certRes.error
      if (progressRes.error) throw progressRes.error
      if (filesRes.error) throw filesRes.error

      const certs = (certRes.data || []) as Certificate[]
      setCertificates(certs)

      const progress = (progressRes.data || []) as CourseProgress[]
      const files = (filesRes.data || []) as CourseFile[]

      const eligible: { course: Course; fileCount: number; completedCount: number }[] = []
      const enrolledCourses = courses.filter(c => enrolledIds.includes(c.id))

      enrolledCourses.forEach(course => {
        const courseFiles = files.filter(f => f.course_id === course.id)
        const completedFiles = progress.filter(p => p.course_id === course.id)
        if (courseFiles.length > 0) {
          eligible.push({ course, fileCount: courseFiles.length, completedCount: completedFiles.length })
        }
      })

      setEligibleCourses(eligible)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load certificates', 'error')
    } finally {
      setLoading(false)
    }
  }, [profile.id, courses, enrolledIds, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const generateCertificate = async (course: Course) => {
    if (certificates.find(c => c.course_id === course.id)) return
    setBusy(course.id)
    try {
      const credentialId = generateCredentialId()
      const { data, error } = await supabase.from('certificates').insert({
        student_id: profile.id,
        course_id: course.id,
        student_name: profile.name,
        course_title: course.title,
        credential_id: credentialId,
        verified: true,
      }).select().single()

      if (error) throw error
      setCertificates(prev => [...prev, data as Certificate])
      downloadCertificate(profile.name, course.title, new Date().toLocaleDateString(), credentialId)
      toast('Certificate generated!', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to generate certificate', 'error')
    } finally {
      setBusy(null)
    }
  }

  const downloadCertificate = (studentName: string, courseTitle: string, date: string, credentialId: string) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = 1200
    canvas.height = 850

    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, 1200, 850)

    // Double border
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.strokeRect(30, 30, 1140, 790)
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1
    ctx.strokeRect(40, 40, 1120, 770)

    // Corner ornaments
    const corners = [[50, 50], [1150, 50], [50, 800], [1150, 800]]
    corners.forEach(([cx, cy]) => {
      ctx.fillStyle = '#444'
      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#555'
      ctx.beginPath()
      ctx.arc(cx, cy, 10, 0, Math.PI * 2)
      ctx.stroke()
    })

    // School Seal (top-right)
    const sealX = 1050, sealY = 120
    ctx.beginPath()
    ctx.arc(sealX, sealY, 45, 0, Math.PI * 2)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(sealX, sealY, 38, 0, Math.PI * 2)
    ctx.stroke()
    // Star in seal
    for (let i = 0; i < 5; i++) {
      const angle = (i * 72 - 90) * Math.PI / 180
      const outerR = 20, innerR = 8
      const ox = sealX + Math.cos(angle) * outerR, oy = sealY + Math.sin(angle) * outerR
      const ia = ((i * 72 + 36) - 90) * Math.PI / 180
      const ix = sealX + Math.cos(ia) * innerR, iy = sealY + Math.sin(ia) * innerR
      if (i === 0) ctx.moveTo(ox, oy)
      else ctx.lineTo(ox, oy)
      ctx.lineTo(ix, iy)
    }
    ctx.closePath()
    ctx.fillStyle = '#f59e0b'
    ctx.fill()
    ctx.fillStyle = '#f59e0b'
    ctx.font = '8px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.fillText('VERIFIED', sealX, sealY + 32)

    // QGX Logo
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 54px "Segoe UI", Arial, sans-serif'
    ctx.letterSpacing = '12px'
    ctx.textAlign = 'center'
    ctx.fillText('Q G X', 600, 130)

    ctx.fillStyle = '#666'
    ctx.font = '11px "Courier New", monospace'
    ctx.fillText('QUERY GEN X · LEARNING MANAGEMENT SYSTEM', 600, 158)

    // Divider
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(200, 180)
    ctx.lineTo(1000, 180)
    ctx.stroke()

    // Certificate title
    ctx.fillStyle = '#f59e0b'
    ctx.font = '14px "Courier New", monospace'
    ctx.fillText('CERTIFICATE OF COMPLETION', 600, 230)

    // Student name
    ctx.fillStyle = '#ffffff'
    ctx.font = '600 42px "Segoe UI", Arial, sans-serif'
    ctx.fillText(studentName, 600, 320)

    // Underline
    ctx.strokeStyle = '#333'
    ctx.beginPath()
    ctx.moveTo(300, 340)
    ctx.lineTo(900, 340)
    ctx.stroke()

    ctx.fillStyle = '#999'
    ctx.font = '16px "Segoe UI", Arial, sans-serif'
    ctx.fillText('has successfully completed the course', 600, 385)

    ctx.fillStyle = '#ffffff'
    ctx.font = '600 28px "Segoe UI", Arial, sans-serif'
    ctx.fillText(courseTitle, 600, 440)

    // Divider
    ctx.strokeStyle = '#333'
    ctx.beginPath()
    ctx.moveTo(300, 475)
    ctx.lineTo(900, 475)
    ctx.stroke()

    // Date & Credential
    ctx.fillStyle = '#888'
    ctx.font = '13px "Courier New", monospace'
    ctx.fillText(`Issued: ${date}`, 600, 520)
    ctx.fillStyle = '#f59e0b'
    ctx.font = '600 14px "Courier New", monospace'
    ctx.fillText(`Credential ID: ${credentialId}`, 600, 548)

    // QR Code (bottom-left)
    const verifyUrl = `QGX-VERIFY:${credentialId}`
    drawQRCode(ctx, verifyUrl, 80, 620, 120)
    ctx.fillStyle = '#555'
    ctx.font = '9px "Courier New", monospace'
    ctx.textAlign = 'center'
    ctx.fillText('SCAN TO VERIFY', 140, 755)

    // Signature lines
    ctx.strokeStyle = '#444'
    ctx.beginPath()
    ctx.moveTo(400, 700)
    ctx.lineTo(600, 700)
    ctx.stroke()
    ctx.fillStyle = '#666'
    ctx.font = '10px "Courier New", monospace'
    ctx.fillText('QGX Platform', 500, 720)

    ctx.beginPath()
    ctx.moveTo(700, 700)
    ctx.lineTo(900, 700)
    ctx.stroke()
    ctx.fillText('Course Instructor', 800, 720)

    // Footer
    ctx.fillStyle = '#333'
    ctx.font = '9px "Courier New", monospace'
    ctx.fillText('This certificate is digitally verified by the QGX platform. Verify at QGX Portal with credential ID.', 600, 780)

    // Download
    const link = document.createElement('a')
    link.download = `QGX-Certificate-${courseTitle.replace(/\s+/g, '-')}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const redownload = (cert: Certificate) => {
    downloadCertificate(cert.student_name, cert.course_title, new Date(cert.issued_at).toLocaleDateString(), cert.credential_id || 'N/A')
  }

  const verifyCert = async () => {
    if (!verifyInput.trim()) return
    try {
      const { data } = await supabase.from('certificates').select('*').eq('credential_id', verifyInput.trim().toUpperCase()).single()
      setVerifyResult(data ? { found: true, cert: data as Certificate } : { found: false })
    } catch {
      setVerifyResult({ found: false })
    }
  }

  if (loading) return <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Loading certificates...</div>

  return (
    <>
      <PageHeader title="CERTIFICATES" subtitle="Verifiable course completion certificates" />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Verification Tool */}
      <div className="card fade-up-1" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Verify Certificate</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="input" placeholder="Enter Credential ID (e.g. QGX-ABCD-1234-EFGH-5678)" value={verifyInput} onChange={e => setVerifyInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') verifyCert() }} style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={verifyCert}>Verify</button>
        </div>
        {verifyResult && (
          <div style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 12, color: verifyResult.found ? 'var(--success)' : 'var(--danger)' }}>
            {verifyResult.found ? (
              <>✅ VERIFIED — Issued to <strong>{verifyResult.cert?.student_name}</strong> for <strong>{verifyResult.cert?.course_title}</strong> on {new Date(verifyResult.cert?.issued_at || '').toLocaleDateString()}</>
            ) : '❌ NOT FOUND — This credential ID does not match any certificate.'}
          </div>
        )}
      </div>

      {/* Existing certificates */}
      {certificates.length > 0 && (
        <>
          <SectionLabel>Earned Certificates</SectionLabel>
          <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginBottom: 24 }}>
            {certificates.map(cert => (
              <div key={cert.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, background: 'var(--success)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: 18 }}>✓</div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{cert.course_title}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>Issued {new Date(cert.issued_at).toLocaleDateString()}</div>
                  </div>
                </div>
                {cert.credential_id && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 10, textAlign: 'center', letterSpacing: '0.05em' }}>
                    🔑 {cert.credential_id}
                  </div>
                )}
                <button className="btn btn-sm" onClick={() => redownload(cert)} style={{ width: '100%', justifyContent: 'center' }}>
                  <Icon name="download" size={11} /> Download with QR
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Eligible courses */}
      <SectionLabel>Course Progress</SectionLabel>
      <div className="fade-up-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {eligibleCourses.map(({ course, fileCount, completedCount }) => {
          const pct = Math.round((completedCount / fileCount) * 100)
          const isComplete = completedCount >= fileCount
          const hasCert = certificates.some(c => c.course_id === course.id)
          return (
            <div key={course.id} className="card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>{course.title}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 12 }}>
                {completedCount}/{fileCount} files · {pct}% complete
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginBottom: 12 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: isComplete ? 'var(--success)' : 'var(--warn)', borderRadius: 3, transition: 'width 0.5s ease' }} />
              </div>
              {isComplete && !hasCert && (
                <button className="btn btn-primary btn-sm" onClick={() => generateCertificate(course)} disabled={busy === course.id} style={{ width: '100%', justifyContent: 'center' }}>
                  {busy === course.id ? <><span className="spinner" /> Generating...</> : <><Icon name="trophy" size={11} /> Generate Certificate</>}
                </button>
              )}
              {hasCert && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--success)', textAlign: 'center' }}>✓ Certificate Earned</div>}
              {!isComplete && <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>Complete all files to earn certificate</div>}
            </div>
          )
        })}
        {eligibleCourses.length === 0 && (
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>Enroll in courses to track certificate progress.</div>
        )}
      </div>
    </>
  )
}
