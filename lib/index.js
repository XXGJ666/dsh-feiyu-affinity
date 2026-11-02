import { writeFileSync as __w } from 'node:fs'
try { __w('D:\\dshchajian\\qq-patch\\affinity-diag.log', new Date().toISOString() + ' AFF-DIAG module-load\n', { flag: 'a' }) } catch { /* 忽略 */ }
/**
 * dsh-feiyu-affinity · 好感度宿主半边
 * 只做四件事：按人记分 / 理由留档 / 每天衰减 / 生闷气与哄。
 * 不改任何官方包；QQ 通道只读它的注入文本。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
// dsh-tools 在 pnpm 安装布局下解析不到；defineTool 本身只是包装，本地兜底成恒等函数
let defineTool = (spec) => spec
try { const m = await import('@deepseek-ai/dsh-tools'); if (typeof m.defineTool === 'function') defineTool = m.defineTool } catch { /* 兜底 */ }

export const name = 'dsh-feiyu-affinity'
export const inject = ['tools', 'webServer']

const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DIR = join(HOME, 'feiyu-affinity')
const MARKS_PATH = 'D:\\大肥鱼的记忆工作区以及跨记忆文件夹\\affinity-marks.jsonl'

const DEFAULTS = { defaultScore: 50, ownerMin: 25, decayHour: 4, sulkHours: [1, 2], dailyGainCap: 8, singleGainCap: 5, singleDropCap: 8 }

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
  if (score >= 70) return '像好哥们，会接话、说好话，但不越界'
  if (score >= 40) return '普通熟人，正常聊，不热络'
  if (score >= 25) return '有点烦，话少，问无聊问题就敷衍'
  return '不想理，能怼就怼'
}

function attitude(score) {
  if (score >= 85) return '黏人、主动撒娇、说好听的'
  if (score >= 70) return '亲近自然'
  if (score >= 50) return '正常'
  if (score >= 30) return '冷淡、话少、有点阴阳怪气'
  return '生闷气、能不理就不理（主人私聊仍必须回）'
}
function isOwner(id, owners) { return owners.map(String).includes(String(id)) }

