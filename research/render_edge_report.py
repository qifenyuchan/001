#!/usr/bin/env python3
"""把 research/github-edge.json 渲染成 docs/RESEARCH-EDGE.md。

第三轮：到更边缘的地方去。不搜任何能被称作「记忆相关」的领域，
改搜这些领域的**上游**——认知科学的原始机制、嵌入式存储引擎家族、
人类用了几十年的外部记忆工具、没人讨论的法律合规、以及一批偏门东西。
"""
import json
import os
import re
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "research", "github-edge.json")
OUT = os.path.join(ROOT, "docs", "RESEARCH-EDGE.md")
PREV = [os.path.join(ROOT, "research", "github-repos.json"),
        os.path.join(ROOT, "research", "github-adjacent.json")]

MEM = re.compile(r"\b(memory|memories|memor|remember|recall|mnem|engram|hippocamp)\w*", re.I)
# 存储引擎类里 "in-memory KV store" 会被 MEM 误命中，要从记忆信号里剔除
FAKE = re.compile(r"in-memory|in memory", re.I)

CATS = [
    ("认知·机制", "cognitive"),
    ("存储·引擎", "engines"),
    ("外部记忆", "pkm"),
    ("合规", "compliance"),
    ("偏门", "odd"),
]

SECTIONS = {
    "cognitive": {
        "title": "认知科学的原始机制：上游在论文里，还没人搬下来",
        "parts": [
            "NeurAI-Lab/CLS-ER",
            "CarletonCognitiveModelingLab/python_actr",
            "anthony-maio/mnemos",
            "thaihungle/MBEC-plus",
            "Roxx0x/mtrace",
            "itsdfish/ACTRModels.jl",
            "HOMlab/QN-ACTR-Release",
            "jessemelpolio/TreeProbe",
            "tanchongmin/Hippocampal-Replay",
            "lampinen/integration_CLS",
            "AbdulrahmanMasoud/human-memory-sdk",
            "Thatgfsj/neuroweave-cortex",
        ],
        "map": [
            ("ACT-R 激活方程", "ACT-R 从 1970 年代活到现在，有明确的激活模型：base-level activation（由访问次数与衰减时间决定）+ spreading activation（由当前被激活的相关记忆传播而来）。**这正好是记忆检索排序需要的两个量**——它既算「这条记忆现在有多活跃」，又算「它是否被眼前的话题激活」。"),
            ("CLS（互补学习系统）", "海马体快速学习、新皮层慢速整合。这是「短期 → 长期巩固」的神经科学根据，也是所有记忆产品嘴上说巩固、实际没做巩固的地方。"),
            ("Hippocampal replay（海马体重放）", "睡眠时重放白天经历——「睡眠式巩固」的原型。它解释了为什么巩固要**在空闲时做**而不是在对话中做：因为新信息必须先落地，才能和旧的整合。"),
            ("Surprisal gating（意外度门控）", "符合预期的日常不值得存，只有超预期的才存。这是从源头控制仓库膨胀，比事后清理高明。"),
        ],
    },
    "engines": {
        "title": "嵌入式存储引擎家族：让「不引入服务」成为可能",
        "parts": [
            "spacejam/sled",
            "cberner/redb",
            "kuzudb/kuzu",
            "nutsdb/nutsdb",
            "fjall-rs/fjall",
            "tonbo-io/tonbo",
            "orneryd/NornicDB",
            "stoolap/stoolap",
            "linkedin/PalDB",
            "lmdbjava/lmdbjava",
            "GrafeoDB/grafeo",
            "KipData/KiteSQL",
        ],
        "map": [
            ("Kùzu（嵌入式属性图）", "**嵌入式**图数据库，单文件，自带向量搜索和全文搜索。**它推翻了第二轮 §3.3 的一个结论**——第二轮判定「不引图数据库，因为都要起服务」，但 Kùzu 是作为库嵌进去的。"),
            ("NornicDB（Graph + Vector + Temporal MVCC）", "图、向量、**时序多版本并发控制**三合一。Temporal MVCC 直接对应记忆的时间切片查询——「三天前我手上有哪几条记忆」。"),
            ("PalDB（写一次 KV）", "LinkedIn 的嵌入式 KV，设计成**写一次、读多次**。这和记忆的写入模式天然匹配：记忆写入后基本不修改，是追加式的。"),
            ("LMDB / sled / redb / fjall", "内存映射与 LSM 树家族，读性能极高。这些是「索引该放哪」的候选。"),
        ],
    },
    "pkm": {
        "title": "人类的外部记忆工具：打磨了几十年的答案",
        "parts": [
            "obsidianmd/obsidian-releases",
            "foambubble/foam",
            "reorproject/reor",
            "xwmx/nb",
            "dendronhq/dendron",
            "org-roam/org-roam",
            "MarkusPfundstein/mcp-obsidian",
            "zk-org/zk",
            "MaggieAppleton/digital-gardeners",
        ],
        "map": [
            ("原子笔记", "一条笔记一个想法，靠链接组织而不是靠文件夹。这和北极星「一轮一条记录」是同一个设计，只是人类用了几十年才总结出这条规则。"),
            ("双向链接", "笔记之间互相引用，A 链接到 B 时 B 也知道 A 存在。这是「记忆之间的关系」的成熟实现，比图数据库轻得多——**它就是纯文本**。"),
            ("图谱视图", "全局看关系网络。用户很吃这一套，说明「看到记忆之间的关系」是真实需求。"),
            ("mcp-obsidian（4481）", "让 Agent 通过 MCP 读写 Obsidian vault。**这个数字说明「Agent + 人类外部记忆工具」已经是成熟路径和真实需求**，不是设想。"),
        ],
    },
    "compliance": {
        "title": "法律与合规：没人讨论，但一定会来",
        "parts": [
            "rtbf-ir/rtbf.ir",
            "sambhal-labs/vismaran",
            "philterd/opensearch-agent-skill-right-to-be-forgotten",
            "snowplow-archive/right-to-be-forgotten-spark-job",
            "GipsyDanger-dev/RightToBeForgotten",
            "Valisthea/styx-erc-cryptographic-amnesia",
        ],
        "map": [],
    },
    "odd": {
        "title": "偏门：看起来完全不相关的三个意外",
        "parts": [
            "open-source-labs/Reactime",
            "sraoss/pg_ivm",
            "SeaQL/FireDBG.for.Rust",
            "Continuum-AI-Corp/OrcaReplay",
            "vlcn-io/materialite",
            "trickle-labs/pg-trickle",
            "ZIZKA-AI-SL/ZizkaDB",
            "gleb-sevruk/pycrunch-trace",
        ],
        "map": [],
    },
}

