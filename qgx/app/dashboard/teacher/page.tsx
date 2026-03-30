'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, pushNotification, logActivity, type Profile, type Test, type Question, type Course } from '@/lib/supabase'
import Layout, { Icon, AnnouncementCard, ProfileModal } from '@/components/Layout'

const DEFAULT_ANTICHEAT = { tabSwitch:false, copyPaste:false, randomQ:false, randomOpts:false, fullscreen:false, timePerQ:0, maxAttempts:1 }
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export default function TeacherDashboard() {
  const router = useRouter()
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [tab, setTab]                 = useState('home')
  const [tests, setTests]             = useState<Test[]>([])
  const [courses, setCourses]         = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [students, setStudents]       = useState<Profile[]>([])
  const [allAttempts, setAllAttempts] = useState<any[]>([])
  const [timetable, setTimetable]     = useState<any[]>([])
  const [showProfile, setShowProfile] = useState(false)

  // Test/Question modals
  const [testModal, setTestModal]       = useState(false)
  const [questionBank, setQuestionBank] = useState<Test | null>(null)
  const [qManualModal, setQManualModal] = useState(false)
  const [aiModal, setAiModal]           = useState(false)
  const [announceModal, setAnnounceModal] = useState(false)
  const [subTab, setSubTab]             = useState<'tests'|'quizzes'>('tests')

  // Timetable
  const [ttModal, setTtModal] = useState(false)
  const [ttEdit, setTtEdit]   = useState<any>(null)
  const [newSlot, setNewSlot] = useState({ subject:'', day:'Monday', time:'', room:'' })

  // Courses — activeCourse is ALWAYS fetched fresh from Supabase
  const [courseModal, setCourseModal]   = useState(false)
  const [activeCourse, setActiveCourse] = useState<any>(null)
  const [courseLoading, setCourseLoading] = useState(false)
  const [newCourse, setNewCourse]       = useState({ title:'', subject:'', description:'' })
  const [uploadFile, setUploadFile]     = useState<File | null>(null)
  const [uploading, setUploading]       = useState(false)
  const [courseStatus, setCourseStatus] = useState('')
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  const [newTest, setNewTest]     = useState({ title:'', subject:'', scheduledDate:'', scheduledTime:'', duration:60, type:'test' as 'test'|'quiz' })
  const [antiCheat, setAntiCheat] = useState({ ...DEFAULT_ANTICHEAT })
  const [showAC, setShowAC]       = useState(false)

  const [qType, setQType] = useState<'mcq'|'msq'|'tf'|'fib'|'match'>('mcq')
  const [qStep, setQStep] = useState(1)
  const [qForm, setQForm] = useState<any>({ text:'', options:['','','',''], answer:0, marks:2, pairs:[{left:'',right:''},{left:'',right:''},{left:'',right:''},{left:'',right:''}] })

  const [aiTopic, setAiTopic]     = useState('')
  const [aiType, setAiType]       = useState('mcq')
  const [aiCount, setAiCount]     = useState(5)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult]   = useState<any[]|null>(null)

  const [newAnnounce, setNewAnnounce] = useState({ title:'', body:'', pinned:false })

  // Forums
  const [forumPosts, setForumPosts]     = useState<any[]>([])
  const [activePost, setActivePost]     = useState<any>(null)
  const [forumComments, setForumComments] = useState<any[]>([])
  const [postModal, setPostModal]       = useState(false)
  const [newPost, setNewPost]           = useState({ title:'', body:'' })
  const [newComment, setNewComment]     = useState('')
  const [postLoading, setPostLoading]   = useState(false)
  const [commentLoading, setCommentLoading] = useState(false)
  const [activeAssign, setActiveAssign]     = useState<any>(null)
  const [assignModal, setAssignModal]       = useState(false)
  const [assignLoading, setAssignLoading]   = useState(false)
  const [gradingSubmission, setGradingSubmission] = useState<any>(null)
  const [gradeForm, setGradeForm]           = useState({ score:'', feedback:'' })
  const [assignFile, setAssignFile]         = useState<File|null>(null)
  const [assignUploading, setAssignUploading] = useState(false)
  const assignFileRef                       = useRef<HTMLInputElement>(null)
  const [newAssign, setNewAssign]           = useState({ title:'', description:'', due_date:'' })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      supabase.from('profiles').select('*').eq('id', data.user.id).single()
        .then(({ data: p }) => { if (p) { setProfile(p as Profile); fetchAll(p as Profile) } })
    })
  }, [])

  const fetchAll = async (p: Profile) => {
    const [t, c, a, ann, st, at, tt] = await Promise.all([
      supabase.from('tests').select('*, questions(*)').eq('teacher_id', p.id).order('created_at', { ascending: false }),
      // Only fetch course metadata here — files are fetched on demand via refreshActiveCourse
      supabase.from('courses').select('id, title, subject, description, teacher_id, teacher_name, created_at').eq('teacher_id', p.id).order('created_at', { ascending: false }),
      supabase.from('assignments').select('*, submissions(*)').eq('teacher_id', p.id).order('created_at', { ascending: false }),
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'student'),
      supabase.from('attempts').select('*'),
      supabase.from('timetable').select('*').eq('teacher_id', p.id).order('day'),
    ])
    if (t.data)   setTests(t.data as Test[])
    if (c.data)   setCourses(c.data)
    if (a.data)   setAssignments(a.data)
    if (ann.data) setAnnouncements(ann.data)
    if (st.data)  setStudents(st.data as Profile[])
    if (at.data)  setAllAttempts(at.data)
    if (tt.data)  setTimetable(tt.data)

    // Fetch forum posts
    const { data: fp } = await supabase.from('forum_posts').select('*').order('pinned', { ascending:false }).order('created_at', { ascending:false })
    if (fp) setForumPosts(fp)

    // Forums realtime
    supabase.channel('forum-posts-teacher')
      .on('postgres_changes', { event:'*', schema:'public', table:'forum_posts' }, () => fetchForumPosts())
      .subscribe()
  }

  const fetchForumPosts = async () => {
    const { data } = await supabase.from('forum_posts').select('*').order('pinned', { ascending:false }).order('created_at', { ascending:false })
    if (data) setForumPosts(data)
  }

  const openPost = async (post: any) => {
    setPostLoading(true)
    setActivePost(post)
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
    if (data) setForumPosts(prev => [data, ...prev])
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

  const pinPost = async (post: any) => {
    const { data } = await supabase.from('forum_posts').update({ pinned: !post.pinned }).eq('id', post.id).select().single()
    if (data) { setForumPosts(prev => prev.map(p => p.id===post.id ? data : p).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0))); if (activePost?.id===post.id) setActivePost(data) }
  }

  const deletePost = async (postId: string) => {
    await supabase.from('forum_posts').delete().eq('id', postId)
    setForumPosts(prev => prev.filter(p => p.id !== postId))
    if (activePost?.id === postId) setActivePost(null)
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

  // SINGLE source of truth for course detail — always fetches fresh from Supabase
  const refreshActiveCourse = async (courseId: string) => {
    setCourseLoading(true)
    const { data, error } = await supabase
      .from('courses')
      .select('*, course_files(*)')
      .eq('id', courseId)
      .single()
    if (data && !error) {
      setActiveCourse(data)
      // Also update the courses list with fresh file count
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, _fileCount: data.course_files?.length || 0 } : c))
    }
    setCourseLoading(false)
    return data
  }

  const openCourse = async (courseId: string) => {
    await refreshActiveCourse(courseId)
  }

  // ── Timetable CRUD ──────────────────────────────────────────────────────
  const openAddSlot = () => { setTtEdit(null); setNewSlot({ subject:'', day:'Monday', time:'', room:'' }); setTtModal(true) }
  const openEditSlot = (slot: any) => { setTtEdit(slot); setNewSlot({ subject:slot.subject, day:slot.day, time:slot.time, room:slot.room }); setTtModal(true) }
  const saveSlot = async () => {
    if (!newSlot.subject || !newSlot.time || !profile) return
    const room = newSlot.room || `qgx-${newSlot.subject.toLowerCase().replace(/\s+/g,'-')}-${Date.now().toString().slice(-4)}`
    if (ttEdit) {
      const { data } = await supabase.from('timetable').update({ ...newSlot, room }).eq('id', ttEdit.id).select().single()
      if (data) setTimetable(prev => prev.map(s => s.id===ttEdit.id ? data : s))
    } else {
      const { data } = await supabase.from('timetable').insert({ ...newSlot, room, teacher_id:profile.id, teacher_name:profile.name }).select().single()
      if (data) setTimetable(prev => [...prev, data])
    }
    setTtModal(false); setTtEdit(null)
  }
  const deleteSlot = async (id: string) => {
    await supabase.from('timetable').delete().eq('id', id)
    setTimetable(prev => prev.filter(s => s.id !== id))
  }

  // ── Courses CRUD ─────────────────────────────────────────────────────────
  const createCourse = async () => {
    if (!newCourse.title || !profile) return
    const { data, error } = await supabase.from('courses').insert({
      title: newCourse.title,
      subject: newCourse.subject,
      description: newCourse.description,
      teacher_id: profile.id,
      teacher_name: profile.name,
    }).select('id, title, subject, description, teacher_id, teacher_name, created_at').single()

    if (data && !error) {
      const courseWithFiles = { ...data, course_files: [] }
      setCourses(prev => [courseWithFiles, ...prev])
      setActiveCourse(courseWithFiles)
      for (const s of students) await pushNotification(s.id, `📚 New course: "${newCourse.title}" by ${profile.name}`, 'course')
      await logActivity(`Teacher ${profile.name} created course: ${newCourse.title}`, 'course')
    }
    setNewCourse({ title:'', subject:'', description:'' })
    setCourseModal(false)
  }

  const deleteCourse = async (id: string) => {
    // Fetch files first to clean up storage
    const { data: courseData } = await supabase.from('courses').select('*, course_files(*)').eq('id', id).single()
    if (courseData?.course_files?.length) {
      const paths = courseData.course_files.map((f: any) => f.storage_path).filter(Boolean)
      if (paths.length) await supabase.storage.from('course-files').remove(paths)
    }
    await supabase.from('courses').delete().eq('id', id)
    setCourses(prev => prev.filter(c => c.id !== id))
    if (activeCourse?.id === id) setActiveCourse(null)
  }

  const uploadCourseFile = async () => {
    if (!uploadFile || !activeCourse || !profile) return
    setUploading(true)
    setCourseStatus('Uploading...')

    const ext = uploadFile.name.split('.').pop()
    const storagePath = `${profile.id}/${activeCourse.id}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('course-files')
      .upload(storagePath, uploadFile)

    if (upErr) {
      setCourseStatus(`❌ Upload failed: ${upErr.message}`)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(storagePath)

    const { data: fileRow, error: dbErr } = await supabase.from('course_files').insert({
      course_id: activeCourse.id,
      name: uploadFile.name,
      storage_path: storagePath,
      url: urlData.publicUrl,
      type: uploadFile.type,
      size: uploadFile.size,
    }).select().single()

    if (dbErr) {
      setCourseStatus(`❌ DB error: ${dbErr.message}`)
      setUploading(false)
      return
    }

    // Clear file input
    setUploadFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setCourseStatus('✅ File uploaded!')
    setTimeout(() => setCourseStatus(''), 3000)
    setUploading(false)

    // Refresh from Supabase to get definitive state
    await refreshActiveCourse(activeCourse.id)
  }

  const deleteCourseFile = async (file: any) => {
    if (!activeCourse) return
    if (file.storage_path) {
      await supabase.storage.from('course-files').remove([file.storage_path])
    }
    await supabase.from('course_files').delete().eq('id', file.id)
    // Refresh from Supabase instead of local splice
    await refreshActiveCourse(activeCourse.id)
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

  // ── Tests ────────────────────────────────────────────────────────────────
  const createTest = async () => {
    if (!newTest.title || !profile) return
    const count = tests.filter(t => t.type===newTest.type).length
    const id = newTest.type==='quiz' ? `Q${count+1}` : `T${count+1}`
    const row = { id, title:newTest.title, subject:newTest.subject, teacher_id:profile.id, teacher_name:profile.name, scheduled_date:newTest.scheduledDate||null, scheduled_time:newTest.scheduledTime||null, duration:newTest.duration, status:'scheduled', total_marks:0, type:newTest.type, anti_cheat:antiCheat }
    const { data } = await supabase.from('tests').insert(row).select().single()
    if (data) {
      setTests(prev => [{ ...data, questions:[] }, ...prev])
      for (const s of students) await pushNotification(s.id, `📝 New ${newTest.type}: "${newTest.title}" by ${profile.name}`, 'test_created')
      await logActivity(`Teacher ${profile.name} created ${newTest.type}: ${newTest.title}`, 'test_created')
    }
    setTestModal(false)
    setNewTest({ title:'', subject:'', scheduledDate:'', scheduledTime:'', duration:60, type:'test' })
    setAntiCheat({ ...DEFAULT_ANTICHEAT })
  }

  const deleteTest = async (id: string) => {
    await supabase.from('tests').delete().eq('id', id)
    setTests(prev => prev.filter(t => t.id !== id))
  }

  const saveManualQuestion = async () => {
    if (!questionBank) return
    let answer: any = qForm.answer
    if (qType==='match') answer = qForm.pairs
    if (qType==='msq') answer = qForm.msqAnswers || []
    const q = { test_id:questionBank.id, type:qType, text:qForm.text, options:['mcq','msq'].includes(qType)?qForm.options:null, answer, marks:qForm.marks, order_index:(questionBank.questions?.length||0) }
    const { data } = await supabase.from('questions').insert(q).select().single()
    if (data) {
      const newMarks = (questionBank.questions?.reduce((s,x)=>s+(x.marks||1),0)||0) + qForm.marks
      await supabase.from('tests').update({ total_marks:newMarks }).eq('id', questionBank.id)
      setTests(prev => prev.map(t => t.id===questionBank.id ? { ...t, questions:[...(t.questions||[]), data as Question], total_marks:newMarks } : t))
      setQuestionBank(prev => prev ? { ...prev, questions:[...(prev.questions||[]), data as Question], total_marks:newMarks } : prev)
    }
    setQManualModal(false)
    setQForm({ text:'', options:['','','',''], answer:0, marks:2, pairs:[{left:'',right:''},{left:'',right:''},{left:'',right:''},{left:'',right:''}] })
    setQStep(1)
  }

  const deleteQuestion = async (qId: string) => {
    await supabase.from('questions').delete().eq('id', qId)
    setTests(prev => prev.map(t => t.id===questionBank?.id ? { ...t, questions:t.questions?.filter(q=>q.id!==qId) } : t))
    setQuestionBank(prev => prev ? { ...prev, questions:prev.questions?.filter(q=>q.id!==qId) } : prev)
  }

  const callGroqAI = async () => {
    if (!aiTopic) return
    setAiLoading(true); setAiResult(null)
    const typeMap: Record<string,string> = {
      mcq: `Generate ${aiCount} MCQ questions. Each must have: "text"(string), "options"(array of exactly 4 strings), "answer"(number 0-3), "marks"(number 1-3).`,
      tf:  `Generate ${aiCount} True/False questions. Each must have: "text"(string), "answer"(boolean), "marks"(number, always 1).`,
      fib: `Generate ${aiCount} Fill-in-the-blank questions. Each must have: "text"(string, use ____ for blank), "answer"(string), "marks"(number 1-2).`,
    }
    const prompt = `You are an expert educator. ${typeMap[aiType]} Topic: "${aiTopic}". Return ONLY a valid JSON array. No markdown, no backticks. Each object must include: "id"(unique string), "type"("${aiType}"), and all fields above.`
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}` },
        body: JSON.stringify({ model:'llama-3.3-70b-versatile', max_tokens:2000, temperature:0.7, messages:[{role:'user',content:prompt}] })
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message||`Groq error: ${res.status}`) }
      const d = await res.json()
      const text = d.choices?.[0]?.message?.content || '[]'
      const parsed = JSON.parse(text.replace(/```json|```/g,'').trim())
      setAiResult(Array.isArray(parsed) ? parsed : [])
    } catch(e:any) { setAiResult([{ error:e.message }]) }
    setAiLoading(false)
  }

  const injectAiQuestions = async () => {
    if (!questionBank || !aiResult) return
    for (const q of aiResult) {
      await supabase.from('questions').insert({ test_id:questionBank.id, type:q.type, text:q.text, options:q.options||null, answer:q.answer, marks:q.marks||1, order_index:(questionBank.questions?.length||0) })
    }
    setAiModal(false); setAiResult(null)
    const { data } = await supabase.from('tests').select('*, questions(*)').eq('id', questionBank.id).single()
    if (data) { setQuestionBank(data as Test); setTests(prev => prev.map(t => t.id===data.id ? data as Test : t)) }
  }

  // ── Assignments ───────────────────────────────────────────────────────────
  const refreshActiveAssign = async (id: string) => {
    setAssignLoading(true)
    const { data } = await supabase.from('assignments').select('*, submissions(*)').eq('id', id).single()
    if (data) { setActiveAssign(data); setAssignments(prev => prev.map(a => a.id === id ? data : a)) }
    setAssignLoading(false)
  }

  const createAssignment = async () => {
    if (!newAssign.title || !profile) return
    setAssignUploading(true)
    let attachment_url = '', attachment_name = ''
    if (assignFile) {
      const ext = assignFile.name.split('.').pop()
      const path = `assignments/${profile.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('course-files').upload(path, assignFile)
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(path)
        attachment_url = urlData.publicUrl
        attachment_name = assignFile.name
      }
    }
    const { data } = await supabase.from('assignments').insert({
      title: newAssign.title, description: newAssign.description,
      due_date: newAssign.due_date, teacher_id: profile.id,
      teacher_name: profile.name, attachment_url, attachment_name,
    }).select('*, submissions(*)').single()
    if (data) {
      setAssignments(prev => [data, ...prev])
      for (const s of students) await pushNotification(s.id, `📋 New assignment: "${newAssign.title}"`, 'assignment')
    }
    setNewAssign({ title:'', description:'', due_date:'' })
    setAssignFile(null)
    if (assignFileRef.current) assignFileRef.current.value = ''
    setAssignModal(false); setAssignUploading(false)
  }

  const deleteAssignment = async (id: string) => {
    await supabase.from('assignments').delete().eq('id', id)
    setAssignments(prev => prev.filter(a => a.id !== id))
    if (activeAssign?.id === id) setActiveAssign(null)
  }

  const submitGrade = async () => {
    if (!gradingSubmission || !gradeForm.score) return
    await supabase.from('submissions').update({
      score: parseInt(gradeForm.score), grade: gradeForm.score + '%', feedback: gradeForm.feedback,
    }).eq('id', gradingSubmission.id)
    if (gradingSubmission.student_id)
      await pushNotification(gradingSubmission.student_id, `📝 "${activeAssign?.title}" graded: ${gradeForm.score}%`, 'grade')
    setGradingSubmission(null); setGradeForm({ score:'', feedback:'' })
    if (activeAssign) await refreshActiveAssign(activeAssign.id)
  }

  const postAnnouncement = async () => {
    if (!newAnnounce.title || !newAnnounce.body || !profile) return
    await supabase.from('announcements').insert({ ...newAnnounce, target:'students', author_id:profile.id, author_name:profile.name, role:'teacher' })
    for (const s of students) await pushNotification(s.id, `📢 ${profile.name}: ${newAnnounce.title}`, 'announcement')
    await logActivity(`Teacher ${profile.name} posted: ${newAnnounce.title}`, 'announcement')
    setNewAnnounce({ title:'', body:'', pinned:false }); setAnnounceModal(false)
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending:false })
    if (data) setAnnouncements(data)
  }

  const navItems = [
    { id:'home',          label:'Overview',        icon:'home'     },
    { section:'Teaching' },
    { id:'tests',         label:'Tests & Quizzes',  icon:'test'     },
    { id:'timetable',     label:'Timetable',        icon:'calendar' },
    { id:'courses',       label:'Courses',          icon:'book'     },
    { id:'assignments',   label:'Assignments',      icon:'task'     },
    { id:'analytics',     label:'Analytics',        icon:'chart'    },
    { id:'announcements', label:'Announcements',    icon:'bell'     },
    { id:'forums',        label:'Forums',           icon:'chat'     },
    { section:'Account' },
    { id:'profile',       label:'My Profile',       icon:'user'     },
  ]

  const myTests   = tests.filter(t => t.type==='test')
  const myQuizzes = tests.filter(t => t.type==='quiz')

  if (!profile) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', fontFamily:'var(--mono)', fontSize:12, color:'var(--fg-dim)' }}>Loading...</div>
  )

  const QBTest = questionBank ? tests.find(t => t.id===questionBank.id) || questionBank : null

  return (
    <Layout profile={profile} navItems={navItems} activeTab={tab} onTabChange={t=>{ setTab(t); if(t!=='courses') setActiveCourse(null); if(t!=='forums'){ setActivePost(null); setForumComments([]) } if(t==='forums') fetchForumPosts() }}>
      {showProfile && <ProfileModal profile={profile} onClose={()=>setShowProfile(false)} onUpdate={p=>setProfile(p)} />}

      {/* ── Timetable Modal ── */}
      {ttModal && (
        <div className="modal-overlay" onClick={()=>setTtModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">{ttEdit?'Edit Slot':'Add Timetable Slot'}</div>
            <div style={{ marginBottom:14 }}>
              <label className="label">Subject</label>
              <input className="input" value={newSlot.subject} onChange={e=>setNewSlot(s=>({...s,subject:e.target.value}))} placeholder="e.g. Mathematics" />
            </div>
            <div className="grid-2" style={{ marginBottom:14 }}>
              <div>
                <label className="label">Day</label>
                <select className="input" value={newSlot.day} onChange={e=>setNewSlot(s=>({...s,day:e.target.value}))}>
                  {DAYS.map(d=><option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Time (e.g. 09:00 - 10:30)</label>
                <input className="input" value={newSlot.time} onChange={e=>setNewSlot(s=>({...s,time:e.target.value}))} placeholder="09:00 - 10:30" />
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <label className="label">Room / Jitsi Meet ID (optional)</label>
              <input className="input" value={newSlot.room} onChange={e=>setNewSlot(s=>({...s,room:e.target.value}))} placeholder="e.g. qgx-math-101" />
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginTop:6 }}>
                Students join at: meet.jit.si/<strong>{newSlot.room||'auto-generated'}</strong>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={saveSlot}>{ttEdit?'Save Changes':'Add Slot'}</button>
              <button className="btn" onClick={()=>setTtModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Course Create Modal ── */}
      {courseModal && (
        <div className="modal-overlay" onClick={()=>setCourseModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Create New Course</div>
            <div style={{ marginBottom:14 }}>
              <label className="label">Course Title</label>
              <input className="input" value={newCourse.title} onChange={e=>setNewCourse(c=>({...c,title:e.target.value}))} placeholder="e.g. Advanced Mathematics" />
            </div>
            <div style={{ marginBottom:14 }}>
              <label className="label">Subject</label>
              <input className="input" value={newCourse.subject} onChange={e=>setNewCourse(c=>({...c,subject:e.target.value}))} placeholder="e.g. Mathematics" />
            </div>
            <div style={{ marginBottom:20 }}>
              <label className="label">Description</label>
              <textarea className="input" rows={3} value={newCourse.description} onChange={e=>setNewCourse(c=>({...c,description:e.target.value}))} placeholder="What will students learn?" />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={createCourse}>Create Course</button>
              <button className="btn" onClick={()=>setCourseModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Test Create Modal ── */}
      {testModal && (
        <div className="modal-overlay" onClick={()=>setTestModal(false)}>
          <div className="modal" style={{ width:580 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Create {newTest.type==='quiz'?'Quiz':'Test'}</div>
            <div className="grid-2" style={{ marginBottom:14 }}>
              <div><label className="label">Type</label>
                <select className="input" value={newTest.type} onChange={e=>setNewTest(f=>({...f,type:e.target.value as any}))}>
                  <option value="test">Test (Scheduled)</option>
                  <option value="quiz">Quiz (Anytime)</option>
                </select>
              </div>
              <div><label className="label">Duration (min)</label>
                <input className="input" type="number" value={newTest.duration} onChange={e=>setNewTest(f=>({...f,duration:+e.target.value}))} />
              </div>
            </div>
            {[['title','Title','text'],['subject','Subject','text'],['scheduledDate','Date','date'],['scheduledTime','Time','time']].map(([k,lbl,t])=>(
              <div key={k} style={{ marginBottom:14 }}>
                <label className="label">{lbl}{k.startsWith('scheduled')&&newTest.type==='quiz'?' (optional)':''}</label>
                <input className="input" type={t} value={(newTest as any)[k]||''} onChange={e=>setNewTest(f=>({...f,[k]:e.target.value}))} />
              </div>
            ))}
            <div style={{ marginBottom:14 }}>
              <button className="btn btn-sm" style={{ marginBottom:10 }} onClick={()=>setShowAC(s=>!s)}>{showAC?'▲':'▼'} Anti-Cheat Settings</button>
              {showAC && (
                <div style={{ border:'1px solid var(--border)', padding:16 }}>
                  {[['tabSwitch','Tab Switch Detection'],['copyPaste','Block Copy-Paste'],['randomQ','Randomize Question Order'],['randomOpts','Randomize Option Order'],['fullscreen','Require Fullscreen']].map(([k,lbl])=>(
                    <label key={k} style={{ display:'flex', alignItems:'center', gap:8, fontFamily:'var(--mono)', fontSize:11, cursor:'pointer', marginBottom:8 }}>
                      <input type="checkbox" checked={(antiCheat as any)[k]} onChange={e=>setAntiCheat(a=>({...a,[k]:e.target.checked}))} /> {lbl}
                    </label>
                  ))}
                  <div className="grid-2" style={{ marginTop:8 }}>
                    <div><label className="label">Time Per Q (sec, 0=off)</label><input className="input" type="number" value={antiCheat.timePerQ} onChange={e=>setAntiCheat(a=>({...a,timePerQ:+e.target.value}))} /></div>
                    <div><label className="label">Max Attempts</label><input className="input" type="number" min={1} max={5} value={antiCheat.maxAttempts} onChange={e=>setAntiCheat(a=>({...a,maxAttempts:+e.target.value}))} /></div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={createTest}>Create & Add Questions</button>
              <button className="btn" onClick={()=>setTestModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Question Modal ── */}
      {qManualModal && (
        <div className="modal-overlay" onClick={()=>{setQManualModal(false);setQStep(1)}}>
          <div className="modal" style={{ width:580 }} onClick={e=>e.stopPropagation()}>
            <div className="modal-title">Add Question Manually</div>
            {qStep===1 && (
              <>
                <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginBottom:16 }}>SELECT QUESTION TYPE</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {[['mcq','MCQ — Single Correct'],['msq','MSQ — Multi Select'],['tf','True / False'],['fib','Fill in the Blank'],['match','Match the Following']].map(([t,lbl])=>(
                    <button key={t} className={`btn btn-sm ${qType===t?'btn-primary':''}`} onClick={()=>{setQType(t as any);setQStep(2)}}>{lbl}</button>
                  ))}
                </div>
              </>
            )}
            {qStep===2 && (
              <>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:12 }}>{qType.toUpperCase()}</div>
                <div style={{ marginBottom:14 }}>
                  <label className="label">Question Text{qType==='fib'?' (use ____ for blank)':''}</label>
                  <textarea className="input" rows={3} value={qForm.text} onChange={e=>setQForm((f:any)=>({...f,text:e.target.value}))} />
                </div>
                {(qType==='mcq'||qType==='msq') && qForm.options.map((opt:string,i:number)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    {qType==='mcq'
                      ? <input type="radio" name="mcq-ans" checked={qForm.answer===i} onChange={()=>setQForm((f:any)=>({...f,answer:i}))} />
                      : <input type="checkbox" checked={(qForm.msqAnswers||[]).includes(i)} onChange={e=>setQForm((f:any)=>({...f,msqAnswers:e.target.checked?[...(f.msqAnswers||[]),i]:(f.msqAnswers||[]).filter((x:number)=>x!==i)}))} />
                    }
                    <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', width:16 }}>{['A','B','C','D'][i]}</span>
                    <input className="input" value={opt} onChange={e=>setQForm((f:any)=>({...f,options:f.options.map((o:string,j:number)=>j===i?e.target.value:o)}))} style={{ flex:1 }} placeholder={`Option ${['A','B','C','D'][i]}`} />
                  </div>
                ))}
                {qType==='tf' && (
                  <div style={{ display:'flex', gap:12, marginBottom:12 }}>
                    {[true,false].map(v=>(
                      <label key={String(v)} style={{ display:'flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:12, cursor:'pointer' }}>
                        <input type="radio" checked={qForm.answer===v} onChange={()=>setQForm((f:any)=>({...f,answer:v}))} /> {v?'TRUE':'FALSE'}
                      </label>
                    ))}
                  </div>
                )}
                {qType==='fib' && (
                  <div style={{ marginBottom:14 }}>
                    <label className="label">Correct Answer</label>
                    <input className="input" value={qForm.answer||''} onChange={e=>setQForm((f:any)=>({...f,answer:e.target.value}))} />
                  </div>
                )}
                {qType==='match' && (
                  <div style={{ marginBottom:14 }}>
                    <div className="grid-2" style={{ marginBottom:6 }}>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>COLUMN A</div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>COLUMN B</div>
                    </div>
                    {qForm.pairs.map((p:any,i:number)=>(
                      <div key={i} className="grid-2" style={{ gap:8, marginBottom:8 }}>
                        <input className="input" value={p.left} onChange={e=>setQForm((f:any)=>({...f,pairs:f.pairs.map((x:any,j:number)=>j===i?{...x,left:e.target.value}:x)}))} placeholder={`Left ${i+1}`} />
                        <input className="input" value={p.right} onChange={e=>setQForm((f:any)=>({...f,pairs:f.pairs.map((x:any,j:number)=>j===i?{...x,right:e.target.value}:x)}))} placeholder={`Right ${i+1}`} />
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                  <label className="label" style={{ marginBottom:0 }}>Marks</label>
                  <input className="input" type="number" min={1} max={10} value={qForm.marks} onChange={e=>setQForm((f:any)=>({...f,marks:+e.target.value}))} style={{ width:80 }} />
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-primary" onClick={saveManualQuestion}>Save Question</button>
                  <button className="btn" onClick={()=>setQStep(1)}>← Back</button>
                  <button className="btn" onClick={()=>{setQManualModal(false);setQStep(1)}}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── AI Modal ── */}
      {aiModal && (
        <div className="modal-overlay" onClick={()=>setAiModal(false)}>
          <div className="modal" style={{ width:600 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Icon name="ai" size={18} />
                <div className="modal-title" style={{ marginBottom:0 }}>AI Question Generator</div>
                <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--success)', border:'1px solid var(--success)', padding:'2px 6px' }}>GROQ</span>
              </div>
              <button className="btn btn-sm" onClick={()=>setAiModal(false)}><Icon name="x" /></button>
            </div>
            <div className="grid-2" style={{ marginBottom:14 }}>
              <div><label className="label">Type</label>
                <select className="input" value={aiType} onChange={e=>setAiType(e.target.value)}>
                  <option value="mcq">MCQ</option><option value="tf">True/False</option><option value="fib">Fill in Blank</option>
                </select>
              </div>
              <div><label className="label">Count</label>
                <input className="input" type="number" min={1} max={20} value={aiCount} onChange={e=>setAiCount(+e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label className="label">Topic</label>
              <input className="input" value={aiTopic} onChange={e=>setAiTopic(e.target.value)} placeholder="e.g. Calculus, Data Structures..." onKeyDown={e=>e.key==='Enter'&&callGroqAI()} />
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <button className="btn btn-primary btn-sm" onClick={callGroqAI} disabled={aiLoading||!aiTopic}>
                {aiLoading?<><span className="spinner"/> Generating...</>:<><Icon name="ai" size={12}/> Generate</>}
              </button>
              {aiResult&&!aiResult[0]?.error&&(
                <button className="btn btn-sm" style={{ borderColor:'var(--success)', color:'var(--success)' }} onClick={injectAiQuestions}>
                  <Icon name="check" size={12}/> Add to Test ({aiResult.length})
                </button>
              )}
            </div>
            {aiResult&&(
              <div style={{ maxHeight:280, overflowY:'auto', border:'1px solid var(--border)', padding:12 }}>
                {aiResult[0]?.error
                  ?<div style={{ color:'var(--danger)', fontFamily:'var(--mono)', fontSize:11 }}>Error: {aiResult[0].error}</div>
                  :aiResult.map((q,i)=>(
                    <div key={i} style={{ marginBottom:10, paddingBottom:10, borderBottom:'1px solid rgba(128,128,128,0.08)' }}>
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:4 }}>Q{i+1} · {q.type?.toUpperCase()} · {q.marks} mark{q.marks!==1?'s':''}</div>
                      <div style={{ fontSize:13 }}>{q.text}</div>
                      {q.options&&<div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                        {q.options.map((o:string,j:number)=><span key={j} style={{ fontFamily:'var(--mono)', fontSize:10, padding:'2px 8px', border:`1px solid ${j===q.answer?'var(--success)':'var(--border)'}`, color:j===q.answer?'var(--success)':'var(--fg-dim)' }}>{o}</span>)}
                      </div>}
                      {q.type==='tf'&&<div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--success)', marginTop:4 }}>Answer: {q.answer?'True':'False'}</div>}
                      {q.type==='fib'&&<div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--success)', marginTop:4 }}>Answer: {q.answer}</div>}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Announce Modal ── */}
      {announceModal && (
        <div className="modal-overlay" onClick={()=>setAnnounceModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">New Announcement</div>
            <div style={{ marginBottom:14 }}><label className="label">Title</label><input className="input" value={newAnnounce.title} onChange={e=>setNewAnnounce(a=>({...a,title:e.target.value}))} /></div>
            <div style={{ marginBottom:14 }}><label className="label">Message</label><textarea className="input" rows={4} value={newAnnounce.body} onChange={e=>setNewAnnounce(a=>({...a,body:e.target.value}))} /></div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={postAnnouncement}>Post</button>
              <button className="btn" onClick={()=>setAnnounceModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="page">
        {tab==='home' && (
          <>
            <div className="page-title fade-up">TEACHER OVERVIEW</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:28 }}>Welcome, {profile.name}</div>
            <div className="grid-4 fade-up-2" style={{ marginBottom:24 }}>
              {[['My Tests',myTests.length],['My Quizzes',myQuizzes.length],['Courses',courses.length],['Timetable Slots',timetable.length]].map(([lbl,val])=>(
                <div key={String(lbl)} className="stat-card"><div className="stat-val">{val}</div><div className="stat-label">{lbl}</div></div>
              ))}
            </div>
            <div className="fade-up-3">
              <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>Announcements</div>
              {announcements.slice(0,3).map((a:any)=><AnnouncementCard key={a.id} a={a} canDelete={false} />)}
            </div>
          </>
        )}

        {/* ── TIMETABLE ── */}
        {tab==='timetable' && (
          <>
            <div className="page-title fade-up">TIMETABLE</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:24 }}>Manage your class schedule</div>
            <div style={{ marginBottom:20 }} className="fade-up-2">
              <button className="btn btn-primary btn-sm" onClick={openAddSlot}><Icon name="plus" size={12}/> Add Slot</button>
            </div>
            {timetable.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No timetable slots yet.</div>}
            {DAYS.map(day=>{
              const slots = timetable.filter(s=>s.day===day)
              if (!slots.length) return null
              return (
                <div key={day} style={{ marginBottom:20 }} className="fade-up">
                  <div style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:'0.15em', textTransform:'uppercase', color:'var(--fg-dim)', marginBottom:8, paddingBottom:4, borderBottom:'1px solid var(--border)' }}>{day}</div>
                  {slots.map((s:any)=>(
                    <div key={s.id} className="card" style={{ marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontWeight:500, marginBottom:4 }}>{s.subject}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:4 }}>{s.time}</div>
                        <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>
                          Room: <span style={{ color:'var(--fg)' }}>{s.room}</span>
                          <span style={{ marginLeft:8, color:'var(--success)' }}>meet.jit.si/{s.room}</span>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-xs" onClick={()=>openEditSlot(s)}><Icon name="edit" size={10}/></button>
                        <button className="btn btn-xs btn-danger" onClick={()=>deleteSlot(s.id)}><Icon name="trash" size={10}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </>
        )}

        {/* ── COURSES LIST ── */}
        {tab==='courses' && !activeCourse && (
          <>
            <div className="page-title fade-up">MY COURSES</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:24 }}>Create courses and upload files for students</div>
            <div style={{ marginBottom:20 }} className="fade-up-2">
              <button className="btn btn-primary btn-sm" onClick={()=>setCourseModal(true)}><Icon name="plus" size={12}/> New Course</button>
            </div>
            {courses.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No courses yet.</div>}
            {courses.map(c=>(
              <div key={c.id} className="card fade-up" style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:15, marginBottom:4 }}>{c.title}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginBottom:6 }}>{c.subject}</div>
                    <div style={{ fontSize:13, color:'var(--fg-dim)', marginBottom:8 }}>{c.description}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>
                      {c._fileCount !== undefined ? c._fileCount : '—'} files
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, marginLeft:12 }}>
                    <button className="btn btn-xs" onClick={()=>openCourse(c.id)} disabled={courseLoading}>
                      <Icon name="edit" size={10}/> {courseLoading ? '...' : 'Manage'}
                    </button>
                    <button className="btn btn-xs btn-danger" onClick={()=>deleteCourse(c.id)}><Icon name="trash" size={10}/></button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── COURSE DETAIL ── */}
        {tab==='courses' && activeCourse && (
          <div className="fade-up">
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button className="btn btn-sm" onClick={()=>setActiveCourse(null)}>← Back</button>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'var(--display)', fontSize:22, letterSpacing:'0.08em' }}>{activeCourse.title}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)' }}>
                  {activeCourse.subject} · {activeCourse.course_files?.length||0} file{activeCourse.course_files?.length!==1?'s':''}
                </div>
              </div>
              <button
                className="btn btn-xs"
                onClick={()=>refreshActiveCourse(activeCourse.id)}
                disabled={courseLoading}
              >
                {courseLoading ? '...' : '↻ Refresh'}
              </button>
            </div>

            {/* Upload */}
            <div className="card" style={{ marginBottom:20, padding:20 }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>Upload File</div>
              <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.mp4,.mov,.zip"
                  onChange={e=>setUploadFile(e.target.files?.[0]||null)}
                  style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--fg)' }}
                />
                <button className="btn btn-primary btn-sm" onClick={uploadCourseFile} disabled={!uploadFile||uploading}>
                  {uploading?<><span className="spinner"/> Uploading...</>:<><Icon name="upload" size={12}/> Upload</>}
                </button>
              </div>
              {courseStatus && (
                <div style={{ fontFamily:'var(--mono)', fontSize:11, color:courseStatus.startsWith('✅')?'var(--success)':'var(--danger)', marginTop:10 }}>
                  {courseStatus}
                </div>
              )}
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginTop:8 }}>
                Supports: PDF, Word, PowerPoint, Excel, Images, Videos, ZIP
              </div>
            </div>

            {/* Files */}
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>
              Files ({activeCourse.course_files?.length||0})
            </div>

            {courseLoading && (
              <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12, padding:'12px 0' }}>
                Loading files...
              </div>
            )}

            {!courseLoading && (!activeCourse.course_files || activeCourse.course_files.length===0) && (
              <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12, padding:'20px 0' }}>
                No files yet. Upload your first file above.
              </div>
            )}

            {!courseLoading && activeCourse.course_files?.map((f:any)=>(
              <div key={f.id} className="card" style={{ marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:20 }}>{getFileIcon(f.type)}</span>
                  <div>
                    <div style={{ fontWeight:500, fontSize:13, marginBottom:2 }}>{f.name}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>
                      {formatSize(f.size)}{f.size?' · ':''}uploaded {new Date(f.created_at||Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="btn btn-xs" style={{ borderColor:'var(--success)', color:'var(--success)', textDecoration:'none' }}>
                      <Icon name="download" size={10}/> View
                    </a>
                  )}
                  <button className="btn btn-xs btn-danger" onClick={()=>deleteCourseFile(f)} disabled={courseLoading}>
                    <Icon name="trash" size={10}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TESTS ── */}
        {tab==='tests' && !QBTest && (
          <>
            <div className="page-title fade-up">TESTS & QUIZZES</div>
            <div style={{ display:'flex', gap:8, marginBottom:20 }} className="fade-up-1">
              <button className={`btn btn-sm ${subTab==='tests'?'btn-primary':''}`} onClick={()=>setSubTab('tests')}>Tests</button>
              <button className={`btn btn-sm ${subTab==='quizzes'?'btn-primary':''}`} onClick={()=>setSubTab('quizzes')}>Quizzes</button>
            </div>
            <div style={{ marginBottom:16 }} className="fade-up-2">
              <button className="btn btn-primary btn-sm" onClick={()=>{ setNewTest(f=>({...f,type:subTab==='quizzes'?'quiz':'test'})); setTestModal(true) }}>
                <Icon name="plus" size={12}/> New {subTab==='quizzes'?'Quiz':'Test'}
              </button>
            </div>
            {(subTab==='tests'?myTests:myQuizzes).map(t=>(
              <div key={t.id} className="card fade-up" style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span className="mono" style={{ fontSize:10, color:'var(--fg-dim)' }}>{t.id}</span>
                      <span style={{ fontWeight:500 }}>{t.title}</span>
                      <span className="tag tag-info">{t.status}</span>
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>
                      {t.scheduled_date&&<>{t.scheduled_date} {t.scheduled_time} · </>}{t.duration} min · {t.questions?.length||0} questions · {t.total_marks} marks
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-xs" onClick={()=>setQuestionBank(t)}><Icon name="edit" size={10}/> Questions</button>
                    <button className="btn btn-xs btn-danger" onClick={()=>deleteTest(t.id)}><Icon name="trash" size={10}/></button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab==='tests' && QBTest && (
          <div className="fade-up">
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button className="btn btn-sm" onClick={()=>setQuestionBank(null)}>← Back</button>
              <div>
                <span style={{ fontFamily:'var(--display)', fontSize:22, letterSpacing:'0.08em' }}>{QBTest.title}</span>
                <span className="mono" style={{ fontSize:11, color:'var(--fg-dim)', marginLeft:10 }}>{QBTest.id} · {QBTest.questions?.length||0} questions · {QBTest.total_marks} marks</span>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <button className="btn btn-sm" onClick={()=>setQManualModal(true)}><Icon name="plus" size={12}/> Add Manually</button>
              <button className="btn btn-sm" style={{ borderColor:'var(--success)', color:'var(--success)' }} onClick={()=>setAiModal(true)}><Icon name="ai" size={12}/> AI Generate</button>
            </div>
            {(!QBTest.questions||QBTest.questions.length===0)&&<div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12, padding:20 }}>No questions yet.</div>}
            {QBTest.questions?.map((q,i)=>(
              <div key={q.id} className="card" style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:4 }}>Q{i+1} · {q.type?.toUpperCase()} · {q.marks} mark{q.marks!==1?'s':''}</div>
                    <div style={{ fontSize:13, marginBottom:8 }}>{q.text}</div>
                    {q.options&&<div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                      {(q.options as string[]).map((o,j)=><span key={j} style={{ fontFamily:'var(--mono)', fontSize:10, padding:'2px 8px', border:`1px solid ${j===q.answer?'var(--success)':'var(--border)'}`, color:j===q.answer?'var(--success)':'var(--fg-dim)' }}>{o}</span>)}
                    </div>}
                    {q.type==='tf'&&<span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--success)' }}>Answer: {q.answer?'True':'False'}</span>}
                    {q.type==='fib'&&<span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--success)' }}>Answer: {String(q.answer)}</span>}
                    {q.type==='msq'&&<div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--success)' }}>Correct: {(q.answer as number[])?.map(i=>['A','B','C','D'][i]).join(', ')}</div>}
                    {q.type==='match'&&<div style={{ marginTop:6 }}>{(q.answer as any[])?.map((p,i)=><div key={i} style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)' }}>{p.left} → {p.right}</div>)}</div>}
                  </div>
                  <button className="btn btn-xs btn-danger" style={{ marginLeft:10 }} onClick={()=>deleteQuestion(q.id)}><Icon name="trash" size={10}/></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==='assignments' && !activeAssign && (
          <>
            {/* Create Assignment Modal */}
            {assignModal && (
              <div className="modal-overlay" onClick={()=>setAssignModal(false)}>
                <div className="modal" style={{ width:540 }} onClick={e=>e.stopPropagation()}>
                  <div className="modal-title">Create Assignment</div>
                  <div style={{ marginBottom:14 }}>
                    <label className="label">Title</label>
                    <input className="input" value={newAssign.title} onChange={e=>setNewAssign(a=>({...a,title:e.target.value}))} placeholder="e.g. Unit 2 Essay" />
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label className="label">Description / Instructions</label>
                    <textarea className="input" rows={4} value={newAssign.description} onChange={e=>setNewAssign(a=>({...a,description:e.target.value}))} placeholder="Describe the task, requirements, rubric..." />
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label className="label">Due Date</label>
                    <input className="input" type="date" value={newAssign.due_date} onChange={e=>setNewAssign(a=>({...a,due_date:e.target.value}))} />
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label className="label">Attach File (optional — PDF, doc, image)</label>
                    <input ref={assignFileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.zip"
                      onChange={e=>setAssignFile(e.target.files?.[0]||null)}
                      style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--fg)' }} />
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-primary" onClick={createAssignment} disabled={assignUploading}>
                      {assignUploading ? <><span className="spinner"/> Creating...</> : 'Create Assignment'}
                    </button>
                    <button className="btn" onClick={()=>setAssignModal(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            <div className="page-title fade-up">ASSIGNMENTS</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:24 }}>All students can see and submit assignments</div>
            <div style={{ marginBottom:20 }} className="fade-up-2">
              <button className="btn btn-primary btn-sm" onClick={()=>setAssignModal(true)}><Icon name="plus" size={12}/> New Assignment</button>
            </div>
            {assignments.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No assignments yet.</div>}
            {assignments.map((a:any)=>(
              <div key={a.id} className="card fade-up" style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:15, marginBottom:4 }}>{a.title}</div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:6 }}>
                      Due: {a.due_date||'No deadline'} · {a.submissions?.length||0} submission{a.submissions?.length!==1?'s':''}
                      {a.submissions?.filter((s:any)=>!s.grade).length > 0 &&
                        <span style={{ color:'var(--warn)', marginLeft:8 }}>⚠ {a.submissions.filter((s:any)=>!s.grade).length} ungraded</span>
                      }
                    </div>
                    <div style={{ fontSize:13, color:'var(--fg-dim)' }}>{a.description?.slice(0,100)}{a.description?.length>100?'...':''}</div>
                    {a.attachment_name && (
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--success)', marginTop:6 }}>📎 {a.attachment_name}</div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:6, marginLeft:12 }}>
                    <button className="btn btn-xs" onClick={()=>refreshActiveAssign(a.id)}><Icon name="edit" size={10}/> View</button>
                    <button className="btn btn-xs btn-danger" onClick={()=>deleteAssignment(a.id)}><Icon name="trash" size={10}/></button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── ASSIGNMENT DETAIL (grading view) ── */}
        {tab==='assignments' && activeAssign && (
          <div className="fade-up">
            {/* Grade Modal */}
            {gradingSubmission && (
              <div className="modal-overlay" onClick={()=>setGradingSubmission(null)}>
                <div className="modal" style={{ width:480 }} onClick={e=>e.stopPropagation()}>
                  <div className="modal-title">Grade Submission</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginBottom:16 }}>
                    {gradingSubmission.student_name || gradingSubmission.student_id}
                  </div>
                  {gradingSubmission.text_response && (
                    <div style={{ marginBottom:16 }}>
                      <label className="label">Student Response</label>
                      <div className="card" style={{ padding:12, fontSize:13, color:'var(--fg-dim)', maxHeight:160, overflowY:'auto' }}>
                        {gradingSubmission.text_response}
                      </div>
                    </div>
                  )}
                  {gradingSubmission.file_url && (
                    <div style={{ marginBottom:16 }}>
                      <label className="label">Submitted File</label>
                      <a href={gradingSubmission.file_url} target="_blank" rel="noopener noreferrer"
                        className="btn btn-xs" style={{ borderColor:'var(--success)', color:'var(--success)', textDecoration:'none' }}>
                        <Icon name="download" size={10}/> {gradingSubmission.file_name||'View File'}
                      </a>
                    </div>
                  )}
                  <div style={{ marginBottom:14 }}>
                    <label className="label">Score (0–100)</label>
                    <input className="input" type="number" min={0} max={100} value={gradeForm.score}
                      onChange={e=>setGradeForm(f=>({...f,score:e.target.value}))} placeholder="e.g. 85" style={{ width:120 }} />
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <label className="label">Feedback (optional)</label>
                    <textarea className="input" rows={3} value={gradeForm.feedback}
                      onChange={e=>setGradeForm(f=>({...f,feedback:e.target.value}))} placeholder="Written feedback for student..." />
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button className="btn btn-primary" onClick={submitGrade}>Submit Grade</button>
                    <button className="btn" onClick={()=>setGradingSubmission(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button className="btn btn-sm" onClick={()=>setActiveAssign(null)}>← Back</button>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'var(--display)', fontSize:22, letterSpacing:'0.08em' }}>{activeAssign.title}</div>
                <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)' }}>
                  Due: {activeAssign.due_date||'No deadline'} · {activeAssign.submissions?.length||0} submissions
                </div>
              </div>
              <button className="btn btn-xs" onClick={()=>refreshActiveAssign(activeAssign.id)} disabled={assignLoading}>
                {assignLoading ? '...' : '↻ Refresh'}
              </button>
            </div>
            <div className="card" style={{ padding:16, marginBottom:20, fontSize:13, color:'var(--fg-dim)' }}>
              {activeAssign.description}
              {activeAssign.attachment_url && (
                <div style={{ marginTop:10 }}>
                  <a href={activeAssign.attachment_url} target="_blank" rel="noopener noreferrer"
                    className="btn btn-xs" style={{ borderColor:'var(--success)', color:'var(--success)', textDecoration:'none' }}>
                    <Icon name="download" size={10}/> {activeAssign.attachment_name||'Download Attachment'}
                  </a>
                </div>
              )}
            </div>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12 }}>
              Submissions ({activeAssign.submissions?.length||0})
            </div>
            {assignLoading && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>Loading...</div>}
            {!assignLoading && (!activeAssign.submissions||activeAssign.submissions.length===0) && (
              <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No submissions yet.</div>
            )}
            {!assignLoading && activeAssign.submissions?.map((sub:any)=>{
              const student = students.find(s=>s.id===sub.student_id)
              return (
                <div key={sub.id} className="card" style={{ marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:500, fontSize:13, marginBottom:4 }}>
                      {student?.name || sub.student_id}
                      <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--fg-dim)', marginLeft:8 }}>{student?.qgx_id}</span>
                    </div>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:4 }}>
                      Submitted: {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : '—'}
                    </div>
                    {sub.text_response && (
                      <div style={{ fontSize:12, color:'var(--fg-dim)', fontStyle:'italic' }}>
                        "{sub.text_response.slice(0,80)}{sub.text_response.length>80?'...':''}"
                      </div>
                    )}
                    {sub.file_url && (
                      <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--success)', textDecoration:'none' }}>
                        📎 {sub.file_name||'Submitted file'}
                      </a>
                    )}
                    {sub.feedback && (
                      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginTop:4 }}>
                        Feedback: {sub.feedback}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, marginLeft:12 }}>
                    {sub.grade
                      ? <span className="tag tag-success">{sub.grade}</span>
                      : <span className="tag tag-warn">Ungraded</span>
                    }
                    <button className="btn btn-xs" onClick={()=>{ setGradingSubmission({...sub, student_name: student?.name}); setGradeForm({ score: sub.score?.toString()||'', feedback: sub.feedback||'' }) }}>
                      <Icon name="edit" size={10}/> {sub.grade ? 'Re-grade' : 'Grade'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab==='analytics' && (
          <>
            <div className="page-title fade-up">ANALYTICS</div>
            <div className="page-sub fade-up-1" style={{ marginBottom:28 }}>Performance insights</div>
            {tests.map(t=>{
              const tAttempts = allAttempts.filter(a=>a.test_id===t.id)
              if (!tAttempts.length) return null
              const avg  = Math.round(tAttempts.reduce((s,a)=>s+(a.percent||0),0)/tAttempts.length)
              const high = Math.max(...tAttempts.map(a=>a.percent||0))
              const low  = Math.min(...tAttempts.map(a=>a.percent||0))
              const pass = tAttempts.filter(a=>(a.percent||0)>=60).length
              return (
                <div key={t.id} className="card fade-up" style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                    <div><span className="mono" style={{ fontSize:10, color:'var(--fg-dim)' }}>{t.id} · </span><span style={{ fontWeight:500 }}>{t.title}</span></div>
                    <div style={{ display:'flex', gap:16, fontFamily:'var(--mono)', fontSize:11 }}>
                      <span><span style={{ color:'var(--fg-dim)' }}>Attempts: </span>{tAttempts.length}</span>
                      <span><span style={{ color:'var(--fg-dim)' }}>Avg: </span><span style={{ color:avg>=70?'var(--success)':avg>=40?'var(--warn)':'var(--danger)' }}>{avg}%</span></span>
                      <span><span style={{ color:'var(--fg-dim)' }}>High: </span>{high}%</span>
                      <span><span style={{ color:'var(--fg-dim)' }}>Low: </span>{low}%</span>
                      <span><span style={{ color:'var(--fg-dim)' }}>Pass: </span>{pass}/{tAttempts.length}</span>
                    </div>
                  </div>
                  {tAttempts.map(a=>{
                    const student = students.find(s=>s.id===a.student_id)
                    return (
                      <div key={a.id} style={{ marginBottom:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'var(--mono)', fontSize:10, marginBottom:3 }}>
                          <span>{student?.name||a.student_id}</span><span>{a.percent}%</span>
                        </div>
                        <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                          <div style={{ height:'100%', width:`${a.percent}%`, background:a.percent>=70?'var(--success)':a.percent>=40?'var(--warn)':'var(--danger)', borderRadius:2, transition:'width 0.8s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {tests.every(t=>allAttempts.filter(a=>a.test_id===t.id).length===0)&&(
              <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No attempts yet.</div>
            )}
          </>
        )}

        {tab==='announcements' && (
          <>
            <div className="page-title fade-up">ANNOUNCEMENTS</div>
            <div style={{ marginBottom:16 }} className="fade-up-1">
              <button className="btn btn-primary btn-sm" onClick={()=>setAnnounceModal(true)}><Icon name="plus" size={12}/> New Announcement</button>
            </div>
            <div className="fade-up-2">
              {announcements.filter((a:any)=>a.author_id===profile.id||a.role==='admin').map((a:any)=>(
                <AnnouncementCard key={a.id} a={a} canDelete={a.author_id===profile.id} onDelete={async id=>{ await supabase.from('announcements').delete().eq('id',id); setAnnouncements(prev=>prev.filter((x:any)=>x.id!==id)) }} />
              ))}
            </div>
          </>
        )}

        {tab==='forums' && !activePost && (
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
            <div className="page-sub fade-up-1" style={{ marginBottom:24 }}>Community discussion for everyone</div>
            <div style={{ marginBottom:20 }} className="fade-up-2">
              <button className="btn btn-primary btn-sm" onClick={()=>setPostModal(true)}><Icon name="plus" size={12}/> New Post</button>
            </div>
            {forumPosts.length===0 && <div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12 }}>No posts yet. Be the first to post!</div>}
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
                  <div style={{ display:'flex', gap:6, marginLeft:12 }} onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-xs" style={{ borderColor:'var(--warn)', color:'var(--warn)' }} onClick={()=>pinPost(post)}>
                      {post.pinned ? '📌 Unpin' : '📌 Pin'}
                    </button>
                    <button className="btn btn-xs btn-danger" onClick={()=>deletePost(post.id)}><Icon name="trash" size={10}/></button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab==='forums' && activePost && (
          <div className="fade-up">
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button className="btn btn-sm" onClick={()=>{ setActivePost(null); setForumComments([]) }}>← Back</button>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  {activePost.pinned && <span style={{ fontFamily:'var(--mono)', fontSize:9, color:'var(--warn)', border:'1px solid var(--warn)', padding:'1px 6px' }}>📌 PINNED</span>}
                  <div style={{ fontFamily:'var(--display)', fontSize:22, letterSpacing:'0.06em' }}>{activePost.title}</div>
                </div>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color: activePost.author_role==='teacher'?'var(--warn)':'var(--fg-dim)', marginTop:4 }}>
                  {activePost.author_name} · {activePost.author_role?.toUpperCase()} · {new Date(activePost.created_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-xs" style={{ borderColor:'var(--warn)', color:'var(--warn)' }} onClick={()=>pinPost(activePost)}>
                  {activePost.pinned ? '📌 Unpin' : '📌 Pin'}
                </button>
                <button className="btn btn-xs btn-danger" onClick={()=>deletePost(activePost.id)}><Icon name="trash" size={10}/></button>
              </div>
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
                  <button className="btn btn-xs btn-danger" style={{ marginLeft:10 }} onClick={()=>deleteComment(c.id)}><Icon name="trash" size={10}/></button>
                </div>
              </div>
            ))}
            {forumComments.length===0&&!postLoading&&<div style={{ color:'var(--fg-dim)', fontFamily:'var(--mono)', fontSize:12, marginBottom:16 }}>No comments yet.</div>}
            <div style={{ marginTop:16, display:'flex', gap:10 }}>
              <textarea className="input" rows={2} value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Write a comment..." style={{ flex:1, resize:'none' }}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); addComment() } }} />
              <button className="btn btn-primary" onClick={addComment} disabled={commentLoading||!newComment.trim()} style={{ alignSelf:'flex-end' }}>
                {commentLoading?<span className="spinner"/>: 'Post'}
              </button>
            </div>
          </div>
        )}

        {tab==='profile' && (
          <div style={{ maxWidth:480 }} className="fade-up">
            <div className="page-title" style={{ marginBottom:20 }}>MY PROFILE</div>
            <div className="card" style={{ padding:28 }}>
              <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:24 }}>
                <div style={{ width:72, height:72, border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'var(--display)', fontSize:28 }}>{profile.avatar}</div>
                <div>
                  <div style={{ fontSize:18, fontWeight:600 }}>{profile.name}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--fg-dim)', marginTop:2 }}>{profile.email}</div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--warn)', marginTop:2 }}>{profile.qgx_id}</div>
                  <span className="tag tag-warn" style={{ marginTop:6, fontSize:9 }}>TEACHER</span>
                </div>
              </div>
              <div className="divider" />
              {[['Bio',profile.bio],['Phone',profile.phone],['Subject',profile.subject],['Joined',profile.joined]].map(([k,v])=>(
                <div key={String(k)} style={{ marginBottom:12 }}><div className="label">{k}</div><div style={{ fontSize:13 }}>{String(v||'—')}</div></div>
              ))}
              <button className="btn btn-primary btn-sm" style={{ marginTop:12 }} onClick={()=>setShowProfile(true)}><Icon name="edit" size={11}/> Edit Profile</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}