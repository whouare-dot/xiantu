# -*- coding: utf-8 -*-
"""
《仙途》文字修仙挂机 —— 数值配平模拟器
================================================
设计目标：把 26 个境界的修为需求曲线，从"后期锁死"重建为"投入换速度"的平滑曲线。

核心思路
--------
1. 先确定每个境界的「零加成目标时长 targetMinutes」（策划输入，硬约束）。
2. 再确定每个境界的「基础速率 baseSpeed」（策划输入，平滑递增）。
3. 反推修为需求：  needCult_i = baseSpeed_i * targetMinutes_i * 60
   再做 2 位有效数字圆整（游戏内数值好看），并重新反算实际时长 + 校验误差 < 15%。
4. 修炼速率架构（已定）：
      speed = base(realmIndex) * rootMult * techniqueMult * caveMult * pillBuff * eventBuff
   其中 pillBuff / eventBuff 为限时/瞬时增益，不计入「持续通关时长」，
   仅用于爆发倍率参考。

所有输出数字均由本脚本计算得出，报告中的每个数字都可复现。

运行：  python tools/balance_sim.py
产物：  tools/out/realms.json     境界配平表（UTF-8, ensure_ascii=False）
        tools/out/sensitivity.json 加成敏感性分析
        tools/out/economy.json     灵石经济初版模型
"""

import json
import math
import os
import sys

# Windows 控制台默认 GBK，强制 UTF-8 输出避免中文/符号乱码
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# ----------------------------------------------------------------------------
# 0. 常量与策划输入
# ----------------------------------------------------------------------------

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT_DIR, "out")

TOLERANCE = 0.15          # 圆整后时长误差上限（15%）
PILL_BREAK_BONUS = 0.15   # 突破丹药对成功率的固定加成（后期限时道具）
PILL_FARM_MINUTES = 15    # 关键突破丹价格 = 目标境界段 15 分钟灵石收入
EXPEDITION_MIN_MIN = 2    # 单次探险灵石下限 = 该境界 2 分钟收入
EXPEDITION_MAX_MIN = 5    # 单次探险灵石上限 = 该境界 5 分钟收入

# 26 个境界，index 0..25，名称与顺序为硬约束
REALM_NAMES = [
    # 炼气 0-8
    "炼气一层", "炼气二层", "炼气三层", "炼气四层", "炼气五层",
    "炼气六层", "炼气七层", "炼气八层", "炼气九层",
    # 筑基 9-11
    "筑基初期", "筑基中期", "筑基后期",
    # 金丹 12-14
    "金丹初期", "金丹中期", "金丹后期",
    # 元婴 15-17
    "元婴初期", "元婴中期", "元婴后期",
    # 化神 18-20
    "化神初期", "化神中期", "化神后期",
    # 21-25
    "炼虚期", "合体期", "大乘期", "渡劫期", "飞升成仙",
]

# 大境界分段（用于经济与展示）：(境界名, 起始 index, 结束 index)
BANDS = [
    ("炼气", 0, 8),
    ("筑基", 9, 11),
    ("金丹", 12, 14),
    ("元婴", 15, 17),
    ("化神", 18, 20),
    ("炼虚", 21, 21),
    ("合体", 22, 22),
    ("大乘", 23, 23),
    ("渡劫", 24, 24),
    ("飞升", 25, 25),
]
BAND_OF = {}
for _name, _a, _b in BANDS:
    for _i in range(_a, _b + 1):
        BAND_OF[_i] = _name

# 「零加成纯在线」目标时长（分钟）。index 25 为终点，无时长。
#
# 本组数由「方案乙：全曲线相对幂律压缩 + 总时长加长 50%」生成，公式如下：
#   记压缩前的原始曲线为 T_i（旧值见文件末尾注释），令
#     i = 0..8 :  T'_i = T_i · (1 + (S-1)·(i/8)^ρ)      ρ = 2
#     i = 9..24:  T'_i = 13 · S · (T_i / 13)^β          β = 0.60
#   其中 S = 9.273，由「零加成总时长 8.08 天 → 12.11 天（×1.5）」解出。
#   结果：渡劫期占比 34.3% → 21.4%；尾 4 境(21~24) 78.1% → 59.6%；
#         前 22 境(0~21) 30.4% → 50.0%。
# 再调曲线时：改这里 + BASE_SPEED，重跑本脚本，再同步 src/data/realms.js。
TARGET_MINUTES = [
    1.5, 2.3, 4.6, 8.7, 15.3, 27.5, 45.2, 73.3, 120.6,   # 炼气
    156.1, 191, 229.4,                                   # 筑基
    286.4, 345, 410,                                     # 金丹
    523, 621.5, 744.1,                                   # 元婴
    913.5, 1077, 1272.2,                                 # 化神
    1632.4, 2164.2, 2828.7, 3750.2,                      # 炼虚 / 合体 / 大乘 / 渡劫
    None,                                                # 飞升（终点）
]

