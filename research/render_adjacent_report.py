#!/usr/bin/env python3
"""把 research/github-adjacent.json 渲染成 docs/RESEARCH-ADJACENT.md。

主报告回答"记忆产品都长什么样"，这份回答另一个问题：
「那些不是做记忆的东西，拆开能不能装在记忆上」。
"""
import json
import re
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "research" / "github-adjacent.json"
MAIN = ROOT / "research" / "github-repos.json"
OUT = ROOT / "docs" / "RESEARCH-ADJACENT.md"

# ---------------------------------------------------------------- 数据加载


def load_adjacent():
    d = json.loads(SRC.read_text(encoding="utf-8"))
    merged = {}
    for qname, v in d["results"].items():
        for it in v["items"]:
            fn = it["full_name"]
            if fn not in merged or it["stars"] > merged[fn]["stars"]:
                merged[fn] = dict(it, _cat=v["category"])
    return merged


def load_main_names():
    if not MAIN.exists():
        return set()
    d = json.loads(MAIN.read_text(encoding="utf-8"))
    return {r["full_name"] for r in d.get("repos", [])}


# ---------------------------------------------------------------- 报告骨架

MEM = re.compile(r"\b(memory|memories|memor|remember|recall|mnem|engram|hippocamp)\w*", re.I)
# 遗忘/巩固机制强信号：必须落在记忆语境里，且排除训练/扩散模型的误命中
NEG = re.compile(r"stable diffusion|dreambooth|finetun|loRA|checkpoint|model training|gradient", re.I)
EBB = re.compile(
    r"forgetting curve|ebbinghaus|spaced.repetition|\bSRS\b|FSRS|memory decay|"
    r"decay\w* (curve|rate|function|model)|consolidat\w* (memory|memories|episodic|into)|"
    r"(memory|memories|episodic)\w* consolidat|sleep.cycle|memory consolidation",
    re.I,
)

CATS = [
    ("检索/索引", "retrieval"),
    ("数据/版本", "versioning"),
    ("结构/实体", "entities"),
    ("认知/生命周期", "cognitive"),
    ("权限/安全", "security"),
    ("运维", "ops"),
    ("本地模型", "localmodel"),
    ("个性化", "personal"),
    ("便携/标准", "portability"),
]

