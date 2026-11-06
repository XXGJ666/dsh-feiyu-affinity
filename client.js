/**
 * dsh-feiyu-affinity · 侧边栏图标 + 原生透明面板
 * © 2026 ShirasuAzusa_XXGJ · https://github.com/XXGJ666/dsh-feiyu-affinity
 */
window.__ModuleLoader__.load({
  id: 'dsh-feiyu-affinity',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const css = `
      [data-fa]{max-height:calc(100vh - 130px);box-sizing:border-box;overflow-y:auto;overflow-x:hidden;padding:16px 20px 16px 16px;font-size:13px;line-height:1.75;color:var(--fg,#ddd);display:flex;flex-direction:column;gap:10px;background:transparent}
      [data-fa] .fa-h{font-size:15px;font-weight:600}
      [data-fa]>*{flex-shrink:0}
      [data-fa] .fa-note{opacity:.6;font-size:12px}
      [data-fa] .fa-card{border:1px solid #ffffff24;border-radius:10px;padding:10px 12px;background:transparent}
      [data-fa] .fa-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0}
      [data-fa] .fa-label{display:inline-block;min-width:78px}
      [data-fa] input{background:rgba(0,0,0,.28);border:1px solid #ffffff2e;border-radius:8px;color:inherit;padding:3px 8px;font-size:12px;width:96px}
      [data-fa] input.fa-wide{width:240px}
      [data-fa] button{border:1px solid #ffffff33;background:transparent;color:inherit;border-radius:8px;padding:3px 10px;font-size:12px;cursor:pointer}
      [data-fa] .fa-bar{flex:1;height:6px;border-radius:99px;background:#ffffff24;overflow:hidden;margin-top:6px}
      [data-fa] .fa-bar>i{display:block;height:100%;background:linear-gradient(90deg,#5aa9ff,#8f7bff)}
      [data-fa] a{color:#5aa9ff}
      [data-fa]::-webkit-scrollbar{width:8px}
      [data-fa]::-webkit-scrollbar-track{background:transparent}
      [data-fa]::-webkit-scrollbar-thumb{background:rgba(255,255,255,.35);border-radius:8px}
      [data-fa]::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.55)}
    `
    const Icon = () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block', marginLeft: '-1px' } }, h('path', { d: 'M12 20s-6.5-4.2-8.6-7.3A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.6 6.4C18.5 15.8 12 20 12 20z' }))
    function Panel() {
      const [d, setD] = React.useState(null)
      const [msg, setMsg] = React.useState('')
      const [form, setForm] = React.useState({ owners: '', ownerOpenids: '', ownerMin: 25, decayHour: 4, dailyGainCap: 8, judgeKey: '', judgeKeyBackup: '' })
      const load = async () => {
        try {
          const j = await (await fetch('/dsh-feiyu-affinity/state', { headers: { accept: 'application/json' } })).json()
          setD(j)
          const c = j.config || {}
          setForm((prev) => ({ ...prev, owners: (c.owners || []).join(','), ownerOpenids: (c.ownerOpenids || []).join(','), ownerMin: c.ownerMin ?? 25, decayHour: c.decayHour ?? 4, dailyGainCap: c.dailyGainCap ?? 8, judgeKey: prev.judgeKey || '', judgeKeyBackup: prev.judgeKeyBackup || '' }))
        } catch { setMsg('读不到数据') }
      }
      React.useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [])
      const save = async () => {
        try {
          await fetch('/dsh-feiyu-affinity/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, judgeKey: form.judgeKey.startsWith('已保存') ? '' : form.judgeKey, judgeKeyBackup: form.judgeKeyBackup.startsWith('已保存') ? '' : form.judgeKeyBackup }) })
          setMsg('已保存，重启 DSH 后生效'); load()
        } catch { setMsg('保存失败') }
      }
      const act = async (path, body) => {
        try { await fetch('/dsh-feiyu-affinity/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); load() } catch { setMsg('操作失败') }
      }
      const people = (d && d.people) || []
      return h('div', { 'data-fa': '' },
        h('div', { className: 'fa-h' }, '好感度'),
        h('div', { className: 'fa-note' }, '分数只影响语气，不影响主人必回与安全规则；每天 04:00 按“几天没互动”衰减。'),
        (d && (d.people || []).some((p) => p.day === new Date().toISOString().slice(0, 10) && Number(p.dayGain || 0) >= Number((d.config || {}).dailyGainCap ?? 25))) ? h('div', { className: 'fa-note', style: { color: '#ffd479' } }, '今日加分已达上限（' + String((d.config || {}).dailyGainCap ?? 25) + '），明天 0 点重置；扣分不受影响。') : null,
        h('div', { className: 'fa-card' },
          h('div', { className: 'fa-row' },
            h('span', { className: 'fa-label' }, '主人地板分'),
            h('input', { value: form.ownerMin, onChange: (e) => setForm({ ...form, ownerMin: Number(e.target.value) }) }),
            h('span', { className: 'fa-note' }, '主人最低不会低于这个分（默认 0，相当于没有地板）')),
          h('div', { className: 'fa-row' },
            h('span', { className: 'fa-label' }, '衰减时间'),
            h('input', { value: form.decayHour, onChange: (e) => setForm({ ...form, decayHour: Number(e.target.value) }) }),
            h('span', { className: 'fa-note' }, '每天几点结算“变淡”（默认 4 点）')),
          h('div', { className: 'fa-row' },
            h('span', { className: 'fa-label' }, '每日上限'),
            h('input', { value: form.dailyGainCap, onChange: (e) => setForm({ ...form, dailyGainCap: Number(e.target.value) }) }),
            h('span', { className: 'fa-note' }, '一天最多能涨多少分（默认 25，防刷满）')),
          h('div', { className: 'fa-row' },
            h('span', { className: 'fa-label' }, '主人 QQ'),
            h('input', { className: 'fa-wide', value: form.owners, placeholder: '多个用逗号隔开', onChange: (e) => setForm({ ...form, owners: e.target.value }) }),
            h('span', { className: 'fa-note' }, '填了你才会被当“主人”，有地板分')),
          h('div', { className: 'fa-row' },
            h('span', { className: 'fa-label' }, '主人 openid'),
            h('input', { className: 'fa-wide', value: form.ownerOpenids, placeholder: 'QQ官方机器人拉群才需要，多个用逗号', onChange: (e) => setForm({ ...form, ownerOpenids: e.target.value }) }),
            h('span', { className: 'fa-note' }, '（看情况填）仅限使用 QQ 官方机器人、或者群聊接入的是官方 QQ 机器人时需要；其他如 Snowluma / NapCat 这种正常账号接入的不用填')),
          h('div', { className: 'fa-row' },
            h('span', { className: 'fa-label' }, '判断 Key'),
            h('input', { className: 'fa-wide', value: form.judgeKey || ((d && d.config && d.config.judgeKeySaved) ? '已保存（输入新 Key 覆盖）' : ''), placeholder: '主 Key', onChange: (e) => setForm({ ...form, judgeKey: e.target.value }) }),
            h('input', { className: 'fa-wide', value: form.judgeKeyBackup || ((d && d.config && d.config.judgeKeyBackupSaved) ? '已保存（输入新 Key 覆盖）' : ''), placeholder: '备 Key（选填）', onChange: (e) => setForm({ ...form, judgeKeyBackup: e.target.value }) }),
            h('span', { className: 'fa-note' }, '填了才会每轮判断；不填就只用词表兜底')),
          h('div', { className: 'fa-row' },
            h('button', { onClick: save }, '保存'),
            h('button', { onClick: load }, '刷新'),
            h('span', { className: 'fa-note' }, msg))),
          h('div', { className: 'fa-row' },
            h('span', { className: 'fa-label' }, '合并身份'),
            h('input', { value: form.mergeFrom, placeholder: 'openid', onChange: (e) => setForm({ ...form, mergeFrom: e.target.value }) }),
            h('input', { value: form.mergeTo, placeholder: 'QQ 号', onChange: (e) => setForm({ ...form, mergeTo: e.target.value }) }),
            h('button', { onClick: () => { if (form.mergeFrom && /^\d{5,12}$/.test(form.mergeTo || '')) act('merge', { from: form.mergeFrom, to: form.mergeTo }) } }, '并'),
            h('span', { className: 'fa-note' }, '把 openid 那条并进 QQ 那条')),
        h('div', { className: 'fa-card', style: { padding: '12px 16px' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            h('span', { style: { fontWeight: 600 } }, '整体情绪'),
            h('button', { style: { border: '1px solid #ffffff33', background: 'transparent', color: 'inherit', borderRadius: '8px', padding: '2px 10px', fontSize: '12px', cursor: 'pointer' }, onClick: load }, '刷新'),
            h('span', null, d && d.mood ? String(d.mood.value) + '（' + String(d.mood.label) + '）' : '—'),
            d && d.mood && d.mood.low && d.mood.low.length ? h('span', { className: 'fa-note' }, '闹别扭：' + d.mood.low.map((x) => x.name + '(' + x.score + ')').join('、')) : null),
          h('div', { className: 'fa-bar' }, h('i', { style: { width: Math.max(2, Math.min(100, Number(d && d.mood ? d.mood.value : 55) || 55)) + '%' } }))),
        h('div', { className: 'fa-card', style: { padding: '16px 20px', margin: '0 -8px', minHeight: '160px', boxSizing: 'border-box' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } }, h('span', { style: { fontWeight: 600, fontSize: '14px' } }, '好感度实时变化'), h('button', { style: { border: '1px solid #ffffff33', background: 'transparent', color: 'inherit', borderRadius: '8px', padding: '2px 10px', fontSize: '12px', cursor: 'pointer' }, onClick: load }, '刷新')),
          people.length === 0 ? h('div', { className: 'fa-note' }, '还没有记录：跟她（或群友）聊两句、夸一句/凶一句，分数就会动。') : people.map((p) => h('div', { className: 'fa-card', key: String(p.qq || '') },
          h('div', { className: 'fa-row' }, h('b', null, (p.name ? String(p.name) + ' · ' : '') + String(p.qq || '')), h('span', { className: 'fa-note' }, String(p.attitude || '')), h('span', { style: { marginLeft: 'auto' } }, String(p.score ?? ''))),
          !/^\d{5,12}$/.test(String(p.qq || '')) ? h('div', { className: 'fa-note' }, '最近说：' + String(p.lastMsg || '（还没抓到内容）')) : null,
          h('div', { className: 'fa-bar' }, h('i', { style: { width: Math.max(2, Math.min(100, Number(p.score) || 0)) + '%' } })),
          (p.reasons || []).slice(0, 3).map((r, k) => h('div', { className: 'fa-note', key: k }, (Number(r.delta) > 0 ? '+' : '') + String(r.delta) + ' ' + String(r.reason || ''))),
          h('div', { className: 'fa-row' }, h('button', { onClick: () => act('adjust', { qq: p.qq, delta: 2, reason: '面板调整' }) }, '+2'), h('button', { onClick: () => act('adjust', { qq: p.qq, delta: -2, reason: '面板调整' }) }, '-2'), p.sulking ? h('button', { onClick: () => act('forgive', { qq: p.qq }) }, '哄好') : null)))
        ),
        h('div', { className: 'fa-card' },
          h('div', { style: { fontWeight: 600, marginBottom: '4px' } }, '怎么开始'),
          h('div', { className: 'fa-note' }, '1. 上面填你的 QQ（多个用逗号）和需要的 openid，点保存'),
          h('div', { className: 'fa-note' }, '2. 重启 DSH，跟她聊几句，夸一句/凶一句，分数就会动'),
          h('div', { className: 'fa-note' }, '3. 分数只影响语气：不影响主人必回、不影响安全规则'),
          h('div', { className: 'fa-note' }, '4. 生闷气时最多两条不回，哄几次就会好，最多 5 次必消气'),
          h('div', { className: 'fa-note' }, '5. 数据在 ~/.dsh/feiyu-affinity/，删了等于重新认识'),
          h('div', { className: 'fa-note' }, '6. 圈起来的这块就是好感度实时表：每个人一行，显示昵称/QQ 或 openid、态度、分数和最近理由'),
          h('div', { className: 'fa-note' }, '7. openid 怎么找：在 DSH 的官方 bot 日志里搜 sender=，你说话的那条会显示 sender=3FEB… 这样一串；复制那串填上面'),
          h('div', { className: 'fa-note' }, '8. 只用小号（NapCat/Snowluma）不接官方 bot 的话，openid 那栏留空即可'),
          h('div', { className: 'fa-note' }, '9. 判断 Key 怎么获取：主 Key 推荐 DeepSeek → platform.deepseek.com 注册 → API keys → 创建（需充 10 元，用很久）'),
          h('div', { className: 'fa-note' }, '10. 备 Key 选填，推荐智谱（免费）→ open.bigmodel.cn 注册 → API Keys → 新建；主 Key 失败时会自动用备 Key'),
          h('div', { className: 'fa-note' }, '11. 合并身份怎么用：官方 bot 和小号是两个身份，同一个人会占两行；一般会按昵称自动合并，合不上时在上面「合并身份」填两行——第一行那串 openid，第二行他的 QQ 号，点「并」就合成一条'),
          h('div', { className: 'fa-note' }, '12. 消息抓取会自动补：插件第一次启动会自己给 QQ 通道补一小段抄送代码（带 .affbak 备份，找不到就跳过，不会改坏），一般不用管；万一自动补失败，包里「可选-通道抓取补丁\apply-capture.ps1」跑一下即可，正常情况用不到。')),
        h('div', { className: 'fa-card' },
          h('div', { style: { fontWeight: 600, marginBottom: '4px' } }, '评分规则（参考）'),
          h('div', { className: 'fa-note' }, '加分：被哄、被关心、被请客、被夸、被记挂、有人替她说话、群友逗她开心 +1~+5'),
          h('div', { className: 'fa-note' }, '减分：被无视、被冷落、被敷衍、被凶、被放鸽子、别人聊得热闹把她晾一边（吃醋）1~5 分'),
          h('div', { className: 'fa-note' }, '正常 55；45 以下开始闹；30 以下真的很生气（对主人也说狠话）；20 以下非常冷淡；10 以下彻底不理，要一直哄才回温。'),
          h('div', { className: 'fa-note' }, '情绪是连续的：不会跨过某个分数就突然换个人，是顺着涨跌慢慢表现出来的。'),
          h('div', { className: 'fa-note' }, '单次最多 ±5；加分每天上限看上面设置；扣分不受限。')),
        h('div', { className: 'fa-note', style: { marginTop: '10px' } }, '© 2026 ', h('a', { href: 'https://github.com/XXGJ666', target: '_blank', rel: 'noreferrer' }, 'ShirasuAzusa_XXGJ'), ' · ', h('a', { href: 'https://github.com/XXGJ666/dsh-feiyu-affinity', target: '_blank', rel: 'noreferrer' }, 'dsh-feiyu-affinity'), ' · MIT'))
    }
    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style'); style.setAttribute('data-plugin-css', 'dsh-feiyu-affinity'); style.textContent = css; document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'affinity css')
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'dsh-feiyu-affinity', order: 96, label: () => h('span', { style: { fontSize: '14px' } }, '好感度') }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-feiyu-affinity' }, Panel))
      },
    }
  },
})
