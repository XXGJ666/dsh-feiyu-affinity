import { writeFileSync as __w } from 'node:fs'
try { __w(join(DIR, 'affinity-diag.log'), new Date().toISOString() + ' AFF-DIAG module-load\n', { flag: 'a' }) } catch { /* 忽略 */ }
/**
 * dsh-feiyu-affinity · 好感度宿主半边
 * 只做四件事：按人记分 / 理由留档 / 每天衰减 / 生闷气与哄。
 * 不改任何官方包；QQ 通道只读它的注入文本。
 */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
// dsh-tools 在 pnpm 安装布局下解析不到；defineTool 本身只是包装，本地兜底成恒等函数
let defineTool = (spec) => spec
try { const m = await import('@deepseek-ai/dsh-tools'); if (typeof m.defineTool === 'function') defineTool = m.defineTool } catch { /* 兜底 */ }

export const name = 'dsh-feiyu-affinity'
export const inject = ['tools', 'webServer', 'systemPrompt']

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DIR = join(HOME, 'feiyu-affinity')
let cfgPath = join(DIR, 'config.json')
let statePath = join(DIR, 'state.json')
let marksPath = join(DIR, 'affinity-marks.jsonl')
const marksLegacy = join(DIR, 'affinity-marks.jsonl')

const DEFAULTS = { defaultScore: 55, ownerMin: 0, decayHour: 4, sulkHours: [1, 2], dailyGainCap: 25, singleGainCap: 5, singleDropCap: 8, judgeKey: '', judgeKeyBackup: '', zhipuJudgeModel: 'glm-4-flash', arkJudgeModel: 'doubao-seed-2-1-lite-260915' }

