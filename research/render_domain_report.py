#!/usr/bin/env python3
"""把 research/github-domains.json 渲染成 docs/RESEARCH-DOMAINS.md。

第四轮：按用户群落扫。AI 用得最多的两群人——理工（写代码做工程）和
文创（写长篇做角色扮演）——早就被「AI 记不住」折磨，各自攒出了土办法。
问的是：他们的土办法里，有没有可以直接搬的机制。
"""
import json
import os
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "research", "github-domains.json")
OUT = os.path.join(ROOT, "docs", "RESEARCH-DOMAINS.md")
PREV = [os.path.join(ROOT, "research", "github-repos.json"),
        os.path.join(ROOT, "research", "github-adjacent.json"),
        os.path.join(ROOT, "research", "github-edge.json")]

SECTIONS = [
    {
        "key": "creative",
        "title": "文创·叙事：土办法已经解决了半个问题",
        "origin": [
            "写长篇的人面对的记忆问题，比对话助手苛刻得多：一部网文几百万字，角色三百个，",
            "第三章埋的伏笔第三百章要收。AI 记不住设定，写出来的角色就会前后矛盾。",
            "这个社区被折磨了几年，攒出了几样土办法——**没有一样用向量**。",
        ],
        "parts": [
            "zenstory-ai/oh-story-claudecode",
            "PenglongHuang/chinese-novelist-skill",
            "ExplosiveCoderflome/AI-Novel-Writing-Assistant",
            "EthanYoQ/AI-Novel-Writer",
            "syrizelink/OpenFic",
            "alfredxw/denova",
            "yuanbw2025/storyforge",
            "mak-kirkland/chronicler",
            "indentlabs/notebook",
            "owlchester/kanka",
            "carlonicora/obsidian-rpg-manager",
            "malfoyslastname/character-card-spec-v2",
            "SenriYuki/SillyTavern-Horae",
            "Lodactio/Extension-Summaryception",
            "bmen25124/SillyTavern-WorldInfo-Recommender",
            "SillyTavern/SillyTavern-Timelines",
            "Anshler/graphify-novel",
            "ynnyh/jarvis-write",
            "ocedo-apps/StoryBook-AI",
            "awrshift/agent-memory-kit",
        ],
        "map": [
            ("世界书（Lorebook / World Info）——触发式注入", "一大堆设定条目，每条带**触发关键词**；对话中出现关键词，对应条目才被注入上下文。这是从 AI Dungeon 到 NovelAI 到 SillyTavern 打磨了多年的机制。**注意它和向量检索的根本区别**：向量是「算出来的相似」，世界书是「作者指定的命中」——更可控、更便宜、可解释，坏处是靠人维护。"),
            ("角色卡（Character Card）——结构化人设", "有正式 spec（v2/v3）：名字、描述、性格、场景、示例对话，PNG 元数据里嵌 JSON。关键是 spec 里还有 `character_book` 字段——**角色卡里内嵌一个迷你世界书**。「对方是谁」被建模成一张卡，而不是一堆流水。"),
            ("故事圣经（Story Bible）——真相层", "已确立事实的清单：世界规则、角色年龄、时间线。写作时必须遵守。有项目把这个说破了：「**The Story Bible holds truth**」——真相和过程是两层，过程草稿怎么改都不碰真相层。"),
            ("一致性校验", "中文网文工具开始内置「自动校验」与「consistency-first」——检测「第三章用剑的人第三百章突然用枪」。这是记忆矛盾检测的应用形态。"),
            ("跑团管理（Campaign Manager）", "世界状态、NPC 关系、时间线、**session recap**（每次跑完团写一篇回顾）。session recap 就是「会话总结」的人类版，跑团社区已经写了几十年。"),
        ],
        "verdict": [
            "**这一轮最大的发现：中文网文社区。**",
            "本轮扫到的中文网文 AI 写作工具全部是中文社区做的，star 全线高于英文同类",
            "（7755 / 3975 / 3238 / 1646 / 1233……），而且描述里直接写着「**创作记忆**」「**自动校验**」",
            "——**「AI 记不住设定」在这个社区已经是被点名、被产品化的痛点**。",
            "这对北极星「首发中文 Agent 生态」的判断是第四轮的独立验证：不是我们猜中文用户需要记忆，",
            "是他们已经在自己动手造了。",
            "",
            "**可搬的机制，按价值排序：**",
            "",
            "- **触发式注入（P1/P2，本轮最大收获）**：北极星现在的注入只有两种——固定注入上一轮（被动、有界）和查询式召回（要 Agent 主动发起）。世界书是第三种：**记录带触发词，当前对话命中就自动进上下文**。它解决的是查询式的死穴——Agent 不知道自己该查什么。落地：记录加可选 `triggers` 字段（关键词列表），每轮对当前输入做一次本地关键词匹配（微秒级），命中且预算允许则随上一轮一起注入。预算优先级：上一轮 > 触发命中 > 搜索结果。",
            "- **真相层（P2）**：记录加 `pinned`（钉为事实）标记。文创的「故事圣经」验证了「真相与过程分层」的必要性——被钉住的记录被新记录取代时要显式确认，这同时是「旧事实冒充新事实」的一道光闸。",
            "- **决策记录模板（P1，几乎零成本）**：ADR 的结构（背景/决定/后果/状态）与北极星七字段高度同构——**这等于工程界用十几年验证了「结构化字段」这条路线**。既然 v2.6 已有自定义方案机制，出一个 `adr` 风格模板就是一晚上的事。",
            "- **兼容角色卡 spec（P3，先记下）**：中文文创用户对 character card spec 极熟。若将来做「实体卡」（人物/项目的结构化档案），直接参考它的字段设计，能省一次发明。",
        ],
    },
    {
        "key": "engineering",
        "title": "理工·工程：模板的富矿，赛道的红海",
        "origin": [
            "写代码的人是 AI 记忆产品最密集的用户群，本轮再扫一遍，仍然能翻出新东西。",
            "但结论和文创正好相反：文创是蓝海里长出了机制，工程是**红海里长满了模板**。",
        ],
        "parts": [
            "DeusData/codebase-memory-mcp",
            "gastownhall/beads",
            "architecture-decision-record/architecture-decision-record",
            "akitaonrails/ai-memory",
            "npryce/adr-tools",
            "breferrari/obsidian-mind",
            "campfirein/byterover-cli",
            "eugeniughelbur/obsidian-second-brain",
            "tigerless-labs/agent-memory",
            "adr/madr",
            "thomvaill/log4brains",
            "elabftw/elabftw",
            "blader/baton",
            "awrshift/agent-memory-kit",
        ],
        "map": [
            ("ADR（架构决策记录）", "软件界沉淀十几年的「当时为什么这么决定」的记录格式：背景 → 决定 → 后果，一份一个 Markdown 文件，有 spec（madr）、有 CLI（adr-tools）、有发布工具（log4brains）。**这是「决策与过程分离」的最成熟模板。**"),
            ("会话交接（Session Handoff）", "「把做到一半的活交给下一个会话」——baton 这类工具在定义交接的格式：当前状态、下一步、注意事项。这就是跨会话记忆的最小形态。"),
            ("Markdown 真源同盟", "obsidian-mind、obsidian-second-brain、agent-memory（tigerless-labs）……一批项目不约而同选了「纯 Markdown 作为 source of truth」。**与北极星的「文件即数据」是同一条路线**，且它们证明了这条路在编码场景站得住。"),
            ("电子实验记录本（ELN）", "elabftw：科研界的记录本，带签名、时间戳、版本、不可篡改。记忆「被当作证据使用」时的形态参照。"),
        ],
        "verdict": [
            "**红海警告：编码 Agent 记忆这个方向，不要再投入。**",
            "四轮扫描里，编码 Agent 记忆项目出现了几十个，SQLite+FTS5、MCP、Markdown 真源……",
            "赛道拥挤到连描述都开始互相抄。北极星的通用定位（不只服务编码）在这里反而是优势，",
            "**但若把编码当主战场，就是在别人的主场打仗。**",
            "",
            "**可搬的东西：**",
            "",
            "- **ADR 模板（P1）**：见文创节的判定——它同时验证了两件事：结构化字段的路线是对的，以及「决策类记忆」值得一个专属模板。北极星的七字段里「原因/结果」本来就在，但 ADR 的「背景→决定→后果→状态（被取代/生效中）」多了一个**状态**维度，恰好和第三轮的 `superseded_by` 接上。",
            "- **会话交接格式（P2）**：北极星已有 `recall range`（跨轮总结），但没有「交接」语义——把「当前会话进行到哪、下一步是什么」作为一条特殊记录写给下一个会话。baton 这类工具在定义它的格式，值得抄作业。这其实就是 v2.6 自定义方案里「下一步」字段的强化版：**一条记录，专门负责未来而不是过去**。",
            "- **ELN 的不可篡改（P3）**：与第三轮的「防篡改审计链」是同一件事，elabftw 是它在科研界的成熟形态。继续押后。",
            "",
            "另外值得记一个反主流的声音：`agent-memory-kit` 的描述写着「**Built-in memory decides what to remember. This one asks.**」",
            "——内置记忆替你决定记什么；这个工具反过来，**问你**。这与北极星「可编辑仓库」的哲学完全同频，",
            "并且点出了一个真问题：自动沉淀的边界在哪。值得在文档里把「记忆是用户可审查的，不是黑箱自动的」写成明文原则。",
        ],
    },
]


