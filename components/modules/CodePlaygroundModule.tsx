'use client'
import { useState, useCallback } from 'react'
import type { Profile } from '@/types'
import { PageHeader } from '@/components/ui/PageHeader'

interface Props {
  profile: Profile
}

const TEMPLATES: Record<string, { label: string; code: string; lang: string }> = {
  js: { label: 'JavaScript', lang: 'javascript', code: '// JavaScript Playground\nconsole.log("Hello, World!");\n\n// Try writing some code:\nfor (let i = 0; i < 5; i++) {\n  console.log(`Count: ${i}`);\n}\n' },
  py: { label: 'Python', lang: 'python', code: '# Python Playground\nprint("Hello, World!")\n\n# Try writing some code:\nfor i in range(5):\n    print(f"Count: {i}")\n' },
  html: { label: 'HTML/CSS', lang: 'html', code: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; padding: 20px; background: #0a0a0a; color: #fff; }\n    h1 { color: #f59e0b; }\n  </style>\n</head>\n<body>\n  <h1>Hello, QGX!</h1>\n  <p>Edit this HTML and click Run to preview.</p>\n</body>\n</html>' },
}

export function CodePlaygroundModule({ profile }: Props) {
  const [lang, setLang] = useState('js')
  const [code, setCode] = useState(TEMPLATES.js.code)
  const [output, setOutput] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [htmlPreview, setHtmlPreview] = useState('')

  const runCode = useCallback(() => {
    setRunning(true)
    setOutput([])

    if (lang === 'html') {
      setHtmlPreview(code)
      setOutput(['HTML rendered in preview below.'])
      setRunning(false)
      return
    }

    if (lang === 'js') {
      const logs: string[] = []
      const sandboxConsole = {
        log: (...args: any[]) => logs.push(args.map((a: any) => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')),
        error: (...args: any[]) => logs.push('Error: ' + args.join(' ')),
        warn: (...args: any[]) => logs.push('Warning: ' + args.join(' ')),
        info: (...args: any[]) => logs.push(args.map((a: any) => String(a)).join(' ')),
      }
      try {
        // eslint-disable-next-line no-new-func
        new Function('console', code)(sandboxConsole)
      } catch (e: any) {
        logs.push(`Error: ${e.message}`)
      }
      setOutput(logs.length ? logs : ['(no output)'])
      setRunning(false)
      return
    }

    // Python — client-side execution via basic interpreter
    const logs: string[] = []
    try {
      const unsupported = [/^\s*def\s+/m, /^\s*class\s+/m, /^\s*import\s+/m, /^\s*from\s+.+\s+import\s+/m, /^\s*while\s+/m, /^\s*try\s*:/m, /^\s*except\s+/m, /^\s*with\s+/m, /^\s*lambda\s+/m]
      if (unsupported.some(rx => rx.test(code))) {
        throw new Error('Unsupported Python syntax in browser sandbox. Supported: print, variables, arithmetic, if, for, range, len, basic lists.')
      }
      // Simple Python subset interpreter for common operations
      const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
      const vars: Record<string, any> = {}
      const MAX_ITERATIONS = 10000
      let iterations = 0

      const evalExpr = (expr: string): any => {
        expr = expr.trim()
        // String literals
        if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'")))
          return expr.slice(1, -1)
        // f-strings
        if (expr.startsWith('f"') || expr.startsWith("f'")) {
          const inner = expr.slice(2, -1)
          return inner.replace(/\{([^}]+)\}/g, (_, e) => String(evalExpr(e)))
        }
        // Numbers
        if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr)
        // Boolean/None
        if (expr === 'True') return true
        if (expr === 'False') return false
        if (expr === 'None') return null
        // range()
        const rangeMatch = expr.match(/^range\((.+)\)$/)
        if (rangeMatch) {
          const args = rangeMatch[1].split(',').map(a => evalExpr(a.trim()))
          const start = args.length > 1 ? args[0] : 0
          const end = args.length > 1 ? args[1] : args[0]
          const step = args[2] || 1
          const arr = []
          for (let i = start; step > 0 ? i < end : i > end; i += step) arr.push(i)
          return arr
        }
        // len()
        const lenMatch = expr.match(/^len\((.+)\)$/)
        if (lenMatch) { const v = evalExpr(lenMatch[1]); return typeof v === 'string' ? v.length : Array.isArray(v) ? v.length : 0 }
        // type()
        const typeMatch = expr.match(/^type\((.+)\)$/)
        if (typeMatch) { const v = evalExpr(typeMatch[1]); return `<class '${typeof v}'>` }
        // str(), int(), float()
        const castMatch = expr.match(/^(str|int|float)\((.+)\)$/)
        if (castMatch) {
          const v = evalExpr(castMatch[2])
          if (castMatch[1] === 'str') return String(v)
          if (castMatch[1] === 'int') return Math.floor(Number(v))
          return Number(v)
        }
        // List literal
        if (expr.startsWith('[') && expr.endsWith(']'))
          return expr.slice(1, -1).split(',').map(e => evalExpr(e.trim())).filter(e => e !== '')
        // Variable
        if (vars[expr] !== undefined) return vars[expr]
        // Simple arithmetic
        const mathMatch = expr.match(/^(.+?)\s*([+\-*/%]|\/\/)\s*(.+)$/)
        if (mathMatch) {
          const l = evalExpr(mathMatch[1]), r = evalExpr(mathMatch[3])
          const op = mathMatch[2]
          if (op === '+') return typeof l === 'string' ? l + r : l + r
          if (op === '-') return l - r
          if (op === '*') return typeof l === 'string' ? l.repeat(r) : l * r
          if (op === '/') return l / r
          if (op === '//') return Math.floor(l / r)
          if (op === '%') return l % r
        }
        // Comparison
        const cmpMatch = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/)
        if (cmpMatch) {
          const l = evalExpr(cmpMatch[1]), r = evalExpr(cmpMatch[3])
          if (cmpMatch[2] === '==') return l == r
          if (cmpMatch[2] === '!=') return l != r
          if (cmpMatch[2] === '>=') return l >= r
          if (cmpMatch[2] === '<=') return l <= r
          if (cmpMatch[2] === '>') return l > r
          if (cmpMatch[2] === '<') return l < r
        }
        return expr
      }

      const execBlock = (block: string[]) => {
        for (let i = 0; i < block.length; i++) {
          const line = block[i]
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue

          // print()
          const printMatch = trimmed.match(/^print\((.+)\)$/)
          if (printMatch) {
            const args = printMatch[1].split(',').map(a => String(evalExpr(a.trim())))
            logs.push(args.join(' '))
            continue
          }

          // Variable assignment
          const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/)
          if (assignMatch) { vars[assignMatch[1]] = evalExpr(assignMatch[2]); continue }

          // for loop
          const forMatch = trimmed.match(/^for\s+(\w+)\s+in\s+(.+):$/)
          if (forMatch) {
            const varName = forMatch[1]
            const iterable = evalExpr(forMatch[2])
            const body: string[] = []
            i++
            while (i < block.length && (block[i].startsWith('    ') || block[i].startsWith('\t'))) {
              body.push(block[i].replace(/^    |\t/, ''))
              i++
            }
            i--
            if (Array.isArray(iterable)) {
              for (const val of iterable) {
                if (++iterations > MAX_ITERATIONS) throw new Error('Execution limit exceeded (possible infinite loop)')
                vars[varName] = val; execBlock(body)
              }
            }
            continue
          }

          // if statement
          const ifMatch = trimmed.match(/^if\s+(.+):$/)
          if (ifMatch) {
            const cond = evalExpr(ifMatch[1])
            const body: string[] = []
            i++
            while (i < block.length && (block[i].startsWith('    ') || block[i].startsWith('\t'))) {
              body.push(block[i].replace(/^    |\t/, ''))
              i++
            }
            i--
            if (cond) execBlock(body)
            continue
          }
        }
      }

      execBlock(lines.length ? code.split('\n') : [])
      setOutput(logs.length ? logs : ['(no output)'])
    } catch (e: any) {
      logs.push(`Error: ${e.message}`)
      setOutput(logs.length ? logs : ['Error: Unable to interpret Python code'])
    }
    setRunning(false)
  }, [code, lang])

  const switchLang = (newLang: string) => {
    setLang(newLang)
    setCode(TEMPLATES[newLang].code)
    setOutput([])
    setHtmlPreview('')
  }

  return (
    <>
      <PageHeader title="CODE PLAYGROUND" subtitle="Write and run code instantly" />

      <div className="fade-up-1" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {Object.entries(TEMPLATES).map(([key, t]) => (
          <button key={key} className={`btn btn-sm ${lang === key ? 'btn-primary' : ''}`} onClick={() => switchLang(key)}>
            {t.label}
          </button>
        ))}
        <button className="btn btn-primary btn-sm" onClick={runCode} disabled={running} style={{ marginLeft: 'auto' }}>
          {running ? 'Running...' : '▶ Run'}
        </button>
      </div>

      <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 'calc(100vh - 240px)' }}>
        {/* Editor */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 4 }}>EDITOR · {TEMPLATES[lang].label}</div>
          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1, fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.6,
              background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--border)',
              borderRadius: 0, padding: 16, resize: 'none', outline: 'none',
              tabSize: 2,
            }}
            onKeyDown={e => {
              if (e.key === 'Tab') {
                e.preventDefault()
                const start = e.currentTarget.selectionStart
                const end = e.currentTarget.selectionEnd
                const newCode = code.substring(0, start) + '  ' + code.substring(end)
                setCode(newCode)
                setTimeout(() => {
                  e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2
                }, 0)
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                runCode()
              }
            }}
          />
        </div>

        {/* Output */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--fg-dim)', marginBottom: 4 }}>OUTPUT</div>
          {lang === 'html' ? (
            <iframe
              srcDoc={htmlPreview}
              sandbox="allow-scripts"
              style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 0, background: '#fff' }}
            />
          ) : (
            <div style={{
              flex: 1, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 0, padding: 16, overflowY: 'auto', color: 'var(--fg)',
            }}>
              {output.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('Error') ? 'var(--danger)' : line.startsWith('Warning') ? 'var(--warn)' : 'var(--fg)' }}>
                  {line}
                </div>
              ))}
              {output.length === 0 && <span style={{ color: 'var(--fg-dim)' }}>Click Run or press Ctrl+Enter</span>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
