import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// In-memory per-user rate limiter (10 requests/minute)
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10
const rateMap = new Map<string, number[]>()

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const timestamps = (rateMap.get(userId) || []).filter(t => now - t < RATE_WINDOW_MS)
  if (timestamps.length >= RATE_LIMIT) {
    rateMap.set(userId, timestamps)
    return true
  }
  timestamps.push(now)
  rateMap.set(userId, timestamps)
  return false
}

/** Validate AI-generated question structure */
function validateQuestion(q: any, type: string): boolean {
  if (!q || typeof q.text !== 'string' || !q.text.trim()) return false
  if (typeof q.marks !== 'number' || q.marks < 1 || q.marks > 10) return false
  if (type === 'mcq') {
    if (!Array.isArray(q.options) || q.options.length !== 4) return false
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) return false
  } else if (type === 'msq') {
    if (!Array.isArray(q.options) || q.options.length !== 4) return false
    if (!Array.isArray(q.answer) || q.answer.some((a: any) => typeof a !== 'number' || a < 0 || a > 3)) return false
  } else if (type === 'tf') {
    if (typeof q.answer !== 'boolean') return false
  } else if (type === 'fib') {
    if (typeof q.answer !== 'string' || !q.answer.trim()) return false
  }
  return true
}

export async function POST(req: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only teachers can generate AI questions
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (isRateLimited(user.id)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }

  const body = await req.json()

  // AI Tutor mode (student-facing)
  if (body.mode === 'tutor') {
    const { message, courseContext, history, file } = body
    if ((!message || typeof message !== 'string' || message.length > 2000) && !file) {
      return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY
    if (!GROQ_API_KEY) return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })

    // Process uploaded file if present
    let fileContext = ''
    let useVision = false
    let imageBase64 = ''
    let imageMime = ''

    if (file && typeof file === 'object' && file.data && file.type) {
      // Validate base64 data size (max ~5MB decoded)
      if (typeof file.data !== 'string' || file.data.length > 7_000_000) {
        return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
      }

      if (file.type === 'image') {
        useVision = true
        imageBase64 = file.data
        imageMime = file.mimeType || 'image/jpeg'
      } else if (file.type === 'pdf') {
        try {
          const pdfParse = (await import('pdf-parse')).default
          const buffer = Buffer.from(file.data, 'base64')
          const pdfData = await pdfParse(buffer)
          fileContext = pdfData.text.slice(0, 8000)
        } catch {
          return NextResponse.json({ error: 'Could not read PDF file' }, { status: 400 })
        }
      } else if (file.type === 'ppt') {
        try {
          const JSZip = (await import('jszip')).default
          const buffer = Buffer.from(file.data, 'base64')
          const zip = await JSZip.loadAsync(buffer)
          let text = ''
          const slideFiles = Object.keys(zip.files)
            .filter(name => /ppt\/slides\/slide\d+\.xml$/.test(name))
            .sort()
          for (const slideName of slideFiles) {
            const content = await zip.files[slideName].async('text')
            const matches = content.match(/<a:t>([^<]*)<\/a:t>/g) || []
            text += matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ') + '\n'
          }
          fileContext = text.slice(0, 8000)
        } catch {
          return NextResponse.json({ error: 'Could not read PPT file' }, { status: 400 })
        }
      }
    }

    const systemPrompt = `You are QGX AI Tutor, a helpful educational assistant for the QGX Learning Management System. ${courseContext ? `The student is studying: "${courseContext}".` : ''}${fileContext ? `\n\nThe user uploaded a document. Here is the extracted text content:\n---\n${fileContext}\n---` : ''}
Rules: 1) Be concise and educational. 2) Explain concepts clearly with examples. 3) If asked to solve homework, guide them through the process instead of giving direct answers. 4) Use simple language appropriate for students. 5) Stay on educational topics only.`

    const userContent = message || (file ? 'Analyze the uploaded file and explain its contents.' : '')

    if (useVision) {
      // Use vision model for images
      const visionMessages = [
        { role: 'system', content: systemPrompt },
        ...(Array.isArray(history) ? history.slice(-4) : []),
        {
          role: 'user',
          content: [
            { type: 'text', text: userContent },
            { type: 'image_url', image_url: { url: `data:${imageMime};base64,${imageBase64}` } },
          ],
        },
      ]

      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: 1500, temperature: 0.7, messages: visionMessages }),
        })
        if (!res.ok) return NextResponse.json({ error: 'AI vision service error' }, { status: res.status })
        const data = await res.json()
        return NextResponse.json({ reply: data.choices?.[0]?.message?.content || 'No response generated.' })
      } catch {
        return NextResponse.json({ error: 'AI vision generation failed' }, { status: 500 })
      }
    }

    // Standard text model (optionally with extracted document context)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-8) : []),
      { role: 'user', content: userContent },
    ]

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 1500, temperature: 0.7, messages }),
      })
      if (!res.ok) return NextResponse.json({ error: 'AI service error' }, { status: res.status })
      const data = await res.json()
      return NextResponse.json({ reply: data.choices?.[0]?.message?.content || 'No response generated.' })
    } catch {
      return NextResponse.json({ error: 'AI generation failed' }, { status: 500 })
    }
  }

  // Teacher question generation mode (original)
  if (!profile || profile.role !== 'teacher') {
    return NextResponse.json({ error: 'Forbidden: teachers only for question generation' }, { status: 403 })
  }

  const { topic, type, count, difficulty, bloom, file: teacherFile } = body

  if (!topic && !teacherFile) {
    return NextResponse.json({ error: 'Provide a topic or upload a file' }, { status: 400 })
  }
  if (!type || !count) {
    return NextResponse.json({ error: 'Missing required fields: type, count' }, { status: 400 })
  }

  // Reject excessively long topic strings
  if (topic && (typeof topic !== 'string' || topic.length > 500)) {
    return NextResponse.json({ error: 'Topic must be a string under 500 characters' }, { status: 400 })
  }

  // Server-side only — never exposed to client
  const GROQ_API_KEY = process.env.GROQ_API_KEY
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 })
  }

  // Extract text from uploaded file if present
  let teacherFileContext = ''
  let teacherUseVision = false
  let teacherImageBase64 = ''
  let teacherImageMime = ''

  if (teacherFile && typeof teacherFile === 'object' && teacherFile.data && teacherFile.type) {
    if (typeof teacherFile.data !== 'string' || teacherFile.data.length > 7_000_000) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 })
    }
    if (teacherFile.type === 'image') {
      teacherUseVision = true
      teacherImageBase64 = teacherFile.data
      teacherImageMime = teacherFile.mimeType || 'image/jpeg'
    } else if (teacherFile.type === 'pdf') {
      try {
        const pdfParse = (await import('pdf-parse')).default
        const buffer = Buffer.from(teacherFile.data, 'base64')
        const pdfData = await pdfParse(buffer)
        teacherFileContext = pdfData.text.slice(0, 8000)
      } catch {
        return NextResponse.json({ error: 'Could not read PDF file' }, { status: 400 })
      }
    } else if (teacherFile.type === 'ppt') {
      try {
        const JSZip = (await import('jszip')).default
        const buffer = Buffer.from(teacherFile.data, 'base64')
        const zip = await JSZip.loadAsync(buffer)
        let text = ''
        const slideFiles = Object.keys(zip.files)
          .filter(name => /ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort()
        for (const slideName of slideFiles) {
          const content = await zip.files[slideName].async('text')
          const matches = content.match(/<a:t>([^<]*)<\/a:t>/g) || []
          text += matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ') + '\n'
        }
        teacherFileContext = text.slice(0, 8000)
      } catch {
        return NextResponse.json({ error: 'Could not read PPT file' }, { status: 400 })
      }
    }
  }

  const safeCount = Math.min(Math.max(1, Number(count)), 20)

  const typeMap: Record<string, string> = {
    mcq: `Generate ${safeCount} MCQ questions. Each must have: "text"(string), "options"(array of exactly 4 strings), "answer"(number 0-3), "marks"(number 1-3).`,
    tf: `Generate ${safeCount} True/False questions. Each must have: "text"(string), "answer"(boolean), "marks"(number, always 1).`,
    fib: `Generate ${safeCount} Fill-in-the-blank questions. Each must have: "text"(string, use ____ for blank), "answer"(string), "marks"(number 1-2).`,
  }

  const topicStr = topic ? `Topic: "${topic}".` : 'Generate questions based on the uploaded content below.'
  const fileStr = teacherFileContext ? `\n\nSource material from uploaded document:\n---\n${teacherFileContext}\n---` : ''
  const prompt = `You are an expert educator. ${typeMap[type] || typeMap.mcq} ${topicStr} Difficulty: ${difficulty || 'medium'}. Bloom's taxonomy level: ${bloom || 'understand'}.${fileStr} Return ONLY a valid JSON array. No markdown, no backticks. Each object must include: "id"(unique string), "type"("${type}"), and all fields above.`

  // If teacher uploaded an image, use vision model
  if (teacherUseVision) {
    try {
      const visionMessages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${teacherImageMime};base64,${teacherImageBase64}` } },
          ],
        },
      ]
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'meta-llama/llama-4-scout-17b-16e-instruct', max_tokens: 2000, temperature: 0.7, messages: visionMessages }),
      })
      if (!res.ok) {
        const err = await res.json()
        return NextResponse.json({ error: err.error?.message || `AI vision error: ${res.status}` }, { status: res.status })
      }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || '[]'
      const start = text.indexOf('[')
      const end = text.lastIndexOf(']')
      const jsonStr = (start !== -1 && end > start) ? text.slice(start, end + 1) : '[]'
      let parsed
      try { parsed = JSON.parse(jsonStr) } catch { return NextResponse.json({ questions: [] }) }
      const validated = (Array.isArray(parsed) ? parsed : []).filter((q: any) => validateQuestion(q, type))
      return NextResponse.json({ questions: validated })
    } catch {
      return NextResponse.json({ error: 'AI vision generation failed' }, { status: 500 })
    }
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      return NextResponse.json(
        { error: err.error?.message || `AI service error: ${res.status}` },
        { status: res.status }
      )
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || '[]'
    // Extract JSON array robustly — find first [ and last ]
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    const jsonStr = (start !== -1 && end > start) ? text.slice(start, end + 1) : '[]'
    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return NextResponse.json({ questions: [] })
    }

    const validated = (Array.isArray(parsed) ? parsed : []).filter((q: any) => validateQuestion(q, type))
    return NextResponse.json({ questions: validated })
  } catch {
    return NextResponse.json(
      { error: 'AI generation failed' },
      { status: 500 }
    )
  }
}
