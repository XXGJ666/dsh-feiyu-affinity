# dsh-feiyu-affinity

给 DSH 人设一份**会记住、会变淡、会生闷气、也能被哄回来**的好感度。

## 它做什么

- 按人记分：默认 50，范围 0~100；主人单独一条，群友各一条。
- 理由留档：每次加减写一句理由，只留最近 10 条，方便她“翻旧账”（同一条只念一次）。
- 每天衰减：04:00 结算，按“几天没互动”扣 1~3 分；主人地板 25（关系底子还在）。
- 生闷气：单次掉 5 分以上或低于 40 分时进入，1~2 小时；对方向软、道歉、给台阶就算哄，几次后消气，绝不永久记仇。
- 只影响语气：分数低也不影响主人必回、不影响安全规则、不改变“主人优先”。

## 给模型的能力（工具）

| 工具 | 用途 |
| --- | --- |
| `affinity_adjust` | 加减好感（带理由，单次 ±5、每天 +8 上限） |
| `affinity_get` | 查某人的分数、态度、近几条理由、是否在生闷气 |
| `affinity_forgive` | 记录一次“哄”，够了就消气 |

## 安装

1. 把本目录放进 `<profile>/node_modules/dsh-feiyu-affinity`
2. 在 profile 的 `cordis.patch.yml` 末尾加一段：

```yaml
- id: dsh-feiyu-affinity
  name: dsh-feiyu-affinity
  disabled: false
  config:
    defaultScore: 50
    ownerMin: 25
```

3. 重启 DSH。

数据在 `~/.dsh/feiyu-affinity/state.json`，删了就是“重新认识”。

## Roadmap

- [x] 宿主：记分 / 衰减 / 生闷气 / 工具
- [ ] 界面：设置面板 + 好感度看板（每人的分数、态度、理由时间线）
- [ ] 与心情（feiyu-mood）联动：心情×好感共同决定语气和语音概率

## License

MIT

---

© 2026 [ShirasuAzusa_XXGJ](https://github.com/XXGJ666) · [dsh-feiyu-affinity](https://github.com/XXGJ666/dsh-feiyu-affinity) · MIT License