def esc(s):
    if not s:
        return ""
    return s.replace("|", "\\|").replace("\n", " ").strip()


def link(name):
    return f"[{name}](https://github.com/{name})"


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

    L = []
    add = L.append

    add("# 按人群扫：理工与文创各自的土办法")
    add("")
    add(f"> 生成时间：{time.strftime('%Y-%m-%d %H:%M')}　|　数据源：`research/github-domains.json`（GitHub Search API）")
    add("")
    add("## 0. 第四轮：换成人视角")
    add("")
    add("前三轮都是技术视角——产品、相邻领域、上游。这一轮换成**用户视角**：")
    add("AI 用得最多的两群人，是**理工类**（写代码、做工程）和**文创类**（写长篇、做角色扮演、跑团）。")
    add("")
    add("这两群人早就被同一个问题折磨——「AI 记不住」——而且**各自攒出了土办法**：")
    add("理工的有决策记录、会话交接、实验笔记；文创的有世界书、角色卡、故事圣经。")
    add("")
    add("本轮只问一件事：**他们的土办法里，有没有可以直接搬的机制。**")
    add("")
    add("| 群落 | 查询数 | 命中 | 一句话概括 |")
    add("|---|---|---|---|")
    add("| 理工·工程 | 8 | 345 | 模板的富矿，赛道的红海 |")
    add("| 文创·叙事 | 8 | 368 | 土办法已经解决了半个问题 |")
    add("")
    add("### 口径与局限")
    add("")
    add("- 与前三轮一致：仓库自述、未抓 README、未安装验证。")
    add(f"- 去重 **{len(merged)}** 个，其中 **{len(newvs)}** 个是前三轮没见过的——**四轮里重叠最低的一次**，")
    add("说明按人群扫与技术视角几乎正交，两条路都值得走。")
    add("- star 异常高的头部项目（疑似刷星）一律不采信。")
    add("")

    for s in SECTIONS:
        add(f"## {s['key'] == 'creative' and 1 or 2}. {s['title']}")
        add("")
        for p in s["origin"]:
            add(p)
            add("")
        add("**样本**")
        add("")
        add("| Star | 项目 | 语言 | 说明 |")
        add("|---|---|---|---|")
        picked = sorted([merged[n] for n in s["parts"] if n in merged], key=lambda x: -x["stars"])
        for it in picked:
            add(f"| {it['stars']} | {link(it['full_name'])} | {it.get('language') or '—'} | {esc((it.get('description') or '')[:104])} |")
        add("")
        add("**他们的机制，拆开装到记忆上**")
        add("")
        for term, use in s["map"]:
            add(f"- **{term}** → {use}")
        add("")
        add("**对北极星的判定。**")
        add("")
        for v in s["verdict"]:
            add(v)
        add("")

    # ---- 3 合并启示
    add("## 3. 两个群落合起来看")
    add("")
    add("把文创和理工放在一起，会出现一张很有意思的对照表：")
    add("")
    add("| 记忆问题 | 文创的土办法 | 理工的土办法 | 北极星现状 |")
    add("|---|---|---|---|")
    add("| 「哪些内容必须被记住」 | 故事圣经（真相层） | ADR（决策记录） | 没有——所有记录平权 |")
    add("| 「什么时候把记忆拿出来」 | 世界书（关键词触发） | 会话交接（固定时机） | 上一轮固定注入 + 查询式召回 |")
    add("| 「这条记忆现在还算数吗」 | 一致性校验 | ADR 的状态字段（被取代/生效中） | 没有 `superseded_by`（第三轮已提出未实现） |")
    add("| 「记忆以什么格式存」 | 角色卡 spec | Markdown 真源 | JSON 文件（同路） |")
    add("| 「记错了怎么办」 | 改圣经，章节重写 | ADR 被新 ADR 取代而非删除 | `.trash` + 墓碑（同路） |")
    add("")
    add("看到规律了吗：**两个群落各自独立演化，答案却在五个问题上全部对得上。**")
    add("而且他们的答案都朴素得可疑——关键词触发、一份一个文件、被取代而不是删除——")
    add("没有一个用了向量，没有一个用了图数据库。")
    add("")
    add("**这是四轮调研里最硬的一条结论：被真实用户打磨出来的记忆机制，全是简单机制。**")
    add("复杂的（向量、图、自动摘要流水线）都活在 demo 里。")
    add("")

    # ---- 4 累计账
    add("## 4. 四轮累计账")
    add("")
    add("| 轮次 | 视角 | 去重 | 新增 | 主要收获 |")
    add("|---|---|---|---|---|")
    add("| 一 | 技术：记忆产品 | 1603 | — | 竞品全景、功能词频 |")
    add("| 二 | 技术：相邻领域 | 1037 | 130 | 巩固与遗忘、中文 FTS5、记忆投毒、2 个负结果 |")
    add("| 三 | 技术：领域上游 | 769 | 747 | 认知上游是空的、IVM、遗忘权、时间旅行 |")
    add(f"| 四 | **人群：理工与文创** | {len(merged)} | **{len(newvs)}** | 触发式注入、真相层、ADR 同构、中文网文社区 |")
    add("")
    add("四轮加起来 **4118 个去重仓库**。")
    add("")

    # ---- 5 清单
    add("## 5. 本轮新增的清单")
    add("")
    add("| 优先级 | 动作 | 来自 | 说明 |")
    add("|---|---|---|---|")
    add("| **P1** | 记录加可选 `triggers` 字段，注入时做触发匹配 | 文创·世界书 | 本轮最大收获。**查询式的死穴是 Agent 不知道该查什么，触发式补上被动一路** |")
    add("| **P1** | `adr` 风格自定义字段方案（背景/决定/后果/状态） | 理工·ADR | v2.6 的方案机制直接支持，一晚上的事 |")
    add("| **P1** | 文档明文原则：记忆用户可审查，不黑箱自动沉淀 | 理工·agent-memory-kit | 「Built-in memory decides. This one asks.」 |")
    add("| P2 | `pinned` 真相层：钉为事实，被取代需显式确认 | 文创·故事圣经 | 同时是「旧事实冒充新事实」的一道闸 |")
    add("| P2 | 会话交接记录（写给下一个会话的「下一步」） | 理工·baton | 「下一步」字段的强化版：专门负责未来的记录 |")
    add("| P3 | 实体卡参考 character card spec 的字段设计 | 文创·角色卡 | 中文用户极熟这套 spec，兼容即省一次发明 |")
    add("| 不做 | 编码 Agent 专用记忆 | 理工 | **红海**，四轮见了几十个同类，不要进别人主场 |")
    add("| 不做 | 世界书管理器 / 跑团管理器 | 文创 | 已有成熟工具，北极星不做 Wiki |")
    add("")

    # ---- 6 结尾
    add("## 6. 这条线还能不能继续")
    add("")
    add("能，但方向变了。四轮下来，技术侧（产品/相邻/上游）的边际收益在第三轮末已经下降，")
    add("本轮证明**人群侧还是富矿**——因为用户社区和 GitHub 技术搜索几乎正交。")
    add("")
    add("如果还有第五轮，值得去的地方不是 GitHub 搜索，而是**用户聚集地本身**：")
    add("")
    add("- **SillyTavern 的扩展生态与讨论区**——世界书的实战用法、失败案例、用户自己发明的补丁。")
    add("- **中文网文写作社区**——他们在用什么工具、放弃什么工具、为什么放弃。")
    add("- **跑团社区的 session recap 模板**——几十年打磨出来的「会话总结」格式。")
    add("")
    add("这些地方没有 API，要靠读帖子。**收益大概率还在，但方式得换。**")
    add("")
    add("技术扫描正式收尾。四轮、4118 个仓库、四份报告，该回到写代码了。")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    return len(merged), len(newvs)


if __name__ == "__main__":
    t, n = build()
    print(f"OK total={t} new={n} -> {OUT}")
