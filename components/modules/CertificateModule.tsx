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
  // QR Code Version 2, 25x25, Error Correction Level L, Byte mode, Mask 0
  // Full Reed-Solomon error correction for reliable scanner compatibility
  const N = 25
  const quiet = Math.floor(size * 0.08)
  const qrArea = size - quiet * 2
  const cell = qrArea / N
  const grid: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false))
  const locked: boolean[][] = Array.from({ length: N }, () => Array(N).fill(false))

  const mark = (r: number, c: number, v: boolean, lock = true) => {
    if (r >= 0 && r < N && c >= 0 && c < N) { grid[r][c] = v; if (lock) locked[r][c] = true }
  }

  // Finder patterns (7x7 at three corners)
  const finder = (tr: number, tc: number) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = tr + r, cc = tc + c
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue
        const border = r === -1 || r === 7 || c === -1 || c === 7
        const ring = r === 0 || r === 6 || c === 0 || c === 6
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
        mark(rr, cc, !border && (ring || core))
      }
  }
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0)

  // Alignment pattern at (18,18) for Version 2
  for (let r = -2; r <= 2; r++)
    for (let c = -2; c <= 2; c++)
      mark(18 + r, 18 + c, Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0))

  // Timing patterns
  for (let i = 8; i < N - 8; i++) { mark(6, i, i % 2 === 0); mark(i, 6, i % 2 === 0) }

  // Dark module
  mark(N - 8, 8, true)

  // Reserve format info areas
  for (let i = 0; i <= 8; i++) { locked[8][Math.min(i, N - 1)] = true; locked[Math.min(i, N - 1)][8] = true }
  for (let i = 0; i < 8; i++) { locked[8][N - 1 - i] = true; locked[N - 1 - i][8] = true }

  // Encode data (byte mode, V2-L: 34 data codewords, 32 usable bytes)
  const trimmed = data.slice(0, 32)
  const bytes = new TextEncoder().encode(trimmed)
  const bits: number[] = []
  bits.push(0, 1, 0, 0) // mode indicator: byte
  for (let i = 7; i >= 0; i--) bits.push((bytes.length >> i) & 1) // character count
  bytes.forEach(b => { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1) }) // data
  for (let i = 0; i < 4 && bits.length < 272; i++) bits.push(0) // terminator
  while (bits.length % 8 !== 0 && bits.length < 272) bits.push(0) // byte-align
  let padByte = true
  while (bits.length < 272) {
    const p = padByte ? 0xEC : 0x11
    for (let i = 7; i >= 0; i--) bits.push((p >> i) & 1)
    padByte = !padByte
  }

  // Convert to 34 data codewords
  const dataCW: number[] = []
  for (let i = 0; i < 272; i += 8) {
    let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | (bits[i + j] || 0)
    dataCW.push(v)
  }

  // Reed-Solomon: generate 10 EC codewords in GF(2^8), primitive poly 0x11D
  const EXP = new Uint8Array(256), LOG = new Uint8Array(256)
  let val = 1
  for (let i = 0; i < 255; i++) { EXP[i] = val; LOG[val] = i; val = (val << 1) ^ (val >= 128 ? 0x11D : 0) }
  EXP[255] = EXP[0]
  const gfMul = (a: number, b: number): number => a === 0 || b === 0 ? 0 : EXP[(LOG[a] + LOG[b]) % 255]

  // Generator polynomial: prod(x + alpha^i) for i=0..9
  let gen = [1]
  for (let i = 0; i < 10; i++) {
    const next = new Array(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) { next[j] ^= gen[j]; next[j + 1] ^= gfMul(gen[j], EXP[i]) }
    gen = next
  }

  // Polynomial long division — remainder = EC codewords
  const div = [...dataCW, ...new Array(10).fill(0)]
  for (let i = 0; i < 34; i++) {
    const c = div[i]
    if (c !== 0) for (let j = 1; j < gen.length; j++) div[i + j] ^= gfMul(gen[j], c)
  }
  const ecCW = div.slice(34)

  // Final bit stream: data codewords + EC codewords
  const allBits: number[] = []
  ;[...dataCW, ...ecCW].forEach(cw => { for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1) })

  // Place bits in zigzag pattern (right-to-left column pairs, alternating up/down)
  let bi = 0, upward = true
  for (let right = N - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5 // skip timing column
    for (let v = 0; v < N; v++) {
      const row = upward ? N - 1 - v : v
      for (let j = 0; j < 2; j++) {
        const col = right - j
        if (col >= 0 && !locked[row][col] && bi < allBits.length) grid[row][col] = allBits[bi++] === 1
      }
    }
    upward = !upward
  }

  // Apply mask 0: invert where (row + col) % 2 === 0
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (!locked[r][c] && (r + c) % 2 === 0) grid[r][c] = !grid[r][c]

  // Write format info — EC Level L + Mask 0 = 111011111000100 (BCH encoded + XOR masked)
  const fmt = [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0]
  const s1: [number,number][] = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]]
  const s2: [number,number][] = [[N-1,8],[N-2,8],[N-3,8],[N-4,8],[N-5,8],[N-6,8],[N-7,8],[8,N-8],[8,N-7],[8,N-6],[8,N-5],[8,N-4],[8,N-3],[8,N-2],[8,N-1]]
  for (let i = 0; i < 15; i++) { grid[s1[i][0]][s1[i][1]] = fmt[i] === 1; grid[s2[i][0]][s2[i][1]] = fmt[i] === 1 }

  // Render with quiet zone for reliable scanning
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, size, size)
  ctx.fillStyle = '#000000'
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (grid[r][c]) ctx.fillRect(x + quiet + c * cell, y + quiet + r * cell, Math.ceil(cell), Math.ceil(cell))
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

    // QR Code (bottom-left) — encodes credential ID for verification
    drawQRCode(ctx, credentialId, 80, 620, 120)
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
              <>✓ VERIFIED — Issued to <strong>{verifyResult.cert?.student_name}</strong> for <strong>{verifyResult.cert?.course_title}</strong> on {new Date(verifyResult.cert?.issued_at || '').toLocaleDateString()}</>
            ) : '× NOT FOUND — This credential ID does not match any certificate.'}
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
                    ◈ {cert.credential_id}
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
