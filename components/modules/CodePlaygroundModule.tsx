'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import type { Profile } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'

interface Props {
  profile: Profile
}

const TEMPLATES: Record<string, { label: string; code: string; lang: string }> = {
  js: {
    label: 'JavaScript', lang: 'javascript',
    code: '// JavaScript Playground\nconsole.log("Hello, World!");\n\n// Try writing some code:\nfor (let i = 0; i < 5; i++) {\n  console.log(`Count: ${i}`);\n}\n',
  },
  py: {
    label: 'Python', lang: 'python',
    code: '# Python Playground\nprint("Hello, World!")\n\n# Try writing some code:\nfor i in range(5):\n    print(f"Count: {i}")\n',
  },
  html: {
    label: 'HTML/CSS', lang: 'html',
    code: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; padding: 20px; background: #0a0a0a; color: #fff; }\n    h1 { color: #f59e0b; }\n    button { background: #f59e0b; color: #000; border: none; padding: 8px 16px; cursor: pointer; border-radius: 4px; margin-top: 12px; }\n  </style>\n</head>\n<body>\n  <h1>Hello, QGX!</h1>\n  <p>Edit this HTML and click Run to preview.</p>\n  <button onclick="console.log(\'Button clicked!\')">Click Me</button>\n  <script>\n    console.log("Page loaded!");\n  </script>\n</body>\n</html>',
  },
}

type LogLine = { text: string; type: 'log' | 'error' | 'warn' | 'info' }