# 每境界「基础修炼速率」base(realmIndex)，单位：修为/息。
# 平滑递增，炼气 10/息 起（与现版本一致），渡劫 250/息 封顶。
BASE_SPEED = [
    10, 10, 10, 11, 11, 12, 12, 13, 14,        # 炼气
    15, 18, 22,                                # 筑基
    27, 33, 40,                                # 金丹
    50, 60, 72,                                # 元婴
    88, 105, 125,                              # 化神
    150, 180, 210, 250,                        # 炼虚 / 合体 / 大乘 / 渡劫
    260,                                       # 飞升（终点，速率仅作展示）
]

# 突破成功率（进入该境界时判定）。炼气全 100%；小境界必成；
# 大境界 0.60~0.75；炼虚及以后递减到 0.25。
BREAK_CHANCE = [
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,   # 炼气（教学期，100%）
    0.75, 1.0, 1.0,                                 # 筑基初期(大境界) / 中 / 后
    0.70, 1.0, 1.0,                                 # 金丹初期(大境界) / 中 / 后
    0.65, 1.0, 1.0,                                 # 元婴初期(大境界) / 中 / 后
    0.60, 1.0, 1.0,                                 # 化神初期(大境界) / 中 / 后
    0.40, 0.35, 0.30, 0.25,                         # 炼虚 / 合体 / 大乘 / 渡劫
    0.25,                                           # 飞升（终局天劫）
]

# 伴随突破丹药（仅大境界=下一境界需要，index -> 丹药名）
BREAK_PILL = {
    9: "筑基丹", 12: "结金丹", 15: "凝婴丹", 18: "化神丹",
    21: "炼虚丹", 22: "合体丹", 23: "大乘丹", 24: "渡劫丹", 25: "飞升仙丹",
}

# 寿元（载），随境界递增，炼气 100 起，飞升 99999。
LIFESPAN = [
    100, 110, 120, 130, 145, 160, 180, 200, 230,    # 炼气
    300, 380, 480,                                   # 筑基
    700, 900, 1200,                                  # 金丹
    1800, 2500, 3500,                                # 元婴
    5000, 7000, 10000,                               # 化神
    15000, 25000, 45000, 80000,                      # 炼虚 / 合体 / 大乘 / 渡劫
    99999,                                           # 飞升
]

# 乘区范围（架构硬约束，用于校验与展示）
ROOT_MULT_RANGE = (0.7, 2.5)      # 灵根
TECH_MULT_RANGE = (1.0, 4.0)      # 功法品阶与层数
CAVE_MULT_RANGE = (1.0, 3.5)      # 洞府聚灵阵 1~9 级
PILL_MULT_RANGE = (1.2, 3.0)      # 丹药限时 buff（瞬时不入总时长）
EVENT_MULT_RANGE = (1.0, 2.0)     # 事件 buff（瞬时不入总时长）

# 敏感性分析配置档：(rootMult, techMult, caveMult)，持续倍率 = 三者乘积
CONFIGS = [
    ("白板",   1.0, 1.0, 1.0),
    ("轻氪",   1.3, 1.4, 1.2),
    ("中配",   1.8, 2.2, 1.7),
    ("高配",   2.2, 3.0, 1.9),
    ("极限",   2.5, 4.0, 2.0),
]
# 额外展示：理论全叠满（洞府满级）——用于暴露"乘区溢出"风险，不计入 5 档目标
THEORETICAL_MAX_CONFIG = ("理论满配(含洞府9级)", 2.5, 4.0, 3.5)

# 经济：各境界段"灵石财富系数"（每点基础修为速率对应的灵石/分钟产出）
BAND_WEALTH = {
    "炼气": 1.0, "筑基": 2.2, "金丹": 5.0, "元婴": 12.0, "化神": 28.0,
    "炼虚": 60.0, "合体": 140.0, "大乘": 330.0, "渡劫": 700.0, "飞升": 700.0,
}


# ----------------------------------------------------------------------------
# 1. 工具函数
# ----------------------------------------------------------------------------

