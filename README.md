# 仙途 · 文字修仙挂机

一款纯前端的文字修仙放置游戏。零外部依赖、零构建步骤，源码是原生 ES Module，
双击启动脚本即可游玩。

当前版本 **v1.0.0**（公开前的内部里程碑为 V6.0「功课」，编号规则见
[docs/版本规划.md](docs/版本规划.md)）。

<img width="1672" height="940" alt="xiantu" src="https://github.com/user-attachments/assets/98927254-c89c-44a2-a3bf-71e94ee60451" />

下面是部分游戏内容展示

<img width="2560" height="1600" alt="d8beee7d-84e0-4104-8201-23f6c6c6e726" src="https://github.com/user-attachments/assets/bf235aac-7eda-43e1-b39b-1b5358631074" />
<img width="2560" height="1600" alt="c0e02dd6-22e5-4056-8b0b-ce8798080120" src="https://github.com/user-attachments/assets/213547d2-86ec-4959-8ac6-9e067b597e89" />
<img width="2560" height="1600" alt="89a61324-3f6f-4120-8d8a-e2c401f733f6" src="https://github.com/user-attachments/assets/c45a090f-1930-4e8d-9ad7-bc509530cd10" />
<img width="2560" height="1600" alt="a2b298c0-d312-4008-974b-b801b641c6c1" src="https://github.com/user-attachments/assets/2e641b4b-c01a-4da7-8e99-880853a4159a" />
<img width="2560" height="1600" alt="23a3d8f5-165e-4ed6-afc4-a267bb757cbe" src="https://github.com/user-attachments/assets/66f6d60b-f87c-467c-a2d5-b0b71484771d" />


---

## 如何运行

原生 ES Module 在 `file://` 协议下会被浏览器 CORS 拦截，所以**必须走 HTTP**。

| 平台 | 操作 |
|---|---|
| Windows | 双击 `启动游戏.bat` |
| macOS / Linux | 终端执行 `bash 启动游戏.sh` |
| 手动 | `python tools/serve.py`，然后打开 http://127.0.0.1:8765/index.html |

需要 Python 3.8+（仅用于起静态服务器，游戏本身不依赖 Python）。
端口被占用时会自动往后找可用端口。

**如果启动脚本报错**：直接在项目目录打开终端执行 `python tools/serve.py` 即可，
效果完全一样。启动脚本本身只是"找到 Python 并运行它"的便利封装。

> 关于 `启动游戏.bat` 的两个坑（已修复，记录备查）：
> 1. 批处理文件**必须是 CRLF 换行**。用 LF 写出来的 `.bat` 会被 cmd.exe 切碎成
>    半截命令，报 `'\serve.py"' 不是内部或外部命令` 这类错。
> 2. 中文 Windows 的 cmd 默认代码页是 **GBK(936)**，`.bat` 里若写 UTF-8 的中文
>    会显示成乱码，所以本脚本用 GBK 编码保存；同时**不要在脚本中途 `chcp`**，
>    切换代码页会让 cmd 用新代码页重新解析后面的行，反而弄坏命令。

---

> **关于 `legacy/demo.html`**
> 那是改版前的原始 demo（单文件 HTML，26 境界骨架）。它原先躺在根目录、
> 扩展名却写成 `.py`，导致 `python main.py` 直接 SyntaxError——现已移到
> `legacy/` 并改回 `.html`，双击就能在浏览器里打开对照。
> 旧存档（`localStorage` 的 `xiantu_save`）会在首次启动新版时**自动迁移**，
> 境界、装备、灵石都会保留；迁移是一次性的，且已有 V2 存档时会直接跳过，
> 所以开 demo 不会覆盖你的进度。

---

## 目录结构

