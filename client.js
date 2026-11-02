/**
 * dsh-feiyu-affinity · 侧边栏图标 + 主窗口内嵌完整面板
 */
window.__ModuleLoader__.load({
  id: 'dsh-feiyu-affinity',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const Icon = () => h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', style: { display: 'block', marginLeft: '-1px' } }, h('path', { d: 'M12 20s-6.5-4.2-8.6-7.3A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.6 6.4C18.5 15.8 12 20 12 20z' }))

    const Panel = () => h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#17171d' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 14px', borderBottom: '1px solid #ffffff16', color: '#ddd', fontSize: '13px', lineHeight: 1.7 } },
        h('b', { style: { fontWeight: 600 } }, '好感度'),
        h('span', { style: { opacity: 0.55, fontSize: '12px', marginLeft: '4px' } }, '规则 / 加减分 / 哄都在下面')),
      h('iframe', { src: '/dsh-feiyu-affinity', title: '好感度', style: { flex: 1, width: '100%', border: 'none', background: '#17171d' } }))

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'dsh-feiyu-affinity',
          order: 96,
          label: () => h('span', { style: { fontSize: '14px', fontWeight: 400 } }, '好感度'),
        }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'dsh-feiyu-affinity' }, Panel))
      },
    }
  },
})