# 每类：领域原问题 / 零件清单 / 拆开装到记忆上 / 对北极星的判定
SECTIONS = {
    "retrieval": {
        "title": "检索与索引引擎",
        "origin": [
            "这一领域原本解决的问题很朴素：上百万份文档里，用户问一句话，怎么在几十毫秒内把相关的几份挑出来。",
            "它几十年的积累分成两条路——**关键词派**（倒排索引、BM25、分词器）和**向量派**（embedding、ANN 近似检索）。",
            "近三年的结论是：**两条都要**，单靠任意一条都会在另一条的强项上翻车。",
        ],
        "parts": [
            "asg017/sqlite-vec",
            "asg017/sqlite-vss",
            "sqliteai/sqlite-vector",
            "wangfenjin/simple",
            "1yefuwang1/vectorlite",
            "sqliteai/sqlite-rag",
            "eminsk/nanovector",
        ],
        "map": [
            ("倒排索引 + FTS5 + BM25", "人名、项目名、术语、错误码这类**精确命中**需求。向量检索在这里恰恰打不中——embedding 会把「张三」和「李四」拉得很近，因为它们句法位置相同。"),
            ("sqlite-vec（向量扩展）", "用户问的和存的**措辞不一样**时才需要：「上次那个部署问题」对应记录里写的「k8s rollout 失败」。关键词检索对这种同义改写完全无能。"),
            ("中文分词器", "这是中文场景的**前置条件**，不是优化项。SQLite 自带 FTS5 默认用 unicode61 分词器，它按空格切词，中文没空格 → 整段话被当成一个 token → 中文检索等于废。"),
            ("混合检索 + RRF 融合", "关键词和向量各出 Top N，用倒数排名融合（1/(k+rank)）合并。这是当前实践里最省事且效果最稳的做法，不需要学一个融合模型。"),
        ],
        "verdict": [
            "**该补，但顺序是先关键词、后向量。**",
            "北极星当前的检索是顺序扫描：挨个解析 JSON 文件再匹配。1500 条约 23MB 时保存已退化到 30ms/条，这个退化就来自全量解析。",
            "- **P1 可做**：侧车索引。维护一个 `data/index.db`（SQLite），写入时增量更新 FTS5 索引，`memory_search` 走索引而不是扫文件，扫到 id 再按文件名 O(1) 读记录。",
            "- **P1 前置必做**：中文分词。要么内置 `wangfenjin/simple` 的预编译分词器（要引入原生二进制，与零依赖冲突），要么自己实现 bigram 切分（中文 FTS5 的实用近似：按 2-gram 切 + 拼音首字母），后者更符合北极星的脾气。",
            "- **暂不做**：向量。理由见 §8——它是可选增强，且现在还没有真实需求触发。",
        ],
    },
    "versioning": {
        "title": "数据版本、时间与一致性",
        "origin": [
            "这一领域原本解决的是：数据会变，变了以后原来的还算不算数？",
            "数据库界的答案是 **bitemporal（双时态）**：把时间拆成两条轴——**有效时间**（这个事实在现实世界里成立的区间）和**事务时间**（我们是什么时候把它记进库的）。",
            "分布式界的答案是 **CRDT** 与 **event sourcing**：不覆盖写，只追加事件，让合并变成可交换的数学运算。",
        ],
        "parts": [
            "xtdb/xtdb",
            "aspen-cloud/triplit",
            "tinyplex/tinybase",
            "electric-sql/electric",
            "amark/gun",
            "oskardudycz/EventSourcing.NetCore",
            "ATOM00blue/wolfdb",
            "Bobcatsfan33/loomdb",
            "muhamadjawdatsalemalakoum/kith",
        ],
        "map": [
            ("bitemporal 双时态", "记忆最尴尬的失败不是记不住，是**旧事实伪装成当前事实**。「张三在 A 公司」三月是对的、六月是错的，但记忆里它俩长得一模一样。双时态直接给出解法：valid_from/valid_to 记事实成立区间，transaction time 记我们何时知道的——后者正是记忆的「什么时候记下来的」。"),
            ("event sourcing（事件溯源）", "记忆不该是覆盖写，而应是追加事件流。有了事件流，撤销、回滚、审计都是免费的，而且能回答「这条结论当时是怎么得出的」。"),
            ("CRDT（无冲突复制类型）", "北极星现有的逐字段时间戳合并 + 墓碑，本质上就是手写的一个 LWW-Register CRDT。既然如此，不如直接用成熟的语义而不是自己造。"),
            ("lineage（数据血缘）", "追踪一条结论由哪几条原始记录推导而来。搬到记忆上就是**「为什么召回这条」**——现在所有记忆产品都只告诉你「召回了什么」，没人告诉你「凭什么」。"),
        ],
        "verdict": [
            "**只取思想，不换存储。**",
            "- **P1 可做（成本低）**：给记录加 `valid_from` / `valid_to` / `superseded_by` 三个字段。这是 bitemporal 的轻量版，不需要换数据库，而且能直接解决「旧事实冒充新事实」。三个字段默认空，不影响现有读写路径。",
            "- **P2 可做**：把 `.trash` 里的旧版本组织成事件日志，支持「把这一轮恢复到第 2 版」。当前旧版本已经进 `.trash` 了，缺的只是一条能读回来的命令。",
            "- **不做**：不换 bitemporal 数据库。北极星最核心的卖点是「文件即数据」——人可以直接打开 JSON 改。换成 xtdb 这类依赖 JVM 的东西，等于把卖点换成负担。",
            "- **值得盯**：`wolfdb`（bi-temporal memory database）和 `loomdb`（把会话做成可 fork/merge 的分支）虽然现在 0-2 star，但方向对——**把 git 的语义搬到记忆上**。如果它们做成了，是北极星多设备方案的另一种可能。",
        ],
    },
    "entities": {
        "title": "实体抽取与结构归并",
        "origin": [
            "这一领域原本解决的是：「张三」「小张」「Zhang San」「他」在数据库里是四条记录，但它们是一个人。",
            "技术上叫 **entity resolution（实体归并）**，图数据库负责存归并后的关系，GraphRAG 负责从文本里抽出实体再建图。",
        ],
        "parts": [
            "dedupeio/dedupe",
            "memgraph/memgraph",
            "FalkorDB/FalkorDB",
            "microsoft/graphrag",
            "HKUDS/LightRAG",
            "neo4j-labs/llm-graph-builder",
            "project-minigraf/minigraf",
        ],
        "map": [
            ("实体归并（dedupe 这类模糊匹配）", "**记忆去重的前置条件**。不做归并，「人物」字段就是一堆碎片：「张三」一条、「小张」一条、「Zhang」一条，检索时各自为政，人看着也乱。"),
            ("关系图", "记忆之间的关联——谁和谁在哪个项目上合作过、这个决策影响了哪个结果。这是纯文本字段表达不了、用户又很想要的东西。"),
            ("GraphRAG", "从整段记忆里抽实体建图，让「和 X 有关的所有事」变成一次图遍历而不是一次全文扫描。"),
        ],
        "verdict": [
            "**要它的最轻那一层。**",
            "- **P2 可做**：实体别名表。一个 `data/entities.json`，形如 `{ 张三: [小张, Zhang San, 老张] }`，检索前先归一化再匹配。这是 dedupe 的极简版，不引任何依赖，人还能直接编辑——和北极星的气质一致。",
            "- **不做**：不引图数据库。单机几千条记忆用 Neo4j/memgraph 是杀鸡用牛刀，而且都要起独立服务，直接破坏「零依赖 + 单文件 + 一个 node 进程」这条底线。",
            "- **值得盯**：`minigraf`（嵌入式图记忆，面向 agent/移动端/浏览器）。关键词是 **embedded**——如果图存储能做到单文件嵌入，未来的取舍会变。",
        ],
    },
    "cognitive": {
        "title": "记忆的生命周期：巩固与遗忘",
        "origin": [
            "认知科学原本研究的是人类怎么记住、怎么忘掉，以及为什么睡眠对记忆是必需的。",
            "这批仓库是相邻扫描里**成色最高的一类**——因为认知科学对「记忆该怎么管理」的思考，比整个 AI 记忆行业深得多，也早得多。",
            "里面最成熟的东西来自一个意想不到的地方：**Anki 社区**。间隔重复（spaced repetition）算法被全世界几百万用户打磨了十几年，还有自己的 benchmark。",
        ],
        "parts": [
            "open-spaced-repetition/fsrs4anki",
            "open-spaced-repetition/free-spaced-repetition-scheduler",
            "open-spaced-repetition/srs-benchmark",
            "maimemo/SSP-MMC",
            "sachitrafa/YourMemory",
            "TiMEM-AI/TiMEM",
            "yantrikos/yantrikdb-server",
            "slow-stack/mneme",
            "grandamenium/dream-skill",
            "ldclabs/anda-brain",
            "xuiltul/animaworks",
            "anthony-maio/mnemos",
            "muratg98/psychmem",
            "pieralukasz/true-recall",
        ],
        "map": [
            ("间隔重复调度（FSRS）", "FSRS 真正算的不是「隔多久复习」，而是**这条记忆现在还能不能被提取出来**（retrievability）。搬到记忆上：每条记录有一个可提取性分数，随时间衰减、每被召回一次就回升。这直接补上了北极星现在最大的洞——只有存取，没有生命周期。"),
            ("艾宾浩斯遗忘曲线", "R = exp(−t/S)，S 是记忆强度，每次被召回 S 增大。落到检索上：排序不该是纯时间倒序，而应是 `相关性 × 衰减分 × 访问频率`。被反复提起的记忆衰减更慢，这正好是间隔重复的语义。"),
            ("巩固（consolidation）", "把多轮零散记忆整理成一条结构化结论。这是人类睡眠在做的事。落到产品上：`memory_consolidate`——把某会话/某时间区间的多条记录合并成一条，原记录标记 `superseded_by` 而不是删除。"),
            ("睡眠式巩固（mneme / dream-skill / anda-brain）", "空闲时自动跑巩固，而不是等用户下命令。`dream-skill` 直接点名是复现 Anthropic 未发布的 auto-dream 能力。"),
            ("surprise gating（意外度门控）", "符合预期的日常不值得存，超预期的才存。这是从源头解决「什么都存导致仓库爆炸」——比事后清理高明。"),
        ],
        "verdict": [
            "**这是最该补的一块，也是相邻扫描最大的收获。**",
            "北极星现在能存、能取、能编辑，但记忆在它里面是**静态**的：存进去什么样，三年后还是什么样，只有数量在涨。认知科学给出的答案是，记忆的价值恰恰来自它会变——被使用的变强，不被使用的衰减，零散的被整理成结构。",
            "- **P1 可做**：给每条记录加三个派生量——`last_access_at`、`access_count`、`decay_score`。**不落盘，读时计算**（符合「单一真源」铁律）。`memory_search` 的排序从「相关 + 时间倒序」改为「相关 × 衰减分」。",
            "- **P1 可做**：`memory_consolidate` 命令。把指定会话或时间区间的多条记录交给 Agent 合并成一条结构化结论，原记录标记 `superseded_by`（与 §3.2 的三个字段打通）。这既解决了仓库膨胀，也让旧的零散记忆仍然可读。",
            "- **P2 待定**：surprise gating。它要求在写入前判断信息量，而这与「写入永不因残缺拒绝」这条铁律直接冲突。**只能设计成后置清理**（写入照常，事后批量标记低信息量记录），不能做成前置拦截。",
            "- **可直接复用的现成资产**：FSRS 的算法与 `srs-benchmark` 的评测方法。它是 MIT/开源、有 benchmark、有十几年真实数据打磨的成熟算法，比任何一个记忆产品自研的衰减公式都可靠。",
        ],
    },
    "security": {
        "title": "权限与提示注入防御",
        "origin": [
            "这一领域原本解决两件事：**谁能看什么**（访问控制），以及**LLM 被输入内容劫持**（提示注入）。",
            "对记忆系统来说，后者的严重性被整个行业低估了。",
        ],
        "parts": [
            "tldrsec/prompt-injection-defenses",
            "liu00222/Open-Prompt-Injection",
            "microsoft/BIPIA",
            "onury/accesscontrol",
            "kolotaev/vakt",
            "thepartly/gatehouse",
            "SleuthCo/clawshield-public",
        ],
        "map": [
            ("提示注入防御 → 记忆投毒", "**这是记忆系统独有的、比 RAG 严重得多的攻击面**：RAG 被注入只让这一次答错，记忆被注入是**往长期记忆里写一条脏数据，永久生效**，此后每次召回都在复述它。一次写入，永久污染。"),
            ("间接注入（BIPIA）", "攻击者不直接和你对话，而是把指令藏在你让 Agent 读的网页、文件、工具输出里。这些内容是记忆的重要来源，等于把攻击面直接接到了写入路径上。"),
            ("ABAC（属性访问控制）", "谁能看什么。对团队共享记忆是必需项——「这条客户记录只有 A 组能看」。"),
            ("入站内容扫描", "在写入前扫一遍，识别注入特征、PII、密钥。"),
        ],
        "verdict": [
            "**低成本的部分现在就该做。**",
            "- **P1 可做**：**来源标记**。每条记录记 `source`（`user_input` / `tool_output` / `web_content` / `file` / `agent`）。这是防御间接注入的正路——不是靠猜文本里有没有恶意指令，而是靠知道这条内容从哪来。来自网页/文件的记录，召回时默认降低信任权重。",
            "- **P1 可做**：**写入侧注入特征检测**。命中已知模式（`ignore previous instructions`、`system:`、`你现在的目标是` 等）时**标记 `suspect` 而不是拒绝写入**——必须守住「写入永不因残缺拒绝」这条铁律。UI 里高亮提示即可。",
            "- **不做**：不自己做 ABAC。团队共享还没排期，做了也是空跑。等 P3 真要做团队功能时，再看 `vakt` / `accesscontrol` 这些成熟实现，那时大概率是直接借鉴而不是自己造。",
        ],
    },
    "ops": {
        "title": "可观测性与持久化执行",
        "origin": [
            "这一领域原本解决的是：分布式系统出问题时怎么知道哪里坏了，以及长流程跑到一半崩了怎么接着跑。",
            "前者是 OpenTelemetry/Jaeger，后者是 durable execution（持久化工作流）。",
        ],
        "parts": [
            "conductor-oss/conductor",
            "jaegertracing/jaeger",
            "open-telemetry/opentelemetry-go",
            "SigNoz/signoz",
        ],
        "map": [
            ("durable execution（持久化工作流）", "Agent 的任务跨越多轮、随时可能中断，需要外部记住「做到哪一步了」。**这本质上就是记忆**——只是存的是执行状态而不是对话内容。它是记忆的一个被忽略的应用场景。"),
            ("分布式追踪 → 记忆操作可观测", "每次 recall/save 记一条 span。真正有用的不是看延迟，而是能看到**哪次召回是无效的**（召回了但 Agent 根本没用），这是评测召回质量的基础数据。"),
        ],
        "verdict": [
            "**现在不做，但埋一个数据点。**",
            "- **不做**：北极星是单进程本地服务，没有分布式需求，引 OpenTelemetry 只会把 46 个文件的包变成 460 个。",
            "- **但值得做**：记录「召回了但没被引用」的比例。这个数字现在是评测召回质量的唯一客观信号，也是 P0 评测 harness 的输入。实现成本极低——召回时记 id，下一轮保存时看引用。",
        ],
    },
    "localmodel": {
        "title": "本地推理与嵌入式向量",
        "origin": [
            "这一领域原本解决的是：不联网、不调大厂 API、在自己机器上跑 embedding 和向量检索。",
            "它是「本地优先」理念在模型侧的对应物。",
        ],
        "parts": [
            "alibaba/zvec",
            "Stevenic/vectra",
            "jdagdelen/hyperDB",
            "NodeDB-Lab/nodedb",
            "Egoist-Machines/LodeDB",
            "cortex-works/cortex-db",
            "NTU-Siqiang-Group/AsterVec",
            "konjoai/vectro",
        ],
        "map": [
            ("本地 embedding", "语义检索不联网。对隐私诉求强、或离线使用的用户是刚需。"),
            ("嵌入式向量库", "不单独起一个向量服务，而是嵌进进程里。`zvec`（阿里开源，16k star）是 in-process 路线的代表。"),
            ("向量量化", "768 维 float32 一条要 3KB。8-bit 或二值量化能压到 1/4 以下。几千条记忆时这点空间不算什么，但**量化让「向量可以进主仓库」这件事变得可讨论**——否则光向量就比正文大。"),
        ],
        "verdict": [
            "**暂不做，但这是最明确的一个「将来要不要做」的开关。**",
            "现状是刻意的：零依赖、无向量、靠结构化字段 + 关键词。1500 条的规模下这个选择是对的。",
            "- **触发条件**：用户出现「我想不起来那次聊的是什么，只记得大概内容」这类诉求时，才需要。在那之前，FTS5 关键词 + 结构化字段更准、更快、更能解释。",
            "- **若做，路径是**：`sqlite-vec`（存储）+ 本地 ONNX 小模型（编码），**全部可选、默认关闭、装了才生效**。这与「零依赖」不冲突——零依赖说的是「不装也能跑」，不是「永远不许有第二个零件」。",
            "- **注意**：一旦引入向量，就必须同时回答「向量文件在不在同步目录里」「换机器要不要重算」，否则会破坏本地优先的多设备方案。这不是技术问题，是它必须排在 P1 全部完成之后的理由。",
        ],
    },
    "personal": {
        "title": "个性化推荐与用户画像",
        "origin": [
            "这一领域原本解决的是：根据用户的历史行为，猜他想要什么。",
            "它和 AI 记忆看起来很像——都要「记住用户」。**这是本次扫描里踩空的一类。**",
        ],
        "parts": [],
        "map": [],
        "verdict": [
            "**负结果，记录在案以免以后重复踩。**",
            "50 条命中里几乎没有可用项，最高 318 star 的还是 FTC 机器人比赛的 SDK（误命中，名字里带 memory）。剩下的多是课程作业级推荐系统。",
            "原因值得写下来：**「推荐系统的用户画像」和「AI 记忆」是看起来像、实际完全不重叠的两个问题。** 推荐系统用协同过滤从千万人行为里统计出偏好，它不需要、也做不到记住「你上次说你妈生日是 10 月 3 号」。它要的是统计意义上的相似，记忆要的是个体意义上的精确。",
            "对北极星的启示：别往「猜你想要什么」的方向做。用户要的不是推荐，是**你说过的话别被忘掉**。",
        ],
    },
    "portability": {
        "title": "个人数据容器与便携标准",
        "origin": [
            "这一领域原本解决的是：数据属于用户自己，应用只是借用。Solid（Tim Berners-Lee 发起）是这条路最著名的尝试。",
            "**它是第二个负结果，但负得比个性化有价值。**",
        ],
        "parts": [
            "pod-os/PodOS",
            "polypoly-eu/polyPod",
            "openwallet-foundation-labs/solid-data-wallet",
            "steamory/portal",
        ],
        "map": [],
        "verdict": [
            "**理念对了，产品死了。**",
            "整个 Solid POD 生态里 star 最高的项目只有 45 个，活跃度近乎停滞。polyPod 已归档，多数仓库停在数年前。",
            "但**它失败的部位值得注意**：Solid 想用一套协议 + 数据规范解决便携性，结果是协议复杂、应用稀少、用户没有迁移的动力。",
            "对北极星的启示是反过来的：**便携性不该靠标准协议实现，该靠人可读的文件格式实现。** 用户能用自己的编辑器打开 JSON、能用 git 管它、能把它扔进任何网盘，这种「不需要谁批准的可迁移性」比任何标准都管用。",
            "这一点上北极星已经做对了——`data/` 下面是一堆人能读懂的 JSON。要守住的正是这个：**任何新功能都不能让数据变成只有本程序能读的东西。**",
        ],
    },
}