```
index.html                游戏外壳
启动游戏.bat / .sh        本地服务器启动脚本
package.json              仅用于 node 测试脚本，浏览器不读它

legacy/
  demo.html               V1.x 原始 demo（单文件 HTML，仅作对照，不参与构建）

src/
  main.js                 入口：装配、主循环调度、离线结算
  core/                   不依赖 DOM 的底层设施
    state.js              全局状态 + 初始行囊
    loop.js               主循环（逻辑 1Hz / 渲染最多 4Hz）
    save.js               存档、版本迁移、导入导出
    bus.js  rng.js  format.js
    telemetry.js          数值诊断采集（修为来源 / 境界停留时长 / 交互时长）
  systems/                纯逻辑，禁止操作 DOM
    cultivation.js        派生属性与修炼结算（所有加成的唯一出口）
    breakthrough.js       突破与天劫
    combat.js             回合制战斗
    encounter.js          奇遇 + 效果 DSL 解释器
    explore.js            主动探险
    alchemy.js forging.js cave.js shop.js inventory.js
  data/                   纯数据表（境界/功法/装备/敌人/奇遇/丹方…）
  ui/                     DOM 渲染，不含业务规则
    render.js             渲染调度
    panels/               各功能面板
    modal.js toast.js log.js tabs.js settings.js tribulation.js encounterUI.js
  assets/svg.js           内联水墨 SVG（34 个图形常量）
  styles/main.css         宣纸古卷主题

tools/
  serve.py                零依赖静态服务器
  balance_sim.py          境界曲线数值模拟器（产出 src/data/realms.js 的数值）
  balance_combat.mjs      战斗平衡校准（各境界胜率）
  smoke_core.mjs          核心逻辑冒烟测试
  test_combat.mjs         战斗/奇遇自测
  test_economy.mjs        经济/洞府/炼丹炼器自测
  test_telemetry.mjs      诊断采集自检（来源拆分必须等于修为总增量）
  out/                    模拟器产出的 JSON

docs/
  版本规划.md             路线图：版本目标、验收标准、状态追踪（持续维护）
  架构规范.md             模块契约（改代码前先读这个）
  设计文档.md             玩法规则与公式
```

---

## 开发命令

```bash
npm start              # 起本地服务器
npm run test:core      # 核心冒烟测试（存档迁移、突破链路、乘区上限）
npm run test:combat    # 战斗与奇遇自测
npm run test:economy   # 经济、洞府离线、炼丹炼器自测
npm run balance        # 重跑境界曲线模拟
node tools/balance_combat.mjs   # 各境界战斗胜率校准
```

---

## 设计要点

**数值不是手调的。** 26 个境界的需求修为由 `tools/balance_sim.py` 反推：
先定每个境界的**目标挂机时长**，再按 `needCult = baseSpeed × 目标时长` 生成，
并自动校验圆整误差 <15%、时长单调递增。零加成基准 **P0 = 12.11 天**（口径见
`docs/设计文档.md` §0）。整局实测为 **P1a = 4 天 1 小时**（地灵根、半优化、连续在线）。
稳态配置参考：地灵根 + 单本功法满 + 聚灵阵满 ≈ 20.1 倍 → 14.5 小时。
（`baseSpeed` 本身也随境界增长 26 倍，所以时长跨度是 2667 倍而不是需求修为的 6.7 万倍——
真正决定体验的是时长，不是修为的绝对量。）

**价格也是推出来的，不是手写的。** 丹药与装备的坊市价一律锚定**材料成本**：

```
成品价 = Σ(材料买入价 × 数量) ÷ 基础成功率 × 1.4，钳进 [材料×1.2, 材料×2.5]
参悟费 = 对应成品的坊市价
```

下界保证不会出现「买成品比买原料还便宜」的倒挂；上界是防刷灵石线的余量版
（材料卖出价 = 原价 × 0.35，所以成品价超过材料价的 `1/0.35 ≈ 2.857` 倍就能套利）。
`tools/test_economy.mjs` 里有对应的双向断言挡着。详见 `docs/设计文档.md` 的 2.5.1。

