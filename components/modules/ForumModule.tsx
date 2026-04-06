'use client'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/lib/toast'
import type { Profile, ForumPost, ForumComment, ForumFlair } from '@/types'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { PAGE_SIZE } from '@/lib/constants'

/* ── helpers ─────────────────────────────────────────── */
const FLAIRS: { id: ForumFlair; label: string; color: string }[] = [
  { id: 'question',     label: 'Question',     color: '#3b82f6' },
  { id: 'discussion',   label: 'Discussion',   color: '#8b5cf6' },
  { id: 'help',         label: 'Help',         color: '#ef4444' },
  { id: 'resource',     label: 'Resource',     color: '#10b981' },
  { id: 'showcase',     label: 'Showcase',     color: '#f59e0b' },
  { id: 'announcement', label: 'Announcement', color: '#ec4899' },
]

const SUGGESTED_TAGS = ['math', 'science', 'english', 'history', 'coding', 'exam-prep', 'homework', 'project', 'study-tips', 'general']

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.jpg','.jpeg','.png','.gif','.mp4','.zip','.txt','.md']

function timeAgo(dateStr: string) {
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function flairObj(flair?: string) {
  return FLAIRS.find(f => f.id === flair) || null
}

const roleColor = (r: string) => r === 'teacher' ? 'var(--warn)' : r === 'admin' ? 'var(--danger)' : 'var(--fg-dim)'
const roleBadge = (r: string) => r === 'teacher' ? 'T' : r === 'admin' ? 'A' : 'S'

function getAttachmentIcon(type?: string) {
  if (!type) return '▸'
  if (type.includes('pdf')) return '▪'
  if (type.includes('image') || type.includes('jpg') || type.includes('png') || type.includes('gif') || type.includes('jpeg')) return '▪'
  if (type.includes('video') || type.includes('mp4')) return '▪'
  if (type.includes('zip') || type.includes('archive')) return '▪'
  if (type.includes('doc') || type.includes('word')) return '▪'
  if (type.includes('ppt') || type.includes('presentation')) return '▪'
  if (type.includes('xls') || type.includes('sheet')) return '▪'
  return '▸'
}

function isImage(type?: string, name?: string) {
  if (!type && !name) return false
  const t = (type || '').toLowerCase()
  const n = (name || '').toLowerCase()
  return t.includes('image') || t.includes('jpg') || t.includes('jpeg') || t.includes('png') || t.includes('gif') || t.includes('webp') ||
    /\.(jpg|jpeg|png|gif|webp)$/i.test(n)
}

/* ── simple markdown renderer ── */
function renderMd(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const html = escaped
    .replace(/```([\s\S]*?)```/g, '<pre class="fm-md-code-block">$1</pre>')
    .replace(/`([^`]+)`/g, '<code class="fm-md-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, label, url) => {
      const safeUrl = url.replace(/["'<>&]/g, '')
      const safeLabel = label.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow" class="fm-md-link">${safeLabel}</a>`
    })
    .replace(/^&gt; (.+)$/gm, '<blockquote class="fm-md-quote">$1</blockquote>')
    .replace(/\n/g, '<br />')
  return html
}

type SortMode = 'hot' | 'new' | 'top'
type CommentSort = 'newest' | 'oldest' | 'top'

/** Increment quest_progress for every active 'social' quest the student hasn't completed yet */
async function incrementSocialQuests(studentId: string) {
  try {
    const { data: quests } = await supabase
      .from('quests')
      .select('id, target_count')
      .eq('target_type', 'social')
      .eq('active', true)
    if (!quests?.length) return

    for (const quest of quests) {
      const { data: existing } = await supabase
        .from('quest_progress')
        .select('id, progress, completed')
        .eq('student_id', studentId)
        .eq('quest_id', quest.id)
        .maybeSingle()

      if (existing?.completed) continue

      const newProgress = (existing?.progress ?? 0) + 1
      const nowComplete = newProgress >= quest.target_count

      if (existing) {
        await supabase.from('quest_progress').update({
          progress: newProgress,
          completed: nowComplete,
          completed_at: nowComplete ? new Date().toISOString() : null,
        }).eq('id', existing.id)
      } else {
        await supabase.from('quest_progress').insert({
          student_id: studentId,
          quest_id: quest.id,
          progress: newProgress,
          completed: nowComplete,
          completed_at: nowComplete ? new Date().toISOString() : null,
        })
      }
    }
  } catch {
    // non-critical — don't block the user action
  }
}

/* ── component ───────────────────────────────────────── */
interface ForumModuleProps { profile: Profile }