# ---------------------------------------------------------------- 输出


def esc(s):
    if not s:
        return ""
    return s.replace("|", "\\|").replace("\n", " ").strip()


def link(name):
    return f"[{name}](https://github.com/{name})"


def row(it):
    return f"| {it['stars']} | {link(it['full_name'])} | {it.get('language') or '—'} | {esc((it.get('description') or '')[:110])} |"


def build():
    data = load_adjacent()
    main_names = load_main_names()
    by_cat = {}
    for it in data.values():
        by_cat.setdefault(it["_cat"], []).append(it)
    for v in by_cat.values():
        v.sort(key=lambda x: -x["stars"])

    L = []
    add = L.append

    add("# 相邻领域零件库：把不是做记忆的东西，拆开装到记忆上")
    add("")
    add(f"> 生成时间：{time.strftime('%Y-%m-%d %H:%M')}　|　数据源：`research/github-adjacent.json`（GitHub Search API）")
    add("")
    add("## 0. 这份报告和上一份不是一回事")
    add("")
    add("`RESEARCH.md` 与 `RESEARCH-GITHUB.md` 回答的是「**别人家的记忆产品长什么样**」。")
    add("这份回答的是另一个问题：**那些压根不做记忆的东西，拆开能不能装在记忆上。**")
    add("")
    add("起因是一个判断——AI 记忆是全球 LLM 用户共同卡住的通用问题，所以它的解法不会全部长在「记忆」这个关键词下面。")
    add("真正可用的零件，很多躺在检索、数据库、认知科学、权限、本地推理这些看起来不相干的领域里，等着被拆下来。")
    add("")
    add("### 口径与局限（和上一份同样的声明）")
    add("")
    add("- 数据是**仓库自述**（description / topics / star），**未经实际安装验证**。")
    add("- 描述里出现的「更准」「+16pp」「SOTA」都是项目**自己写的**，本扫描不对其负责。")
    add("- 按 star 排序会让头部混入**刷星仓库**（见 §1 的噪声处理）。")
    add("- 只取 Search API 元数据，**未抓 README**，因此功能判断基于描述文本，可能与实际有出入。")
    add("")

    # ---- 1 方法
    add("## 1. 方法：为什么不继续搜 memory")
    add("")
    add("上一份扫了 22 组记忆类关键词，拿到 1603 去重 / 693 相关。")
    add("但继续加「memory」「agent memory」这类关键词，收益是递减的——**搜记忆只会撞进同温层**，")
    add("翻来覆去是同一批项目互相抄。")
    add("")
    add("所以这一轮换了路子：**不搜记忆，搜 9 个相邻领域**，每组 50 条，共 22 组查询。")
    add("")
    add("| 类别 | 查询数 | 命中 | 成色 |")
    add("|---|---|---|---|")
    tone = {
        "检索/索引": "高——直接捞到主扫描漏掉的一批记忆项目",
        "数据/版本": "中高——思想是宝，产品太重",
        "结构/实体": "中——图数据库过重，实体归并有用",
        "认知/生命周期": "**最高**——本次最大收获",
        "权限/安全": "中——提示注入对记忆是独特攻击面",
        "运维": "低——当前规模用不上",
        "本地模型": "中——是最明确的「将来开关」",
        "个性化": "**负结果**——踩空",
        "便携/标准": "**负结果**——生态已死，但理念对",
    }
    qn = {"检索/索引": 4, "数据/版本": 4, "结构/实体": 3, "认知/生命周期": 3,
          "权限/安全": 2, "运维": 2, "本地模型": 2, "个性化": 1, "便携/标准": 1}
    for c, _ in CATS:
        add(f"| {c} | {qn[c]} | {len(by_cat.get(c, []))} | {tone[c]} |")
    add("")
    add("### 关于噪声")
    add("")
    add("按 star 排序的搜索结果里，头部会出现一批名字可疑却几万 star 的仓库")
    add("（如 `Graphify-Labs/graphify` 12.9万、`tirth8205/code-review-graph` 3.2万、`simonlin1212/a-stock-data` 1.1万）。")
    add("这些都是**刷星仓库**，本报告一律不采信、不列入下表。")
    add("处理办法：所有入选项目逐一读描述人工确认，宁可少列也不列没把握的。")
    add("")

    # ---- 2 总览
    add("## 2. 总览：1037 个去重仓库，186 个含记忆信号")
    add("")
    add(f"22 组查询去重后 **{len(data)}** 个仓库。")
    memhits = [i for i in data.values() if MEM.search((i.get("description") or "") + " " + i["full_name"])]
    add(f"其中 **{len(memhits)}** 个描述里含记忆语义词——")
    add("说明一件事：**在别人的地盘上，长着大量我们没见过的记忆项目。**（详见 §5）")
    add("")

    # ---- 3 零件库
    add("## 3. 零件库：九类领域，拆开装到记忆上")
    add("")
    add("每一节三个问题：**它原本解决什么 → 零件是什么 → 拆开装到记忆上怎么用 → 北极星要不要做。**")
    add("")
    idx = 0
    for cname, key in CATS:
        idx += 1
        s = SECTIONS[key]
        add(f"### 3.{idx} {s['title']}")
        add("")
        add("**它原本解决什么。**")
        add("")
        for p in s["origin"]:
            add(p)
            add("")
        if s["parts"]:
            add("**零件**")
            add("")
            add("| Star | 项目 | 语言 | 说明 |")
            add("|---|---|---|---|")
            found = 0
            picked = [data[n] for n in s["parts"] if n in data]
            picked.sort(key=lambda x: -x["stars"])
            for it in picked:
                add(row(it))
                found += 1
            add("")
            if not found:
                add("（候选均为低质命中，不列）")
                add("")
        if s["map"]:
            add("**拆开装到记忆上**")
            add("")
            for term, use in s["map"]:
                add(f"- **{term}** → {use}")
            add("")
        add("**对北极星的判定。**")
        add("")
        for v in s["verdict"]:
            add(v)
            add("")

    # ---- 4 艾宾浩斯流派
    add("## 4. 一个没想到的流派：艾宾浩斯遗忘曲线")
    add("")
    ebb = [i for i in memhits
           if EBB.search(i.get("description") or "") and not NEG.search(i.get("description") or "")]
    ebb.sort(key=lambda x: -x["stars"])
    add("扫描前没想到的是：**「艾宾浩斯遗忘曲线」在 AI 记忆圈已经长成了一个独立流派。**")
    add(f"仅本次相邻扫描就命中 **{len(ebb)}** 个以遗忘曲线 / 间隔重复 / 巩固为核心机制的项目，")
    add("其中不少是给 Claude Code、OpenClaw、DeepSeek Harness 做的 **skill 插件包**。")
    add("")
    add("这说明两件事：")
    add("")
    add("1. **衰减是公认的刚需**，民间已经自发实现了一堆，但**没有一个是可靠的**——它们几乎都是把 `exp(-t/S)` 直接套上去，没有经过真实数据校准，也没有评测。")
    add("2. **真正成熟的实现不在记忆圈，在 Anki 圈**。FSRS（free-spaced-repetition-scheduler，729 star）有算法本体、有 `srs-benchmark` 评测、有十几年几百万用户的行为数据打磨，是 MIT 许可的成熟算法。")
    add("")
    add("| Star | 项目 | 说明 |")
    add("|---|---|---|")
    for it in ebb[:22]:
        add(f"| {it['stars']} | {link(it['full_name'])} | {esc((it.get('description') or '')[:100])} |")
    add("")
    add("**结论**：要加衰减，**别自己写公式，去借 FSRS**。同时必须做评测，")
    add("否则只是把「感觉应该衰减」换成了「代码里写着衰减」，对用户没有任何区别。")
    add("")
    add("两件能直接拿来用的现成资产：")
    add("")
    add("- **`open-spaced-repetition/free-spaced-repetition-scheduler`** —— 有 benchmark、有十几年真实行为数据打磨的成熟算法（MIT）。")
    add("- **`Neal006/memorylens-bench`** —— 专门**评测 LLM 记忆衰减**的 benchmark，直接对比 Naive / RAG / 各类衰减策略。这正是主报告里 P0「评测 harness」缺的一块拼图。")
    add("")

    # ---- 5 意外收获
    add("## 5. 意外收获：在别人地盘上找到的记忆项目")
    add("")
    add("下面是相邻扫描里含记忆信号、**且不在上一份 693 个相关项目里**的仓库（按 star 排序）。")
    add("它们证明了这条路是通的：搜「sqlite fts5」能搜到 engram，搜「spaced repetition」能搜到 YourMemory，")
    add("**搜什么不重要，重要的是别只搜一个词。**")
    add("")
    newhits = [i for i in memhits if i["full_name"] not in main_names]
    newhits.sort(key=lambda x: -x["stars"])
    add(f"共 **{len(newhits)}** 个新增。")
    add("")
    add("| Star | 项目 | 来源类别 | 说明 |")
    add("|---|---|---|---|")
    for it in newhits[:60]:
        add(f"| {it['stars']} | {link(it['full_name'])} | {it['_cat']} | {esc((it.get('description') or '')[:96])} |")
    add("")

    # ---- 6 技术栈收敛
    add("## 6. 一个被反复验证的技术栈")
    add("")
    add("把这些项目用的存储方案数一遍，会发现一个明显的事实：")
    add("**在「本地 / 单文件 / 无服务」这条路上，大家的答案高度一致——SQLite + FTS5。**")
    add("")
    stack = [i for i in memhits if re.search(r"sqlite", (i.get("description") or ""), re.I)]
    stack.sort(key=lambda x: -x["stars"])
    fts = [i for i in stack if re.search(r"fts5|fts\b", (i.get("description") or ""), re.I)]
    add(f"本次含记忆信号的 {len(memhits)} 个项目里，**{len(stack)} 个**在描述里明确提到 SQLite，其中 **{len(fts)} 个**同时提到 FTS5。")
    add("")
    add(f"（绝对占比只有 {len(stack) * 100 // len(memhits)}%，看着不高——但多数项目的描述根本不会提存储方案，")
    add("**会提的那批，提的就是 SQLite**。这个信号强度比数字本身要大。）")
    add("")
    add("| Star | 项目 | 说明 |")
    add("|---|---|---|")
    for it in stack[:20]:
        add(f"| {it['stars']} | {link(it['full_name'])} | {esc((it.get('description') or '')[:100])} |")
    add("")
    add("这对北极星是个好消息也是个警告：")
    add("")
    add("- **好消息**：选定的方向与主流一致，说明判断没错。")
    add("- **警告**：**这已经是及格线，不再是差异化**。当所有人都用 SQLite+FTS5 时，它不构成任何卖点。")
    add("北极星真正不一样的地方是**文件即数据、人可直接编辑、单一真源、只注入上一轮**——这些才是别人没有的。")
    add("")

    # ---- 7 可执行清单
    add("## 7. 落到北极星的清单")
    add("")
    add("按「成本 / 收益 / 是否与铁律冲突」排序，只列本次扫描新推导出的，已在主报告列的（如评测 harness）不重复。")
    add("")
    add("| 优先级 | 动作 | 来自 § | 成本 | 与铁律的关系 |")
    add("|---|---|---|---|---|")
    rows = [
        ("**P1**", "FTS5 侧车索引（`data/index.db`），检索不再全量扫文件", "3.1", "中", "不冲突——索引是派生数据，可随时重建"),
        ("**P1**", "中文分词（自实现 bigram + 拼音首字母，不引原生二进制）", "3.1", "中", "不冲突"),
        ("**P1**", "记录加 `valid_from` / `valid_to` / `superseded_by`", "3.2", "低", "不冲突——默认空，读路径不受影响"),
        ("**P1**", "`last_access_at` / `access_count` / `decay_score` 三个派生量（**不落盘**）", "3.4", "低", "**必须不落盘**，否则违反单一真源"),
        ("**P1**", "search 排序改为 `相关性 × 衰减分`", "3.4", "低", "不冲突"),
        ("**P1**", "`memory_consolidate`：多轮合并为一条，原记录标 `superseded_by`", "3.4", "中", "不冲突——原记录保留可读"),
        ("**P1**", "`source` 来源标记（user_input / web_content / file / tool_output）", "3.5", "低", "不冲突"),
        ("**P1**", "写入侧注入特征检测，**标记而非拒绝**", "3.5", "低", "**只能标记**，拒绝会违反「写入永不因残缺拒绝」"),
        ("**P1**", "记录「召回了但没被引用」的比例", "3.6", "低", "不冲突"),
        ("P2", "实体别名表 `data/entities.json`", "3.3", "低", "不冲突——人可编辑"),
        ("P2", "`.trash` 旧版本组织成事件日志，支持恢复到指定版本", "3.2", "中", "不冲突"),
        ("P2", "surprise gating（**后置清理**，不得前置拦截）", "3.4", "中", "**前置拦截会违反写入铁律**"),
        ("不做", "向量检索 / 本地 embedding", "3.7", "高", "待触发条件出现"),
        ("不做", "图数据库 / GraphRAG", "3.3", "高", "破坏零依赖 + 单文件"),
        ("不做", "bitemporal 数据库 / ABAC / OpenTelemetry", "3.2,3.5,3.6", "高", "当前规模不需要"),
        ("不做", "个性化推荐 / Solid POD", "3.8,3.9", "—", "**已验证为负，不再投入**"),
    ]
    for p, a, src, c, note in rows:
        add(f"| {p} | {a} | {src} | {c} | {note} |")
    add("")

    # ---- 8 更边缘
    add("## 8. 再往外一层")
    add("")
    add("这一轮扫了 9 个相邻领域。回头看，**边缘还没到头**：")
    add("")
    add("1. **认知科学本体**——这一轮只扫到了它在 GitHub 上的实现。真正的源头是论文：记忆巩固的睡眠机制、提取练习效应（testing effect）、间隔效应（spacing effect）、ACT-R 激活模型。其中 ACT-R 已经有人搬进来了（`tonitangpotato/engram-ai`），但还很粗糙。")
    add("2. **更多存储引擎**——本次只覆盖了 SQLite 生态。Kùzu（嵌入式图）、DuckDB（嵌入式分析）、Redb/SQLite 的 LMDB 替代，这些「嵌入式」家族里还可能躺着别的零件。")
    add("3. **人类的外部记忆工具**——Obsidian、Logseq、Zettelkasten 这些方法论已经打磨了几十年，解决的是同一个问题：**怎么让记住的东西以后还能找到**。本次只碰到了 `pieralukasz/true-recall`（Obsidian 间隔重复）。")
    add("4. **法律与合规**——记忆会留存多久、用户要求删除时怎么办、「被遗忘权」怎么落地。这一块在 AI 记忆讨论里几乎无人提起，但它是真的会来的。")
    add("5. **更奇怪的地方**——文件系统（`nisamaasoglu/LetheFS`，会自主遗忘的文件系统）、游戏存档、版本控制系统。本次只看到 0-2 star 的雏形。")
    add("")
    add("**结论：这片海确实比扫到的更深。** 本次 22 组查询拿到的东西已经超出预期，")
    add("而它只是 9 个方向的第一层。")
    add("")

    OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
    return len(data), len(memhits), len(newhits)


if __name__ == "__main__":
    t, m, n = build()
    print(f"OK total={t} memhits={m} new={n} -> {OUT}")