# 每节的正文：origin / 判定。写在脚本里以保持可重现。
BODY = {
    "cognitive": {
        "origin": [
            "第二轮扫到的是**认知科学的实现侧**——「谁在做遗忘曲线」，拿到了 67 个项目和 FSRS。",
            "这一轮扫的是**机制侧**——认知科学本身在说什么。结果出乎意料：",
            "**101 个项目，最高的只有 54 star。** 认知科学对记忆机制的思考比整个 AI 记忆行业深了四十年，但它在 GitHub 上几乎是空的。",
        ],
        "verdict": [
            "**这是个机会，也是个警告。**",
            "",
            "- **机会**：这块地是空的。谁先把论文搬下来，谁就拿到别人没有的东西。",
            "- **警告**：**别指望抄到成熟实现**。GitHub 上最好的 ACT-R 实现只有 37 star，只能当参考，不能当依赖。这也解释了为什么唯一打磨到生产级的记忆调度算法（FSRS）来自 Anki 社区而不是认知科学界——认知科学的产出是论文，不是代码。",
            "",
            "**对北极星的一个具体建议：如果要加衰减，搬 ACT-R 的激活方程，而不是 FSRS 的调度。**",
            "理由：FSRS 优化的是「隔多久该复习一次」，这是抽认卡的问题；ACT-R 算的是「这条记忆现在激活性有多高」，这恰恰是记忆检索排序需要的量。",
            "而且 ACT-R 的激活 = **base-level**（由访问次数与时间衰减决定）+ **spreading**（由当前话题激活的相关记忆传播而来）。",
            "第二项尤其关键——它天然支持「提到 A 时想起相关的 B」，这是纯关键词检索做不到、而用户又天天在用的能力。",
            "",
            "落地形态（P1，与 §3.4 的三个派生量合并）：`decay_score` 用 ACT-R 的 base-level 公式算，spreading 部分先不做（需要维护记忆间关联，成本过高），留到 P2。",
        ],
    },
    "engines": {
        "origin": [
            "第二轮确认了「SQLite + FTS5」是本地优先记忆的事实标准。这一轮问的是：**SQLite 之外还有什么？**",
            "答案是嵌入式引擎家族已经非常庞大——Rust 生态尤其活跃（sled、redb、fjall、KiteSQL、stoolap 都是 Rust 写的）。",
        ],
        "verdict": [
            "**结论不变，但理由必须改——而且改正之后，理由变强了。**",
            "- 第二轮 §3.3 写的是「不引图数据库，因为都要起独立服务」。**这个理由被 Kùzu 推翻了**（它是嵌入式单文件图数据库）。",
            "- 但结论仍然是不引。真正的理由第二轮没写清楚，现在补上：**所有嵌入式引擎存的都是私有二进制格式，而北极星最核心的卖点是「人能直接打开 JSON 改」。**",
            "- 换成 Kùzu / redb / sled 之后，`data/` 下面就是一堆只有本程序能读的二进制文件，「文件即数据」这条卖点直接消失。",
            "",
            "**这也顺带明确了侧车索引该用什么：只能选 SQLite。**",
            "理由不是它最好，而是**它是唯一一个人也能打开的嵌入式数据库**——任何 sqlite3 客户端、任何语言、甚至命令行都能读。",
            "用 redb 或 fjall 做索引，索引文件就变成了黑盒，与「任何新功能都不能让数据变成只有本程序能读的东西」这条铁律冲突。",
            "",
            "值得记一笔的：PalDB 的「写一次读多次」设计与记忆的追加式写入天然匹配，未来若真要换引擎，它是比 LSM 家族更合适的候选。",
        ],
    },
    "pkm": {
        "origin": [
            "Obsidian、Roam、Logseq、Zettelkasten 这些方法论，解决的问题和 AI 记忆是同一个：**怎么让记下来的东西，以后还能找得到。**",
            "它们已经打磨了几十年，用户会用五到十年。这类工具知道什么会烂掉。",
        ],
        "verdict": [
            "**不做 PKM，但要把衔接做出来。**",
            "",
            "- **不做**：用户要的不是一个笔记软件，而且这个赛道已经有 Obsidian（22388 star）这类成熟产品。做了打不过，也不该做。",
            "- **P1 可做（具体形态）**：**导出为 Obsidian 兼容的 Markdown vault**。把记忆导出成「一轮一个 .md 文件 + Obsidian 双向链接语法 `[[...]]`」，用户可以直接把目录扔进 Obsidian 打开。",
            "- 这一条修正了第二轮的判定：当时「导入导出」是 P1，但排得很抽象。现在有了具体形态——**不是导出成 JSON，是导出成人类 PKM 工具能直接吃的 Markdown**。",
            "- 价值在于它同时满足两件事：既守住了「人可读」，又让用户自己选择用哪个工具看。**不需要北极星自己变成 Obsidian，只需要它能被 Obsidian 打开。**",
            "",
            "另一个信号：`mcp-obsidian` 有 4481 star，说明「Agent 读写人类笔记库」是真实存在的需求。",
            "如果用户已经有了 Obsidian vault，他们需要的可能不是新的记忆服务，而是让 Agent 接上旧的那个。这个需求要盯，但不在当前版本范围内。",
        ],
    },
    "compliance": {
        "origin": [
            "这一轮最边缘的一类。62 个项目里绝大多数是噪音——但正是从噪音里能看出「这块现在有没有人在管」。",
            "答案是有，但极少，而且**已经有人在做 AI Agent 记忆的专属方案了**。",
        ],
        "verdict": [
            "**「记忆的删除」和「记忆的遗忘」是两件事，而且它们会打架。这件事现在没人提。**",
            "这是本节最重要的发现，值得单独讲清楚：",
            "",
            "- **用户要求删除** → 合规义务。必须真的删掉，而且要能证明删了。",
            "- **记忆自动衰减** → 产品功能。是让记忆变淡、排序变低，**它仍然存在于仓库里**。",
            "- 两者混在一起会出事：如果系统用「它已经衰减了」来解释「用户要求删除的数据还在」，合规上完全说不清。而且衰减是自动的、无人值守的，用户根本不知道自己的数据到底还在不在。",
            "",
            "**对北极星**：",
            "",
            "- 现有 `memory_purge` 是真删（写墓碑 + 跨设备传播），这个设计是对的，要守住。",
            "- **P1 要做（成本极低）**：把这两件事的语义在文档和数据结构里明确分开。衰减的记录**永远留在 JSON 里**（只是分数低、排序靠后），用户要求删除的记录**必须真的删掉**。",
            "- 现在代码已经用墓碑了，缺的不是实现，是**把话说清楚**——这个风险现在没人提，提前讲清楚比事后补救便宜得多。",
            "",
            "值得盯的项目：",
            "",
            "- `sambhal-labs/vismaran` —— 直接做「AI agent memory 的 provable right-to-be-forgotten」（GDPR/DPDP 第 17 条）。虽然只有 2 star，但它是**第一个把遗忘权明确接到 AI 记忆上**的项目。",
            "- `snowplow-archive/right-to-be-forgotten-spark-job` —— 已归档，但是数据管道里删除用户数据的真实工程实现，可作参考。",
        ],
    },
    "odd": {
        "origin": [
            "最后一类是我故意放进去的、看起来和记忆毫无关系的六个方向。",
            "结果是**三个意外**：一个指出第二轮的方案有现成理论可依，一个让现有设计白捡一个功能，一个指向还远的未来。",
        ],
        "verdict": [
            "#### 意外一：IVM 就是侧车索引的理论基础",
            "",
            "第二轮 §3.1 提了个方案：「P1 可做：FTS5 侧车索引，写入时增量更新索引」。",
            "现在知道了，**这个「增量更新」不是我拍脑袋想的，它是 IVM（Incremental View Maintenance，增量视图维护）的一个特例**——数据库界研究了三十年的成熟理论，有完整的形式化定义。",
            "",
            "- `sraoss/pg_ivm`（1497）—— PostgreSQL 的 IVM 扩展。",
            "- `trickle-labs/pg-trickle`（149）—— 流式表的 IVM。",
            "- **`vlcn-io/materialite`（160）—— JavaScript 实现的 differential dataflow + IVM。**",
            "",
            "最后一条最重要：**IVM 在 Node 生态里已经有实现了**，这条路可以走，不用从零摸索。",
            "具体可借鉴的是 delta 处理思路——每次写入进来的是「插入 delta / 删除 delta」，索引只需要对 delta 做处理，而不是对全量重算。北极星覆盖保存时（旧版进 .trash）产生的正是删除 delta + 插入 delta。",
            "",
            "#### 意外二：时间旅行调试 → 记忆的时间旅行查询",
            "",
            "`Continuum-AI-Corp/OrcaReplay`（285）直接写着「Time travel for AI agents. Record, replay, fork, and debug any agent run」。",
            "时间旅行调试器在这个领域之外早就成熟了（Reactime 2239、FireDBG 1679、codetracer 1306、pycrunch-trace 198），它们解决的问题是「回到过去的某个状态看看」。",
            "",
            "**搬到记忆上，这是个甜点功能**：",
            "「**三天前我问这个问题的时候，你手上有哪几条记忆？**」",
            "",
            "- 判定：**P2，但实现成本比所有人都低**。因为记录天然带 `turn_no` 和时间戳，且保存是覆盖式（旧版进 `.trash` 而不是删除）——**时间旅行需要的历史数据，北极星已经在存了**。",
            "- 这是现有设计的隐藏红利：别人要专门做一个历史版本系统才能支持，北极星只需要一条查询命令。",
            "",
            "#### 意外三：记忆的防篡改审计链",
            "",
            "`ZIZKA-AI-SL/ZizkaDB`（143）——「Audit trail database for AI agents. Tamper-evident, checksum-backed decision logs」。",
            "当记忆开始影响决策，「这条记忆有没有被人改过」会变成真问题。",
            "",
            "- 判定：**P3**。现在有 `revision` 和 `.trash`（能看出改过），但没有防篡改（看不出改了什么、也防不住刻意篡改）。",
            "- 只有团队/合规场景才真需要。当前不做，但记下来——因为它是「记忆会被当作证据使用」那一天的前置条件。",
        ],
    },
}