export function CodePlaygroundModule({ profile }: Props) {
  const [lang, setLang] = useState('js')
  const [code, setCode] = useState(TEMPLATES.js.code)
  const [output, setOutput] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const [htmlRendered, setHtmlRendered] = useState(false)
  const [htmlSrcDoc, setHtmlSrcDoc] = useState<string>('')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const outputEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll terminal to bottom on new output
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [output])

  // Listen for console messages forwarded from the HTML iframe via postMessage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.source === 'qgx-html-console') {
        setOutput(prev => [...prev, { text: e.data.msg, type: e.data.type || 'log' }])
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const runCode = useCallback(() => {
    setRunning(true)
    setOutput([])
    setHtmlRendered(false)

    // ── HTML mode ──────────────────────────────────────────────
    if (lang === 'html') {
      // Bridge injects console.log/error/warn → parent via postMessage
      const consoleBridge = `<script>
(function() {
  var orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  ['log','error','warn','info'].forEach(function(t) {
    console[t] = function() {
      var args = Array.prototype.slice.call(arguments);
      orig[t].apply(console, args);
      window.parent.postMessage({
        source: 'qgx-html-console', type: t,
        msg: args.map(function(a){ return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }).join(' ')
      }, '*');
    };
  });
  window.onerror = function(msg, src, line, col) {
    window.parent.postMessage({ source: 'qgx-html-console', type: 'error', msg: 'JS Error (line ' + line + ':' + col + '): ' + msg }, '*');
  };
})();
</script>`
      const injected = code.includes('</head>')
        ? code.replace('</head>', consoleBridge + '</head>')
        : consoleBridge + code
      // Use srcDoc (React prop) — reliable even in sandboxed iframes
      setHtmlSrcDoc(injected)
      setHtmlRendered(true)
      setOutput([{ text: '▶ HTML rendered — console output appears below', type: 'info' }])
      setRunning(false)
      return
    }

    // ── JavaScript mode ────────────────────────────────────────
    if (lang === 'js') {
      const workerSrc = [
        'self.console = {',
        '  log:   (...a) => self.postMessage({ type:"log",  msg: a.map(x => typeof x==="object"?JSON.stringify(x,null,2):String(x)).join(" ") }),',
        '  error: (...a) => self.postMessage({ type:"error",msg: "Error: "+a.join(" ") }),',
        '  warn:  (...a) => self.postMessage({ type:"warn", msg: "Warning: "+a.join(" ") }),',
        '  info:  (...a) => self.postMessage({ type:"info", msg: a.join(" ") }),',
        '};',
        'self.onmessage = e => {',
        '  try { (0,eval)(e.data); } catch(err) { self.postMessage({ type:"error", msg:"Error: "+err.message }); }',
        '  self.postMessage({ type:"done" });',
        '};',
      ].join('\n')
      const blob = new Blob([workerSrc], { type: 'application/javascript' })
      const url = URL.createObjectURL(blob)
      const worker = new Worker(url)
      const logs: LogLine[] = []
      const timeout = setTimeout(() => {
        worker.terminate(); URL.revokeObjectURL(url)
        setOutput([...logs, { text: 'Error: Execution timed out (possible infinite loop)', type: 'error' }])
        setRunning(false)
      }, 5000)
      worker.onmessage = e => {
        if (e.data.type !== 'done') logs.push({ text: e.data.msg, type: e.data.type })
        else {
          clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url)
          setOutput(logs.length ? logs : [{ text: '(no output)', type: 'info' }])
          setRunning(false)
        }
      }
      worker.onerror = err => {
        clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url)
        setOutput([...logs, { text: `Error: ${err.message || 'Execution failed'}`, type: 'error' }])
        setRunning(false)
      }
      worker.postMessage(code)
      return
    }

    // ── Python subset interpreter ──────────────────────────────
    const logs: LogLine[] = []
    try {
      const vars: Record<string, any> = {}
      const MAX = 10000; let iters = 0

      const evalExpr = (expr: string): any => {
        expr = expr.trim()
        if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) return expr.slice(1, -1)
        if (expr.startsWith('f"') || expr.startsWith("f'")) return expr.slice(2, -1).replace(/\{([^}]+)\}/g, (_, e) => String(evalExpr(e)))
        if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr)
        if (expr === 'True') return true; if (expr === 'False') return false; if (expr === 'None') return null
        const rm = expr.match(/^range\((.+)\)$/)
        if (rm) {
          const a = rm[1].split(',').map(x => evalExpr(x.trim()))
          const s = a.length > 1 ? a[0] : 0, en = a.length > 1 ? a[1] : a[0], st = a[2] || 1
          const arr: number[] = []; for (let i = s; st > 0 ? i < en : i > en; i += st) arr.push(i); return arr
        }
        const lm = expr.match(/^len\((.+)\)$/); if (lm) { const v = evalExpr(lm[1]); return Array.isArray(v) ? v.length : String(v).length }
        const cm = expr.match(/^(str|int|float)\((.+)\)$/)
        if (cm) { const v = evalExpr(cm[2]); return cm[1]==='str'?String(v):cm[1]==='int'?Math.floor(Number(v)):Number(v) }
        if (expr.startsWith('[') && expr.endsWith(']')) return expr.slice(1,-1).split(',').map(e=>evalExpr(e.trim())).filter(e=>e!=='')
        if (vars[expr] !== undefined) return vars[expr]
        const mm = expr.match(/^(.+?)\s*([+\-*/%]|\/\/)\s*(.+)$/)
        if (mm) { const l=evalExpr(mm[1]),r=evalExpr(mm[3]),op=mm[2]; if(op==='+')return typeof l==='string'?l+r:l+r; if(op==='-')return l-r; if(op==='*')return typeof l==='string'?l.repeat(r):l*r; if(op==='/')return l/r; if(op==='//') return Math.floor(l/r); if(op==='%')return l%r }
        const cmp = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/)
        if (cmp) { const l=evalExpr(cmp[1]),r=evalExpr(cmp[3]),op=cmp[2]; if(op==='==')return l==r; if(op==='!=')return l!=r; if(op==='>=')return l>=r; if(op==='<=')return l<=r; if(op==='>')return l>r; if(op==='<')return l<r }
        return expr
      }

      const execBlock = (block: string[]) => {
        for (let i = 0; i < block.length; i++) {
          const trimmed = block[i].trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const p = trimmed.match(/^print\((.+)\)$/)
          if (p) { logs.push({ text: p[1].split(',').map(a=>String(evalExpr(a.trim()))).join(' '), type:'log' }); continue }
          const asgn = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
          if (asgn) { vars[asgn[1]] = evalExpr(asgn[2]); continue }
          const forM = trimmed.match(/^for\s+(\w+)\s+in\s+(.+):$/)
          if (forM) {
            const vn = forM[1], it = evalExpr(forM[2]), body: string[] = []
            i++; while (i<block.length&&(block[i].startsWith('    ')||block[i].startsWith('\t'))){ body.push(block[i].replace(/^    |\t/,'')); i++ }; i--
            if (Array.isArray(it)) for (const val of it) { if(++iters>MAX)throw new Error('Execution limit exceeded'); vars[vn]=val; execBlock(body) }
            continue
          }
          const ifM = trimmed.match(/^if\s+(.+):$/)
          if (ifM) {
            const cond = evalExpr(ifM[1]), body: string[] = []
            i++; while (i<block.length&&(block[i].startsWith('    ')||block[i].startsWith('\t'))){ body.push(block[i].replace(/^    |\t/,'')); i++ }; i--
            if (cond) execBlock(body)
            continue
          }
        }
      }

      execBlock(code.split('\n'))
      setOutput(logs.length ? logs : [{ text: '(no output)', type: 'info' }])
    } catch (e: any) {
      setOutput([...logs, { text: `Error: ${e.message}`, type: 'error' }])
    }
    setRunning(false)
  }, [code, lang])

  const switchLang = (l: string) => { setLang(l); setCode(TEMPLATES[l].code); setOutput([]); setHtmlRendered(false) }

  const typeColor = (t: string) => t==='error'?'var(--danger)':t==='warn'?'var(--warn)':t==='info'?'var(--fg-dim)':'var(--fg)'
  const typePrefix = (t: string) => t==='error'?'✖':t==='warn'?'⚠':t==='info'?'●':'›'

  return (
    <>
      <PageHeader title="CODE PLAYGROUND" subtitle="Write and run code instantly" />

      {/* Toolbar */}
      <div className="fade-up-1" style={{ display:'flex', gap:8, marginBottom:12, alignItems:'center' }}>
        {Object.entries(TEMPLATES).map(([key, t]) => (
          <button key={key} className={`btn btn-sm ${lang===key?'btn-primary':''}`} onClick={()=>switchLang(key)}>
            {t.label}
          </button>
        ))}
        <button className="btn btn-primary btn-sm" onClick={runCode} disabled={running} style={{ marginLeft:'auto' }}>
          {running ? '◌ Running...' : '▶ Run'}
        </button>
        {output.length>0 && (
          <button className="btn btn-sm" onClick={()=>setOutput([])}>✕ Clear</button>
        )}
      </div>

      {/* Main grid */}
      <div className="fade-up-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, height:'calc(100vh - 240px)' }}>

        {/* ── Editor ── */}
        <div style={{ display:'flex', flexDirection:'column' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:4, letterSpacing:'0.08em' }}>
            EDITOR · {TEMPLATES[lang].label.toUpperCase()} · <span style={{opacity:0.4}}>Ctrl+Enter to run</span>
          </div>
          <textarea
            value={code}
            onChange={e=>setCode(e.target.value)}
            spellCheck={false}
            style={{
              flex:1, fontFamily:'var(--mono)', fontSize:13, lineHeight:1.6,
              background:'var(--surface)', color:'var(--fg)', border:'1px solid var(--border)',
              borderRadius:8, padding:16, resize:'none', outline:'none', tabSize:2,
            }}
            onKeyDown={e=>{
              if(e.key==='Tab'){
                e.preventDefault()
                const s=e.currentTarget.selectionStart, en=e.currentTarget.selectionEnd
                const n=code.substring(0,s)+'  '+code.substring(en); setCode(n)
                setTimeout(()=>{ e.currentTarget.selectionStart=e.currentTarget.selectionEnd=s+2 },0)
              }
              if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); runCode() }
            }}
          />
        </div>

        {/* ── Output panel ── */}
        <div style={{ display:'flex', flexDirection:'column', gap: lang==='html'?8:0 }}>

          {/* HTML Preview iframe */}
          {lang==='html' && (
            <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:4, letterSpacing:'0.08em' }}>
                PREVIEW{!htmlRendered && <span style={{opacity:0.35}}> · Click Run to render</span>}
              </div>
              <iframe
                ref={iframeRef}
                srcDoc={htmlSrcDoc || '<html><body style="background:#111;color:#555;font-family:monospace;padding:20px;font-size:12px">Click ▶ Run to render your HTML here.</body></html>'}
                sandbox="allow-scripts"
                style={{ flex:1, border:'1px solid var(--border)', borderRadius:8, background:'#111' }}
              />
            </div>
          )}

          {/* Terminal — always visible for all modes */}
          <div style={{ display:'flex', flexDirection:'column', height:lang==='html'?180:'100%', minHeight:lang==='html'?180:undefined }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-dim)', marginBottom:4, letterSpacing:'0.08em', display:'flex', justifyContent:'space-between' }}>
              <span>TERMINAL</span>
              {output.some(o=>o.type==='error') && (
                <span style={{color:'var(--danger)'}}>✖ {output.filter(o=>o.type==='error').length} error(s)</span>
              )}
            </div>
            <div style={{
              flex:1, fontFamily:'var(--mono)', fontSize:12, lineHeight:1.7,
              background:'#0c0c0c', border:'1px solid var(--border)',
              borderRadius:8, padding:'12px 14px', overflowY:'auto', color:'var(--fg)',
            }}>
              {output.length===0 ? (
                <span style={{color:'var(--fg-dim)',opacity:0.45}}>
                  {running ? '◌ executing...' : '▶ Run code to see output here'}
                </span>
              ) : output.map((line,i)=>(
                <div key={i} style={{ color:typeColor(line.type), display:'flex', gap:6, marginBottom:2 }}>
                  <span style={{ opacity:0.3, userSelect:'none', width:14, textAlign:'right', flexShrink:0 }}>{i+1}</span>
                  <span style={{ opacity:0.5, flexShrink:0 }}>{typePrefix(line.type)}</span>
                  <span style={{ whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{line.text}</span>
                </div>
              ))}
              {running && output.length>0 && (
                <div style={{color:'var(--fg-dim)',marginTop:4}}>◌ running...</div>
              )}
              <div ref={outputEndRef} />
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