def round_nice(value, sig=2):
    """圆整到 sig 位有效数字，让游戏内数值可读（如 2640 -> 2600）。"""
    if value is None or value == 0:
        return 0
    exp = math.floor(math.log10(abs(value)))
    step = 10 ** (exp - (sig - 1))
    return int(round(value / step) * step)


def round_nice_monotonic(values):
    """圆整并强制严格递增：若圆整后出现并列/倒挂，则按步长上抬。"""
    out = []
    prev = None
    for v in values:
        if v is None:
            out.append(None)
            continue
        r = round_nice(v)
        if prev is not None and r <= prev:
            exp = math.floor(math.log10(abs(prev)))
            step = 10 ** (exp - 1)
            r = prev + step
        out.append(r)
        prev = r
    return out


def fmt_minutes(m):
    """分钟 -> 人类可读。"""
    if m is None:
        return "-"
    if m < 60:
        return f"{m:.1f}分"
    if m < 60 * 24:
        return f"{m/60:.2f}时"
    return f"{m/60/24:.2f}天"


# ----------------------------------------------------------------------------
# 2. 构建配平表
# ----------------------------------------------------------------------------

def build_realms():
    n = len(REALM_NAMES)
    assert len(TARGET_MINUTES) == n, "目标时长表长度与境界数不一致"
    assert len(BASE_SPEED) == n, "基础速率表长度与境界数不一致"
    assert len(BREAK_CHANCE) == n, "突破成功率表长度与境界数不一致"
    assert len(LIFESPAN) == n, "寿元表长度与境界数不一致"

    raw_need = []
    for i in range(n):
        if TARGET_MINUTES[i] is None:
            raw_need.append(None)
        else:
            raw_need.append(BASE_SPEED[i] * TARGET_MINUTES[i] * 60.0)

    need = round_nice_monotonic(raw_need)

    realms = []
    for i in range(n):
        t = TARGET_MINUTES[i]
        base = BASE_SPEED[i]
        nc = need[i]
        if t is None:
            actual = None
            err = None
        else:
            actual = nc / (base * 60.0)          # 反算实际时长（分钟）
            err = abs(actual - t) / t * 100.0    # 圆整误差 %
        realms.append({
            "index": i,
            "name": REALM_NAMES[i],
            "band": BAND_OF[i],
            "needCult": nc,
            "baseSpeed": base,
            "targetMinutes": t,
            "actualMinutes": round(actual, 4) if actual is not None else None,
            "roundErrorPct": round(err, 4) if err is not None else None,
            "breakChance": BREAK_CHANCE[i],
            "breakPill": BREAK_PILL.get(i),
            "lifespan": LIFESPAN[i],
        })
    return realms


# ----------------------------------------------------------------------------
# 3. 自校验
# ----------------------------------------------------------------------------