**"投入换确定性"，不是"赌脸卡死"。** 突破失败只损失 25% 修为且不清零，
连续失败有保底加成；天劫失败不跌落境界。这是模拟跑出来的结论——
若失败清零，白板玩家的总时长会从 8 天膨胀到 26 天（**旧曲线数据，P0 口径**，
8.08 天为 V5.0 重调前的零加成基线），后期会退化成反复赌概率。

**乘区有软上限。** 灵根（2.5）× 功法（4 槽合计 9.63）× 洞府（3.52）全叠满，
原始倍率约 **84.7 倍**；经渐近压缩后收敛到 `SUSTAINED_CAP = 24` 倍上限。
（注：raw 超过约 30 后压缩已基本饱和——raw 30 → 有效 22.1，raw 84.7 → 有效 24.0，
后期功法投入的边际收益接近零，是待修项，见 `docs/设计文档.md` §0.5。）

**洞府离线也推进。** 建筑升级用绝对时间戳计时，关掉游戏照常完工；
`caveOffline` 会把离线窗口按升级完成时刻**分段模拟**，
用"当时的建筑等级"计算产出，而不是简单乘以当前等级。

---

## 怎么反馈数值问题

游戏内置了数值诊断采集（`src/core/telemetry.js`）。玩过一段之后：

1. 打开「设置 · 存档管理」→「数值诊断」
2. 点 **复制摘要**（几十行文字版，日常够用）或 **导出诊断数据**（完整 JSON）

摘要里包含：修为来源构成（纯修炼 / 战斗 / 奇遇 / 丹药 / 离线各占多少）、
每个境界的实际停留时长与离开时的倍率、交互时长、以及一条自检
（按来源拆分的和必须精确等于修为总增量——对不上就说明采集本身有问题，
摘要的「自检」一段会写明差多少，那种数据不能用）。

有了这些，"修炼偏慢"就不再只是体感，而是能算出差在哪一段。
时长口径（P0 / P1 / P2 / P3）的权威定义见 `docs/设计文档.md` §0。

---

## 当前版本范围（v1.0.0）

已完成：境界与突破、天劫、回合制战斗、功法流派与参悟、天赋、炼丹、炼器、
洞府（含离线产出）、宗门、立场、灵兽（含血脉）、道侣、坊市与拍卖行、
奇遇（69 条）、探险、试炼塔、轮回转生与真结局、世界天象、成就与图鉴、
本世功课、飞升演出、存档迁移（可从 demo 1.x 无损迁移）、水墨视觉与动效。

各版本的交付记录与后续方向见 [`docs/版本规划.md`](docs/版本规划.md)。

---

## 关于背景音乐

`src/music/` 在本仓库中是**空的**。开发时那里放过 12 首配乐，但都是第三方版权作品
（柳青瑶、詹昊晁等），不适合随开源仓库公开分发，因此已从版本控制中排除。

游戏对音频缺失是容错的——找不到文件就静默跳过那一首，不影响任何玩法。
想自己配乐的话见 [`src/music/README.md`](src/music/README.md)。

---

## 许可证

[MIT](LICENSE)。你可以自由使用、修改、分发本项目的**代码**，包括商用，只需保留版权声明。

**注意：MIT 只覆盖代码，不覆盖任何第三方音频。** 本项目不含任何音频文件。

---

## 已知限制

- 奇遇冷却与探险冷却不持久化，刷新即重置（探险本就是"人在电脑前"的主动玩法）
- 寿元目前只增不减，尚未做"寿元耗尽"的死亡结算
- 敌人强度在同一档位内仍有较大跨度，靠 `tools/balance_combat.mjs` 手工校准维持
- 洞府建筑的丹房 / 炼器室，数据里的 `autoUnlockLevel` 与描述文案写的是 5 级，
  代码实际按 3 级解锁；藏经阁数据写 `perLevel: 2`，`calcComprehension()` 里却乘了 10。
  详见 `docs/设计文档.md` 2.6 的 ⚠ 注
