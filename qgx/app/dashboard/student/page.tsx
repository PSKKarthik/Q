'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, pushNotification, logActivity, type Profile, type Test, type Attempt } from '@/lib/supabase'
import Layout, { Icon, AnnouncementCard, ProfileModal } from '@/components/Layout'

function fisher_yates<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getTier(xp: number) {
  if (xp <= 500)  return { label: 'ROOKIE',    color: 'var(--fg-dim)' }
  if (xp <= 1000) return { label: 'SCHOLAR',   color: 'var(--success)' }
  if (xp <= 2000) return { label: 'ACHIEVER',  color: 'var(--warn)' }
  if (xp <= 3500) return { label: 'ELITE',     color: '#ff9500' }
  return               { label: 'LEGEND',    color: 'var(--danger)' }
}

export default function StudentDashboard() {
  const router = useRouter()
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [tab, setTab]                 = useState('home')
  const [tests, setTests]             = useState<Test[]>([])
  const [attempts, setAttempts]       = useState<Attempt[]>([])
  const [allCourses, setAllCourses]   = useState<any[]>([])
  const [enrolledIds, setEnrolledIds] = useState<string[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [timetable, setTimetable]     = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [allStudents, setAllStudents] = useState<Profile[]>([])
  const [doubleXP, setDoubleXP]       = useState<any>({ active: false, ends_at: null })
  const [showProfile, setShowProfile] = useState(false)
  const [jitsiRoom, setJitsiRoom]     = useState<any>(null)
  const [courseView, setCourseView]   = useState<'browse'|'enrolled'>('browse')
  const [activeCourse, setActiveCourse] = useState<any>(null)
  const [enrolling, setEnrolling]     = useState<string|null>(null)
  const [courseLoading, setCourseLoading] = useState(false)

  // Assignment submission state
  const [activeAssign, setActiveAssign]   = useState<any>(null)
  const [submitModal, setSubmitModal]     = useState(false)
  const [submitText, setSubmitText]       = useState('')
  const [submitFile, setSubmitFile]       = useState<File|null>(null)
  const [submitting, setSubmitting]       = useState(false)
  const [submitStatus, setSubmitStatus]   = useState('')
  const submitFileRef                     = useRef<HTMLInputElement>(null)

  // Forums
  const [forumPosts, setForumPosts]       = useState<any[]>([])
  const [activePost, setActivePost]       = useState<any>(null)
  const [forumComments, setForumComments] = useState<any[]>([])
  const [postModal, setPostModal]         = useState(false)
  const [newPost, setNewPost]             = useState({ title:'', body:'' })
  const [newComment, setNewComment]       = useState('')
  const [postLoading, setPostLoading]     = useState(false)
  const [commentLoading, setCommentLoading] = useState(false)

  // Test attempt state
  const [activeTest, setActiveTest] = useState<Test | null>(null)
  const [questions, setQuestions]   = useState<any[]>([])
  const [answers, setAnswers]       = useState<Record<string, any>>({})
  const [currentQ, setCurrentQ]     = useState(0)
  const [timeLeft, setTimeLeft]     = useState(0)
  const [qTimeLeft, setQTimeLeft]   = useState(0)
  const [testResult, setTestResult] = useState<any>(null)
  const [ghostScore, setGhostScore] = useState<number | null>(null)
  const timerRef  = useRef<any>(null)
  const qTimerRef = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => { if (p) { setProfile(p as Profile); fetchAll(p as Profile) } })
    })
  }, [])

  const fetchAll = async (p: Profile) => {
    const { data: enrollData } = await supabase.from('enrollments').select('course_id').eq('student_id', p.id)
    const eIds = enrollData?.map((e: any) => e.course_id) || []
    setEnrolledIds(eIds)

    const [t, at, ac, a, tt, ann, st, dx] = await Promise.all([
      supabase.from('tests').select('*, questions(*)').eq('status', 'scheduled'),
      supabase.from('attempts').select('*').eq('student_id', p.id),
      // Always fetch course_files fresh
      supabase.from('courses').select('id, title, subject, description, teacher_id, teacher_name, created_at').order('created_at', { ascending: false }),
      supabase.from('assignments').select('*, submissions(*)').order('created_at', { ascending: false }),
      supabase.from('timetable').select('*'),
      supabase.from('announcements').select('*').in('target', ['all','students']).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'student'),
      supabase.from('platform_settings').select('*').eq('key', 'double_xp').single(),
    ])
    if (t.data)   setTests(t.data as Test[])
    if (at.data)  setAttempts(at.data as Attempt[])
    if (ac.data)  setAllCourses(ac.data)
    if (a.data)   setAssignments(a.data)
    if (tt.data)  setTimetable(tt.data)
    if (ann.data) setAnnouncements(ann.data)
    if (st.data)  setAllStudents(st.data as Profile[])
    if (dx.data)  setDoubleXP(dx.data.value)

    // Forums
    const { data: fp } = await supabase.from('forum_posts').select('*').order('pinned', { ascending:false }).order('created_at', { ascending:false })
    if (fp) setForumPosts(fp)

    supabase.channel('student-ann')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'announcements' },
        (p) => setAnnouncements(prev => [p.new, ...prev]))
      .subscribe()

    supabase.channel('forum-posts-student')
      .on('postgres_changes', { event:'*', schema:'public', table:'forum_posts' }, () => fetchForumPosts())
      .subscribe()
  }

  const fetchForumPosts = async () => {
    const { data } = await supabase.from('forum_posts').select('*').order('pinned', { ascending:false }).order('created_at', { ascending:false })
    if (data) setForumPosts(data)
  }

  const openPost = async (post: any) => {
    setPostLoading(true); setActivePost(post)
    const { data } = await supabase.from('forum_comments').select('*').eq('post_id', post.id).order('created_at', { ascending:true })
    if (data) setForumComments(data)
    setPostLoading(false)
  }

  const createPost = async () => {
    if (!newPost.title || !newPost.body || !profile) return
    const { data } = await supabase.from('forum_posts').insert({
      title: newPost.title, body: newPost.body,
      author_id: profile.id, author_name: profile.name, author_role: profile.role,
    }).select().single()
    if (data) setForumPosts(prev => [data, ...prev.filter(p=>!p.pinned), ...prev.filter(p=>p.pinned)])
    setNewPost({ title:'', body:'' }); setPostModal(false)
  }

  const toggleLike = async (post: any) => {
    if (!profile) return
    const liked = (post.likes||[]).includes(profile.id)
    const newLikes = liked ? post.likes.filter((id:string)=>id!==profile.id) : [...(post.likes||[]), profile.id]
    await supabase.from('forum_posts').update({ likes: newLikes }).eq('id', post.id)
    const updated = { ...post, likes: newLikes }
    setForumPosts(prev => prev.map(p => p.id===post.id ? updated : p))
    if (activePost?.id === post.id) setActivePost(updated)
  }

  const deletePost = async (postId: string) => {
    await supabase.from('forum_posts').delete().eq('id', postId)
    setForumPosts(prev => prev.filter(p => p.id !== postId))
    if (activePost?.id === postId) { setActivePost(null); setForumComments([]) }
  }

  const addComment = async () => {
    if (!newComment.trim() || !activePost || !profile) return
    setCommentLoading(true)
    const { data } = await supabase.from('forum_comments').insert({
      post_id: activePost.id, body: newComment,
      author_id: profile.id, author_name: profile.name, author_role: profile.role,
    }).select().single()
    if (data) setForumComments(prev => [...prev, data])
    setNewComment(''); setCommentLoading(false)
  }

  const deleteComment = async (commentId: string) => {
    await supabase.from('forum_comments').delete().eq('id', commentId)
    setForumComments(prev => prev.filter(c => c.id !== commentId))
  }

  // Always fetch fresh course data with files when opening a course
  const openCourse = async (courseId: string) => {
    setCourseLoading(true)
    const { data, error } = await supabase
      .from('courses')
      .select('*, course_files(*)')
      .eq('id', courseId)
      .single()
    if (data && !error) {
      setActiveCourse(data)
    } else {
      // Fallback to cached data without files
      const cached = allCourses.find(c => c.id === courseId)
      setActiveCourse({ ...cached, course_files: [] })
    }
    setCourseLoading(false)
  }

  const enrollCourse = async (courseId: string) => {
    if (!profile || enrolledIds.includes(courseId)) return
    setEnrolling(courseId)
    const { error } = await supabase.from('enrollments').insert({ course_id: courseId, student_id: profile.id })
    if (!error) {
      setEnrolledIds(prev => [...prev, courseId])
      await logActivity(`${profile.name} enrolled in course`, 'enrollment')
    }
    setEnrolling(null)
  }

  const unenrollCourse = async (courseId: string) => {
    if (!profile) return
    await supabase.from('enrollments').delete().eq('course_id', courseId).eq('student_id', profile.id)
    setEnrolledIds(prev => prev.filter(id => id !== courseId))
    if (activeCourse?.id === courseId) setActiveCourse(null)
  }

  const submitAssignment = async () => {
    if (!activeAssign || !profile) return
    setSubmitting(true); setSubmitStatus('Submitting...')
    let file_url = '', file_name = ''
    if (submitFile) {
      const ext = submitFile.name.split('.').pop()
      const path = `submissions/${profile.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('course-files').upload(path, submitFile)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(path)
        file_url = urlData.publicUrl
        file_name = submitFile.name
      }
    }
    // Upsert so re-submission updates existing row
    const existing = activeAssign.submissions?.find((s:any) => s.student_id === profile.id)
    if (existing) {
      await supabase.from('submissions').update({
        text_response: submitText, file_url, file_name,
        submitted_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('submissions').insert({
        assignment_id: activeAssign.id, student_id: profile.id,
        text_response: submitText, file_url, file_name,
        submitted_at: new Date().toISOString(),
      })
    }
    if (activeAssign.teacher_id)
      await pushNotification(activeAssign.teacher_id, `📋 ${profile.name} submitted: "${activeAssign.title}"`, 'submission')
    await logActivity(`${profile.name} submitted assignment: ${activeAssign.title}`, 'submission')
    setSubmitStatus('✅ Submitted!')
    setSubmitting(false)
    setSubmitText(''); setSubmitFile(null)
    if (submitFileRef.current) submitFileRef.current.value = ''
    setTimeout(() => { setSubmitModal(false); setSubmitStatus(''); fetchAll(profile) }, 1200)
  }

  const getFileIcon = (type: string) => {
    if (!type) return '📄'
    if (type.includes('pdf')) return '📕'
    if (type.includes('video')) return '🎬'
    if (type.includes('image')) return '🖼️'
    if (type.includes('word')||type.includes('document')) return '📝'
    if (type.includes('sheet')||type.includes('excel')) return '📊'
    if (type.includes('zip')) return '🗜️'
    return '📄'
  }

  const formatSize = (bytes: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)}KB`
    return `${(bytes/1024/1024).toFixed(1)}MB`
  }

  // Test timer
  useEffect(() => {
    if (!activeTest || testResult) return
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); handleSubmit(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [activeTest, testResult])

  // Per-question timer
  useEffect(() => {
    if (!activeTest || !activeTest.anti_cheat?.timePerQ || testResult) return
    clearInterval(qTimerRef.current)
    setQTimeLeft(activeTest.anti_cheat.timePerQ)
    qTimerRef.current = setInterval(() => {
      setQTimeLeft(t => {
        if (t <= 1) {
          clearInterval(qTimerRef.current)
          setCurrentQ(q => Math.min(q + 1, questions.length - 1))
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(qTimerRef.current)
  }, [currentQ, activeTest])

  const startTest = async (test: Test) => {
    let qs = [...(test.questions || [])]
    const ac = test.anti_cheat || {}
    if (ac.randomQ) qs = fisher_yates(qs)
    if (ac.randomOpts) qs = qs.map(q => {
      if (q.type === 'mcq' && q.options) {
        const shuffled = fisher_yates(q.options.map((o: string, i: number) => ({ o, i })))
        const newOpts  = shuffled.map((x: any) => x.o)
        const newAns   = shuffled.findIndex((x: any) => x.i === q.answer)
        return { ...q, options: newOpts, answer: newAns }
      }
      return q
    })
    if (ac.fullscreen) { try { await document.documentElement.requestFullscreen() } catch {} }
    const prev = attempts.find(a => a.test_id === test.id)
    setGhostScore(prev ? prev.percent : null)
    if (ac.tabSwitch) {
      const handler = () => { if (document.hidden) handleSubmit() }
      document.addEventListener('visibilitychange', handler)
    }
    setActiveTest(test); setQuestions(qs); setAnswers({})
    setCurrentQ(0); setTimeLeft(test.duration * 60); setTestResult(null)
    if (ac.timePerQ > 0) setQTimeLeft(ac.timePerQ)
  }

  const handleSubmit = async () => {
    if (!activeTest || !profile) return
    clearInterval(timerRef.current); clearInterval(qTimerRef.current)
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{})

    let score = 0, total = 0
    const answerMap: Record<string, any> = {}
    questions.forEach(q => {
      total += q.marks || 1
      const ans = answers[q.id]
      answerMap[q.id] = ans
      if (q.type==='mcq' && ans===q.answer) score += q.marks || 1
      else if (q.type==='tf' && ans===q.answer) score += q.marks || 1
      else if (q.type==='fib' && typeof ans==='string' && ans.trim().toLowerCase()===(q.answer as string)?.toLowerCase()) score += q.marks || 1
      else if (q.type==='msq') {
        const correct = JSON.stringify((q.answer as number[]).sort()) === JSON.stringify((ans||[]).sort())
        if (correct) score += q.marks || 1
      }
    })
    const percent = total ? Math.round((score / total) * 100) : 0
    const isDoubleXP = doubleXP.active && doubleXP.ends_at && Date.now() < doubleXP.ends_at
    let baseXP = Math.round(percent * 0.5)
    let xpEarned = isDoubleXP ? baseXP * 2 : baseXP
    let ghostMsg = '', ghostBonus = 0
    if (ghostScore !== null) {
      if (percent > ghostScore) { ghostMsg = '🏆 You beat your ghost!'; ghostBonus = 50; xpEarned += 50 }
      else if (percent === ghostScore) ghostMsg = '🤝 Tied your ghost'
      else ghostMsg = '👻 Ghost wins this time'
    }
    const result = { score, total, percent, date: new Date().toISOString().slice(0,10), xpEarned, isDoubleXP, ghostMsg, ghostBonus, answerMap }
    await supabase.from('attempts').upsert({ student_id:profile.id, test_id:activeTest.id, score, total, percent, answer_map:answerMap })
    const newXP = (profile.xp || 0) + xpEarned
    await supabase.from('profiles').update({ xp:newXP, score:percent }).eq('id', profile.id)
    if (ghostBonus > 0) await supabase.from('profiles').update({ ghost_wins:(profile.ghost_wins||0)+1 }).eq('id', profile.id)
    setProfile(p => p ? { ...p, xp:newXP, score:percent } : p)
    await pushNotification(profile.id, `✅ Test "${activeTest.title}" submitted — ${percent}%`, 'attempt')
    await logActivity(`Student ${profile.name} submitted test ${activeTest.id}: ${percent}%`, 'attempt')
    setAttempts(prev => [...prev.filter(a=>a.test_id!==activeTest.id), { id:'', student_id:profile.id, test_id:activeTest.id, score, total, percent, answer_map:answerMap, submitted_at:new Date().toISOString() }])
    setTestResult(result)
  }

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const sortedLeaderboard = [...allStudents].sort((a,b) => (b.xp||0) - (a.xp||0))

  const navItems = [
    { id:'home',        label:'Overview',    icon:'home'     },
    { section:'Learning' },
    { id:'tests',       label:'Tests',       icon:'test'     },
    { id:'courses',     label:'Courses',     icon:'book'     },
    { id:'assignments', label:'Assignments', icon:'task'     },
    { id:'timetable',   label:'Timetable',   icon:'calendar' },
    { id:'leaderboard', label:'Leaderboard', icon:'trophy'   },
    { id:'forums',      label:'Forums',      icon:'chat'     },
    { id:'wrapped',     label:'My Wrapped',  icon:'star'     },
    { section:'Account' },
    { id:'profile',     label:'My Profile',  icon:'user'     },
  ]

  if (!profile) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-dim)' }}>Loading...</div>

  const myAttempts = attempts
  const attempted  = myAttempts.map(a => a.test_id)
  const tier = getTier(profile.xp || 0)
  const enrolledCourses = allCourses.filter(c => enrolledIds.includes(c.id))

  const copyWrapped = () => {
    const rank = sortedLeaderboard.findIndex(s => s.id === profile.id) + 1
    const best = myAttempts.length ? Math.max(...myAttempts.map(a=>a.percent)) : 0
    const text = `QGX Wrapped | ${profile.name} | ${profile.qgx_id}\nXP: ${profile.xp} | Tier: ${tier.label} | Rank: #${rank}\nBest Score: ${best}% | Tests: ${myAttempts.length}/${tests.length}\nGhost Wins: ${profile.ghost_wins||0}`
    navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'))
  }

  return (
    <Layout profile={profile} navItems={navItems} activeTab={tab} onTabChange={t => { setTab(t); setActiveTest(null); setTestResult(null); setJitsiRoom(null); setActiveCourse(null); if(t!=='forums'){ setActivePost(null); setForumComments([]) } if(t==='forums') fetchForumPosts() }}>
      {showProfile && <ProfileModal profile={profile} onClose={()=>setShowProfile(false)} onUpdate={p=>setProfile(p)} />}

      {doubleXP.active && doubleXP.ends_at && Date.now() < doubleXP.ends_at && (
        <div style={{ background:'var(--warn)', color:'#000', textAlign:'center', padding:'8px', fontFamily:'var(--mono)', fontSize:11, letterSpacing:'0.1em' }}>
          ⚡ DOUBLE XP HOUR ACTIVE — Earn 2× XP on all tests!
        </div>
      )}

      <div className="page">
        {tab === 'home' && (
          <>
            <div className="page-title fade-up">STUDENT DASHBOARD</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:28 }}>Welcome, {profile.name} · <span style={{ color:'var(--fg-dim)' }}>{profile.qgx_id}</span></div>
            <div className="grid-4 fade-up-2" style={{ marginBottom:24 }}>
              {[['XP Points', profile.xp||0], ['Best Score', `${profile.score||0}%`], ['Tests Done', myAttempts.length], ['Enrolled', enrolledIds.length]].map(([lbl,val])=>(
                <div key={String(lbl)} className="stat-card"><div className="stat-val" style={{ fontSize:36 }}>{val}</div><div className="stat-label">{lbl}</div></div>
              ))}
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }} className="fade-up-3">Announcements</div>
            <div className="fade-up-4">
              {announcements.slice(0,3).map((a:any)=><AnnouncementCard key={a.id} a={a} canDelete={false} />)}
            </div>
          </>
        )}

        {/* ── TESTS LIST ── */}
        {tab === 'tests' && !activeTest && !testResult && (
          <>
            <div className="page-title fade-up">TESTS & QUIZZES</div>
            <div style={{ marginBottom:28 }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }} className="fade-up-1">Available</div>
              {tests.filter(t=>!attempted.includes(t.id)).map(t=>{
                const attCount = myAttempts.filter(a=>a.test_id===t.id).length
                const maxAtt   = t.anti_cheat?.maxAttempts || 1
                const blocked  = attCount >= maxAtt
                return (
                  <div key={t.id} className="card fade-up" style={{ marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span className="mono" style={{ fontSize:10, color:'var(--fg-dim)' }}>{t.id}</span>
                        <span style={{ fontWeight:500 }}>{t.title}</span>
                        {t.type==='quiz' && <span className="tag tag-info">QUIZ</span>}
                      </div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>
                        {t.teacher_name} · {t.duration} min · {t.questions?.length||0} questions
                        {t.anti_cheat?.maxAttempts>1 && ` · ${attCount}/${maxAtt} attempts`}
                      </div>
                    </div>
                    {blocked
                      ? <span className="tag tag-danger">Max Attempts</span>
                      : <button className="btn btn-primary btn-sm" onClick={()=>startTest(t)}><Icon name="arrow" size={12} /> Attempt</button>
                    }
                  </div>
                )
              })}
              {tests.filter(t=>!attempted.includes(t.id)).length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No available tests.</div>}
            </div>
            <div>
              <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>Attempted</div>
              {myAttempts.map(a=>{
                const t = tests.find(x=>x.id===a.test_id)
                return (
                  <div key={a.id||a.test_id} className="card" style={{ marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontWeight:500, marginBottom:2 }}>{t?.title||a.test_id}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>{a.submitted_at?.slice(0,10)}</div>
                    </div>
                    <div style={{ fontFamily:'var(--display)', fontSize:32, color:a.percent>=70?'var(--success)':a.percent>=40?'var(--warn)':'var(--danger)' }}>{a.percent}%</div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── TEST ATTEMPT ── */}
        {activeTest && !testResult && (() => {
          const ac = activeTest.anti_cheat || {}
          const q  = questions[currentQ]
          if (!q) return null
          const pct = ac.timePerQ > 0 ? (qTimeLeft / ac.timePerQ) * 100 : 100
          return (
            <div className="fade-up"
              onContextMenu={ac.copyPaste ? e=>e.preventDefault() : undefined}
              onCopy={ac.copyPaste ? e=>e.preventDefault() : undefined}
              onPaste={ac.copyPaste ? e=>e.preventDefault() : undefined}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, paddingBottom:16, borderBottom:'1px solid var(--border)' }}>
                <div>
                  <div style={{ fontFamily:'var(--display)', fontSize:24, letterSpacing:'0.06em' }}>{activeTest.title}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginTop:2 }}>
                    {activeTest.id} · {questions.length} questions
                    {ghostScore !== null && <span style={{ marginLeft:16, color:'var(--fg-dim)' }}>👻 GHOST — {ghostScore}%</span>}
                    {doubleXP.active && <span style={{ marginLeft:12, color:'var(--warn)' }}>⚡ 2X XP</span>}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontFamily:'var(--display)', fontSize:36, color:timeLeft<300?'var(--danger)':timeLeft<600?'var(--warn)':'var(--fg)' }}>{fmt(timeLeft)}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-dim)' }}>REMAINING</div>
                </div>
              </div>
              {ac.timePerQ > 0 && (
                <div className="q-timer-bar">
                  <div className="q-timer-fill" style={{ width:`${pct}%`, background:pct<30?'var(--danger)':'var(--warn)' }} />
                </div>
              )}
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:20 }}>
                {questions.map((_,i)=>(
                  <button key={i} onClick={()=>setCurrentQ(i)} style={{ width:32, height:32, border:`1px solid ${i===currentQ?'var(--fg)':answers[questions[i].id]!==undefined?'var(--success)':'var(--border)'}`, background:i===currentQ?'var(--fg)':answers[questions[i].id]!==undefined?'rgba(0,230,118,0.1)':'transparent', color:i===currentQ?'var(--bg)':'var(--fg)', fontFamily:'var(--mono)', fontSize:11, cursor:'pointer' }}>
                    {i+1}
                  </button>
                ))}
              </div>
              <div className="card" style={{ padding:24, marginBottom:16 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:8 }}>
                  Q{currentQ+1} of {questions.length} · {q.type?.toUpperCase()} · {q.marks} mark{q.marks!==1?'s':''}
                </div>
                <div style={{ fontSize:16, marginBottom:20, lineHeight:1.5 }}>{q.text}</div>
                {q.type==='mcq' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {(q.options as string[]).map((o,j)=>(
                      <button key={j} onClick={()=>setAnswers(a=>({...a,[q.id]:j}))} style={{ textAlign:'left', padding:'10px 16px', border:`1px solid ${answers[q.id]===j?'var(--fg)':'var(--border)'}`, background:answers[q.id]===j?'rgba(128,128,128,0.1)':'transparent', color:'var(--fg)', fontFamily:'var(--sans)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:10, transition:'all 0.15s' }}>
                        <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', width:16 }}>{['A','B','C','D'][j]}</span>{o}
                      </button>
                    ))}
                  </div>
                )}
                {q.type==='msq' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {(q.options as string[]).map((o,j)=>{
                      const sel: number[] = answers[q.id] || []
                      return (
                        <button key={j} onClick={()=>setAnswers(a=>{ const cur=a[q.id]||[]; return {...a,[q.id]:cur.includes(j)?cur.filter((x:number)=>x!==j):[...cur,j]} })} style={{ textAlign:'left', padding:'10px 16px', border:`1px solid ${sel.includes(j)?'var(--fg)':'var(--border)'}`, background:sel.includes(j)?'rgba(128,128,128,0.1)':'transparent', color:'var(--fg)', fontFamily:'var(--sans)', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', width:16 }}>{['A','B','C','D'][j]}</span>{o}
                        </button>
                      )
                    })}
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginTop:4 }}>Select all that apply</div>
                  </div>
                )}
                {q.type==='tf' && (
                  <div style={{ display:'flex', gap:8 }}>
                    {[true,false].map(v=>(
                      <button key={String(v)} onClick={()=>setAnswers(a=>({...a,[q.id]:v}))} style={{ padding:'10px 28px', border:`1px solid ${answers[q.id]===v?'var(--fg)':'var(--border)'}`, background:answers[q.id]===v?'rgba(128,128,128,0.1)':'transparent', color:'var(--fg)', fontFamily:'var(--mono)', fontSize:12, cursor:'pointer' }}>
                        {v?'TRUE':'FALSE'}
                      </button>
                    ))}
                  </div>
                )}
                {q.type==='fib' && (
                  <input className="input" placeholder="Your answer..." value={answers[q.id]||''} onChange={e=>setAnswers(a=>({...a,[q.id]:e.target.value}))} style={{ maxWidth:400 }} />
                )}
                {q.type==='match' && (
                  <div>
                    <div className="grid-2" style={{ marginBottom:8 }}>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>COLUMN A</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>YOUR MATCH</div>
                    </div>
                    {(q.answer as any[]).map((pair:any,i:number)=>(
                      <div key={i} className="grid-2" style={{ gap:8, marginBottom:8 }}>
                        <div style={{ padding:'8px 12px', border:'1px solid var(--border)', fontSize:13 }}>{pair.left}</div>
                        <input className="input" placeholder="Match..." value={(answers[q.id]||{})[i]?.right||''} onChange={e=>setAnswers(a=>({...a,[q.id]:{...(a[q.id]||{}),[i]:{left:pair.left,right:e.target.value}}}))} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-sm" onClick={()=>setCurrentQ(q=>Math.max(0,q-1))} disabled={currentQ===0}>← Prev</button>
                  <button className="btn btn-sm" onClick={()=>setCurrentQ(q=>Math.min(questions.length-1,q+1))} disabled={currentQ===questions.length-1}>Next →</button>
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleSubmit}><Icon name="check" size={12} /> Submit</button>
              </div>
            </div>
          )
        })()}

        {/* ── RESULT ── */}
        {testResult && (
          <div className="fade-up" style={{ maxWidth:500 }}>
            <div style={{ textAlign:'center', padding:'40px 0' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:11, letterSpacing:'0.2em', color:'var(--fg-dim)', marginBottom:12 }}>TEST COMPLETE</div>
              <div style={{ fontFamily:'var(--display)', fontSize:100, color:testResult.percent>=70?'var(--success)':testResult.percent>=40?'var(--warn)':'var(--danger)', lineHeight:1 }}>{testResult.percent}%</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:14, color:'var(--fg-dim)', marginTop:8 }}>{testResult.score} / {testResult.total} marks</div>
              <div style={{ marginTop:16, fontFamily:'var(--mono)', fontSize:12, color:'var(--warn)' }}>
                {testResult.isDoubleXP ? `⚡ 2X XP — +${testResult.xpEarned} XP earned!` : `+${testResult.xpEarned} XP earned`}
              </div>
              {testResult.ghostMsg && <div style={{ marginTop:12, fontFamily:'var(--mono)', fontSize:13 }}>{testResult.ghostMsg}</div>}
              <button className="btn btn-primary" style={{ marginTop:28 }} onClick={()=>{ setActiveTest(null); setTestResult(null) }}>← Back to Tests</button>
            </div>
          </div>
        )}

        {/* ── TIMETABLE ── */}
        {tab === 'timetable' && (
          <>
            <div className="page-title fade-up">TIMETABLE</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:24 }}>Join live classes via Jitsi Meet</div>
            {jitsiRoom ? (
              <div className="fade-up">
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <button className="btn btn-sm" onClick={()=>setJitsiRoom(null)}>← Back</button>
                  <span className="mono" style={{ fontSize:12, color:'var(--fg-dim)' }}>Room: {jitsiRoom.room}</span>
                </div>
                <div style={{ border:'1px solid var(--border)', height:520 }}>
                  <iframe src={`https://meet.jit.si/${jitsiRoom.room}#userInfo.displayName="${encodeURIComponent(profile.name)}"`} style={{ width:'100%', height:'100%', border:'none' }} allow="camera; microphone; fullscreen; display-capture" />
                </div>
              </div>
            ) : (
              <div className="fade-up-2">
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map(day=>{
                  const slots = timetable.filter(s=>s.day===day)
                  if(!slots.length) return null
                  return (
                    <div key={day} style={{ marginBottom:16 }}>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--fg-dim)', marginBottom:8 }}>{day}</div>
                      {slots.map((s:any)=>(
                        <div key={s.id} className="card" style={{ marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div>
                            <div style={{ fontWeight:500, marginBottom:2 }}>{s.subject}</div>
                            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>{s.teacher_name} · {s.time}</div>
                          </div>
                          <button className="btn btn-sm" style={{ borderColor:'var(--success)', color:'var(--success)' }} onClick={()=>setJitsiRoom(s)}>
                            <Icon name="video" size={12} /> Join Meet
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })}
                {timetable.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No classes scheduled yet.</div>}
              </div>
            )}
          </>
        )}

        {/* ── COURSES LIST ── */}
        {tab === 'courses' && !activeCourse && (
          <>
            <div className="page-title fade-up">COURSES</div>
            <div style={{ display:'flex', gap:8, marginBottom:20 }} className="fade-up-1">
              <button className={`btn btn-sm ${courseView==='browse'?'btn-primary':''}`} onClick={()=>setCourseView('browse')}>
                Browse All ({allCourses.length})
              </button>
              <button className={`btn btn-sm ${courseView==='enrolled'?'btn-primary':''}`} onClick={()=>setCourseView('enrolled')}>
                Enrolled ({enrolledIds.length})
              </button>
            </div>

            {courseView==='browse' && (
              <div className="fade-up-2">
                {allCourses.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No courses available yet.</div>}
                {allCourses.map((c:any)=>{
                  const isEnrolled = enrolledIds.includes(c.id)
                  return (
                    <div key={c.id} className="card fade-up" style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:500, fontSize:15, marginBottom:4 }}>{c.title}</div>
                          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginBottom:6 }}>
                            {c.subject} · {c.teacher_name}
                          </div>
                          <div style={{ fontSize:13, color:'var(--fg-dim)', marginBottom:8 }}>{c.description}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:6, marginLeft:12, minWidth:110 }}>
                          {isEnrolled ? (
                            <>
                              <button
                                className="btn btn-xs"
                                style={{ borderColor:'var(--success)', color:'var(--success)' }}
                                onClick={()=>openCourse(c.id)}
                                disabled={courseLoading}
                              >
                                <Icon name="book" size={10}/> {courseLoading ? 'Loading...' : 'View Files'}
                              </button>
                              <button className="btn btn-xs" onClick={()=>unenrollCourse(c.id)} style={{ fontSize:9 }}>
                                Unenroll
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={()=>enrollCourse(c.id)}
                              disabled={enrolling===c.id}
                            >
                              {enrolling===c.id ? 'Enrolling...' : '+ Enroll'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {courseView==='enrolled' && (
              <div className="fade-up-2">
                {enrolledCourses.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>You haven't enrolled in any courses yet.</div>}
                {enrolledCourses.map((c:any)=>(
                  <div
                    key={c.id}
                    className="card fade-up"
                    style={{ marginBottom:12, cursor:'pointer' }}
                    onClick={()=>openCourse(c.id)}
                  >
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontWeight:500, fontSize:15, marginBottom:4 }}>{c.title}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginBottom:4 }}>
                          {c.subject} · {c.teacher_name}
                        </div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>
                          Click to view files
                        </div>
                      </div>
                      <span className="tag tag-success">ENROLLED</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── COURSE FILE VIEW ── */}
        {tab === 'courses' && activeCourse && (
          <div className="fade-up">
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button className="btn btn-sm" onClick={()=>setActiveCourse(null)}>← Back</button>
              <div>
                <div style={{ fontFamily:'var(--display)', fontSize:22, letterSpacing:'0.08em' }}>{activeCourse.title}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)' }}>
                  {activeCourse.subject} · {activeCourse.teacher_name} · {activeCourse.course_files?.length||0} file{activeCourse.course_files?.length!==1?'s':''}
                </div>
              </div>
              {/* Refresh button */}
              <button
                className="btn btn-xs"
                style={{ marginLeft:'auto' }}
                onClick={()=>openCourse(activeCourse.id)}
                disabled={courseLoading}
              >
                {courseLoading ? '...' : '↻ Refresh'}
              </button>
            </div>

            {activeCourse.description && (
              <div className="card" style={{ marginBottom:16, padding:16, fontSize:13, color:'var(--fg-dim)' }}>
                {activeCourse.description}
              </div>
            )}

            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>
              Course Files ({activeCourse.course_files?.length||0})
            </div>

            {courseLoading && (
              <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12, padding:'20px 0' }}>
                Loading files...
              </div>
            )}

            {!courseLoading && (!activeCourse.course_files || activeCourse.course_files.length===0) && (
              <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12, padding:'20px 0' }}>
                No files uploaded yet for this course.
              </div>
            )}

            {!courseLoading && activeCourse.course_files?.map((f:any)=>(
              <div key={f.id} className="card" style={{ marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:20 }}>{getFileIcon(f.type)}</span>
                  <div>
                    <div style={{ fontWeight:500, fontSize:13, marginBottom:2 }}>{f.name}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>
                      {formatSize(f.size)}{f.size?' · ':''}
                      {new Date(f.created_at||Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={f.name}
                    className="btn btn-sm"
                    style={{ borderColor:'var(--success)', color:'var(--success)', textDecoration:'none' }}
                  >
                    <Icon name="download" size={12}/> Download
                  </a>
                ) : (
                  <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>No URL</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── ASSIGNMENTS ── */}
        {tab === 'assignments' && (
          <>
            {/* Submit Modal */}
            {submitModal && activeAssign && (
              <div className="modal-overlay" onClick={()=>setSubmitModal(false)}>
                <div className="modal" style={{ width:520 }} onClick={e=>e.stopPropagation()}>
                  <div className="modal-title">Submit Assignment</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginBottom:16 }}>{activeAssign.title}</div>
                  {activeAssign.description && (
                    <div className="card" style={{ padding:12, fontSize:13, color:'var(--fg-dim)', marginBottom:16, maxHeight:120, overflowY:'auto' }}>
                      {activeAssign.description}
                    </div>
                  )}
                  {activeAssign.attachment_url && (
                    <div style={{ marginBottom:16 }}>
                      <label className="label">Assignment File</label>
                      <a href={activeAssign.attachment_url} target="_blank" rel="noopener noreferrer"
                        className="btn btn-xs" style={{ borderColor:'var(--success)', color:'var(--success)', textDecoration:'none' }}>
                        <Icon name="download" size={10}/> {activeAssign.attachment_name||'Download'}
                      </a>
                    </div>
                  )}
                  <div style={{ marginBottom:14 }}>
                    <label className="label">Your Response (text)</label>
                    <textarea className="input" rows={5} value={submitText}
                      onChange={e=>setSubmitText(e.target.value)} placeholder="Type your answer here..." />
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label className="label">Upload File (optional)</label>
                    <input ref={submitFileRef} type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.zip,.txt"
                      onChange={e=>setSubmitFile(e.target.files?.[0]||null)}
                      style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--fg)' }} />
                  </div>
                  {submitStatus && (
                    <div style={{ fontFamily:'var(--mono)', fontSize:11, color:submitStatus.startsWith('✅')?'var(--success)':'var(--fg-dim)', marginBottom:12 }}>
                      {submitStatus}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-primary" onClick={submitAssignment} disabled={submitting||(!submitText&&!submitFile)}>
                      {submitting ? <><span className="spinner"/> Submitting...</> : <><Icon name="upload" size={12}/> Submit</>}
                    </button>
                    <button className="btn" onClick={()=>setSubmitModal(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            <div className="page-title fade-up">ASSIGNMENTS</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:24 }}>Submit your work and track grades</div>
            {assignments.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No assignments yet.</div>}
            {assignments.map((a:any)=>{
              const sub = a.submissions?.find((s:any)=>s.student_id===profile.id)
              const isOverdue = a.due_date && new Date(a.due_date) < new Date() && !sub
              return (
                <div key={a.id} className="card fade-up" style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:500, fontSize:15, marginBottom:4 }}>{a.title}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color: isOverdue?'var(--danger)':'var(--fg-dim)', marginBottom:6 }}>
                        {a.teacher_name} · Due: {a.due_date||'No deadline'}{isOverdue?' · OVERDUE':''}
                      </div>
                      <div style={{ fontSize:13, color:'var(--fg-dim)', marginBottom:sub?8:0 }}>
                        {a.description?.slice(0,120)}{a.description?.length>120?'...':''}
                      </div>
                      {a.attachment_name && (
                        <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--success)', marginTop:4 }}>📎 {a.attachment_name}</div>
                      )}
                      {sub?.feedback && (
                        <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginTop:8, padding:'8px 12px', border:'1px solid var(--border)' }}>
                          💬 Feedback: {sub.feedback}
                        </div>
                      )}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, marginLeft:12, minWidth:110 }}>
                      {sub ? (
                        <>
                          {sub.grade
                            ? <span className="tag tag-success">{sub.grade}</span>
                            : <span className="tag tag-warn">Submitted</span>
                          }
                          <button className="btn btn-xs" onClick={()=>{ setActiveAssign(a); setSubmitModal(true); setSubmitText(sub.text_response||'') }}>
                            ↺ Resubmit
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-primary btn-xs" onClick={()=>{ setActiveAssign(a); setSubmitModal(true) }}>
                          <Icon name="upload" size={10}/> Submit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}

        {/* ── LEADERBOARD ── */}
        {tab === 'leaderboard' && (
          <>
            <div className="page-title fade-up">LEADERBOARD</div>
            <div style={{ border:'1px solid var(--border)' }} className="fade-up-2">
              {sortedLeaderboard.map((s,i)=>(
                <div key={s.id} className="leaderboard-row" style={{ background:s.id===profile.id?'rgba(128,128,128,0.05)':'transparent' }}>
                  <div className={`rank ${i<3?'top':''}`}>{i+1}</div>
                  <div className="avatar">{s.avatar}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:s.id===profile.id?600:400 }}>
                      {s.name} {s.id===profile.id&&<span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--success)' }}>YOU</span>}
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-dim)' }}>{s.qgx_id}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'var(--display)', fontSize:24, color:'var(--warn)' }}>{s.xp||0}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-dim)' }}>XP</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── WRAPPED ── */}
        {tab === 'wrapped' && (() => {
          const rank = sortedLeaderboard.findIndex(s=>s.id===profile.id)+1
          const best = myAttempts.length ? Math.max(...myAttempts.map(a=>a.percent)) : 0
          const consistency = tests.length ? Math.round((myAttempts.length/tests.length)*100) : 0
          return (
            <div style={{ position:'relative', minHeight:'80vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center' }}>
              <div className="grid-bg" style={{ opacity:0.5 }} />
              <div style={{ position:'relative', zIndex:2, maxWidth:480, width:'100%' }}>
                <div className="fade-up" style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:'0.3em', color:'var(--fg-dim)', marginBottom:16 }}>QGX WRAPPED 2026</div>
                <div className="fade-up-1" style={{ fontFamily:'var(--display)', fontSize:'clamp(32px,6vw,56px)', letterSpacing:'0.08em', marginBottom:4 }}>{profile.name}</div>
                <div className="fade-up-1" style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-dim)', marginBottom:32 }}>{profile.qgx_id}</div>
                <div className="fade-up-2" style={{ fontFamily:'var(--display)', fontSize:80, lineHeight:1, marginBottom:8, color:tier.color }}>{tier.label}</div>
                <div className="fade-up-2" style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginBottom:32 }}>XP TIER</div>
                <div className="grid-2 fade-up-3" style={{ gap:12, marginBottom:12 }}>
                  {[['Total XP', profile.xp||0], ['Leaderboard Rank', `#${rank}`], ['Best Score', `${best}%`], ['Tests Done', myAttempts.length]].map(([lbl,val])=>(
                    <div key={String(lbl)} style={{ border:'1px solid var(--border)', padding:16, background:'var(--card)' }}>
                      <div style={{ fontFamily:'var(--display)', fontSize:32 }}>{val}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-dim)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <div className="grid-2 fade-up-4" style={{ gap:12, marginBottom:32 }}>
                  {[['Consistency', `${consistency}%`], ['Ghost Wins', profile.ghost_wins||0]].map(([lbl,val])=>(
                    <div key={String(lbl)} style={{ border:'1px solid var(--border)', padding:16, background:'var(--card)' }}>
                      <div style={{ fontFamily:'var(--display)', fontSize:32 }}>{val}</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-dim)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{lbl}</div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary" onClick={copyWrapped}>📋 Copy Summary</button>
              </div>
            </div>
          )
        })()}

        {/* ── FORUMS ── */}
        {tab === 'forums' && !activePost && (
          <>
            {postModal && (
              <div className="modal-overlay" onClick={()=>setPostModal(false)}>
                <div className="modal" style={{ width:540 }} onClick={e=>e.stopPropagation()}>
                  <div className="modal-title">New Post</div>
                  <div style={{ marginBottom:14 }}>
                    <label className="label">Title</label>
                    <input className="input" value={newPost.title} onChange={e=>setNewPost(p=>({...p,title:e.target.value}))} placeholder="What's this about?" />
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label className="label">Body</label>
                    <textarea className="input" rows={5} value={newPost.body} onChange={e=>setNewPost(p=>({...p,body:e.target.value}))} placeholder="Write your post..." />
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-primary" onClick={createPost}>Post</button>
                    <button className="btn" onClick={()=>setPostModal(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            <div className="page-title fade-up">FORUMS</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:24 }}>Community discussion — ask questions, share ideas</div>
            <div style={{ marginBottom:20 }} className="fade-up-2">
              <button className="btn btn-primary btn-sm" onClick={()=>setPostModal(true)}><Icon name="plus" size={12}/> New Post</button>
            </div>
            {forumPosts.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No posts yet. Start the conversation!</div>}
            {forumPosts.map((post:any)=>(
              <div key={post.id} className="card fade-up" style={{ marginBottom:10, cursor:'pointer' }} onClick={()=>openPost(post)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      {post.pinned && <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--warn)', border:'1px solid var(--warn)', padding:'1px 6px' }}>📌 PINNED</span>}
                      <span style={{ fontWeight:500, fontSize:15 }}>{post.title}</span>
                    </div>
                    <div style={{ fontSize:13, color:'var(--fg-dim)', marginBottom:8 }}>{post.body.slice(0,120)}{post.body.length>120?'...':''}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', display:'flex', gap:16 }}>
                      <span style={{ color: post.author_role==='teacher'?'var(--warn)':post.author_role==='admin'?'var(--danger)':'var(--fg-dim)' }}>
                        {post.author_name} · {post.author_role?.toUpperCase()}
                      </span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      <span>👍 {post.likes?.length||0}</span>
                    </div>
                  </div>
                  {post.author_id===profile.id && (
                    <button className="btn btn-xs btn-danger" style={{ marginLeft:12 }} onClick={e=>{ e.stopPropagation(); deletePost(post.id) }}>
                      <Icon name="trash" size={10}/>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'forums' && activePost && (
          <div className="fade-up">
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button className="btn btn-sm" onClick={()=>{ setActivePost(null); setForumComments([]) }}>← Back</button>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {activePost.pinned && <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--warn)', border:'1px solid var(--warn)', padding:'1px 6px' }}>📌 PINNED</span>}
                  <div style={{ fontFamily:'var(--display)', fontSize:22, letterSpacing:'0.06em' }}>{activePost.title}</div>
                </div>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, marginTop:4, color: activePost.author_role==='teacher'?'var(--warn)':activePost.author_role==='admin'?'var(--danger)':'var(--fg-dim)' }}>
                  {activePost.author_name} · {activePost.author_role?.toUpperCase()} · {new Date(activePost.created_at).toLocaleDateString()}
                </div>
              </div>
              {activePost.author_id===profile.id && (
                <button className="btn btn-xs btn-danger" onClick={()=>deletePost(activePost.id)}><Icon name="trash" size={10}/></button>
              )}
            </div>
            <div className="card" style={{ padding:20, marginBottom:20, fontSize:14, lineHeight:1.7 }}>
              {activePost.body}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <button className="btn btn-sm" style={{ borderColor:(activePost.likes||[]).includes(profile.id)?'var(--success)':'var(--border)', color:(activePost.likes||[]).includes(profile.id)?'var(--success)':'var(--fg)' }} onClick={()=>toggleLike(activePost)}>
                👍 {activePost.likes?.length||0} {(activePost.likes||[]).includes(profile.id)?'Liked':'Like'}
              </button>
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>
              Comments ({forumComments.length})
            </div>
            {postLoading && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>Loading...</div>}
            {forumComments.map((c:any)=>(
              <div key={c.id} className="card" style={{ marginBottom:8, padding:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, marginBottom:6, color: c.author_role==='teacher'?'var(--warn)':c.author_role==='admin'?'var(--danger)':'var(--fg-dim)' }}>
                      {c.author_name} · {c.author_role?.toUpperCase()} · {new Date(c.created_at).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize:13, lineHeight:1.6 }}>{c.body}</div>
                  </div>
                  {c.author_id===profile.id && (
                    <button className="btn btn-xs btn-danger" style={{ marginLeft:10 }} onClick={()=>deleteComment(c.id)}><Icon name="trash" size={10}/></button>
                  )}
                </div>
              </div>
            ))}
            {forumComments.length===0&&!postLoading&&<div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12, marginBottom:16 }}>No comments yet. Be the first!</div>}
            <div style={{ marginTop:16, display:'flex', gap:10 }}>
              <textarea className="input" rows={2} value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Write a comment... (Enter to post)" style={{ flex:1, resize:'none' }}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); addComment() } }} />
              <button className="btn btn-primary" onClick={addComment} disabled={commentLoading||!newComment.trim()} style={{ alignSelf:'flex-end' }}>
                {commentLoading?<span className="spinner"/>:'Post'}
              </button>
            </div>
          </div>
        )}

        {/* ── PROFILE ── */}
        {tab === 'profile' && (
          <div style={{ maxWidth:480 }} className="fade-up">
            <div className="page-title" style={{ marginBottom:20 }}>MY PROFILE</div>
            <div className="card" style={{ padding:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:24 }}>
                <div style={{ width:72, height:72, border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--display)', fontSize:28 }}>{profile.avatar}</div>
                <div>
                  <div style={{ fontSize:18, fontWeight:600 }}>{profile.name}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginTop:2 }}>{profile.email}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--success)', marginTop:2 }}>{profile.qgx_id}</div>
                  <span className="tag tag-success" style={{ marginTop:6, fontSize:9 }}>STUDENT</span>
                </div>
              </div>
              <div className="divider" />
              {[['Bio',profile.bio],['Phone',profile.phone],['Grade',profile.grade],['XP',`${profile.xp||0} points`],['Joined',profile.joined]].map(([k,v])=>(
                <div key={String(k)} style={{ marginBottom:12 }}><div className="label">{k}</div><div style={{ fontSize:13 }}>{v||'—'}</div></div>
              ))}
              <button className="btn btn-primary btn-sm" style={{ marginTop:12 }} onClick={()=>setShowProfile(true)}><Icon name="edit" size={11} /> Edit Profile</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}