def validate(realms):
    errors = []

    def check(cond, msg):
        if not cond:
            errors.append(msg)

    # 3.1 名称/顺序/数量
    check(len(realms) == 26, "境界数量必须为 26")
    check([r["index"] for r in realms] == list(range(26)), "index 必须为 0..25 连续")

    # 3.2 基础速率单调不减
    for i in range(1, 26):
        check(realms[i]["baseSpeed"] >= realms[i - 1]["baseSpeed"],
              f"基础速率倒挂：{realms[i]['name']} < {realms[i-1]['name']}")

    # 3.3 需求修为严格递增（终点 null 除外）
    vals = [r["needCult"] for r in realms if r["needCult"] is not None]
    for a, b in zip(vals, vals[1:]):
        check(b > a, f"需求修为非严格递增：{a} -> {b}")
    check(realms[25]["needCult"] is None, "飞升(index 25)的 needCult 必须为 null")

    # 3.4 实际时长严格递增、无倒挂，且误差 < 15%
    actuals = [(r["index"], r["name"], r["actualMinutes"]) for r in realms
               if r["actualMinutes"] is not None]
    for (i0, n0, a0), (i1, n1, a1) in zip(actuals, actuals[1:]):
        check(a1 > a0, f"时长倒挂：{n0}({a0:.1f}分) -> {n1}({a1:.1f}分) 未递增")
    for r in realms:
        if r["roundErrorPct"] is None:
            continue
        check(r["roundErrorPct"] < TOLERANCE * 100,
              f"{r['name']} 圆整误差 {r['roundErrorPct']:.2f}% 超过 {TOLERANCE*100:.0f}%")

    # 3.5 时长量级与单调性（整体越往后越慢）
    check(actuals[0][2] <= 2.0, "教学期首个境界时长应 <= 2 分钟")
    check(actuals[-1][2] >= 3000, "渡劫期时长应 >= 3000 分钟")

    # 3.6 突破成功率区间
    check(all(abs(realms[i]["breakChance"] - 1.0) < 1e-9 for i in range(9)),
          "炼气期突破成功率必须为 100%")
    for i in (9, 12, 15, 18):
        check(0.55 <= realms[i]["breakChance"] <= 0.75,
              f"{realms[i]['name']} 大境界突破成功率应在 0.55~0.75")
    for i in (21, 22, 23, 24):
        check(0.25 <= realms[i]["breakChance"] <= 0.40,
              f"{realms[i]['name']} 突破成功率应在 0.25~0.40")

    # 3.7 寿元
    ls = [r["lifespan"] for r in realms]
    check(ls[0] == 100, "炼气寿元应为 100")
    check(ls[-1] == 99999, "飞升寿元应为 99999")
    for a, b in zip(ls, ls[1:]):
        check(b > a, f"寿元非严格递增：{a} -> {b}")

    # 3.8 乘区范围
    for name, r_, t_, c_ in CONFIGS + [THEORETICAL_MAX_CONFIG]:
        check(ROOT_MULT_RANGE[0] <= r_ <= ROOT_MULT_RANGE[1], f"{name} 灵根倍率越界")
        check(TECH_MULT_RANGE[0] <= t_ <= TECH_MULT_RANGE[1], f"{name} 功法倍率越界")
        check(CAVE_MULT_RANGE[0] <= c_ <= CAVE_MULT_RANGE[1], f"{name} 洞府倍率越界")

    # 3.9 敏感性配置单调递增，中配 4~8 倍，极限 10~20 倍
    mults = [r_ * t_ * c_ for _, r_, t_, c_ in CONFIGS]
    for a, b in zip(mults, mults[1:]):
        check(b > a, "敏感性配置持续倍率未递增")
    check(4.0 <= mults[2] <= 8.0, f"中配持续倍率 {mults[2]:.2f} 应在 4~8 倍")
    check(10.0 <= mults[4] <= 20.0, f"极限持续倍率 {mults[4]:.2f} 应在 10~20 倍")

    return errors


# ----------------------------------------------------------------------------
# 4. 敏感性 / 通关时长分析
# ----------------------------------------------------------------------------

def compute_sensitivity(realms):
    """纯修炼通关总时长（不含突破失败重算），单位分钟。

    总时长 = Σ(每境界目标时长) / 持续倍率
    另给出「含突破失败的期望总时长」：失败需按原境界重新积累修为。
    """
    total_base = sum(r["targetMinutes"] for r in realms
                     if r["targetMinutes"] is not None)

    # 突破失败期望损耗（以"被卡住的那个境界"的时长计）：
    # 进入 gated 境界 i 的判定发生在 i-1 境界完成时。
    def failure_overhead(use_pill):
        total = 0.0
        detail = []
        for i in range(26):
            ch = realms[i]["breakChance"]
            if ch >= 1.0:
                continue
            eff = min(1.0, ch + (PILL_BREAK_BONUS if use_pill else 0.0))
            src = realms[i - 1]["targetMinutes"] if i - 1 >= 0 else None
            if src is None:
                continue
            extra = src * (1.0 / eff - 1.0)
            total += extra
            detail.append({
                "intoRealm": realms[i]["name"],
                "fromRealm": realms[i - 1]["name"],
                "baseChance": ch,
                "effectiveChance": round(eff, 4),
                "sourceMinutes": src,
                "expectedExtraMinutes": round(extra, 2),
            })
        return total, detail

    rows = []
    for name, r_, t_, c_ in CONFIGS:
        mult = r_ * t_ * c_
        use_pill = name != "白板"
        overhead, detail = failure_overhead(use_pill)
        pure = total_base / mult
        with_fail = (total_base + overhead) / mult
        rows.append({
            "config": name,
            "rootMult": r_,
            "techniqueMult": t_,
            "caveMult": c_,
            "sustainedMult": round(mult, 4),
            "totalMinutes": round(pure, 2),
            "totalHours": round(pure / 60.0, 2),
            "totalDays": round(pure / 60.0 / 24.0, 2),
            "totalWithFailMinutes": round(with_fail, 2),
            "totalWithFailHours": round(with_fail / 60.0, 2),
            "usesBreakPill": use_pill,
            "failureDetail": detail,
        })
    return total_base, rows


