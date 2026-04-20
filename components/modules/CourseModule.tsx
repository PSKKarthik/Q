'use client'
import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import type { Profile, Course, CourseFile, CourseProgress, CourseRating } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import { pushNotification, pushNotificationBatch, logActivity } from '@/lib/actions'
import { formatSize, getFileIcon } from '@/lib/utils'
import { MAX_FILE_SIZE } from '@/lib/constants'

/* ╔══════════════════════════════════════════════════════════╗
   ║  COURSE MODULE — Netflix-meets-Coursera Course Hub       ║
   ╠══════════════════════════════════════════════════════════╣
   ║  Smart Discovery · Progress Tracking · Rate & Review     ║
   ║  In-App Preview · Course Completion · Teacher Analytics  ║
   ╚══════════════════════════════════════════════════════════╝ */

// ── TYPES ──────────────────────────────────────────────────
interface StudentCourseProps {
  profile: Profile
  courses: Course[]
  enrolledIds: string[]
  onEnrolledChange: (ids: string[]) => void
  onCoursesChange: (courses: Course[]) => void
}

interface TeacherCourseProps {
  profile: Profile
  courses: (Course & { _fileCount?: number })[]
  students: Profile[]
  onCoursesChange: (courses: any[]) => void
}

type SortKey = 'newest' | 'popular' | 'rated'
type PreviewType = 'pdf' | 'image' | 'video' | 'youtube' | 'document' | 'other'
type FilePreview = { file: CourseFile; type: PreviewType } | null

// ── HELPERS ────────────────────────────────────────────────
const SUBJECTS = ['All', 'Mathematics', 'Science', 'English', 'History', 'Computer Science', 'Art', 'Music', 'Physics', 'Chemistry', 'Biology', 'Other']

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/

function extractYouTubeId(url: string): string | null {
  const m = url.match(YOUTUBE_REGEX)
  return m ? m[1] : null
}

function getPreviewType(file: CourseFile): PreviewType {
  const name = (file.name || '').toLowerCase()
  const type = (file.type || '').toLowerCase()
  const url = (file.url || '').toLowerCase()
  // YouTube links (stored as url or in name)
  if (YOUTUBE_REGEX.test(url) || YOUTUBE_REGEX.test(file.url || '')) return 'youtube'
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (type.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/.test(name)) return 'image'
  if (type.includes('video') || /\.(mp4|mov|webm)$/.test(name)) return 'video'
  if (/\.(docx?|pptx?|xlsx?)$/.test(name)) return 'document'
  if (type.includes('word') || type.includes('presentation') || type.includes('powerpoint') || type.includes('spreadsheet') || type.includes('excel')) return 'document'
  return 'other'
}

function StarRating({ value, onChange, readonly = false, size = 18 }: { value: number; onChange?: (n: number) => void; readonly?: boolean; size?: number }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="course-stars" style={{ display: 'inline-flex', gap: 2 }}>
      {[1,2,3,4,5].map(n => (
        <span
          key={n}
          onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHover(n)}
          onMouseLeave={() => !readonly && setHover(0)}
          style={{
            cursor: readonly ? 'default' : 'pointer',
            fontSize: size,
            color: n <= (hover || value) ? '#f59e0b' : 'var(--border)',
            transition: 'color .15s',
          }}
        >★</span>
      ))}
    </div>
  )
}

function ProgressRing({ percent, size = 40, stroke = 3 }: { percent: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  const color = percent >= 100 ? 'var(--success)' : percent > 50 ? '#f59e0b' : 'var(--fg-dim)'
  return (
    <svg width={size} height={size} className="course-progress-ring">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.3} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fontFamily: 'var(--mono)', fontSize: size * 0.26, fill: 'var(--fg)' }}>
        {Math.round(percent)}%
      </text>
    </svg>
  )
}

function SubjectStrip({ subject }: { subject: string }) {
  const colors: Record<string, string> = {
    mathematics: '#3b82f6', science: '#10b981', english: '#f59e0b', history: '#ef4444',
    'computer science': '#8b5cf6', art: '#ec4899', music: '#06b6d4', physics: '#6366f1',
    chemistry: '#f97316', biology: '#22c55e',
  }
  const color = colors[(subject || '').toLowerCase()] || 'var(--fg-dim)'
  return <div className="course-subject-strip" style={{ background: color }} />
}