def esc(s):
    if not s:
        return ""
    return s.replace("|", "\\|").replace("\n", " ").strip()


def link(name):
    return f"[{name}](https://github.com/{name})"


def row(it, lang=True):
    if lang:
        return f"| {it['stars']} | {link(it['full_name'])} | {it.get('language') or '—'} | {esc((it.get('description') or '')[:112])} |"
    return f"| {it['stars']} | {link(it['full_name'])} | {esc((it.get('description') or '')[:112])} |"


def build():
    d = json.loads(open(SRC, encoding="utf-8").read())
    merged = {}
    for q, v in d["results"].items():
        for it in v["items"]:
            fn = it["full_name"]
            if fn not in merged or it["stars"] > merged[fn]["stars"]:
                merged[fn] = dict(it, _cat=v["category"])

    prev = set()
    for f in PREV:
        if not os.path.exists(f):
            continue
        dd = json.loads(open(f, encoding="utf-8").read())
        if "repos" in dd:
            prev |= {r["full_name"] for r in dd["repos"]}
        else:
            for q, v in dd["results"].items():
                prev |= {i["full_name"] for i in v["items"]}
    newvs = [i for i in merged.values() if i["full_name"] not in prev]

    by_cat = {}
    for it in merged.values():
        by_cat.setdefault(it["_cat"], []).append(it)

    L = []
    add = L.append

    add("# 更边缘的一层：上游、引擎、人类经验与三个意外")
    add("")
    add(f"> 生成时间：{time.strftime('%Y-%m-%d %H:%M')}　|　数据源：`research/github-edge.json`（GitHub Search API）")
    add("")
    add("## 0. 第三轮：不搜领域，搜领域的上游")
    add("")
    add("前两轮的路线是：第一轮搜「记忆产品」，第二轮搜「相邻领域」。")
    add("这一轮再往外推一层：**不搜任何能被称作「记忆相关」的领域，改搜这些领域的上游。**")
    add("")
    add("动机来自第二轮末尾的判断：这片海比扫到的更深。既然「搜别的东西能捞到零件」，")
    add("那再往上追一层——**那些零件本身又是从哪来的**——应该还能挖到东西。")
    add("")
    add("| 方向 | 查询数 | 命中 | 它回答什么问题 |")
    add("|---|---|---|---|")
    qn = {c: 0 for c, _ in CATS}
    for q in d["queries"]:
        qn[q["category"]] += 1
    why = {
        "认知·机制": "记忆机制的原始研究，而不是它的实现",
        "存储·引擎": "SQLite 之外的嵌入式引擎家族",
        "外部记忆": "人类用了几十年的外部记忆工具",
        "合规": "记忆的删除义务（没人讨论的那个）",
        "偏门": "看起来和记忆毫无关系的六个方向",
    }
    for c, _ in CATS:
        add(f"| {c} | {qn[c]} | {len(by_cat.get(c, []))} | {why[c]} |")
    add("")
    add("### 口径与局限（与前两轮一致）")
    add("")
    add("- 数据是**仓库自述**，未经实际安装验证；描述里的效果宣称均为项目自述。")
    add("- 只取 Search API 元数据，**未抓 README**。")
    add("- 本轮的查询刻意选在「上游」，因此**命中项目的 star 普遍偏低**。")
    add("这本身是数据的一部分，不是缺陷——见 §1 的解释。")
    add("- 存储引擎类的描述里「in-memory KV store」会被记忆关键词误命中，")
    add("因此本轮**不沿用前两轮的「记忆信号命中数」口径**（会被严重虚高），改用「前两轮未见过的新增数」。")
    add("")

    add("## 1. 总览：769 个去重仓库，747 个是前两轮没见过的")
    add("")
    add(f"24 组上游查询去重后 **{len(merged)}** 个仓库，其中 **{len(newvs)}** 个不在前两轮的任何一次扫描里。")
    add("")
    add("**与前两轮的重叠率不到 3%** —— 说明每往外推一层，看到的都是新的东西。")
    add("")
    add("另一个必须说清楚的现象：**本轮命中项目的 star 普遍偏低。**")
    add("认知机制类最高的只有 54 star，合规类最高 216 star。")
    add("这不是扫描没扫好，而是**这些领域本身就是 GitHub 上的洼地**——")
    add("认知科学的产出是论文不是代码，合规的产出是法条不是仓库。")
    add("它们的价值不在 star 数里。")
    add("")

    add("## 2. 五个上游方向")
    add("")
    idx = 0
    for cname, key in CATS:
        idx += 1
        s = SECTIONS[key]
        b = BODY[key]
        add(f"### 2.{idx} {s['title']}")
        add("")
        for p in b["origin"]:
            add(p)
            add("")
        add("**零件**")
        add("")
        add("| Star | 项目 | 语言 | 说明 |")
        add("|---|---|---|---|")
        picked = sorted([merged[n] for n in s["parts"] if n in merged], key=lambda x: -x["stars"])
        for it in picked:
            add(row(it))
        add("")
        if s["map"]:
            add("**拆开装到记忆上**")
            add("")
            for term, use in s["map"]:
                add(f"- **{term}** → {use}")
            add("")
        add("**对北极星的判定。**")
        add("")
        for v in b["verdict"]:
            add(v)
        add("")

    # ---- 3 推翻的三个判定
    add("## 3. 这一轮推翻了什么")
    add("")
    add("调研最有价值的产出不是新信息，是**发现自己之前的判断错了**。这一轮改了三轮：")
    add("")
    add("| 第二轮的判定 | 理由 | 第三轮的结果 |")
    add("|---|---|---|")
    add("| 不引图数据库 | 「都要起独立服务，破坏零依赖」 | **理由错了**——Kùzu 是嵌入式单文件图数据库。但结论不变，**新理由是**：嵌入式引擎存私有二进制格式，破坏「人能直接打开改」。 |")
    add("| FTS5 侧车索引（增量更新） | 自己想的方案 | **它其实是 IVM**，数据库界研究三十年的成熟理论。而且 JS 实现已存在（`materialite`），可以直接借鉴 delta 处理。 |")
    add("| 「导入导出」P1 | 形态抽象 | 具体化为**导出 Obsidian 兼容的 Markdown vault**。不是导出 JSON，是导出人类 PKM 工具能直接吃的格式。 |")
    add("")
    add("还补上了两条第二轮的空白：")
    add("")
    add("1. **选 SQLite 的真正理由**：不是它最好，而是它是唯一一个人也能打开的嵌入式数据库。这条以前没讲清楚。")
    add("2. **时间旅行查询是现有设计的隐藏红利**：因为保存是覆盖式且旧版进 `.trash`，历史数据已经在存了，别人要专门做版本系统，北极星只需要一条命令。")
    add("")

    # ---- 4 三轮账
    add("## 4. 三轮扫描的累计账")
    add("")
    add("| 轮次 | 搜什么 | 去重 | 记忆相关/新增 | 主要收获 |")
    add("|---|---|---|---|---|")
    add("| 一 | 22 组记忆类关键词 | 1603 | 693 | 竞品全景、功能词频、长尾项目 |")
    add("| 二 | 9 个相邻领域（22 组） | 1037 | 186 记忆信号 / **130 新增** | **记忆的巩固与遗忘**；中文 FTS5 分词；记忆投毒；两个负结果 |")
    add(f"| 三 | 5 个上游方向（24 组） | {len(merged)} | **{len(newvs)} 新增** | **认知机制上游是空的**；IVM；记忆的遗忘权；时间旅行查询 |")
    add("")
    add("三轮加起来扫过 **3409 个去重仓库**，每一轮看到的与前一轮重叠都很少。")
    add("")
    add("但比数量更重要的是一个趋势：")
    add("**越往外走，star 越低，信息密度越高。**")
    add("第一轮动辄上万 star 的项目里，多数是互相抄的同类产品；")
    add("第三轮 54 star 的仓库里，装的是四十年认知科学的积累。")
    add("")

    # ---- 5 清单
    add("## 5. 本轮新增的补充清单")
    add("")
    add("在第二轮 §7 清单上的增删。只列本轮新推导的。")
    add("")
    add("| 优先级 | 动作 | 来自 § | 说明 |")
    add("|---|---|---|---|")
    add("| **P1** | `decay_score` 改用 ACT-R base-level 公式 | 2.1 | 替换第二轮说的 FSRS：FSRS 优化复习间隔，ACT-R 算当前激活，**后者才是检索排序要的量** |")
    add("| **P1** | 导出为 **Obsidian 兼容的 Markdown vault** | 2.3 | 具体化第二轮的「导入导出」。不是导出 JSON |")
    add("| **P1** | 文档里明确区分「用户要求删除」与「系统自动衰减」 | 2.4 | 成本极低，但现在没人提。前者真删，后者留着只是排序低 |")
    add("| **P1** | 侧车索引按 IVM 的 delta 思路实现 | 2.5 | 借鉴成熟理论，别自己摸索 |")
    add("| P2 | 时间旅行查询（「三天前我手上有哪几条记忆」） | 2.5 | **实现成本比所有人都低**，历史数据已经在存 |")
    add("| P2 | ACT-R spreading activation（提到 A 想起 B） | 2.1 | 需要维护记忆间关联，成本高，留到 P2 |")
    add("| P3 | 记忆防篡改审计链 | 2.5 | 团队/合规场景才需要 |")
    add("| 不做 | 换嵌入式引擎（Kùzu/redb/sled/fjall） | 2.2 | 理由已改：不是太重，是**破坏人可读** |")
    add("| 不做 | 自己做 PKM | 2.3 | 打不过 Obsidian，也不该做 |")
    add("")

    # ---- 6 下一层
    add("## 6. 还有第四层吗")
    add("")
    add("有，但收益正在变薄。诚实评估：")
    add("")
    add("1. **认知科学的论文本体**——这一轮只扫到它在 GitHub 上的少量实现。真正的源头是论文（ACT-R 原始文献、CLS 理论、睡眠巩固研究）。**下一步不是扫 GitHub，是读论文。** GitHub 扫描这条路在这里到头了。")
    add("2. **人类的记忆训练实践**——记忆宫殿、记忆术、 spaced repetition 社区。这些在 GitHub 上同样几乎是空的（本轮「method of loci」组最高命中只有几十 star）。")
    add("3. **与产品更近的东西**——比如各家的 MCP 记忆服务器实现细节、工具输出压缩策略。这些是**往回收**而不是往外扩，性质不同。")
    add("")
    add("**建议：GitHub 扫描这条线到此为止（三轮 3409 个仓库，边际收益已明显下降），**")
    add("把精力转到两件更实在的事上：")
    add("")
    add("- **读论文**：把 ACT-R 与 CLS 的原始文献读进来，把激活方程落成代码。这比再扫一千个仓库有价值。")
    add("- **补 P1**：本报告三轮积累的 P1 清单已经足够排满一个版本，再调研下去是拖延。")
    add("")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return len(merged), len(newvs)


if __name__ == "__main__":
    t, n = build()
    print(f"OK total={t} new={n} -> {OUT}")