export function ForumModule({ profile }: ForumModuleProps) {
  const { toast } = useToast()
  const [posts, setPosts]             = useState<ForumPost[]>([])
  const [activePost, setActivePost]   = useState<ForumPost | null>(null)
  const [comments, setComments]       = useState<ForumComment[]>([])
  const [postModal, setPostModal]     = useState(false)
  const [editingPost, setEditingPost] = useState<ForumPost | null>(null)
  const [showBookmarks, setShowBookmarks] = useState(false)

  // Create/edit form
  const [formTitle, setFormTitle]     = useState('')
  const [formBody, setFormBody]       = useState('')
  const [formFlair, setFormFlair]     = useState<ForumFlair | ''>('')
  const [formTags, setFormTags]       = useState<string[]>([])
  const [tagInput, setTagInput]       = useState('')
  const [attachment, setAttachment]   = useState<File | null>(null)
  const [uploading, setUploading]     = useState(false)
  const fileRef                       = useRef<HTMLInputElement>(null)

  // Feed controls
  const [sort, setSort]               = useState<SortMode>('hot')
  const [searchQ, setSearchQ]         = useState('')
  const [filterFlair, setFilterFlair] = useState<ForumFlair | ''>('')
  const [page, setPage]               = useState(0)

  // Comment state
  const [newComment, setNewComment]   = useState('')
  const [replyTo, setReplyTo]         = useState<ForumComment | null>(null)
  const [commentLoading, setCommentLoading] = useState(false)
  const [postLoading, setPostLoading] = useState(false)
  const [commentSort, setCommentSort] = useState<CommentSort>('oldest')
  const [postActionBusy, setPostActionBusy] = useState<Record<string, boolean>>({})
  const [commentActionBusy, setCommentActionBusy] = useState<Record<string, boolean>>({})

  const channelRef = useRef<any>(null)
  const commentChannelRef = useRef<any>(null)

  /* ── data fetching ── */
  const fetchPosts = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('forum_posts').select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      if (data) setPosts(data as ForumPost[])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load posts', 'error')
    }
  }, [toast])

  /* ── lifecycle ── */
  useEffect(() => {
    fetchPosts()
    channelRef.current = supabase.channel(`forum-${profile.role}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_posts' }, () => fetchPosts())
      .subscribe()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (commentChannelRef.current) supabase.removeChannel(commentChannelRef.current)
    }
  }, [fetchPosts, profile.role])

  useEffect(() => {
    if (commentChannelRef.current) {
      supabase.removeChannel(commentChannelRef.current)
      commentChannelRef.current = null
    }
    if (!activePost) return

    commentChannelRef.current = supabase.channel(`forum-comments-${activePost.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forum_comments', filter: `post_id=eq.${activePost.id}` }, () => {
        supabase.from('forum_comments').select('*').eq('post_id', activePost.id).order('created_at', { ascending: true }).then(({ data }) => {
          if (data) setComments(data as ForumComment[])
        })
      })
      .subscribe()

    return () => {
      if (commentChannelRef.current) {
        supabase.removeChannel(commentChannelRef.current)
        commentChannelRef.current = null
      }
    }
  }, [activePost])

  const openPost = async (post: ForumPost) => {
    setPostLoading(true)
    setActivePost(post)
    setCommentSort('oldest')
    supabase.rpc('increment_view_count', { p_post_id: post.id })
    try {
      const { data, error } = await supabase.from('forum_comments').select('*')
        .eq('post_id', post.id).order('created_at', { ascending: true })
      if (error) throw error
      if (data) setComments(data as ForumComment[])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to load comments', 'error')
    } finally {
      setPostLoading(false)
    }
  }

  /* ── sorting ── */
  const sortedPosts = (() => {
    let list = [...posts]
    if (showBookmarks) list = list.filter(p => (p.bookmarks || []).includes(profile.id))
    if (filterFlair) list = list.filter(p => p.flair === filterFlair)
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.body?.toLowerCase().includes(q) ||
        p.tags?.some(t => t.toLowerCase().includes(q)) ||
        p.author_name?.toLowerCase().includes(q)
      )
    }
    const pinned = list.filter(p => p.pinned)
    const unpinned = list.filter(p => !p.pinned)
    if (sort === 'new') unpinned.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    else if (sort === 'top') unpinned.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
    else {
      unpinned.sort((a, b) => {
        const ageA = (Date.now() - new Date(a.created_at).getTime()) / 3600000
        const ageB = (Date.now() - new Date(b.created_at).getTime()) / 3600000
        const scoreA = ((a.likes?.length || 0) * 2 + (a.comment_count || 0)) / Math.pow(ageA + 2, 1.2)
        const scoreB = ((b.likes?.length || 0) * 2 + (b.comment_count || 0)) / Math.pow(ageB + 2, 1.2)
        return scoreB - scoreA
      })
    }
    return [...pinned, ...unpinned]
  })()

  /* ── sorted comments ── */
  const sortedComments = useMemo(() => {
    const list = [...comments]
    if (commentSort === 'newest') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    else if (commentSort === 'top') list.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
    else list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    return list
  }, [comments, commentSort])

  /* ── post CRUD ── */
  const openCreateModal = () => {
    setEditingPost(null)
    setFormTitle(''); setFormBody(''); setFormFlair(''); setFormTags([]); setTagInput('')
    setAttachment(null)
    setPostModal(true)
  }

  const openEditModal = (post: ForumPost) => {
    setEditingPost(post)
    setFormTitle(post.title); setFormBody(post.body || ''); setFormFlair(post.flair || ''); setFormTags(post.tags || []); setTagInput('')
    setAttachment(null)
    setPostModal(true)
  }

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (t && !formTags.includes(t) && formTags.length < 5) setFormTags(prev => [...prev, t])
    setTagInput('')
  }

  const submitPost = async () => {
    if (uploading) return
    if (!formTitle.trim() || !formBody.trim()) return
    setUploading(true)
    try {

    let attachment_url = '', attachment_name = '', attachment_type = ''
    if (attachment) {
      if (attachment.size > MAX_ATTACHMENT_SIZE) { toast('File too large. Max 10 MB.', 'error'); setUploading(false); return }
      const ext = attachment.name.split('.').pop() || ''
      const path = `forum/${profile.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('course-files').upload(path, attachment)
      if (!error) {
        const { data: urlData } = supabase.storage.from('course-files').getPublicUrl(path)
        attachment_url = urlData.publicUrl
        attachment_name = attachment.name
        attachment_type = attachment.type || ext
      }
    }

    if (editingPost) {
      const updates: any = {
        title: formTitle.trim(), body: formBody.trim(),
        flair: formFlair || null, tags: formTags, edited_at: new Date().toISOString(),
      }
      if (attachment_url) {
        updates.attachment_url = attachment_url
        updates.attachment_name = attachment_name
        updates.attachment_type = attachment_type
      }
      const { data } = await supabase.from('forum_posts').update(updates)
        .eq('id', editingPost.id).eq('author_id', profile.id).select().single()
      if (data) {
        const updated = data as ForumPost
        setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
        if (activePost?.id === updated.id) setActivePost(updated)
      }
    } else {
      const row: any = {
        title: formTitle.trim(), body: formBody.trim(),
        author_id: profile.id, author_name: profile.name, author_role: profile.role,
        flair: formFlair || null, tags: formTags,
      }
      if (attachment_url) {
        row.attachment_url = attachment_url
        row.attachment_name = attachment_name
        row.attachment_type = attachment_type
      }
      const { data } = await supabase.from('forum_posts').insert(row).select().single()
      if (data) {
        setPosts(prev => [data as ForumPost, ...prev])
        // Award +5 XP for creating a new post
        const { error: xpErr } = await supabase.rpc('atomic_xp_update', { p_user_id: profile.id, p_xp_delta: 5, p_best_score: 0, p_ghost_win_increment: 0 })
        if (xpErr) {
          toast('Post created but XP award failed', 'info')
        } else {
          toast('▪ +5 XP — New forum post!', 'success')
        }
        if (profile.role === 'student') incrementSocialQuests(profile.id)
      }
    }
    setPostModal(false)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save post', 'error')
    } finally {
      setUploading(false)
    }
  }

  const deletePost = async (postId: string) => {
    if (postActionBusy[postId]) return
    if (!confirm('Delete this post and all comments? This cannot be undone.')) return
    setPostActionBusy(prev => ({ ...prev, [postId]: true }))
    try {
      const isStaff = profile.role === 'admin' || profile.role === 'teacher'
      const targetPost = posts.find(p => p.id === postId)
      if (isStaff && targetPost?.author_id !== profile.id) {
        const { error } = await supabase.rpc('admin_delete_forum_post', { p_post_id: postId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('forum_posts').delete().eq('id', postId).eq('author_id', profile.id)
        if (error) throw error
      }
      setPosts(prev => prev.filter(p => p.id !== postId))
      if (activePost?.id === postId) { setActivePost(null); setComments([]) }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete post', 'error')
    } finally {
      setPostActionBusy(prev => ({ ...prev, [postId]: false }))
    }
  }

  /* ── voting ── */
  const togglePostLike = async (post: ForumPost) => {
    if (postActionBusy[post.id]) return
    setPostActionBusy(prev => ({ ...prev, [post.id]: true }))
    try {
      const wasLiked = (post.likes || []).includes(profile.id)
      const { data, error } = await supabase.rpc('toggle_forum_like', { post_id: post.id, user_id: profile.id })
      if (error) { toast(error.message || 'Failed to like post', 'error'); return }
      const newLikes: string[] = data ?? []
      const updated = { ...post, likes: newLikes }
      setPosts(prev => prev.map(p => p.id === post.id ? updated : p))
      if (activePost?.id === post.id) setActivePost(updated)
      // Award/revoke reputation to post author
      if (post.author_id !== profile.id) {
        const delta = wasLiked ? -1 : 1
        supabase.rpc('increment_reputation', { target_user: post.author_id, delta })
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to like post', 'error')
    } finally {
      setPostActionBusy(prev => ({ ...prev, [post.id]: false }))
    }
  }

  const toggleCommentLike = async (comment: ForumComment) => {
    if (commentActionBusy[comment.id]) return
    setCommentActionBusy(prev => ({ ...prev, [comment.id]: true }))
    const wasLiked = (comment.likes || []).includes(profile.id)
    const { data, error } = await supabase.rpc('toggle_comment_like', { comment_id: comment.id, user_id: profile.id })
    try {
      if (error) { toast(error.message || 'Failed to like comment', 'error'); return }
      const newLikes: string[] = data ?? []
      setComments(prev => prev.map(c => c.id === comment.id ? { ...c, likes: newLikes } : c))
      // Award/revoke reputation to comment author
      if (comment.author_id !== profile.id) {
        const delta = wasLiked ? -1 : 1
        supabase.rpc('increment_reputation', { target_user: comment.author_id, delta })
      }
    } finally {
      setCommentActionBusy(prev => ({ ...prev, [comment.id]: false }))
    }
  }

  /* ── bookmark ── */
  const toggleBookmark = async (post: ForumPost) => {
    if (postActionBusy[post.id]) return
    setPostActionBusy(prev => ({ ...prev, [post.id]: true }))
    try {
      const { data, error } = await supabase.rpc('toggle_forum_bookmark', { p_post_id: post.id, p_user_id: profile.id })
      if (error) throw error
      const newBookmarks: string[] = data ?? []
      const updated = { ...post, bookmarks: newBookmarks }
      setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
      if (activePost?.id === updated.id) setActivePost(updated)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update bookmark', 'error')
    } finally {
      setPostActionBusy(prev => ({ ...prev, [post.id]: false }))
    }
  }

  /* ── pin/unpin (admin / teacher only) ── */
  const togglePin = async (post: ForumPost) => {
    if (postActionBusy[post.id]) return
    setPostActionBusy(prev => ({ ...prev, [post.id]: true }))
    try {
      const { data, error } = await supabase.rpc('toggle_forum_pin', { p_post_id: post.id })
      if (error) throw error
      const newPinned = data as boolean
      const updated = { ...post, pinned: newPinned }
      setPosts(prev => prev.map(p => p.id === post.id ? updated : p))
      if (activePost?.id === post.id) setActivePost(updated)
      toast(newPinned ? '● Post pinned' : '● Post unpinned', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to pin post', 'error')
    } finally {
      setPostActionBusy(prev => ({ ...prev, [post.id]: false }))
    }
  }

  /* ── best answer ── */
  const markBestAnswer = async (commentId: string) => {
    if (!activePost) return
    if (postActionBusy[activePost.id]) return
    if (activePost.author_id !== profile.id) { toast('Only the post author can mark best answer', 'error'); return }
    setPostActionBusy(prev => ({ ...prev, [activePost.id]: true }))
    try {
      const prevBestId = activePost.best_answer_id
      const newId = prevBestId === commentId ? null : commentId
      const { data, error } = await supabase.from('forum_posts').update({ best_answer_id: newId })
        .eq('id', activePost.id).eq('author_id', profile.id).select().single()
      if (error) throw error
      if (data) {
        const updated = data as ForumPost
        setPosts(prev => prev.map(p => p.id === updated.id ? updated : p))
        setActivePost(updated)
        setComments(prev => prev.map(c => ({ ...c, is_best_answer: c.id === newId })))
        // Award/revoke +5 rep for best answer
        if (prevBestId) {
          const prevComment = comments.find(c => c.id === prevBestId)
          if (prevComment && prevComment.author_id !== profile.id) {
            supabase.rpc('increment_reputation', { target_user: prevComment.author_id, delta: -5 })
          }
        }
        if (newId) {
          const newComment = comments.find(c => c.id === newId)
          if (newComment && newComment.author_id !== profile.id) {
            supabase.rpc('increment_reputation', { target_user: newComment.author_id, delta: 5 })
            // Award +15 XP to comment author for best answer
            const { error: xpErr } = await supabase.rpc('atomic_xp_update', { p_user_id: newComment.author_id, p_xp_delta: 15, p_best_score: 0, p_ghost_win_increment: 0 })
            if (!xpErr) toast('✓ Best answer marked! +15 XP awarded', 'success')
          }
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to mark best answer', 'error')
    } finally {
      setPostActionBusy(prev => ({ ...prev, [activePost.id]: false }))
    }
  }

  /* ── comments ── */
  const addComment = async () => {
    if (commentLoading) return
    if (!newComment.trim() || !activePost) return
    setCommentLoading(true)
    try {
      const row: any = {
        post_id: activePost.id, body: newComment.trim(),
        author_id: profile.id, author_name: profile.name, author_role: profile.role,
      }
      if (replyTo) row.parent_id = replyTo.id
      const { data, error } = await supabase.from('forum_comments').insert(row).select().single()
      if (error) throw error
      if (data) {
        setComments(prev => [...prev, data as ForumComment])
        setActivePost(prev => prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev)
        setPosts(prev => prev.map(p => p.id === activePost.id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p))
        // Award +3 XP for commenting
        const { error: xpErr } = await supabase.rpc('atomic_xp_update', { p_user_id: profile.id, p_xp_delta: 3, p_best_score: 0, p_ghost_win_increment: 0 })
        if (xpErr) {
          toast('Comment added but XP award failed', 'info')
        } else {
          toast('◇ +3 XP — Forum comment!', 'success')
        }
        if (profile.role === 'student') incrementSocialQuests(profile.id)
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add comment', 'error')
    }
    setNewComment(''); setReplyTo(null); setCommentLoading(false)
  }

  const deleteComment = async (commentId: string) => {
    if (commentActionBusy[commentId]) return
    if (!confirm('Delete this comment?')) return
    setCommentActionBusy(prev => ({ ...prev, [commentId]: true }))
    try {
      const isStaff = profile.role === 'admin' || profile.role === 'teacher'
      const targetComment = comments.find(c => c.id === commentId)
      if (isStaff && targetComment?.author_id !== profile.id) {
        const { error } = await supabase.rpc('admin_delete_forum_comment', { p_comment_id: commentId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('forum_comments').delete().eq('id', commentId).eq('author_id', profile.id)
        if (error) throw error
      }
      setComments(prev => prev.filter(c => c.id !== commentId))
      if (activePost) {
        setActivePost(prev => prev ? { ...prev, comment_count: Math.max((prev.comment_count || 0) - 1, 0) } : prev)
        setPosts(prev => prev.map(p => p.id === activePost.id ? { ...p, comment_count: Math.max((p.comment_count || 0) - 1, 0) } : p))
        // Clear best answer if deleted
        if (activePost.best_answer_id === commentId) {
          await supabase.from('forum_posts').update({ best_answer_id: null }).eq('id', activePost.id)
          setActivePost(prev => prev ? { ...prev, best_answer_id: undefined } : prev)
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete comment', 'error')
    } finally {
      setCommentActionBusy(prev => ({ ...prev, [commentId]: false }))
    }
  }

  /* ── build threaded comments ── */
  const buildTree = (list: ForumComment[]) => {
    const roots: ForumComment[] = []
    const childMap: Record<string, ForumComment[]> = {}
    // Put best answer first in roots
    const bestId = activePost?.best_answer_id
    list.forEach(c => {
      if (c.parent_id) {
        if (!childMap[c.parent_id]) childMap[c.parent_id] = []
        childMap[c.parent_id].push(c)
      } else roots.push(c)
    })
    if (bestId) {
      const bestIdx = roots.findIndex(c => c.id === bestId)
      if (bestIdx > 0) {
        const [best] = roots.splice(bestIdx, 1)
        roots.unshift(best)
      }
    }
    return { roots, childMap }
  }

  /* ── render helpers ── */
  const VoteBar = ({ likes, onVote, vertical = true, disabled = false }: { likes: string[]; onVote: () => void; vertical?: boolean; disabled?: boolean }) => {
    const liked = (likes || []).includes(profile.id)
    const count = likes?.length || 0
    return (
      <div className={`fm-vote ${vertical ? 'fm-vote-v' : 'fm-vote-h'}`}>
        <button className={`fm-vote-btn ${liked ? 'fm-voted' : ''}`} onClick={e => { e.stopPropagation(); onVote() }} aria-label="Upvote" disabled={disabled}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>
        </button>
        <span className={`fm-vote-count ${liked ? 'fm-voted' : ''}`}>{count}</span>
      </div>
    )
  }

  const FlairBadge = ({ flair }: { flair?: string }) => {
    const f = flairObj(flair)
    if (!f) return null
    return <span className="fm-flair" style={{ borderColor: f.color, color: f.color }}>{f.label}</span>
  }

  const AuthorBadge = ({ name, role, date, edited }: { name: string; role: string; date: string; edited?: string }) => (
    <div className="fm-author">
      <span className="fm-avatar-sm" style={{ borderColor: roleColor(role) }}>{roleBadge(role)}</span>
      <span className="fm-author-name" style={{ color: roleColor(role) }}>{name}</span>
      <span className="fm-dot">·</span>
      <span className="fm-time">{timeAgo(date)}</span>
      {edited && <span className="fm-edited">(edited)</span>}
    </div>
  )

  const TagList = ({ tags }: { tags?: string[] }) => {
    if (!tags?.length) return null
    return <div className="fm-tags">{tags.map(t => <span key={t} className="fm-tag" onClick={e => { e.stopPropagation(); setSearchQ(t); setFilterFlair(''); setShowBookmarks(false); if (activePost) { setActivePost(null); setComments([]) } }}>#{t}</span>)}</div>
  }

  /* Markdown body renderer */
  const MdBody = ({ text, className }: { text: string; className?: string }) => (
    <div className={className} dangerouslySetInnerHTML={{ __html: renderMd(text) }} />
  )

  /* ── render comment (recursive for threading) ── */
  const renderComment = (c: ForumComment, childMap: Record<string, ForumComment[]>, depth = 0) => {
    const isBest = activePost?.best_answer_id === c.id
    const canMarkBest = activePost?.author_id === profile.id && activePost?.flair === 'question' && !c.parent_id
    return (
      <div key={c.id} className={`fm-comment ${depth > 0 ? 'fm-comment-nested' : ''} ${isBest ? 'fm-best-answer' : ''}`} style={{ marginLeft: Math.min(depth * 24, 72) }}>
        {isBest && <div className="fm-best-badge">✓ Best Answer</div>}
        <div className="fm-comment-inner">
          <div className="fm-comment-left">
            <div className="fm-thread-line" />
          </div>
          <div className="fm-comment-body">
            <AuthorBadge name={c.author_name} role={c.author_role} date={c.created_at} />
            <MdBody text={c.body} className="fm-comment-text" />
            <div className="fm-comment-actions">
              <VoteBar likes={c.likes || []} onVote={() => toggleCommentLike(c)} vertical={false} disabled={!!commentActionBusy[c.id]} />
              <button className="fm-action-btn" onClick={() => { setReplyTo(c); setNewComment(`@${c.author_name} `) }} disabled={!!commentActionBusy[c.id]}>
                <Icon name="chat" size={11} /> Reply
              </button>
              {canMarkBest && (
                <button className={`fm-action-btn ${isBest ? 'fm-action-best-active' : ''}`} onClick={() => markBestAnswer(c.id)} disabled={!!activePost && !!postActionBusy[activePost.id]}>
                  {isBest ? '✓ Unmark' : '✓ Best Answer'}
                </button>
              )}
              {(c.author_id === profile.id || profile.role === 'admin' || profile.role === 'teacher') && (
                <button className="fm-action-btn fm-action-danger" onClick={() => deleteComment(c.id)} disabled={!!commentActionBusy[c.id]}>
                  <Icon name="trash" size={11} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
        {childMap[c.id]?.map(child => renderComment(child, childMap, depth + 1))}
      </div>
    )
  }

  /* ════════════════════════════════════════════════════════
     POST LIST VIEW
     ════════════════════════════════════════════════════════ */
  if (!activePost) {
    return (
      <>
        {/* ── Create / Edit Modal ── */}
        <Modal open={postModal} onClose={() => setPostModal(false)} title={editingPost ? 'Edit Post' : 'Create Post'} width={620}>
          {/* Flair selection */}
          <div style={{ marginBottom: 16 }}>
            <label className="label">Flair</label>
            <div className="fm-flair-picker">
              {FLAIRS.map(f => (
                <button key={f.id} className={`fm-flair-opt ${formFlair === f.id ? 'fm-flair-active' : ''}`}
                  style={{ borderColor: f.color, color: formFlair === f.id ? '#000' : f.color, background: formFlair === f.id ? f.color : 'transparent' }}
                  onClick={() => setFormFlair(formFlair === f.id ? '' : f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label className="label">Title</label>
            <input className="input" value={formTitle} onChange={e => setFormTitle(e.target.value)}
              placeholder="An interesting title..." maxLength={200} />
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--fg-dim)', textAlign: 'right', marginTop: 4 }}>{formTitle.length}/200</div>
          </div>

          {/* Body */}
          <div style={{ marginBottom: 14 }}>
            <label className="label">Body <span style={{ fontSize: 9, color: 'var(--fg-dim)', fontWeight: 400 }}>— supports **bold**, *italic*, ~~strike~~, `code`, ```code blocks```, [links](url), &gt; quotes</span></label>
            <textarea className="input fm-compose-body" rows={8} value={formBody} onChange={e => setFormBody(e.target.value)}
              placeholder="Share your thoughts, question, or resource..." />
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 14 }}>
            <label className="label">Tags (up to 5)</label>
            <div className="fm-tag-input-row">
              <input className="input" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
                placeholder="Type and Enter..." style={{ flex: 1 }} />
            </div>
            <div className="fm-tag-suggestions">
              {SUGGESTED_TAGS.filter(t => !formTags.includes(t)).slice(0, 6).map(t => (
                <button key={t} className="fm-tag-sug" onClick={() => addTag(t)}>+ {t}</button>
              ))}
            </div>
            {formTags.length > 0 && (
              <div className="fm-tags" style={{ marginTop: 8 }}>
                {formTags.map(t => (
                  <span key={t} className="fm-tag fm-tag-removable" onClick={() => setFormTags(prev => prev.filter(x => x !== t))}>#{t} ×</span>
                ))}
              </div>
            )}
          </div>

          {/* Attachment */}
          <div style={{ marginBottom: 20 }}>
            <label className="label">Attachment (optional — max 10 MB)</label>
            <input ref={fileRef} type="file" accept={ALLOWED_TYPES.join(',')}
              onChange={e => setAttachment(e.target.files?.[0] || null)}
              style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--fg)' }} />
            {editingPost?.attachment_name && !attachment && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginTop: 6 }}>
                Current: {getAttachmentIcon(editingPost.attachment_type)} {editingPost.attachment_name}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={submitPost} disabled={uploading || !formTitle.trim() || !formBody.trim()}>
              {uploading ? <><span className="spinner" /> Posting...</> : editingPost ? 'Save Changes' : 'Post'}
            </button>
            <button className="btn" onClick={() => setPostModal(false)}>Cancel</button>
          </div>
        </Modal>

        <PageHeader title="COMMUNITY FORUM" subtitle="Ask, discuss, share — your learning community" />

        {/* ── Controls bar ── */}
        <div className="fm-controls fade-up-1">
          <div className="fm-sort-bar">
            {(['hot', 'new', 'top'] as SortMode[]).map(s => (
              <button key={s} className={`fm-sort-btn ${sort === s && !showBookmarks ? 'fm-sort-active' : ''}`} onClick={() => { setSort(s); setShowBookmarks(false); setPage(0) }}>
                {s === 'hot' ? '◆' : s === 'new' ? '◇' : '★'} {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <button className={`fm-sort-btn ${showBookmarks ? 'fm-sort-active' : ''}`}
              onClick={() => { setShowBookmarks(!showBookmarks); setPage(0) }}>
              ◈ Saved
            </button>
          </div>
          <div className="fm-search-bar">
            <Icon name="search" size={12} />
            <input className="fm-search-input" value={searchQ} onChange={e => { setSearchQ(e.target.value); setPage(0) }} placeholder="Search posts, tags, authors..." />
            {searchQ && <button className="fm-clear-btn" onClick={() => setSearchQ('')}>×</button>}
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreateModal}><Icon name="plus" size={12} /> New Post</button>
        </div>

        {/* ── Flair filter ── */}
        <div className="fm-flair-bar fade-up-2">
          <button className={`fm-flair-filter ${!filterFlair ? 'fm-flair-filter-active' : ''}`} onClick={() => { setFilterFlair(''); setPage(0) }}>All</button>
          {FLAIRS.map(f => (
            <button key={f.id} className={`fm-flair-filter ${filterFlair === f.id ? 'fm-flair-filter-active' : ''}`}
              style={{ borderColor: filterFlair === f.id ? f.color : undefined, color: filterFlair === f.id ? f.color : undefined }}
              onClick={() => { setFilterFlair(filterFlair === f.id ? '' : f.id); setPage(0) }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Feed ── */}
        {sortedPosts.length === 0 && (
          <div className="fm-empty fade-up">
            <div style={{ fontSize: 32, marginBottom: 8 }}>{showBookmarks ? '◈' : '◇'}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>
              {showBookmarks ? 'No saved posts yet.' : searchQ || filterFlair ? 'No posts match your filters.' : 'No posts yet. Start the conversation!'}
            </div>
          </div>
        )}

        {sortedPosts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((post, i) => {
          const bookmarked = (post.bookmarks || []).includes(profile.id)
          return (
            <div key={post.id} className={`fm-post-card fade-up${Math.min(i, 3) > 0 ? `-${Math.min(i, 3)}` : ''}`} onClick={() => openPost(post)}>
              {/* Vote column */}
              <div className="fm-post-vote">
                <VoteBar likes={post.likes || []} onVote={() => togglePostLike(post)} disabled={!!postActionBusy[post.id]} />
              </div>

              {/* Content */}
              <div className="fm-post-content">
                <div className="fm-post-meta">
                  <AuthorBadge name={post.author_name} role={post.author_role} date={post.created_at} edited={post.edited_at} />
                </div>

                <div className="fm-post-header">
                  {post.pinned && <span className="fm-pinned">●</span>}
                  <FlairBadge flair={post.flair} />
                  <span className="fm-post-title">{post.title}</span>
                  {post.best_answer_id && post.flair === 'question' && <span className="fm-solved-badge">✓ Solved</span>}
                </div>

                <div className="fm-post-preview">{post.body?.slice(0, 200)}{(post.body?.length || 0) > 200 ? '...' : ''}</div>

                {post.attachment_name && isImage(post.attachment_type, post.attachment_name) && post.attachment_url && (
                  <div className="fm-img-thumb" onClick={e => e.stopPropagation()}>
                    <Image src={post.attachment_url} alt={post.attachment_name} width={960} height={540} unoptimized loading="lazy" />
                  </div>
                )}

                {post.attachment_name && !isImage(post.attachment_type, post.attachment_name) && (
                  <div className="fm-attachment-badge">
                    {getAttachmentIcon(post.attachment_type)} {post.attachment_name}
                  </div>
                )}

                <TagList tags={post.tags} />

                <div className="fm-post-stats">
                  <span className="fm-stat"><Icon name="chat" size={11} /> {post.comment_count || 0} comment{(post.comment_count || 0) !== 1 ? 's' : ''}</span>
                  <span className="fm-stat">◎ {post.view_count || 0}</span>
                  <button className={`fm-action-btn ${bookmarked ? 'fm-bookmarked' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleBookmark(post) }} disabled={!!postActionBusy[post.id]}>
                    {bookmarked ? '◈' : '◇'} {bookmarked ? 'Saved' : 'Save'}
                  </button>
                  {post.author_id === profile.id && (
                    <>
                      <button className="fm-action-btn" onClick={e => { e.stopPropagation(); openEditModal(post) }} disabled={!!postActionBusy[post.id]}><Icon name="edit" size={11} /> Edit</button>
                      <button className="fm-action-btn fm-action-danger" onClick={e => { e.stopPropagation(); deletePost(post.id) }} disabled={!!postActionBusy[post.id]}><Icon name="trash" size={11} /> Delete</button>
                    </>
                  )}
                  {(profile.role === 'admin' || profile.role === 'teacher') && (
                    <>
                      <button className={`fm-action-btn ${post.pinned ? 'fm-action-best-active' : ''}`} onClick={e => { e.stopPropagation(); togglePin(post) }} disabled={!!postActionBusy[post.id]}>● {post.pinned ? 'Unpin' : 'Pin'}</button>
                      {post.author_id !== profile.id && (
                        <button className="fm-action-btn fm-action-danger" onClick={e => { e.stopPropagation(); deletePost(post.id) }} disabled={!!postActionBusy[post.id]}><Icon name="trash" size={11} /> Remove</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <Pagination page={page} totalPages={Math.ceil(sortedPosts.length / PAGE_SIZE)} onPageChange={setPage} />
      </>
    )
  }

  /* ════════════════════════════════════════════════════════
     POST DETAIL VIEW
     ════════════════════════════════════════════════════════ */
  const { roots, childMap } = buildTree(sortedComments)
  const bookmarked = (activePost.bookmarks || []).includes(profile.id)

  return (
    <div className="fm-detail fade-up">
      {/* Back bar */}
      <button className="fm-back-btn" onClick={() => { setActivePost(null); setComments([]); setReplyTo(null); setNewComment('') }}>
        ← Back to Forum
      </button>

      {/* Post */}
      <div className="fm-detail-post">
        <div className="fm-post-vote" style={{ paddingTop: 4 }}>
          <VoteBar likes={activePost.likes || []} onVote={() => togglePostLike(activePost)} />
        </div>
        <div className="fm-post-content" style={{ flex: 1 }}>
          <div className="fm-post-meta">
            <AuthorBadge name={activePost.author_name} role={activePost.author_role} date={activePost.created_at} edited={activePost.edited_at} />
            <span className="fm-stat" style={{ marginLeft: 'auto' }}>◎ {activePost.view_count || 0} views</span>
          </div>

          <div className="fm-detail-header">
            {activePost.pinned && <span className="fm-pinned">● PINNED</span>}
            <FlairBadge flair={activePost.flair} />
            {activePost.best_answer_id && activePost.flair === 'question' && <span className="fm-solved-badge">✓ Solved</span>}
          </div>
          <h2 className="fm-detail-title">{activePost.title}</h2>

          <TagList tags={activePost.tags} />

          <MdBody text={activePost.body} className="fm-detail-body" />

          {activePost.attachment_url && isImage(activePost.attachment_type, activePost.attachment_name) && (
            <div className="fm-img-preview">
              <a href={activePost.attachment_url} target="_blank" rel="noopener noreferrer">
                <Image src={activePost.attachment_url} alt={activePost.attachment_name || 'Image'} width={1280} height={720} unoptimized loading="lazy" />
              </a>
              <div className="fm-img-caption">
                ▪ {activePost.attachment_name}
                <a href={activePost.attachment_url} target="_blank" rel="noopener noreferrer" className="fm-attachment-dl">Open full size ↗</a>
              </div>
            </div>
          )}

          {activePost.attachment_url && !isImage(activePost.attachment_type, activePost.attachment_name) && (
            <a href={activePost.attachment_url} target="_blank" rel="noopener noreferrer" className="fm-attachment-link" onClick={e => e.stopPropagation()}>
              {getAttachmentIcon(activePost.attachment_type)} {activePost.attachment_name || 'Attachment'}
              <span className="fm-attachment-dl">Download ↗</span>
            </a>
          )}

          <div className="fm-post-stats" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <span className="fm-stat"><Icon name="chat" size={11} /> {activePost.comment_count || 0} comments</span>
            <button className={`fm-action-btn ${bookmarked ? 'fm-bookmarked' : ''}`} onClick={() => toggleBookmark(activePost)} disabled={!!postActionBusy[activePost.id]}>
              {bookmarked ? '◈ Saved' : '◇ Save'}
            </button>
            {activePost.author_id === profile.id && (
              <>
                <button className="fm-action-btn" onClick={() => openEditModal(activePost)} disabled={!!postActionBusy[activePost.id]}><Icon name="edit" size={11} /> Edit</button>
                <button className="fm-action-btn fm-action-danger" onClick={() => deletePost(activePost.id)} disabled={!!postActionBusy[activePost.id]}><Icon name="trash" size={11} /> Delete</button>
              </>
            )}
            {(profile.role === 'admin' || profile.role === 'teacher') && (
              <>
                <button className={`fm-action-btn ${activePost.pinned ? 'fm-action-best-active' : ''}`} onClick={() => togglePin(activePost)} disabled={!!postActionBusy[activePost.id]}>● {activePost.pinned ? 'Unpin' : 'Pin'}</button>
                {activePost.author_id !== profile.id && (
                  <button className="fm-action-btn fm-action-danger" onClick={() => deletePost(activePost.id)} disabled={!!postActionBusy[activePost.id]}><Icon name="trash" size={11} /> Remove</button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Comment composer ── */}
      <div className="fm-compose">
        {replyTo && (
          <div className="fm-reply-banner">
            Replying to <strong>{replyTo.author_name}</strong>
            <button className="fm-clear-btn" onClick={() => { setReplyTo(null); setNewComment('') }}>×</button>
          </div>
        )}
        <textarea className="input fm-compose-input" rows={3} value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder={replyTo ? `Reply to ${replyTo.author_name}...` : 'Write a comment... (supports **bold**, *italic*, `code`)'}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addComment() } }}
        />
        <div className="fm-compose-footer">
          <span className="fm-hint">Ctrl+Enter to post · Markdown supported</span>
          <button className="btn btn-primary btn-sm" onClick={addComment} disabled={commentLoading || !newComment.trim()}>
            {commentLoading ? <span className="spinner" /> : 'Comment'}
          </button>
        </div>
      </div>

      {/* ── Comments header with sort ── */}
      <div className="fm-comments-header">
        <span>{comments.length} Comment{comments.length !== 1 ? 's' : ''}</span>
        <div className="fm-comment-sort">
          {(['oldest', 'newest', 'top'] as CommentSort[]).map(s => (
            <button key={s} className={`fm-sort-btn ${commentSort === s ? 'fm-sort-active' : ''}`}
              onClick={() => setCommentSort(s)}>
              {s === 'oldest' ? '◇' : s === 'newest' ? '◇' : '★'} {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {postLoading && <div style={{ color: 'var(--fg-dim)', fontFamily: 'var(--mono)', fontSize: 12, padding: 16 }}>Loading comments...</div>}

      {!postLoading && roots.length === 0 && (
        <div className="fm-empty" style={{ padding: '24px 0' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--fg-dim)' }}>No comments yet. Be the first to reply!</div>
        </div>
      )}

      {roots.map(c => renderComment(c, childMap, 0))}
    </div>
  )
}