function applyInner(ctx, rawConfig) {
  const cfg = { ...DEFAULTS, ...(rawConfig || {}), ...loadCfg() }
  const logErr = () => {}
  const owners = (Array.isArray(cfg.owners) ? cfg.owners : (Array.isArray(rawConfig?.owners) ? rawConfig.owners : [])).map(String)
  const dataDir = typeof rawConfig?.dataDir === 'string' && rawConfig.dataDir.trim() !== '' ? rawConfig.dataDir.trim() : DIR
  const statePath = join(dataDir, 'state.json')
  const cfgPath = join(dataDir, 'config.json')
  const marksPath = join(dataDir, 'affinity-marks.jsonl')

  const get = (id) => {
    const s = loadState()
    const k = String(id)
    return s.people[k] ?? { score: cfg.defaultScore, lastActive: 0, lastChange: 0, log: [] }
  }
  const put = (id, rec) => {
    const s = loadState()
    s.people[String(id)] = rec
    saveState(s)
  }

  const adjust = (id, delta, reason) => {
    const s = loadState()
    const k = String(id)
    const rec = s.people[k] ?? { score: cfg.defaultScore, lastActive: 0, lastChange: 0, log: [], day: '', dayGain: 0 }
    const today = new Date().toISOString().slice(0, 10)
    if (rec.day !== today) { rec.day = today; rec.dayGain = 0 }
    let d = Math.max(-cfg.singleDropCap, Math.min(cfg.singleGainCap, Math.round(Number(delta) || 0)))
    if (d > 0) {
      const room = Math.max(0, cfg.dailyGainCap - Number(rec.dayGain || 0))
      d = Math.min(d, room)
      rec.dayGain = Number(rec.dayGain || 0) + d
    }
    if (d === 0) return { score: rec.score, delta: 0 }
    const floor = isOwner(k, owners) ? cfg.ownerMin : 0
    rec.score = Math.max(floor, Math.min(100, Number(rec.score ?? cfg.defaultScore) + d))
    rec.lastChange = Date.now()
    rec.log = [{ t: Date.now(), delta: d, reason: String(reason || '').slice(0, 40) }, ...(rec.log || [])].slice(0, 10)
    if (d <= -5 || rec.score < 40) {
      const hours = cfg.sulkHours[0] + Math.random() * (cfg.sulkHours[1] - cfg.sulkHours[0])
      const week = Math.floor(Date.now() / (7 * 86400000))
      if (rec.offendWeek !== week) { rec.offendWeek = week; rec.offendCount = 0 }
      rec.offendCount = Number(rec.offendCount || 0) + 1
      const need = Math.min(5, 2 + Math.max(0, rec.offendCount - 1))
      rec.sulk = { until: Date.now() + hours * 3600 * 1000, need, done: 0, shown: 0, reason: String(reason || '').slice(0, 40) }
    }
    s.people[k] = rec
    saveState(s)
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
      const days = Math.floor((Date.now() - Number(rec.lastActive || 0)) / 86400000)
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
</script></body></html>`
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
          qq, score: r.score, attitude: attitude(r.score), lastActive: r.lastActive || 0,
          reasons: (r.log || []).slice(0, 6),
          sulking: Boolean(r.sulk && Number(r.sulk.until) > Date.now()),
        })).sort((a, b) => b.lastActive - a.lastActive)
        json(res, { people: rows, config: cfg })
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
    const m = s2.match(/(?:qq|QQ)\s*[=:：]\s*(\d{5,12})/) || s2.match(/[(（](\d{6,12})[)）]/)
    return m ? m[1] : ''
  }
  const noteFor = (sid) => {
    try {
      const txt = lastUser.get(sid) || ''
      const qq = qqOf(txt)
      if (!qq) return ''
      const rec = get(qq)
      const reasons = (rec.log || []).filter((x) => Math.abs(Number(x.delta)) >= 2).slice(0, 2).map((x) => (x.delta > 0 ? '+' : '') + x.delta + ' ' + x.reason)
      const isMine = owners.includes(String(qq))
      const desc = isMine ? attitude(rec.score) : friendAttitude(rec.score)
      let note = '【好感度：' + rec.score + '（' + desc + '）'
      if (reasons.length) note += '｜近因：' + reasons.join('；')
      note += '】\n规则：分数只影响语气，绝不影响主人必回与安全规则；同一条旧账最多提一次，不准反复念；别人的理由不准说给第三个人听。'
      // applyFriendSilence
      if (!isMine && rec.score < 40) note += '\n【对这个人没什么兴趣】无聊消息可以直接只输出 <no_reply>；只有真问到正事/被叫名字才回，也可以怼一句。'
      if (!isMine && rec.score < 25) note += '\n【基本不想理】能不回就不回，回也很短、带刺；不用装热情。'
      note += '\n打分：这一轮如果有值得加减分的点，直接调用 affinity_adjust；也可以用标记（系统会删掉、不会发出去）：回复最后单独一行写 [[aff:+2|原因]] 或 [[aff:-3|原因]]（单次 ±5，一天加分最多 +8）。'
      if (rec.sulk && Number(rec.sulk.until) > Date.now()) {
        const shown = Number(rec.sulk.shown || 0)
        const need = Number(rec.sulk.need || 2)
        const old = rec.sulk.reason ? '（这次是因为：' + rec.sulk.reason + '，可以提一次，但不准反复念）' : ''
        if (shown < 2) note += '\n【正在生闷气】最多两条可以不回（整条只输出 <no_reply>），之后必须回；对方道歉/哄你时调用 affinity_forgive。' + old
        else note += '\n【正在生闷气】已经凉了对方' + shown + ' 条，这条必须回，语气可以冷但不能失联；对方哄你就调用 affinity_forgive。' + old
        rec.sulk.shown = shown + 1
        put(qq, rec)
      }
      return note
    } catch { return '' }
  }
  const judge = (sid) => {
    try {
      const txt = lastUser.get(sid) || ''
      const qq = qqOf(txt)
      if (!qq || !txt) return
      if (/谢谢|辛苦了|厉害|好听|喜欢|爱你|太棒|贴贴|夸/.test(txt)) adjust(qq, 2, '夸她/道谢')
      else if (/滚|闭嘴|烦死|笨蛋|蠢|垃圾|傻|敷衍/.test(txt)) adjust(qq, -3, '凶她/敷衍')
      else if (/对不起|抱歉|我错了/.test(txt)) adjust(qq, 1, '道歉')
    } catch { /* 忽略 */ }
  }
  const mount = (agent, sid) => {
    const offs = []
    try {
      offs.push(agent.ctx.on('agent/inbox/inserted', (payload) => {
        const msg = payload && payload.message ? payload.message : payload
        const t = typeof msg?.text === 'string' ? msg.text : (typeof msg?.content === 'string' ? msg.content : '')
        if (t) lastUser.set(sid, t)
      }))
    } catch { /* 忽略 */ }
    try {
      offs.push(agent.ctx.systemPrompt.context({ name: 'feiyu-affinity', order: 880, text: () => noteFor(sid) }))
    } catch { /* 忽略 */ }
    try { offs.push(agent.ctx.on('agent/turn-stopping', () => judge(sid))) } catch { /* 忽略 */ }
    return () => { for (const f of offs) { try { f && f() } catch { /* 忽略 */ } } }
  }
  const readMarks = () => {
    try {
      const fsx = require ? null : null
    } catch { /* 忽略 */ }
  }
  const tick = () => {
    try {
      // 【模型打分】读通道写下的标记，应用后清空
      try {
        const txt = readFileSync(MARKS_PATH, 'utf8')
        if (txt.trim() !== '') {
          for (const line of txt.split('\n')) {
            if (line.trim() === '') continue
            try {
              const m = JSON.parse(line)
              if (m && m.qq) adjust(String(m.qq), Number(m.delta) || 0, String(m.reason || '模型判断'))
            } catch { /* 忽略单行 */ }
          }
          writeFileSync(MARKS_PATH, '', 'utf8')
        }
      } catch { /* 没有标记文件 */ }
      const svc = (typeof ctx.get === 'function' ? ctx.get('agents') : undefined) || ctx.agents
      const list = (svc && typeof svc.list === 'function' ? svc.list() : []) || []
      const alive = new Set()
      for (const a of list) {
        const sid = sidOf(a)
        if (!sid) continue
        alive.add(sid)
        if (mounted.has(sid)) continue
        try { mounted.set(sid, mount(a, sid)) } catch (e) { logErr('mount', e) }
      }
      for (const [sid, off] of mounted) {
        if (!alive.has(sid)) { try { off() } catch { /* 忽略 */ } mounted.delete(sid) }
      }
    } catch (e) { logErr('tick', e) }
  }
  tick()
  const tMount = setInterval(tick, 4000)
  tMount.unref?.()
}

export function apply(ctx, rawConfig) {
  try { applyInner(ctx, rawConfig) }
  catch (e) {
    try { writeFileSync('D:\\dshchajian\\qq-patch\\affinity-load.log', new Date().toISOString() + ' apply-fatal ' + (e && e.stack ? e.stack : String(e)) + '\n', { flag: 'a' }) } catch { /* 忽略 */ }
    throw e
  }
}