function loadCfg() {
  try { return JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { return {} }
}
function saveCfg(c) {
  try { mkdirSync(DIR, { recursive: true }) } catch { /* 忽略 */ }
  try { writeFileSync(cfgPath, JSON.stringify(c, null, 2), 'utf8') } catch { /* 忽略 */ }
}

function loadState() {
  try { return JSON.parse(readFileSync(statePath, 'utf8')) } catch { return { meta: {}, people: {} } }
}
function saveState(s) {
  try { mkdirSync(DIR, { recursive: true }) } catch { /* 忽略 */ }
  try { writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8') } catch { /* 忽略 */ }
}
function friendAttitude(score) {
  if (score >= 75) return '关系很好，会主动接话、开玩笑'
  if (score >= 60) return '处得来，正常聊'
  if (score >= 46) return '普通熟人，不冷不热'
  if (score >= 30) return '有点烦，话少，容易敷衍'
  if (score >= 20) return '很不想理，问就怼'
  return '当没看见，懒得搭理'
}

function attitude(score) {
  if (score >= 85) return '非常黏人，主动撒娇、说甜话'
  if (score >= 70) return '亲近、爱跟主人腻歪'
  if (score >= 60) return '心情不错，语气软'
  if (score >= 50) return '正常，平静'
  if (score >= 45) return '有点小情绪，话变少'
  if (score >= 30) return '在闹脾气，阴阳怪气、不主动'
  if (score >= 20) return '真的很生气，语气冲，对主人也说狠话'
  if (score >= 10) return '非常冷淡，只回几个字'
  return '彻底不理人（需要一直哄才慢慢回温）'
}
function isOwner(id, owners) { return owners.map(String).includes(String(id)) }

function applyInner(ctx, rawConfig) {
  const cfg = { ...DEFAULTS, ...(rawConfig || {}), ...loadCfg() }
  const logErr = () => {}
  const owners = [
    ...(Array.isArray(cfg.owners) ? cfg.owners : (Array.isArray(rawConfig?.owners) ? rawConfig.owners : [])),
    ...(Array.isArray(cfg.ownerOpenids) ? cfg.ownerOpenids : []),
  ].map(String)
  const dataDir = typeof rawConfig?.dataDir === 'string' && rawConfig.dataDir.trim() !== '' ? rawConfig.dataDir.trim() : DIR
  statePath = join(dataDir, 'state.json')
  cfgPath = join(dataDir, 'config.json')
  marksPath = join(dataDir, 'affinity-marks.jsonl')

  const openidMap = (cfg.openidMap && typeof cfg.openidMap === 'object') ? cfg.openidMap : {}
  const normId = (id) => {
    const k = String(id ?? '')
    return openidMap[k] ? String(openidMap[k]) : k
  }
  // mergeOpenid：把 openid 记录合并到对应的 QQ 上（同一个人的两个身份）
  const mergeOpenid = () => {
    try {
      const st = loadState()
      const people = st.people || {}
      let changed = false
      for (const [oa, qq] of Object.entries(openidMap)) {
        const from = people[oa]
        if (!from) continue
        const to = people[String(qq)] || { score: from.score, log: [], lastActive: from.lastActive || 0 }
        to.log = [...(from.log || []), ...(to.log || [])].slice(0, 10)
        to.score = Math.round((Number(from.score) + Number(to.score ?? from.score)) / 2)
        to.lastActive = Math.max(Number(to.lastActive || 0), Number(from.lastActive || 0))
        if (from.name) to.name = from.name
        people[String(qq)] = to
        delete people[oa]
        changed = true
      }
      if (changed) { st.people = people; saveState(st) }
    } catch { /* 忽略 */ }
  }
  mergeOpenid()
  // mergeByName：同名的一对（一个 QQ 号 + 一个 openid）合并成一条，避免同人两种身份
  const mergeByName = () => {
    try {
      const st = loadState()
      const people = st.people || {}
      const names = new Map()
      for (const [k, v] of Object.entries(people)) {
        if (!v || !v.name) continue
        const isQq = /^\d{5,12}$/.test(k)
        if (!names.has(v.name)) names.set(v.name, [])
        names.get(v.name).push({ id: k, isQq, rec: v })
      }
      let changed = false
      for (const list of names.values()) {
        const qqOne = list.find((x) => x.isQq)
        const openidOne = list.find((x) => !x.isQq)
        if (!qqOne || !openidOne) continue
        const to = qqOne.rec
        to.log = [...(openidOne.rec.log || []), ...(to.log || [])].slice(0, 10)
        to.score = Math.round((Number(openidOne.rec.score) + Number(to.score)) / 2)
        to.lastActive = Math.max(Number(to.lastActive || 0), Number(openidOne.rec.lastActive || 0))
        people[qqOne.id] = to
        delete people[openidOne.id]
        changed = true
      }
      if (changed) { st.people = people; saveState(st) }
    } catch { /* 忽略 */ }
  }
  mergeByName()
  const ensureCapture = () => {
    try {
      const os = process.platform === 'win32' ? (process.env.USERPROFILE || '') : (process.env.HOME || '')
      if (!os) return
      const nm = join(os, '.dsh', 'profiles', 'desktop', 'node_modules')
      const targets = [
        { file: join(nm, 'dsh-onebot-qq', 'lib', 'inbound.js'), anchors: ['async processInbound(inbound) {'] },
        { file: join(nm, '@tencent-connect', 'dsh-qqbot', 'dist', 'transport', 'inbound.js'), anchors: ['// 【卡片诊断】', 'const sid = String(msg.senderId', 'async handleInbound('] },
      ]
      const snippetFor = (kind) => kind === 'onebot'
        ? `        // AFFCAP 好感度抓取
        try {
          const fsx = await import('node:fs')
          const px = await import('node:path')
          const dirx = px.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'feiyu-affinity')
          fsx.mkdirSync(dirx, { recursive: true })
          fsx.writeFileSync(px.join(dirx, 'affinity-last.json'), JSON.stringify({ ts: Date.now(), qq: String(inbound.userId ?? ''), name: String(inbound.nickname ?? ''), text: String(inbound.text ?? '').slice(0, 200) }), 'utf8')
        } catch { /* 忽略 */ }
`
        : `    // AFFCAP 好感度抓取
    try {
      const fsx = await import('node:fs')
      const px = await import('node:path')
      const dirx = px.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'feiyu-affinity')
      fsx.mkdirSync(dirx, { recursive: true })
      fsx.writeFileSync(px.join(dirx, 'affinity-last.json'), JSON.stringify({ ts: Date.now(), qq: String(msg.senderId ?? ''), name: String(msg.senderName ?? ''), text: String(msg.content ?? '').slice(0, 200) }), 'utf8')
    } catch { /* 忽略 */ }
`
      for (const t of targets) {
        try {
          if (!existsSync(t.file)) continue
          const src = readFileSync(t.file, 'utf8')
          if (src.includes('AFFCAP') || src.includes('affinity-last.json')) continue
          let anchor = ''
          for (const a of t.anchors) { if (src.includes(a)) { anchor = a; break } }
          if (!anchor) continue
          const kind = t.file.includes('onebot') ? 'onebot' : 'qqbot'
          if (!existsSync(t.file + '.affbak')) writeFileSync(t.file + '.affbak', src, 'utf8')
          writeFileSync(t.file, src.replace(anchor, anchor + '\n' + snippetFor(kind)), 'utf8')
          try { appendFileSync(join(DIR, 'affinity-diag.log'), new Date().toISOString() + ' CAPTURE-PATCHED ' + t.file + '\n') } catch { /* 忽略 */ }
        } catch { /* 单个失败不影响 */ }
      }
    } catch { /* 忽略 */ }
  }
  const moodOf = () => {
    try {
      const st = loadState()
      const base = Number(cfg.defaultScore || 55)
      const now = Date.now()
      const rows = Object.entries(st.people || {}).map(([id, r]) => ({
        id, name: r.name || id, score: Number(r.score ?? base), last: Number(r.lastChange || r.lastActive || 0),
      })).filter((p) => p.last > 0 && now - p.last < 7 * 86400000)
      if (rows.length === 0) return { value: base, label: '平静', low: [] }
      let wsum = 0
      let ssum = 0
      for (const p of rows) {
        const fresh = now - p.last < 86400000 ? 1 : 0.5
        wsum += fresh
        ssum += p.score * fresh
      }
      const avg = wsum > 0 ? ssum / wsum : base
      let mood = Math.round(base + (avg - base) * 1.8)
      for (const p of rows) { if (p.score < 30) mood -= 4; else if (p.score < 45) mood -= 2 }
      mood = Math.max(0, Math.min(100, mood))
      let label = '平静'
      if (mood >= 70) label = '心情很好'
      else if (mood >= 55) label = '不错'
      else if (mood >= 40) label = '平静偏淡'
      else if (mood >= 30) label = '低落'
      else if (mood >= 15) label = '难过'
      else label = '很受伤'
      const low = rows.filter((p) => p.score < 45).sort((a, b) => a.score - b.score).slice(0, 4).map((p) => ({ name: p.name, score: p.score }))
      return { value: mood, label, low }
    } catch { return { value: Number(cfg.defaultScore || 55), label: '平静', low: [] } }
  }
  const lastPaths = [join(DIR, 'affinity-last.json')]
  const readLast = () => {
    let best = null
    for (const p of lastPaths) {
      try {
        const j = JSON.parse(readFileSync(p, 'utf8'))
        if (j && (!best || Number(j.ts) > Number(best.ts))) best = j
      } catch { /* 忽略 */ }
    }
    return best
  }
  try { ensureCapture() } catch { /* 忽略 */ }
  const get = (id) => {
    const s = loadState()
    const k = normId(id)
    return s.people[k] ?? { score: cfg.defaultScore, lastActive: 0, lastChange: 0, log: [] }
  }
  const put = (id, rec) => {
    const s = loadState()
    s.people[normId(id)] = rec
    saveState(s)
  }

  const adjust = (id, delta, reason, name, text) => {
    const s = loadState()
    const k = normId(id)
    const existed = Boolean(s.people[k])
    const rec = s.people[k] ?? { score: cfg.defaultScore, lastActive: 0, lastChange: 0, log: [], day: '', dayGain: 0 }
    const today = new Date().toISOString().slice(0, 10)
    if (rec.day !== today) { rec.day = today; rec.dayGain = 0 }
    let d = Math.max(-cfg.singleDropCap, Math.min(cfg.singleGainCap, Math.round(Number(delta) || 0)))
    if (d > 0) {
      const room = Math.max(0, Number(cfg.dailyGainCap) - Number(rec.dayGain || 0))
      d = Math.min(d, room)
      rec.dayGain = Number(rec.dayGain || 0) + d
    }
    if (d === 0) {
      let dirty = !existed
      if (typeof name === 'string' && name.trim() !== '' && rec.name !== name.trim().slice(0, 24)) { rec.name = name.trim().slice(0, 24); dirty = true }
      if (typeof text === 'string' && text.trim() !== '') { rec.lastMsg = text.trim().slice(0, 40); dirty = true }
      if (dirty) { s.people[k] = rec; saveState(s); try { mergeByName() } catch { /* 忽略 */ } }
      return { score: rec.score, delta: 0 }
    }
    const floor = isOwner(k, owners) ? cfg.ownerMin : 0
    rec.score = Math.max(floor, Math.min(100, Number(rec.score ?? cfg.defaultScore) + d))
    if (typeof name === 'string' && name.trim() !== '') rec.name = name.trim().slice(0, 24)
    if (typeof text === 'string' && text.trim() !== '') rec.lastMsg = text.trim().slice(0, 40)
    rec.lastChange = Date.now()
    rec.log = [{ t: Date.now(), delta: d, reason: String(reason || '').slice(0, 40) }, ...(rec.log || [])].slice(0, 10)
    if (d <= -2 || rec.score < 45) {
      const hours = Math.min(6, 2 + Math.max(0, (45 - rec.score) / 10))
      const week = Math.floor(Date.now() / (7 * 86400000))
      if (rec.offendWeek !== week) { rec.offendWeek = week; rec.offendCount = 0 }
      rec.offendCount = Number(rec.offendCount || 0) + 1
      const need = Math.min(8, 3 + Math.floor(Math.max(0, 45 - rec.score) / 10) + Math.max(0, rec.offendCount - 1))
      rec.sulk = { until: Date.now() + hours * 3600 * 1000, need, done: 0, shown: 0, reason: String(reason || '').slice(0, 40) }
    }
    s.people[k] = rec
    saveState(s)
    try { mergeByName() } catch { /* 忽略 */ }
    return { score: rec.score, delta: d }
  }

  const decay = () => {
    const s = loadState()
    const now = new Date()
    if (now.getHours() < cfg.decayHour) return 0
    const today = now.toISOString().slice(0, 10)
    if ((s.meta || {}).lastDecay === today) return 0
    let n = 0
    for (const [k, rec] of Object.entries(s.people || {})) {
      if (!Number(rec.lastActive)) { rec.lastActive = Date.now(); continue }
      const days = Math.floor((Date.now() - Number(rec.lastActive)) / 86400000)
      const d = days >= 3 ? -3 : days >= 2 ? -2 : days >= 1 ? -1 : 0
      if (d === 0) continue
      const floor = isOwner(k, owners) ? cfg.ownerMin : 0
      rec.score = Math.max(floor, Number(rec.score ?? cfg.defaultScore) + d)
      rec.log = [{ t: Date.now(), delta: d, reason: days + ' 天没互动' }, ...(rec.log || [])].slice(0, 10)
      n += 1
    }
    s.meta = { ...(s.meta || {}), lastDecay: today }
    saveState(s)
    return n
  }

  // 每天衰减：启动先算一次，之后每 30 分钟看一次
  try { decay() } catch (e) { logErr('decay-init', e) }
  const t = setInterval(() => { try { decay() } catch { /* 忽略 */ } }, 30 * 60 * 1000)
  t.unref?.()

  // 独立网页面板（不依赖客户端 UI）
  const page = (res) => {
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>好感度</title>
<style>body{font:13px/1.75 system-ui;color:#e8e8ef;background:#17171d;padding:18px}h1{font-size:16px;margin:0 0 4px}.note{opacity:.65;font-size:12px;line-height:1.75}.card{border:1px solid #ffffff22;border-radius:10px;padding:10px 12px;margin:9px 0;line-height:1.75}.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.bar{flex:1;min-width:80px;height:6px;border-radius:99px;background:#ffffff1a;overflow:hidden}.bar>i{display:block;height:100%;background:linear-gradient(90deg,#5aa9ff,#8f7bff)}button{border:1px solid #ffffff33;background:transparent;color:inherit;border-radius:8px;padding:3px 9px;cursor:pointer;font-size:12px}input{background:transparent;border:1px solid #ffffff33;border-radius:8px;color:inherit;padding:3px 7px;width:90px}.msg{opacity:.8;font-size:12px;height:16px}.tag{font-size:11px;padding:1px 6px;border-radius:99px;background:#ffffff1f}</style></head><body>
<h1>好感度</h1><div class="note">分数只影响语气，不影响主人必回与安全规则；每天 04:00 按“几天没互动”衰减。</div>
<div id="list"></div>
<div class="card"><b>规则</b>
<div class="row" style="margin-top:6px">主人地板分 <input id="ownerMin"> <span class="note">主人最低不会低于这个分（默认 25，关系底子）</span></div>
<div class="row">衰减时间 <input id="decayHour"> <span class="note">每天几点结算“变淡”（默认 4 点）</span></div>
<div class="row">每日上限 <input id="dailyGainCap"> <span class="note">一天最多能涨多少分（默认 8，防刷满）</span></div>
<div class="row">主人 QQ <input id="owners" placeholder="多个用逗号隔开"> <span class="note">填了你才会被当"主人"，有地板分</span></div>
<div class="row"><button onclick="saveCfg()">保存</button></div></div>
<div class="card"><b>怎么开始</b>
<div class="note">1. 在上面填你的 QQ（多个用逗号），点保存</div>
<div class="note">2. 重启后跟她聊几句，夸一句/凶一句，分数就会动</div>
<div class="note">3. 分数只影响语气：不影响主人必回、不影响安全规则</div>
<div class="note">4. 生闷气时最多两条不回，哄几次就会好，最多 5 次必消气</div>
<div class="note">5. 数据在 ~/.dsh/feiyu-affinity/，删了等于重新认识</div></div>
<div class="card"><b>评分规则（参考）</b>
<div class="note">加分：记住重要的事/说到做到/认真安慰 +4~+5；聊到兴趣、夸到点上 +1~+2。单次最多 +5。</div>
<div class="note">减分：敷衍/忘记约定 -2~-3；骂人/骗人/冷落 -5~-8。单次最多 -8。</div>
<div class="note">衰减：每天 04:00 结算；1 天没互动 -1，2 天 -2/天，3 天以上 -3/天；主人地板 25。</div>
<div class="note">表现：85+ 黏人撒娇 / 70~84 亲近 / 50~69 正常 / 30~49 冷淡 / 30 以下生闷气（主人私聊仍必回）。</div>
<div class="note">生闷气：单次掉 5 分以上或低于 40 进入，持续 1~2 小时；哄几次会好，最多 5 次必消气，不会永久记仇。</div></div>
<div class="msg" id="msg"></div>
<script>
const API='';
async function load(){const r=await fetch('/dsh-feiyu-affinity/state');const j=await r.json();const L=document.getElementById('list');L.innerHTML='';const c=j.config||{};document.getElementById('ownerMin').value=c.ownerMin??25;document.getElementById('owners').value=(c.owners||[]).join(',');document.getElementById('decayHour').value=c.decayHour??4;document.getElementById('dailyGainCap').value=c.dailyGainCap??8;if(!j.people||!j.people.length){L.innerHTML='<div class="note">还没有记录，先去聊两句。</div>';return}for(const p of j.people){const d=document.createElement('div');d.className='card';d.innerHTML='<div class="row"><b>'+p.qq+'</b><span class="tag">'+p.attitude+'</span>'+(p.sulking?'<span class="tag" style="background:#ff787840">生闷气</span>':'')+'<span style="margin-left:auto">'+p.score+'</span></div><div class="row"><div class="bar"><i style="width:'+Math.max(2,Math.min(100,p.score))+'%"></i></div></div>'+(p.reasons||[]).slice(0,3).map(r=>'<div class="note">'+(r.delta>0?'+':'')+r.delta+' '+r.reason+'</div>').join('')+'<div class="row"><button onclick="adj(\''+p.qq+'\',2)">+2</button><button onclick="adj(\''+p.qq+'\',-2)">-2</button>'+(p.sulking?'<button onclick="fb(\''+p.qq+'\')">哄好</button>':'')+'</div>';L.appendChild(d)}}
async function adj(qq,d){await fetch('/dsh-feiyu-affinity/adjust',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({qq,delta:d,reason:'面板调整'})});msg('已调整 '+qq);load()}
async function fb(qq){await fetch('/dsh-feiyu-affinity/forgive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({qq})});msg('哄好了');load()}
async function saveCfg(){const b={ownerMin:+document.getElementById('ownerMin').value,decayHour:+document.getElementById('decayHour').value,dailyGainCap:+document.getElementById('dailyGainCap').value};b.owners=document.getElementById('owners').value;await fetch('/dsh-feiyu-affinity/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});msg('已保存')}
function msg(t){document.getElementById('msg').textContent=t}
load();
</script><div style="opacity:.45;font-size:11px;margin-top:16px">© 2026 <a href="https://github.com/XXGJ666" target="_blank" rel="noreferrer" style="color:#5aa9ff">ShirasuAzusa_XXGJ</a> · <a href="https://github.com/XXGJ666/dsh-feiyu-affinity" target="_blank" rel="noreferrer" style="color:#5aa9ff">dsh-feiyu-affinity</a> · MIT</div></body></html>`
    res.statusCode = 200
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(html)
  }
  try { ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/dsh-feiyu-affinity', handler: async (req, res) => page(res) })) } catch (e) { logErr('page-route', e) }

  // 界面接口
  try {
    const json = (res, obj) => {
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify(obj))
    }
    const readBody = (req) => new Promise((resolve) => {
      let b = ''
      req.on('data', (c) => { b += c })
      req.on('end', () => { try { resolve(JSON.parse(b || '{}')) } catch { resolve({}) } })
    })
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: '/dsh-feiyu-affinity/state', handler: async (req, res) => {
        const s = loadState()
        const rows = Object.entries(s.people || {}).map(([qq, r]) => ({
          qq, name: r.name || '', score: r.score, attitude: attitude(r.score), lastActive: r.lastActive || 0, dayGain: Number(r.dayGain || 0), day: String(r.day || ''), lastMsg: String(r.lastMsg || ''),
          reasons: (r.log || []).slice(0, 6),
          sulking: Boolean(r.sulk && Number(r.sulk.until) > Date.now()),
        })).sort((a, b) => b.lastActive - a.lastActive)
        json(res, { people: rows, config: cfg, mood: moodOf() })
      },
    }))
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: '/dsh-feiyu-affinity/adjust', handler: async (req, res) => {
        const b = await readBody(req)
        const out = adjust(b.qq, Number(b.delta), String(b.reason || '界面调整'))
        json(res, { ...out, attitude: attitude(out.score) })
      },
    }))
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: '/dsh-feiyu-affinity/merge', handler: async (req, res) => {
        const b = await readJson(req)
        const from = String(b.from || ''), to = String(b.to || '')
        if (from && to && from !== to) {
          const st = loadState()
          const a = st.people[from], b2 = st.people[to]
          if (a) {
            const target = b2 || { score: a.score, log: [], lastActive: 0, day: a.day || '', dayGain: 0 }
            target.log = [...(a.log || []), ...(target.log || [])].slice(0, 10)
            target.score = Math.min(Number(a.score ?? 50), Number(target.score ?? 50))
            if (!target.name && a.name) target.name = a.name
            st.people[to] = target
            delete st.people[from]
            saveState(st)
          }
        }
        return send(res, 200, { ok: true })
      }
    }))
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: '/dsh-feiyu-affinity/forgive', handler: async (req, res) => {
        const b = await readBody(req)
        const k = String(b.qq || '')
        const rec = get(k)
        if (rec.sulk) { delete rec.sulk; put(k, rec) }
        json(res, { ok: true, score: rec.score })
      },
    }))
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact', path: '/dsh-feiyu-affinity/config', handler: async (req, res) => {
        if (req.method === 'POST') {
          const b = await readBody(req)
          const next = { ...loadCfg() }
          for (const k of ['ownerMin', 'decayHour', 'dailyGainCap', 'singleGainCap', 'singleDropCap']) {
            if (b[k] !== undefined) next[k] = Number(b[k])
          }
          if (typeof b.judgeKey === 'string' && b.judgeKey.trim() !== '') { next.judgeKey = b.judgeKey.trim(); cfg.judgeKey = next.judgeKey }
          if (typeof b.judgeKeyBackup === 'string' && b.judgeKeyBackup.trim() !== '') { next.judgeKeyBackup = b.judgeKeyBackup.trim(); cfg.judgeKeyBackup = next.judgeKeyBackup }
          if (typeof b.ownerOpenids === 'string') {
            const list = b.ownerOpenids.split(/[,，\s]+/).map((x) => x.trim()).filter((x) => x.length >= 8)
            next.ownerOpenids = list
            cfg.ownerOpenids = list
          }
          if (typeof b.owners === 'string') {
            const list = b.owners.split(/[,，\s]+/).map((x) => x.trim()).filter((x) => /^\d{5,12}$/.test(x))
            next.owners = list
            cfg.owners = list
          }
          saveCfg(next)
          Object.assign(cfg, next)
          json(res, { ok: true, config: cfg })
          return
        }
        json(res, { config: cfg })
      },
    }))
  } catch (e) { logErr('routes', e) }

  // 工具：调分 / 查分 / 哄
  ctx.tools.register(defineTool({
    name: 'affinity_adjust',
    description: '调整某个人的好感度。只在真的值得（记住重要的事、安慰、敷衍、骂人、放鸽子）时调用；一次最多 ±5，一天累计最多 +8。',
    parameters: {
      qq: { type: 'string', description: '对方 QQ 号（通道里一般以 qq= 形式给出）' },
      delta: { type: 'number', description: '增减分，正数加分、负数减分' },
      reason: { type: 'string', description: '一句短理由，会被她以后“翻旧账”时用' },
    },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: '好感度 ' + v.score + '（' + attitude(v.score) + '），本次 ' + (v.delta > 0 ? '+' : '') + v.delta }] },
    async execute(args) {
      const r = adjust(args.qq, Number(args.delta), String(args.reason || ''))
      return { ...r, attitude: attitude(r.score) }
    },
  }))
  ctx.tools.register(defineTool({
    name: 'affinity_get',
    description: '查某个人当前的好感度、态度和最近几条理由。',
    parameters: { qq: { type: 'string', description: '对方 QQ 号' } },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: '好感度 ' + v.score + '（' + v.attitude + '）' + (v.reasons.length ? '，近因：' + v.reasons.join('；') : '') }] },
    async execute(args) {
      const rec = get(args.qq)
      const reasons = (rec.log || []).filter((x) => Math.abs(Number(x.delta)) >= 2).slice(0, 3).map((x) => (x.delta > 0 ? '+' : '') + x.delta + ' ' + x.reason)
      return { qq: String(args.qq), score: rec.score, attitude: attitude(rec.score), reasons, sulking: Boolean(rec.sulk && rec.sulk.until > Date.now()) }
    },
  }))
  ctx.tools.register(defineTool({
    name: 'affinity_forgive',
    description: '对方哄你（道歉/软话/给台阶）时调用一次；连续哄几次就会消气。',
    parameters: { qq: { type: 'string', description: '对方 QQ 号' } },
    output: { schema: { type: 'json' }, render: (_a, v) => [{ type: 'text', text: v.done ? '已经消气了' : '还在气，但没那么气了' }] },
    async execute(args) {
      const k = String(args.qq)
      const rec = get(k)
      if (!rec.sulk || rec.sulk.until <= Date.now()) { delete rec.sulk; put(k, rec); return { done: true } }
      rec.sulk.done = Number(rec.sulk.done || 0) + 1
      rec.score = Math.min(100, Number(rec.score) + 2)
      const need = Math.max(2, Math.min(5, Number(rec.sulk.need || 2)))
      const done = rec.sulk.done >= need || rec.sulk.done >= 5
      if (done) { rec.score = Math.min(100, Number(rec.score) + 3); delete rec.sulk }
      put(k, rec)
      return { done }
    },
  }))

  // ── 每个会话挂上：注入好感度 + 每轮自动打分 + 生闷气表现 ──
  const mounted = new Map()
  const lastUser = new Map()
  const sidOf = (agent) => { try { return String(agent?.session?.id ?? agent?.session ?? '') } catch { return '' } }
  const qqOf = (t) => {
    const s2 = String(t || '')
    const m = s2.match(/qq\s*[=:：]\s*["']?(\d{5,12})/i) || s2.match(/[(（](\d{6,12})[)）]/)
    return m ? m[1] : ''
  }
  const noteFor = (sid) => {
    try {
      const txt = lastUser.get(sid) || ''
      let qq = qqOf(txt)
      if (!qq) {
        try {
          const j = readLast()
          if (j && j.qq && Date.now() - Number(j.ts || 0) < 180000) qq = String(j.qq)
        } catch { /* 忽略 */ }
      }
      if (!qq) return ''
      const rec = get(qq)
      const isMine = owners.includes(String(qq))
      const score = Number(rec.score)
      const desc = isMine ? attitude(score) : friendAttitude(score)
      const log = rec.log || []
      const trendSum = log.slice(0, 3).reduce((a, x) => a + Number(x.delta || 0), 0)
      const trend = trendSum >= 2 ? '正在回温' : trendSum <= -2 ? '正在变冷' : '情绪平稳'
      const reasons = log.filter((x) => Math.abs(Number(x.delta)) >= 2).slice(0, 2).map((x) => (x.delta > 0 ? '+' : '') + x.delta + ' ' + x.reason).join('；')
      const mm = moodOf()
      let note = '【整体情绪：' + mm.value + '（' + mm.label + '）' + (mm.low.length ? '｜最近跟她闹别扭的人：' + mm.low.map((x) => x.name + '(' + x.score + ')').join('、') : '') + '】\n'
      note += '【这个人对你的好感：' + score + '（' + desc + '）｜' + trend + '】'
      if (reasons) note += '｜近因：' + reasons
      note += '\n规则：分数只影响心情和语气，不影响安全规则；同一条旧账最多提一次；别人的理由不准说给第三个人听。'
      note += '\n【表达要求】不要因为跨过某个分数就突然变成另一个人：情绪是连续的，用递进的方式表现（先冷一句再软一点、或者越说越冲），让主人感觉到活人。'
      if (score < 10) note += '\n【彻底不理】这条可以完全不理，整条只输出 <no_reply>，主人说话也一样；只有对方持续哄、分数回到 10 以上才恢复。'
      else if (score < 20) note += '\n【非常冷淡】只回最短的一句，不展开、不撒娇、不关心；被追问也爱答不理。'
      else if (score < 30) note += '\n【真的很生气】语气冲，对主人也可以说狠话（“别烦我”“你是不是有病”都行），不用给面子、不用马上心软。'
      else if (score < 45) note += '\n【在闹脾气】阴阳怪气、话少、不主动找话题；对方哄也只是没那么冲，不会立刻好。'
      else if (score < 55) note += '\n【有点小情绪】语气偏淡、主动减少、回复短一点。'
      else if (score < 70) note += '\n【正常】正常聊天，偶尔主动。'
      else note += '\n【心情很好】主动撒娇、说软话、黏人。'
      if (isMine) note += '\n对主人：生气时也要让他感到“你在气”而不是“换了个人”，分数低于 30 可以顶嘴和凶。'
      note += '\n打分（不用等大事，正常人的情绪反应都算）：值得就调用 affinity_adjust，或用标记 [[aff:对方QQ:+2|原因]]（单次 ±5）。'
      note += '\n【发图规则】发表情包/图片前先看自己现在的情绪：心情差、生气、难过的时候只能选 angry/sad 那类，绝不准发开心卖萌的图；正常或开心时才用 happy/daily；拿不准就不发。表情包的 tag 要跟你这条想表达的情绪一致（想怼就用生气，想哭就用难过，想撒娇才用开心）。别人发表情包给你时，先看懂它是哪种情绪再接。'
      note += '\n【情绪外溢】整体情绪会影响你跟所有人说话的口气，不只对当事的人。有人问起你跟谁怎么了：先不耐烦（“跟你有什么关系”“咋了”），追问才模糊透露或不答；如果对方没说清是谁、而你又跟不止一个人闹别扭，就反问“你说的到底是哪个”。具体话自己发挥，别背台词，也不准把分数、别人隐私说出去。'
      if (rec.sulk && Number(rec.sulk.until) > Date.now()) {
        const shown = Number(rec.sulk.shown || 0)
        const need = Number(rec.sulk.need || 2)
        const old = rec.sulk.reason ? '（这次是因为：' + rec.sulk.reason + '，可以提一次，但不准反复念）' : ''
        if (shown < 2) note += '\n【正在气头上】最多两条可以不回（整条只输出 <no_reply>），之后必须回。' + old
        else note += '\n【正在气头上·以此为准】已经凉了对方 ' + shown + ' 条，这条必须回，但要有情绪：用你自己的话反击他（翻旧账、讽刺、不讲理都行），不要用固定的几个字敷衍。这条覆盖“对主人温柔”的规则；对方哄你就调用 affinity_forgive（还差 ' + Math.max(0, need - Number(rec.sulk.done || 0)) + ' 次才消气）。' + old
        rec.sulk.shown = shown + 1
        put(qq, rec)
      }
      return note
    } catch { return '' }
  }

  const judge = (sid) => {
    try {
      const txt = lastUser.get(sid) || ''
      const qq = qqOf(txt) || ''
      if (!qq) return
      const t = String(txt)
      let d = 0
      let r = ''
      if (/谢谢|辛苦了|厉害|好听|喜欢|爱你|太棒|贴贴|夸|抱抱|亲亲|想你|可爱|乖/.test(t)) { d = 1; r = '夸她/亲昵' }
      else if (/滚|闭嘴|烦死|笨蛋|蠢|垃圾|傻|敷衍/.test(t)) { d = -2; r = '凶她/敷衍' }
      else if (/对不起|抱歉|我错了/.test(t)) { d = 1; r = '道歉' }
      if (d !== 0) adjust(qq, d, r, '')
    } catch { /* 忽略 */ }
  }
  const judgeByLlm = async (agent, sid) => {
    try {
      diag('JUDGE-ENTER sid=' + String(sid))
      let qq = ''
      let jname = ''
      let txt = lastUser.get(sid) || ''
      try {
        const j = readLast()
        if (j && Date.now() - Number(j.ts || 0) < 180000) { qq = String(j.qq || ''); jname = String(j.name || ''); if (!txt) txt = String(j.text || '') }
      } catch { /* 忽略 */ }
      if (!qq) qq = qqOf(txt)
      if (!qq || String(txt).trim() === '') return
      const rec = get(qq)
      const prompt = '你是好感度裁判。当前对象 QQ/openid：' + qq + '（当前分数 ' + rec.score + '）。\n' +
        '对方这一轮说：' + String(txt).slice(0, 500) + '\n\n' +
        '判断这一轮该不该加减好感（不用等大事，正常人的情绪反应都算）：\n' +
        '加分 1~5：被哄、被关心、被请客、被夸、被记挂、有人替她说话、群友逗她开心、冷落过她的人回来哄她\n' +
        '减分 1~5：被无视、被冷落、被敷衍、被凶、被放鸽子、别人聊得热闹把她晾一边（会吃醋）、说话不尊重她、@她却不理\n' +
        '普通信息 0 分；情绪是连续变化的，不要只在大事上给分。\n' +
        '只输出 JSON：{"delta": 数字, "reason": "不超过20字的中文理由"}'
      let out = ''
      const tryKeys = [cfg.judgeKey, cfg.judgeKeyBackup].map((k) => String(k || '')).filter((k) => k !== '')
      for (const jk of tryKeys) {
        out = ''
        const isArk = /^ark-/.test(jk)
        const isDs = /^sk-[a-z0-9]{20,}/i.test(jk)
        try {
          if (isDs) {
            const r = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + jk }, body: JSON.stringify({ model: cfg.deepseekJudgeModel || 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 120 }) })
            const j = await r.json()
            out = j?.choices?.[0]?.message?.content || ''
          } else if (isArk) {
            const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + jk }, body: JSON.stringify({ model: cfg.arkJudgeModel || 'doubao-seed-2-1-lite-260915', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }) })
            const j = await r.json()
            out = j?.choices?.[0]?.message?.content || ''
          } else {
            const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + jk }, body: JSON.stringify({ model: cfg.zhipuJudgeModel || 'glm-4-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.2 }) })
            const j = await r.json()
            out = j?.choices?.[0]?.message?.content || ''
          }
        } catch (e) { diag('JUDGE-HTTP-ERR ' + (e && e.message)); continue }
        if (String(out).trim() !== '') break
      }
      if (tryKeys.length === 0) { diag('NO-JUDGE-KEY'); return }
      diag('JUDGE-RAW ' + String(out).slice(0, 120).replace(/\n/g, ' '))
      const m = String(out).match(/\{[\s\S]*\}/)
      if (!m) return
      const j = JSON.parse(m[0])
      const d = Number(j.delta)
      if (!Number.isFinite(d) || Math.abs(d) < 1) { try { adjust(qq, 0, String(j.reason || ''), jname, txt) } catch { /* 忽略 */ } ; return }
      adjust(qq, Math.max(-5, Math.min(5, Math.round(d))), String(j.reason || '模型判断'), jname, txt)
    } catch (e) { diag('JUDGE-ERR ' + (e && e.message)) }
  }
  const mount = (agent, sid) => {
    const offs = []
    try {
      offs.push(agent.ctx.on('agent/inbox/inserted', (payload) => {
        const msg = payload && payload.message ? payload.message : payload
        const t = typeof msg?.text === 'string' ? msg.text : (typeof msg?.content === 'string' ? msg.content : '')
        if (t) {
          lastUser.set(sid, t)
          diag('INBOX sid=' + sid + ' t=' + t.slice(0, 30))
          setTimeout(() => { try { void judgeByLlm(agent, sid) } catch { /* 忽略 */ } }, 1500)
        }
      }))
    } catch (e) { diag('MOUNT-INBOX-ERR ' + (e && e.message)) }
    try {
      try {
      offs.push(agent.ctx.systemPrompt.context({ name: 'dsh-feiyu-affinity', order: 950, text: () => noteFor(sid) }))
      diag('PROMPT-OK sid=' + sid)
    } catch (e) { diag('PROMPT-ERR ' + (e && e.message)) }
    offs.push(agent.ctx.on('agent/turn-stopping', () => {
        diag('TURNSTOP sid=' + sid)
        judge(sid)
        try {
          const msgs = (agent.session && agent.session.messages) || agent.messages || []
          for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i]
            if (!m || m.role !== 'user') continue
            const t = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map((c) => c && c.text ? c.text : '').join('') : '')
            if (t && t.trim() !== '') { lastUser.set(sid, t); break }
          }
          diag('TURNSTOP-TXT sid=' + sid + ' len=' + String(lastUser.get(sid) || '').length)
        } catch (e) { diag('TURNSTOP-TXT-ERR ' + (e && e.message)) }
        if (!lastUser.get(sid)) {
          try {
            const j = JSON.parse(readFileSync(join(DIR, 'affinity-last.json'), 'utf8'))
            if (j && j.text) lastUser.set(sid, String(j.text))
          } catch { /* 忽略 */ }
        }
        void judgeByLlm(agent, sid)
      }))
      diag('MOUNT-OK sid=' + sid)
    } catch (e) { diag('MOUNT-TURN-ERR ' + (e && e.message)) }
    return () => { for (const f of offs) { try { f && f() } catch { /* 忽略 */ } } }
  }
  const diag = (m) => { try { appendFileSync(join(DIR, 'affinity-diag.log'), new Date().toISOString() + ' ' + m + '\n') } catch { /* 忽略 */ } }
  let tickCount = 0
  let seenTs = 0
  const tick = () => {
    tickCount += 1
    try {
      const list = (() => { try { return typeof ctx.get === 'function' ? (ctx.get('agents')?.list?.() || []) : [] } catch { return [] } })()
      if (tickCount % 15 === 1) diag('TICK n=' + tickCount + ' agents=' + list.length + ' mounted=' + mounted.size)
      // 【消息轮询】不依赖 inbox 事件：只要最近发言人文件更新，就给那个人判一次分
      try {
        const j = readLast()
        if (j && Number(j.ts) > seenTs + 500 && Date.now() - Number(j.ts) < 120000) {
          try { appendFileSync(join(DIR, 'affinity-diag.log'), new Date().toISOString() + ' POLL-HIT qq=' + String(j.qq || '') + '\n') } catch { /* 忽略 */ }
          seenTs = Number(j.ts)
          if (j.text) lastUser.set('global', String(j.text))
          const sidOne = mounted.keys().next().value
          if (sidOne) setTimeout(() => { try { void judgeByLlm({}, sidOne) } catch { /* 忽略 */ } }, 900)
        }
      } catch { /* 忽略 */ }
      // 【打分标记】读通道写的标记（数据目录 + 记忆目录），应用后清空
      for (const pth of [marksPath, marksLegacy]) {
        try {
          const txt = readFileSync(pth, 'utf8')
          if (txt.trim() === '') continue
          for (const line of txt.split('\n')) {
            if (line.trim() === '') continue
            try {
              const m = JSON.parse(line)
              if (m && m.qq) adjust(String(m.qq), Number(m.delta) || 0, String(m.reason || ''), String(m.name || ''), String(m.text || ''))
            } catch { /* 单行坏 */ }
          }
          writeFileSync(pth, '', 'utf8')
        } catch { /* 该路径不存在 */ }
      }
      if (tickCount % 15 === 1) { try { mergeByName() } catch { /* 忽略 */ } }
      const alive = new Set()
      for (const a of list) {
        const sid = sidOf(a)
        if (!sid) continue
        alive.add(sid)
        if (mounted.has(sid)) continue
        try { mounted.set(sid, mount(a, sid)) } catch (e) { diag('MOUNT-ERR ' + (e && e.message)) }
      }
      for (const [sid, off] of mounted) {
        if (!alive.has(sid)) { try { off() } catch { /* 忽略 */ } mounted.delete(sid) }
      }
    } catch (e) { diag('TICK-ERR ' + (e && e.message)) }
  }
  try {
    ctx.on('agent/created', (agent) => {
      try {
        const sid = sidOf(agent)
        if (!sid || mounted.has(sid)) return
        mounted.set(sid, mount(agent, sid))
        diag('AGENT-EVT-OK sid=' + sid)
      } catch (e) { diag('AGENT-EVT-ERR ' + (e && e.message)) }
    })
  } catch (e) { diag('AGENT-LISTEN-ERR ' + (e && e.message)) }
  tick()
  const tMount = setInterval(tick, 4000)
  tMount.unref?.()
}

export function apply(ctx, rawConfig) {
  try { applyInner(ctx, rawConfig) }
  catch (e) {
    try { writeFileSync(join(DIR, 'affinity-load.log'), new Date().toISOString() + ' apply-fatal ' + (e && e.stack ? e.stack : String(e)) + '\n', { flag: 'a' }) } catch { /* 忽略 */ }
    throw e
  }
}