// ══════════════════════════════════════════════════════════════
// STUDENT COURSE MODULE
// ══════════════════════════════════════════════════════════════
export function StudentCourseModule({ profile, courses, enrolledIds, onEnrolledChange, onCoursesChange }: StudentCourseProps) {
  const { toast } = useToast()
  const [view, setView] = useState<'browse' | 'enrolled'>('browse')
  const [activeCourse, setActiveCourse] = useState<(Course & { course_files?: CourseFile[] }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('All')
  const [sort, setSort] = useState<SortKey>('newest')
  const [preview, setPreview] = useState<FilePreview>(null)
  const [progress, setProgress] = useState<CourseProgress[]>([])
  const [ratings, setRatings] = useState<CourseRating[]>([])
  const [enrollCounts, setEnrollCounts] = useState<Record<string, number>>({})
  const [rateModal, setRateModal] = useState(false)
  const [rateValue, setRateValue] = useState(5)
  const [rateReview, setRateReview] = useState('')
  const [rateSubmitting, setRateSubmitting] = useState(false)
  const [reviewLimit, setReviewLimit] = useState(5)
  const [reviewSort, setReviewSort] = useState<'newest' | 'highest' | 'lowest'>('newest')

  const fetchMeta = useCallback(async () => {
    try {
      const [progRes, ratRes, enrollRes] = await Promise.all([
        supabase.from('course_progress').select('*').eq('student_id', profile.id),
        supabase.from('course_ratings').select('*'),
        supabase.from('enrollments').select('course_id'),
      ])
      if (progRes.error) throw progRes.error
      if (ratRes.error) throw ratRes.error
      if (enrollRes.error) throw enrollRes.error
      if (progRes.data) setProgress(progRes.data)
      if (ratRes.data) setRatings(ratRes.data)
      if (enrollRes.data) {
        const counts: Record<string, number> = {}
        enrollRes.data.forEach((e: any) => { counts[e.course_id] = (counts[e.course_id] || 0) + 1 })
        setEnrollCounts(counts)
      }
    } catch (err) {
      toast((err as any)?.message ||'Failed to load course data', 'error')
    }
  }, [profile.id, toast])

  // Fetch progress, ratings, enrollment counts on mount
  useEffect(() => {
    fetchMeta()
  }, [fetchMeta])

  const enrolledCourses = useMemo(() => courses.filter(c => enrolledIds.includes(c.id)), [courses, enrolledIds])

  // Course stats helper
  const getCourseStats = useCallback((courseId: string) => {
    const courseRatings = ratings.filter(r => r.course_id === courseId)
    const avg = courseRatings.length ? courseRatings.reduce((s, r) => s + r.rating, 0) / courseRatings.length : 0
    return { avgRating: avg, ratingCount: courseRatings.length, enrollCount: enrollCounts[courseId] || 0 }
  }, [ratings, enrollCounts])

  // Progress for a specific course
  const getCourseProgress = useCallback((courseId: string, fileCount: number) => {
    if (!fileCount) return 0
    const completed = progress.filter(p => p.course_id === courseId).length
    return Math.round((completed / fileCount) * 100)
  }, [progress])

  const isFileCompleted = useCallback((fileId: string) => {
    return progress.some(p => p.file_id === fileId)
  }, [progress])

  // Continue learning — enrolled courses with progress < 100%
  const continueLearning = useMemo(() => {
    return enrolledCourses.filter(c => {
      const p = getCourseProgress(c.id, (c as any)._fileCount || 0)
      return p > 0 && p < 100
    }).slice(0, 3)
  }, [enrolledCourses, getCourseProgress])

  // Filtering & sorting
  const published = useMemo(() => courses.filter(c => c.status !== 'draft'), [courses])

  const filtered = useMemo(() => {
    let list = published
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(c => c.title.toLowerCase().includes(q) || c.subject?.toLowerCase().includes(q) || c.teacher_name?.toLowerCase().includes(q))
    }
    if (subjectFilter !== 'All') list = list.filter(c => c.subject?.toLowerCase() === subjectFilter.toLowerCase())
    if (sort === 'newest') list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    if (sort === 'popular') list = [...list].sort((a, b) => (enrollCounts[b.id] || 0) - (enrollCounts[a.id] || 0))
    if (sort === 'rated') list = [...list].sort((a, b) => getCourseStats(b.id).avgRating - getCourseStats(a.id).avgRating)
    return list
  }, [published, search, subjectFilter, sort, enrollCounts, getCourseStats])

  const courseCache = useRef<Record<string, any>>({})

  const openCourse = async (courseId: string, forceRefresh = false) => {
    if (!forceRefresh && courseCache.current[courseId]) {
      setActiveCourse(courseCache.current[courseId])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.from('courses').select('*, course_files(*)').eq('id', courseId).single()
      if (error) throw error
      if (data) {
        // Sort files by section then order_index
        if (data.course_files) {
          data.course_files.sort((a: any, b: any) => {
            if ((a.section || '') !== (b.section || '')) return (a.section || '').localeCompare(b.section || '')
            return (a.order_index || 0) - (b.order_index || 0)
          })
        }
        courseCache.current[courseId] = data
        setActiveCourse(data)
      }
    } catch (err) {
      toast((err as any)?.message ||'Failed to load course', 'error')
    } finally {
      setLoading(false)
    }
  }

  const enroll = async (courseId: string) => {
    try {
      const { error } = await supabase.from('enrollments').insert({ course_id: courseId, student_id: profile.id })
      if (error) throw error
      onEnrolledChange([...enrolledIds, courseId])
      setEnrollCounts(prev => ({ ...prev, [courseId]: (prev[courseId] || 0) + 1 }))
      await logActivity(`${profile.name} enrolled in course`, 'enrollment')
    } catch (err) {
      toast((err as any)?.message ||'Failed to enroll', 'error')
    }
  }

  const unenroll = async (courseId: string) => {
    try {
      const { error } = await supabase.from('enrollments').delete().eq('course_id', courseId).eq('student_id', profile.id)
      if (error) throw error
      onEnrolledChange(enrolledIds.filter(id => id !== courseId))
      setEnrollCounts(prev => ({ ...prev, [courseId]: Math.max(0, (prev[courseId] || 1) - 1) }))
      if (activeCourse?.id === courseId) setActiveCourse(null)
    } catch (err) {
      toast((err as any)?.message ||'Failed to unenroll', 'error')
    }
  }

  const toggleFileComplete = async (file: CourseFile) => {
    if (!activeCourse) return
    try {
      const existing = progress.find(p => p.file_id === file.id)
      if (existing) {
        const { error } = await supabase.from('course_progress').delete().eq('id', existing.id)
        if (error) throw error
        setProgress(prev => prev.filter(p => p.id !== existing.id))
      } else {
        const { data, error } = await supabase.from('course_progress').insert({
          student_id: profile.id, course_id: activeCourse.id, file_id: file.id,
        }).select().single()
        if (error) throw error
        if (data) setProgress(prev => [...prev, data])
        // Check completion
        const fileCount = activeCourse.course_files?.length || 0
        const newCompleted = progress.filter(p => p.course_id === activeCourse.id).length + 1
        if (newCompleted >= fileCount && fileCount > 0) {
          // Award XP once per student+course, guarded server-side.
          const courseXP = activeCourse.xp_reward ?? 50
          const { data: awarded } = await supabase.rpc('award_course_completion_xp', {
            p_user_id: profile.id,
            p_course_id: activeCourse.id,
            p_xp_delta: courseXP,
          })
          if (awarded) {
            toast(`◈ Course complete! +${courseXP} XP`, 'success')
            await logActivity(`${profile.name} completed course: ${activeCourse.title} (+${courseXP} XP)`, 'achievement')
          }
        }
      }
    } catch (err) {
      toast((err as any)?.message ||'Failed to update progress', 'error')
    }
  }

  const submitRating = async () => {
    if (!activeCourse || rateSubmitting) return
    setRateSubmitting(true)
    try {
      const existing = ratings.find(r => r.course_id === activeCourse.id && r.student_id === profile.id)
      if (existing) {
        const { error } = await supabase.from('course_ratings').update({ rating: rateValue, review: rateReview }).eq('id', existing.id)
        if (error) throw error
        setRatings(prev => prev.map(r => r.id === existing.id ? { ...r, rating: rateValue, review: rateReview } : r))
      } else {
        const { data, error } = await supabase.from('course_ratings').insert({
          student_id: profile.id, student_name: profile.name, course_id: activeCourse.id,
          rating: rateValue, review: rateReview,
        }).select().single()
        if (error) throw error
        if (data) setRatings(prev => [...prev, data])
      }
      setRateModal(false)
    } catch (err) {
      toast((err as any)?.message ||'Failed to submit rating', 'error')
    } finally {
      setRateSubmitting(false)
    }
  }

  // ── RENDER: COURSE DETAIL ──
  if (activeCourse) {
    const files = activeCourse.course_files || []
    const fileCount = files.length
    const courseProgress = getCourseProgress(activeCourse.id, fileCount)
    const stats = getCourseStats(activeCourse.id)
    const courseRatings = ratings.filter(r => r.course_id === activeCourse.id)
    const myRating = ratings.find(r => r.course_id === activeCourse.id && r.student_id === profile.id)
    const isEnrolled = enrolledIds.includes(activeCourse.id)

    // Group files by section
    const sections: Record<string, CourseFile[]> = {}
    files.forEach(f => {
      const sec = f.section || 'General'
      if (!sections[sec]) sections[sec] = []
      sections[sec].push(f)
    })

    // Inline preview renderer
    const renderInlinePreview = (file: CourseFile, pType: PreviewType) => {
      if (!preview || preview.file.id !== file.id) return null
      return (
        <div className="course-inline-preview">
          <div className="course-inline-preview-header">
            <span className="course-inline-preview-title">
              <Icon name="search" size={12} /> {file.name}
            </span>
            <button className="btn btn-xs course-inline-preview-close" onClick={() => setPreview(null)}>✕ Close</button>
          </div>
          <div className="course-inline-preview-body">
            {pType === 'youtube' && (() => {
              const ytId = extractYouTubeId(file.url || '')
              return ytId ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${ytId}?rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="course-inline-preview-iframe"
                  style={{ aspectRatio: '16/9' }}
                />
              ) : (
                <div className="course-inline-preview-fallback">
                  <div style={{ fontSize: 36, marginBottom: 12 }}>▶</div>
                  <div>Could not extract YouTube video ID</div>
                  {file.url && <a href={file.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-xs" style={{ marginTop: 12, textDecoration: 'none' }}>Open on YouTube</a>}
                </div>
              )
            })()}
            {pType === 'pdf' && file.url && (
              <iframe src={file.url} className="course-inline-preview-iframe course-inline-preview-tall" />
            )}
            {pType === 'image' && file.url && (
              <Image src={file.url} alt={file.name} width={1200} height={800} unoptimized
                className="course-inline-preview-tall"
                style={{ width: '100%', objectFit: 'contain', borderRadius: 0 }} />
            )}
            {pType === 'video' && file.url && (
              <div>
                <video
                  src={file.url}
                  controls
                  className="course-inline-preview-tall"
                  style={{ width: '100%', borderRadius: 0 }}
                  onTimeUpdate={(e) => {
                    const vid = e.currentTarget
                    if (vid.duration && vid.currentTime / vid.duration >= 0.8 && !isFileCompleted(file.id)) {
                      supabase.from('course_progress').upsert({ student_id: profile.id, course_id: activeCourse?.id, file_id: file.id }).then(({ error }) => {
                        if (!error) setProgress(prev => prev.some(p => p.file_id === file.id) ? prev : [...prev, { id: '', student_id: profile.id, course_id: activeCourse?.id || '', file_id: file.id, completed_at: new Date().toISOString() } as CourseProgress])
                      })
                    }
                  }}
                />
                {isFileCompleted(file.id) ? (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--success)', textAlign: 'center', marginTop: 8 }}>✓ Watched</div>
                ) : (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', textAlign: 'center', marginTop: 8 }}>Watch 80% to mark as complete</div>
                )}
              </div>
            )}
            {pType === 'document' && file.url && (
              <div>
                <iframe
                  src={`https://docs.google.com/gview?url=${encodeURIComponent(file.url)}&embedded=true`}
                  className="course-inline-preview-iframe course-inline-preview-tall"
                  onLoad={(e) => {
                    // Google Docs viewer may redirect to a blank page on failure — show fallback
                    try {
                      const f = e.currentTarget
                      if (f.contentDocument?.title === '') f.style.display = 'none'
                    } catch { /* cross-origin — viewer loaded, which means success */ }
                  }}
                />
                <div className="course-doc-download-bar">
                  <Icon name="download" size={11} />
                  <span>Can&apos;t see the preview?</span>
                  <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}
                    className="btn btn-xs btn-primary" style={{ textDecoration: 'none' }}>
                    Download File
                  </a>
                </div>
              </div>
            )}
            {pType === 'other' && (
              <div className="course-inline-preview-fallback">
                <div style={{ fontSize: 48, marginBottom: 16 }}>{getFileIcon(file.type)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)', marginBottom: 16 }}>
                  Preview not available for this file type
                </div>
                {file.url && (
                  <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}
                    className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                    <Icon name="download" size={12} /> Download
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="course-detail fade-up">

        {/* Rate Modal */}
        <Modal open={rateModal} onClose={() => setRateModal(false)} title="Rate This Course">
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <StarRating value={rateValue} onChange={setRateValue} size={32} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Review (optional)</label>
            <textarea className="input" rows={3} value={rateReview} onChange={e => setRateReview(e.target.value)}
              placeholder="What did you think of this course?" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={submitRating} disabled={rateSubmitting}>
              {rateSubmitting ? 'Saving...' : myRating ? 'Update Rating' : 'Submit Rating'}
            </button>
            <button className="btn" onClick={() => setRateModal(false)}>Cancel</button>
          </div>
        </Modal>

        {/* Hero Header */}
        <div className="course-hero">
          <SubjectStrip subject={activeCourse.subject} />
          <div className="course-hero-content">
            <button className="btn btn-sm" onClick={() => setActiveCourse(null)} style={{ marginBottom: 12 }}>← Back</button>
            <div className="course-hero-title">{activeCourse.title}</div>
            <div className="course-hero-meta">
              <span><Icon name="user" size={11} /> {activeCourse.teacher_name}</span>
              <span><Icon name="book" size={11} /> {fileCount} file{fileCount !== 1 ? 's' : ''}</span>
              <span><Icon name="users" size={11} /> {stats.enrollCount} enrolled</span>
              {stats.ratingCount > 0 && (
                <span style={{ color: '#f59e0b' }}>★ {stats.avgRating.toFixed(1)} ({stats.ratingCount})</span>
              )}
              <span style={{ color: 'var(--warn)', fontFamily: 'var(--mono)', fontSize: 11 }}>◈ {activeCourse.xp_reward ?? 50} XP on completion</span>
            </div>
            {activeCourse.description && (
              <div className="course-hero-desc">{activeCourse.description}</div>
            )}
            <div className="course-hero-actions">
              {isEnrolled ? (
                <>
                  <ProgressRing percent={courseProgress} size={48} stroke={4} />
                  <button className="btn btn-sm" onClick={() => { setRateValue(myRating?.rating || 5); setRateReview(myRating?.review || ''); setRateModal(true) }}>
                    <Icon name="star" size={12} /> {myRating ? 'Edit Rating' : 'Rate Course'}
                  </button>
                  <button className="btn btn-sm" onClick={() => unenroll(activeCourse.id)} style={{ fontSize: 10, color: 'var(--fg-dim)' }}>Unenroll</button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => enroll(activeCourse.id)}>+ Enroll</button>
              )}
              <button className="btn btn-xs" onClick={() => openCourse(activeCourse.id)} disabled={loading}
                style={{ marginLeft: 'auto' }}>
                {loading ? <span className="spinner" /> : '↻'}
              </button>
            </div>
          </div>
        </div>

        {/* Course Progress Bar (enrolled only) */}
        {isEnrolled && fileCount > 0 && (
          <div className="course-progress-bar-wrapper">
            <div className="course-progress-label">
              <span>Progress</span>
              <span>{courseProgress}%{courseProgress >= 100 ? ' ✓ COMPLETED' : ''}</span>
            </div>
            <div className="course-progress-bar">
              <div className="course-progress-fill" style={{ width: `${courseProgress}%` }} />
            </div>
          </div>
        )}

        {/* Files by Section */}
        {Object.entries(sections).map(([section, sectionFiles]) => (
          <div key={section}>
            <SectionLabel>{section} ({sectionFiles.length})</SectionLabel>
            <div className="course-files-list">
              {sectionFiles.map(f => {
                const completed = isFileCompleted(f.id)
                const pType = getPreviewType(f)
                const canPreview = pType !== 'other'
                const isActive = preview?.file.id === f.id
                return (
                  <div key={f.id}>
                    <div className={`course-file-card ${completed ? 'course-file-done' : ''} ${isActive ? 'course-file-active' : ''}`}>
                      <div className="course-file-left">
                        {isEnrolled && (
                          <button className={`course-file-check ${completed ? 'checked' : ''}`} onClick={() => toggleFileComplete(f)}
                            title={completed ? 'Mark incomplete' : 'Mark complete'}>
                            {completed ? <Icon name="check" size={12} /> : <span style={{ opacity: 0.3 }}>○</span>}
                          </button>
                        )}
                        <span className="course-file-icon">{pType === 'youtube' ? '▶' : getFileIcon(f.type)}</span>
                        <div className="course-file-info">
                          <div className="course-file-name">{f.name}</div>
                          <div className="course-file-meta">
                            {pType === 'youtube' ? 'YouTube' : formatSize(f.size || 0)}{(f.size || pType === 'youtube') ? ' · ' : ''}
                            {new Date(f.uploaded_at || Date.now()).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="course-file-actions">
                        {canPreview && f.url && (
                          <button className={`btn btn-xs ${isActive ? 'btn-primary' : ''}`}
                            onClick={() => setPreview(isActive ? null : { file: f, type: pType })}
                            style={!isActive ? { borderColor: 'var(--fg-dim)', color: 'var(--fg-dim)' } : {}}>
                            <Icon name={isActive ? 'minimize-2' : 'search'} size={10} /> {isActive ? 'Close' : 'Preview'}
                          </button>
                        )}
                        {f.url && pType !== 'youtube' && (
                          <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name}
                            className="btn btn-xs" style={{ borderColor: 'var(--success)', color: 'var(--success)', textDecoration: 'none' }}>
                            <Icon name="download" size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                    {renderInlinePreview(f, pType)}
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {files.length === 0 && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-dim)', padding: '20px 0' }}>
            <Icon name="upload" size={32} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>No files uploaded yet for this course.</span>
          </div>
        )}

        {/* Reviews Section */}
        {courseRatings.length > 0 && (
          <>
            <SectionLabel>Reviews ({courseRatings.length})</SectionLabel>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {(['newest', 'highest', 'lowest'] as const).map(s => (
                <button key={s} className={`btn btn-sm${reviewSort === s ? ' btn-primary' : ''}`} onClick={() => { setReviewSort(s); setReviewLimit(5) }}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
              ))}
            </div>
            <div className="course-reviews">
              {[...courseRatings].sort((a, b) => reviewSort === 'newest' ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : reviewSort === 'highest' ? b.rating - a.rating : a.rating - b.rating).slice(0, reviewLimit).map(r => (
                <div key={r.id} className="course-review-card">
                  <div className="course-review-header">
                    <span className="course-review-name">{r.student_name}</span>
                    <StarRating value={r.rating} readonly size={13} />
                  </div>
                  {r.review && <div className="course-review-text">{r.review}</div>}
                  <div className="course-review-date">{new Date(r.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
            {courseRatings.length > reviewLimit && (
              <button className="btn" style={{ marginTop: 8, width: '100%' }} onClick={() => setReviewLimit(l => l + 10)}>
                Show More Reviews ({courseRatings.length - reviewLimit} remaining)
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  // ── RENDER: BROWSE/ENROLLED LIST ──
  return (
    <>
      <PageHeader title="COURSES" />

      {/* Continue Learning */}
      {continueLearning.length > 0 && (
        <div className="fade-up-1">
          <SectionLabel>Continue Learning</SectionLabel>
          <div className="course-continue-row">
            {continueLearning.map(c => {
              const p = getCourseProgress(c.id, (c as any)._fileCount || 0)
              return (
                <div key={c.id} className="course-continue-card" onClick={() => openCourse(c.id)}>
                  <SubjectStrip subject={c.subject} />
                  <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ProgressRing percent={p} size={36} stroke={3} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{c.title}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)' }}>{c.subject}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="course-tabs fade-up-1">
        <button className={`course-tab ${view === 'browse' ? 'active' : ''}`} onClick={() => setView('browse')}>
          Browse All ({published.length})
        </button>
        <button className={`course-tab ${view === 'enrolled' ? 'active' : ''}`} onClick={() => setView('enrolled')}>
          Enrolled ({enrolledIds.length})
        </button>
      </div>

      {/* Search + Filters */}
      {view === 'browse' && (
        <div className="course-search-bar fade-up-2">
          <div className="course-search-input-wrap">
            <Icon name="search" size={13} />
            <input className="course-search-input" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search courses, subjects, teachers..." />
          </div>
          <div className="course-filters">
            <div className="course-subject-pills">
              {SUBJECTS.filter(s => s === 'All' || courses.some(c => (c.subject || '').toLowerCase() === s.toLowerCase())).map(s => (
                <button key={s} className={`course-pill ${subjectFilter === s ? 'active' : ''}`} onClick={() => setSubjectFilter(s)}>
                  {s}
                </button>
              ))}
            </div>
            <select className="course-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
              <option value="newest">Newest</option>
              <option value="popular">Most Popular</option>
              <option value="rated">Highest Rated</option>
            </select>
          </div>
        </div>
      )}

      {/* Course Grid */}
      <div className="course-grid fade-up-3">
        {(view === 'browse' ? filtered : enrolledCourses).map(c => {
          const isEnrolled = enrolledIds.includes(c.id)
          const stats = getCourseStats(c.id)
          const p = getCourseProgress(c.id, (c as any)._fileCount || 0)
          return (
            <div key={c.id} className="course-card" onClick={() => isEnrolled ? openCourse(c.id) : undefined}
              style={{ cursor: isEnrolled ? 'pointer' : 'default' }}>
              <SubjectStrip subject={c.subject} />
              <div className="course-card-body">
                <div className="course-card-top">
                  <div className="course-card-title">{c.title}</div>
                  <div className="course-card-teacher">
                    <Icon name="user" size={10} /> {c.teacher_name}
                  </div>
                  {c.subject && <span className="course-card-subject">{c.subject}</span>}
                </div>
                {c.description && <div className="course-card-desc">{c.description}</div>}
                <div className="course-card-footer">
                  <div className="course-card-stats">
                    <span><Icon name="users" size={10} /> {stats.enrollCount}</span>
                    {stats.ratingCount > 0 && <span style={{ color: '#f59e0b' }}>★ {stats.avgRating.toFixed(1)}</span>}
                    {(c.xp_reward ?? 50) > 0 && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--warn)' }}>◈ {c.xp_reward ?? 50} XP</span>
                    )}
                  </div>
                  {isEnrolled ? (
                    <div className="course-card-enrolled">
                      <ProgressRing percent={p} size={30} stroke={2.5} />
                      <span className="tag tag-success" style={{ fontSize: 9 }}>ENROLLED</span>
                    </div>
                  ) : (
                    <button className="btn btn-primary btn-xs" onClick={e => { e.stopPropagation(); enroll(c.id) }}>
                      + Enroll
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {(view === 'browse' ? filtered : enrolledCourses).length === 0 && (
        <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12, textAlign: 'center', padding: '40px 0' }}>
          {view === 'browse' ? 'No courses match your search.' : "You haven't enrolled in any courses yet."}
        </div>
      )}

      {/* Learning Stats */}
      {view === 'enrolled' && enrolledCourses.length > 0 && (
        <div className="course-learning-stats fade-up-4">
          <SectionLabel>Learning Stats</SectionLabel>
          <div className="course-stats-row">
            <div className="course-stat-item">
              <div className="course-stat-value">{enrolledCourses.length}</div>
              <div className="course-stat-label">Enrolled</div>
            </div>
            <div className="course-stat-item">
              <div className="course-stat-value">{enrolledCourses.filter(c => getCourseProgress(c.id, (c as any)._fileCount || 0) >= 100).length}</div>
              <div className="course-stat-label">Completed</div>
            </div>
            <div className="course-stat-item">
              <div className="course-stat-value">{progress.length}</div>
              <div className="course-stat-label">Files Done</div>
            </div>
            <div className="course-stat-item">
              <div className="course-stat-value">{ratings.filter(r => r.student_id === profile.id).length}</div>
              <div className="course-stat-label">Rated</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


// ══════════════════════════════════════════════════════════════
// TEACHER COURSE MODULE
// ══════════════════════════════════════════════════════════════
export function TeacherCourseModule({ profile, courses, students, onCoursesChange }: TeacherCourseProps) {
  const { toast } = useToast()
  const [activeCourse, setActiveCourse] = useState<(Course & { course_files?: CourseFile[] }) | null>(null)
  const [loading, setLoading] = useState(false)
  const [createModal, setCreateModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [newCourse, setNewCourse] = useState({ title: '', subject: '', description: '', xpReward: '50' })
  const [editForm, setEditForm] = useState({ title: '', subject: '', description: '', status: 'published' as string, xpReward: '50' })
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [fileSection, setFileSection] = useState('')
  const [editingFileId, setEditingFileId] = useState<string | null>(null)
  const [editFileSectionValue, setEditFileSectionValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [analyticsView, setAnalyticsView] = useState(false)
  const [courseStats, setCourseStats] = useState<{ enrollments: number; ratings: CourseRating[]; progress: CourseProgress[] }>({ enrollments: 0, ratings: [], progress: [] })

  const refreshActiveCourse = async (courseId: string) => {
    setLoading(true)
    try {
      const { data, error } = await supabase.from('courses').select('*, course_files(*)').eq('id', courseId).single()
      if (error) throw error
      if (data) {
        if (data.course_files) {
          data.course_files.sort((a: any, b: any) => {
            if ((a.section || '') !== (b.section || '')) return (a.section || '').localeCompare(b.section || '')
            return (a.order_index || 0) - (b.order_index || 0)
          })
        }
        setActiveCourse(data)
        onCoursesChange(courses.map(c => c.id === courseId ? { ...c, _fileCount: data.course_files?.length || 0 } : c))
      }
    } catch (err) {
      toast((err as any)?.message ||'Failed to load course', 'error')
    } finally {
      setLoading(false)
    }
  }

  const createCourse = async () => {
    if (!newCourse.title) return
    try {
      const { data, error } = await supabase.from('courses').insert({
        title: newCourse.title, subject: newCourse.subject, description: newCourse.description,
        teacher_id: profile.id, teacher_name: profile.name, status: 'published',
        xp_reward: parseInt(newCourse.xpReward) || 50,
      }).select('id, title, subject, description, teacher_id, teacher_name, created_at, status, xp_reward').single()
      if (error) throw error
      if (data) {
        const courseWithFiles = { ...data, course_files: [], _fileCount: 0 }
        onCoursesChange([courseWithFiles, ...courses])
        setActiveCourse(courseWithFiles)
        await pushNotificationBatch(students.map(s => s.id), `▪ New course: "${newCourse.title}" by ${profile.name}`, 'course')
        await logActivity(`Teacher ${profile.name} created course: ${newCourse.title}`, 'course')
      }
    } catch (err) {
      toast((err as any)?.message ||'Failed to create course', 'error')
    } finally {
      setNewCourse({ title: '', subject: '', description: '', xpReward: '50' })
      setCreateModal(false)
    }
  }

  const updateCourse = async () => {
    if (!activeCourse || !editForm.title) return
    try {
      const { error } = await supabase.from('courses').update({
        title: editForm.title, subject: editForm.subject,
        description: editForm.description, status: editForm.status,
        xp_reward: parseInt(editForm.xpReward) || 50,
      }).eq('id', activeCourse.id).eq('teacher_id', profile.id)
      if (error) throw error
      const updated = { ...activeCourse, ...editForm, status: editForm.status as Course['status'] }
      setActiveCourse(updated)
      onCoursesChange(courses.map(c => c.id === activeCourse.id ? { ...c, ...editForm } : c))
    } catch (err) {
      toast((err as any)?.message ||'Failed to update course', 'error')
    } finally {
      setEditModal(false)
    }
  }

  const deleteCourse = async (id: string) => {
    if (!confirm('Delete this course and all its files? This cannot be undone.')) return
    try {
      const { data: courseData } = await supabase.from('courses').select('*, course_files(*)').eq('id', id).eq('teacher_id', profile.id).single()
      if (courseData?.course_files?.length) {
        const paths = courseData.course_files.map((f: any) => f.storage_path).filter(Boolean)
        if (paths.length) await supabase.storage.from('course-files').remove(paths)
      }
      const { error } = await supabase.from('courses').delete().eq('id', id).eq('teacher_id', profile.id)
      if (error) throw error
      onCoursesChange(courses.filter(c => c.id !== id))
      if (activeCourse?.id === id) setActiveCourse(null)
    } catch (err) {
      toast((err as any)?.message ||'Failed to delete course', 'error')
    }
  }

  const ALLOWED_FILE_TYPES = [
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm',
    'application/zip', 'application/x-zip-compressed',
  ]

  const uploadCourseFile = async () => {
    if (!uploadFile || !activeCourse) return
    if (uploadFile.size > MAX_FILE_SIZE) { setStatus('× File too large. Maximum size is 50 MB.'); return }
    if (!ALLOWED_FILE_TYPES.includes(uploadFile.type)) { setStatus('× File type not allowed. Use PDF, Word, Excel, PPT, images, or videos.'); return }
    setUploading(true); setStatus('Uploading...')
    try {
      const ext = uploadFile.name.split('.').pop()
      const storagePath = `${profile.id}/${activeCourse.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('course-files').upload(storagePath, uploadFile)
      if (upErr) { setStatus(`× Upload failed: ${upErr.message}`); setUploading(false); return }
      const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(storagePath)
      const { error: dbErr } = await supabase.from('course_files').insert({
        course_id: activeCourse.id, name: uploadFile.name, storage_path: storagePath,
        url: urlData.publicUrl, type: uploadFile.type, size: uploadFile.size,
        section: fileSection || null, order_index: (activeCourse.course_files?.length || 0),
      }).select().single()
      if (dbErr) { setStatus(`× DB error: ${dbErr.message}`); setUploading(false); return }
      setUploadFile(null); setFileSection('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      setStatus('✓ File uploaded!')
      setTimeout(() => setStatus(''), 3000)
      await refreshActiveCourse(activeCourse.id)
    } catch (e: any) {
      setStatus('× Upload failed: unexpected error')
    } finally {
      setUploading(false)
    }
  }

  const deleteCourseFile = async (file: any) => {
    if (!activeCourse || !confirm('Delete this file?')) return
    try {
      if (file.storage_path) await supabase.storage.from('course-files').remove([file.storage_path])
      const { error } = await supabase.from('course_files').delete().eq('id', file.id)
      if (error) throw error
      await refreshActiveCourse(activeCourse.id)
    } catch (err) {
      toast((err as any)?.message ||'Failed to delete file', 'error')
    }
  }

  const moveFile = async (file: CourseFile, direction: 'up' | 'down', sectionFiles: CourseFile[]) => {
    const idx = sectionFiles.findIndex(f => f.id === file.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sectionFiles.length) return
    const other = sectionFiles[swapIdx]
    const thisOrder = file.order_index ?? idx
    const otherOrder = other.order_index ?? swapIdx
    try {
      await Promise.all([
        supabase.from('course_files').update({ order_index: otherOrder }).eq('id', file.id),
        supabase.from('course_files').update({ order_index: thisOrder }).eq('id', other.id),
      ])
      await refreshActiveCourse(activeCourse!.id)
    } catch (err) {
      toast((err as any)?.message ||'Failed to reorder files', 'error')
    }
  }

  const changeFileSection = async (fileId: string, newSection: string) => {
    try {
      const { error } = await supabase.from('course_files').update({ section: newSection || null }).eq('id', fileId)
      if (error) throw error
      setEditingFileId(null)
      await refreshActiveCourse(activeCourse!.id)
    } catch (err) {
      toast((err as any)?.message ||'Failed to update section', 'error')
    }
  }

  const fetchAnalytics = async (courseId: string) => {
    try {
      const [eRes, rRes, pRes] = await Promise.all([
        supabase.from('enrollments').select('course_id').eq('course_id', courseId),
        supabase.from('course_ratings').select('*').eq('course_id', courseId),
        supabase.from('course_progress').select('*').eq('course_id', courseId),
      ])
      setCourseStats({
        enrollments: eRes.data?.length || 0,
        ratings: rRes.data || [],
        progress: pRes.data || [],
      })
      setAnalyticsView(true)
    } catch (err) {
      toast((err as any)?.message ||'Failed to load analytics', 'error')
    }
  }

  // ── RENDER: COURSE DETAIL (TEACHER) ──
  if (activeCourse) {
    const files = activeCourse.course_files || []
    const sections: Record<string, CourseFile[]> = {}
    files.forEach(f => {
      const sec = f.section || 'General'
      if (!sections[sec]) sections[sec] = []
      sections[sec].push(f)
    })

    return (
      <div className="course-detail fade-up">
        {/* Edit Modal */}
        <Modal open={editModal} onClose={() => setEditModal(false)} title="Edit Course">
          <div style={{ marginBottom: 14 }}>
            <label className="label">Title</label>
            <input className="input" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Subject</label>
            <input className="input" value={editForm.subject} onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="label">Description</label>
            <textarea className="input" rows={3} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label className="label">Status</label>
              <select className="input" value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                <option value="published">Published (visible to students)</option>
                <option value="draft">Draft (hidden from students)</option>
              </select>
            </div>
            <div style={{ width: 120 }}>
              <label className="label">◈ XP Reward</label>
              <input className="input" type="number" min={0} max={500} value={editForm.xpReward}
                onChange={e => setEditForm(f => ({ ...f, xpReward: e.target.value }))}
                placeholder="50" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={updateCourse}>Save Changes</button>
            <button className="btn" onClick={() => setEditModal(false)}>Cancel</button>
          </div>
        </Modal>

        {/* Analytics Drawer */}
        <Modal open={analyticsView} onClose={() => setAnalyticsView(false)} title="Course Analytics" width={600}>
          <div className="course-analytics">
            <div className="course-stats-row" style={{ marginBottom: 20 }}>
              <div className="course-stat-item">
                <div className="course-stat-value">{courseStats.enrollments}</div>
                <div className="course-stat-label">Enrolled</div>
              </div>
              <div className="course-stat-item">
                <div className="course-stat-value">
                  {courseStats.ratings.length ? (courseStats.ratings.reduce((s, r) => s + r.rating, 0) / courseStats.ratings.length).toFixed(1) : '—'}
                </div>
                <div className="course-stat-label">Avg Rating</div>
              </div>
              <div className="course-stat-item">
                <div className="course-stat-value">{courseStats.ratings.length}</div>
                <div className="course-stat-label">Reviews</div>
              </div>
              <div className="course-stat-item">
                <div className="course-stat-value">
                  {courseStats.enrollments && files.length ? Math.round(
                    (new Set(courseStats.progress.filter(p => {
                      const fileIds = new Set(files.map(f => f.id))
                      return fileIds.has(p.file_id)
                    }).map(p => p.student_id)).size /
                    Math.max(1, courseStats.enrollments)) * 100
                  ) : 0}%
                </div>
                <div className="course-stat-label">Avg Progress</div>
              </div>
            </div>
            {/* Rating Breakdown */}
            {courseStats.ratings.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Rating Distribution</div>
                {[5,4,3,2,1].map(n => {
                  const count = courseStats.ratings.filter(r => r.rating === n).length
                  const pct = courseStats.ratings.length ? (count / courseStats.ratings.length) * 100 : 0
                  return (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, width: 20, textAlign: 'right' }}>{n}★</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 0, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: '#f59e0b', borderRadius: 0, transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', width: 20 }}>{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
            {/* Reviews */}
            {courseStats.ratings.filter(r => r.review).length > 0 && (
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Student Reviews</div>
                {courseStats.ratings.filter(r => r.review).map(r => (
                  <div key={r.id} className="course-review-card">
                    <div className="course-review-header">
                      <span className="course-review-name">{r.student_name}</span>
                      <StarRating value={r.rating} readonly size={12} />
                    </div>
                    <div className="course-review-text">{r.review}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>

        {/* Header */}
        <div className="course-hero">
          <SubjectStrip subject={activeCourse.subject} />
          <div className="course-hero-content">
            <button className="btn btn-sm" onClick={() => setActiveCourse(null)} style={{ marginBottom: 12 }}>← Back</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div className="course-hero-title">{activeCourse.title}</div>
              {activeCourse.status === 'draft' && <span className="tag tag-warn">DRAFT</span>}
            </div>
            <div className="course-hero-meta">
              <span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
              <span>{activeCourse.subject}</span>
            </div>
            <div className="course-hero-actions">
              <button className="btn btn-sm" onClick={() => { setEditForm({ title: activeCourse.title, subject: activeCourse.subject || '', description: activeCourse.description || '', status: activeCourse.status || 'published', xpReward: String(activeCourse.xp_reward ?? 50) }); setEditModal(true) }}>
                <Icon name="edit" size={12} /> Edit
              </button>
              <button className="btn btn-sm" onClick={() => fetchAnalytics(activeCourse.id)}>
                <Icon name="chart" size={12} /> Analytics
              </button>
              <button className="btn btn-xs" onClick={() => refreshActiveCourse(activeCourse.id)} disabled={loading}
                style={{ marginLeft: 'auto' }}>
                {loading ? <span className="spinner" /> : '↻'}
              </button>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="course-upload-card">
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Upload File</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={fileInputRef} type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.mp4,.mov,.zip"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg)' }} />
            <input className="input" value={fileSection} onChange={e => setFileSection(e.target.value)}
              placeholder="Section (optional)" style={{ maxWidth: 180 }} />
            <button className="btn btn-primary btn-sm" onClick={uploadCourseFile} disabled={!uploadFile || uploading}>
              {uploading ? 'Uploading...' : <><Icon name="upload" size={12} /> Upload</>}
            </button>
          </div>
          {status && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: status.startsWith('✓') ? 'var(--success)' : 'var(--danger)', marginTop: 10 }}>
              {status}
            </div>
          )}
        </div>

        {/* Files */}
        {Object.entries(sections).map(([section, sectionFiles]) => (
          <div key={section}>
            <SectionLabel>{section} ({sectionFiles.length})</SectionLabel>
            <div className="course-files-list">
              {sectionFiles.map((f, fi) => (
                <div key={f.id} className="course-file-card">
                  <div className="course-file-left">
                    <span className="course-file-icon">{getFileIcon(f.type)}</span>
                    <div className="course-file-info">
                      <div className="course-file-name">{f.name}</div>
                      <div className="course-file-meta">
                        {formatSize(f.size || 0)}{f.size ? ' · ' : ''}
                        {new Date(f.uploaded_at || Date.now()).toLocaleDateString()}
                        {' · '}
                        {editingFileId === f.id ? (
                          <input className="input" value={editFileSectionValue}
                            onChange={e => setEditFileSectionValue(e.target.value)}
                            onBlur={() => changeFileSection(f.id, editFileSectionValue)}
                            onKeyDown={e => { if (e.key === 'Enter') changeFileSection(f.id, editFileSectionValue); if (e.key === 'Escape') setEditingFileId(null) }}
                            autoFocus placeholder="Section"
                            style={{ width: 120, height: 22, fontSize: 11, padding: '2px 6px', display: 'inline-block' }} />
                        ) : (
                          <span style={{ color: 'var(--accent)', cursor: 'pointer', borderBottom: '1px dashed var(--border)' }}
                            onClick={() => { setEditingFileId(f.id); setEditFileSectionValue(f.section || '') }}
                            title="Click to change section">
                            ▪ {f.section || 'General'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="course-file-actions">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginRight: 4 }}>
                      <button className="btn btn-xs" onClick={() => moveFile(f, 'up', sectionFiles)} disabled={fi === 0}
                        style={{ padding: '0 4px', fontSize: 10, lineHeight: 1, opacity: fi === 0 ? 0.3 : 1 }} title="Move up">▲</button>
                      <button className="btn btn-xs" onClick={() => moveFile(f, 'down', sectionFiles)} disabled={fi === sectionFiles.length - 1}
                        style={{ padding: '0 4px', fontSize: 10, lineHeight: 1, opacity: fi === sectionFiles.length - 1 ? 0.3 : 1 }} title="Move down">▼</button>
                    </div>
                    {f.url && (
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="btn btn-xs"
                        style={{ borderColor: 'var(--success)', color: 'var(--success)', textDecoration: 'none' }}>
                        <Icon name="download" size={10} /> View
                      </a>
                    )}
                    <button className="btn btn-xs btn-danger" onClick={() => deleteCourseFile(f)} disabled={loading}>
                      <Icon name="trash" size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {files.length === 0 && !loading && (
          <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12, padding: '20px 0' }}>
            No files yet. Upload your first file above.
          </div>
        )}
      </div>
    )
  }

  // ── RENDER: COURSE LIST (TEACHER) ──
  return (
    <>
      <PageHeader title="MY COURSES" subtitle="Create courses and upload files for students" />

      {/* Create Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create New Course">
        <div style={{ marginBottom: 14 }}>
          <label className="label">Course Title</label>
          <input className="input" value={newCourse.title} onChange={e => setNewCourse(c => ({ ...c, title: e.target.value }))} placeholder="e.g. Advanced Mathematics" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Subject</label>
          <input className="input" value={newCourse.subject} onChange={e => setNewCourse(c => ({ ...c, subject: e.target.value }))} placeholder="e.g. Mathematics" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label">Description</label>
          <textarea className="input" rows={3} value={newCourse.description} onChange={e => setNewCourse(c => ({ ...c, description: e.target.value }))} placeholder="What will students learn?" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="label">◈ XP Reward (on completion)</label>
          <input className="input" type="number" min={0} max={500} value={newCourse.xpReward}
            onChange={e => setNewCourse(c => ({ ...c, xpReward: e.target.value }))}
            placeholder="50" style={{ maxWidth: 120 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={createCourse}>Create Course</button>
          <button className="btn" onClick={() => setCreateModal(false)}>Cancel</button>
        </div>
      </Modal>

      <div style={{ marginBottom: 20 }} className="fade-up-2">
        <button className="btn btn-primary btn-sm" onClick={() => setCreateModal(true)}><Icon name="plus" size={12} /> New Course</button>
      </div>

      {courses.length === 0 && <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12 }}>No courses yet.</div>}

      <div className="course-grid fade-up-3">
        {courses.map(c => (
          <div key={c.id} className="course-card" style={{ cursor: 'pointer' }} onClick={() => refreshActiveCourse(c.id)}>
            <SubjectStrip subject={c.subject} />
            <div className="course-card-body">
              <div className="course-card-top">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="course-card-title">{c.title}</div>
                  {c.status === 'draft' && <span className="tag tag-warn" style={{ fontSize: 8 }}>DRAFT</span>}
                </div>
                {c.subject && <span className="course-card-subject">{c.subject}</span>}
              </div>
              {c.description && <div className="course-card-desc">{c.description}</div>}
              <div className="course-card-footer">
                <div className="course-card-stats">
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{c._fileCount ?? '—'} files</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--warn)' }}>◈ {c.xp_reward ?? 50} XP</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-xs" onClick={e => { e.stopPropagation(); refreshActiveCourse(c.id) }} disabled={loading}>
                    <Icon name="edit" size={10} /> Manage
                  </button>
                  <button className="btn btn-xs btn-danger" onClick={e => { e.stopPropagation(); deleteCourse(c.id) }}>
                    <Icon name="trash" size={10} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