def burst_info():
    """爆发倍率参考：持续倍率 × 丹药 × 事件（限时，不计入通关时长）。"""
    info = []
    for name, r_, t_, c_ in CONFIGS:
        sustained = r_ * t_ * c_
        info.append({
            "config": name,
            "sustainedMult": round(sustained, 3),
            "burstWorst": round(sustained * PILL_MULT_RANGE[0] * EVENT_MULT_RANGE[0], 2),
            "burstBest": round(sustained * PILL_MULT_RANGE[1] * EVENT_MULT_RANGE[1], 2),
        })
    return info


# ----------------------------------------------------------------------------
# 5. 灵石经济模型
# ----------------------------------------------------------------------------

def build_economy(realms):
    """每境界段灵石收入 + 关键物品价格。

    收入/分钟 = 基础速率 × 该境界段的财富系数。
    关键突破丹价格 = 目标境界段收入/分钟 × 15 分钟（保证"后期买得起"）。
    单次探险奖励 = 该境界收入/分钟 × [2, 5] 分钟（修复现版本固定 50-300 的崩溃）。
    """
    income = {}
    for r in realms:
        inc = round_nice(r["baseSpeed"] * BAND_WEALTH[r["band"]])
        income[r["index"]] = inc

    # 各段代表收入（取该段首个境界）
    band_income = {}
    band_range = {}
    for name, a, b in BANDS:
        band_income[name] = income[a]
        band_range[name] = (a, b)

    pills = []
    for idx, pill in BREAK_PILL.items():
        dest_band = BAND_OF[idx]
        inc = band_income[dest_band]
        price = round_nice(inc * PILL_FARM_MINUTES)
        pills.append({
            "breakInto": realms[idx]["name"],
            "pill": pill,
            "destBand": dest_band,
            "destBandIncomePerMin": inc,
            "farmMinutes": PILL_FARM_MINUTES,
            "price": price,
        })

    bands = []
    for name, a, b in BANDS:
        inc = band_income[name]
        bands.append({
            "band": name,
            "indexStart": a,
            "indexEnd": b,
            "incomePerMin": inc,
            "expeditionStoneMin": inc * EXPEDITION_MIN_MIN,
            "expeditionStoneMax": inc * EXPEDITION_MAX_MIN,
        })

    return {
        "incomePerRealm": [{"index": r["index"], "name": r["name"],
                            "band": r["band"], "incomePerMin": income[r["index"]]}
                           for r in realms],
        "bands": bands,
        "breakPills": pills,
    }


# ----------------------------------------------------------------------------
# 6. 输出
# ----------------------------------------------------------------------------

def print_realm_table(realms):
    print("=" * 96)
    print("《仙途》境界配平表（零加成 · 纯在线基准）")
    print("=" * 96)
    header = f"{'#':>2}  {'境界':<8} {'需求修为':>12} {'基础速率':>8} {'目标时长':>9} {'实际时长':>9} {'误差':>6} {'突破率':>6}  {'寿元':>6}"
    print(header)
    print("-" * 96)
    for r in realms:
        nc = "—(终点)" if r["needCult"] is None else f"{r['needCult']:,}"
        tgt = fmt_minutes(r["targetMinutes"])
        act = fmt_minutes(r["actualMinutes"])
        err = f"{r['roundErrorPct']:.2f}%" if r["roundErrorPct"] is not None else "-"
        print(f"{r['index']:>2}  {r['name']:<8} {nc:>12} "
              f"{str(r['baseSpeed']) + '/息':>8} {tgt:>9} {act:>9} {err:>6} "
              f"{r['breakChance']*100:>5.0f}%  {r['lifespan']:>6}")
    print("-" * 96)
    total = sum(r["targetMinutes"] for r in realms if r["targetMinutes"] is not None)
    print(f"零加成纯修炼合计：{total:,.0f} 分钟 = {total/60:.1f} 小时 = {total/60/24:.2f} 天")


def print_sensitivity(total_base, rows):
    print()
    print("=" * 96)
    print("加成敏感性分析：灵根 × 功法 × 洞府（持续倍率，丹药/事件为限时不计入）")
    print("=" * 96)
    print(f"零加成基准总时长：{total_base:,.0f} 分钟（{total_base/60:.1f} 小时 / {total_base/60/24:.2f} 天）")
    print("-" * 96)
    print(f"{'配置':<6} {'灵根':>5} {'功法':>5} {'洞府':>5} {'持续倍率':>8} "
          f"{'纯通关':>12} {'含突破失败':>14}")
    print("-" * 96)
    for row in rows:
        print(f"{row['config']:<6} {row['rootMult']:>5.2f} {row['techniqueMult']:>5.2f} "
              f"{row['caveMult']:>5.2f} {row['sustainedMult']:>7.2f}x "
              f"{fmt_minutes(row['totalMinutes']):>12} {fmt_minutes(row['totalWithFailMinutes']):>14}")
    print("-" * 96)
    print("注：含突破失败 = 失败后需按原境界重新积累修为（悲观模型）；白板无突破丹，其余配置默认使用突破丹。")

    print()
    print("爆发倍率参考（持续倍率 × 丹药buff × 事件buff，限时，不计入通关时长）：")
    for b in burst_info():
        print(f"  {b['config']:<6} 持续 {b['sustainedMult']:>6.2f}x  "
              f"爆发区间 {b['burstWorst']:>7.2f}x ~ {b['burstBest']:>7.2f}x")


def print_economy(econ):
    print()
    print("=" * 96)
    print("灵石经济模型（初版）")
    print("=" * 96)
    print(f"{'境界段':<6} {'收入/分钟':>10} {'推荐单次探险':>16}")
    print("-" * 96)
    for b in econ["bands"]:
        print(f"{b['band']:<6} {b['incomePerMin']:>10,} "
              f"{b['expeditionStoneMin']:>7,} ~ {b['expeditionStoneMax']:<7,}")
    print("-" * 96)
    print("关键突破丹价格（= 目标境界段 15 分钟收入）：")
    for p in econ["breakPills"]:
        print(f"  突破 {p['breakInto']:<6} 需 {p['pill']:<6} 价格 {p['price']:>12,} 灵石 "
              f"（{p['destBand']}段收入 {p['destBandIncomePerMin']:,}/分钟，约 {p['farmMinutes']} 分钟回本）")


def write_json(realms, total_base, rows, econ):
    os.makedirs(OUT_DIR, exist_ok=True)

    realms_payload = {
        "meta": {
            "game": "仙途",
            "description": "26 境界修为配平表（零加成纯在线基准）",
            "formula": "needCult = baseSpeed * targetMinutes * 60",
            "speedFormula": "speed = base(realmIndex) * rootMult * techniqueMult * caveMult * pillBuff * eventBuff",
            "tolerance": TOLERANCE,
            "baseTotalMinutes": total_base,
            "baseTotalHours": round(total_base / 60.0, 2),
            "baseTotalDays": round(total_base / 60.0 / 24.0, 2),
        },
        "realms": realms,
    }
    path = os.path.join(OUT_DIR, "realms.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(realms_payload, f, ensure_ascii=False, indent=2)

    sens_payload = {"baseTotalMinutes": total_base, "configs": rows, "burst": burst_info()}
    with open(os.path.join(OUT_DIR, "sensitivity.json"), "w", encoding="utf-8") as f:
        json.dump(sens_payload, f, ensure_ascii=False, indent=2)

    with open(os.path.join(OUT_DIR, "economy.json"), "w", encoding="utf-8") as f:
        json.dump(econ, f, ensure_ascii=False, indent=2)

    return path


# ----------------------------------------------------------------------------
# 7. main
# ----------------------------------------------------------------------------

def main():
    realms = build_realms()
    errors = validate(realms)

    print_realm_table(realms)

    total_base, rows = compute_sensitivity(realms)
    print_sensitivity(total_base, rows)

    econ = build_economy(realms)
    print_economy(econ)

    print()
    print("=" * 96)
    if errors:
        print("自校验：失败 [FAIL]")
        for e in errors:
            print("  - " + e)
        # 明确报错
        raise AssertionError(f"配平自校验未通过，共 {len(errors)} 项：{errors}")
    print("自校验：通过 [OK]（时长单调递增 / 无倒挂 / 圆整误差 < 15% / 成功率区间 / 寿元递增 / 倍率档位达标）")

    path = write_json(realms, total_base, rows, econ)
    print(f"已写出：{path}")
    print(f"       {os.path.join(OUT_DIR, 'sensitivity.json')}")
    print(f"       {os.path.join(OUT_DIR, 'economy.json')}")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print("\n[配平错误] " + str(exc), file=sys.stderr)
        sys.exit(1)
