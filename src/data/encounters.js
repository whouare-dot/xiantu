// src/data/encounters.js
// 《仙途》奇遇事件表（纯数据，无逻辑）
// 境界索引 realmIndex 0..25：
//   0-8   炼气（凡俗、江湖）
//   9-14  筑基 / 金丹（宗门、秘境）
//   15+   元婴及以上（天地异象、上古遗秘、大道之争）
// tier: good | bad | neutral | rare
// 效果 DSL 见 docs/架构规范.md，禁止在数据里出现函数。

import { COMPANIONS } from './companions.js';

/**
 * 道侣的专属奇遇（V4.0）。
 * 它们定义在 data/companions.js 里（与人物放在一起，便于维护），
 * 这里并入统一的奇遇池——这样 encounter 系统不需要知道"道侣奇遇"这个概念，
 * 照常按 tier / minRealm / weight 抽即可。
 */
const COMPANION_ENCOUNTERS = COMPANIONS.map((c) => c.encounter).filter(Boolean);

export const ENCOUNTERS = [
  // ============================================================
  // GOOD —— 25 条
  // ============================================================

  {
    id: 'enc_wild_herb',
    title: '荒径灵草',
    desc: '山道塌了半边，绕行时见崖缝里生着一丛灵芝草，叶背泛着淡淡青气。风一过，草叶轻颤，崖顶碎石簌簌落下。再往里还藏着一株更大的，只是那片岩壁已经裂了纹。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 8,
    weight: 12,
    once: false,
    choices: [
      {
        text: '尽数采下',
        hint: '收益丰厚，但崖壁将塌',
        req: null,
        outcomes: [
          {
            weight: 65,
            log: '你攀上崖缝，连根拔起三株灵芝，指缝间尽是清苦药香。',
            effects: [
              { type: 'material', id: 'mat_lingzhi', amount: [2, 3] },
              { type: 'stones', quality: 'low', amount: [30, 80] }
            ]
          },
          {
            weight: 35,
            log: '最后一株刚离土，崖壁轰然塌下。你护住灵草滚落坡底，衣衫尽破，所幸药没丢。',
            effects: [
              { type: 'material', id: 'mat_lingzhi', amount: [1, 1] },
              { type: 'hp', amount: [-25, -10] }
            ]
          }
        ]
      },
      {
        text: '只取近处两株',
        hint: '稳妥，收益略薄',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你只采了手边两株，退开时崖壁果然落石。够用就好，何必与山争。',
            effects: [
              { type: 'material', id: 'mat_lingzhi', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '不采，赶路要紧',
        hint: '无风险，也无所得',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你看了那丛草一眼，转身走了。山中灵物自有其主。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_old_hunter',
    title: '山中猎户',
    desc: '山坳里躺着个断了腿的猎户，弓弦还绷着，箭头上沾着黑血。他说追一头白毛野物，反被扑下了坡，那东西就伏在不远的灌木里，喘息声很重。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 8,
    weight: 9,
    once: false,
    choices: [
      {
        text: '替他驱走野物',
        hint: '要动手，胜则重谢',
        req: null,
        outcomes: [
          {
            weight: 70,
            // ⚠ log 不能写成"那畜生已经跑了"：战斗行排在它前面播（见 encounter.js 的
            // applyChoice 时序说明），若这里先报结局，读起来就是"妖物逃了，你却又与它打了一场"。
            log: '你循声逼近，护在猎户身前，与那白毛畜生周旋了一场。猎户解下腰间皮囊相赠。',
            effects: [
              { type: 'battle', power: 18, enemy: 'en_canglang', name: '白毛野物' },
              { type: 'material', id: 'mat_shougu', amount: [1, 2] },
              { type: 'material', id: 'mat_yaoxue', amount: [1, 2] }
            ]
          },
          {
            weight: 30,
            log: '野物比想象中凶悍，你肩头被抓出几道血口。猎户拄着断弓挪过来，帮你接了小半囊兽血。',
            effects: [
              { type: 'battle', power: 26, enemy: 'en_canglang', name: '白毛野物' },
              { type: 'hp', amount: [-30, -15] },
              { type: 'material', id: 'mat_yaoxue', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '背他下山求医',
        hint: '舍半日脚程，换一份因果',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你背他走了三十里山路。临别时猎户什么也没给，只是深深看你一眼。你心头却莫名松快。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] },
              { type: 'attr', attr: 'luck', amount: [1, 3] }
            ]
          }
        ]
      },
      {
        text: '取弓便走',
        hint: '得物，但心有挂碍',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你解下那张旧弓。猎户没有拦，只是盯着你的背影看。那目光跟了你一路。',
            effects: [
              { type: 'stones', quality: 'low', amount: [20, 60] },
              { type: 'attr', attr: 'daoHeart', amount: [-1, -1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_broken_stele',
    title: '断碑残刻',
    desc: '荒草里斜着一截断碑，碑文被风雨磨得只剩半篇，笔画间隐有说不出的沉意。盯着看久了，太阳穴竟微微发胀，仿佛有字在往脑子里钻。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 12,
    weight: 8,
    once: false,
    choices: [
      {
        text: '凝神参悟',
        hint: '需悟性，所得看天分',
        req: { attr: 'comprehension', min: 12 },
        outcomes: [
          {
            weight: 60,
            log: '半篇残文在识海中接续起来，你恍然明白了几个字的真意，周身气机为之一畅。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [1, 2] },
              { type: 'cult', amount: [60, 200] }
            ]
          },
          {
            weight: 40,
            log: '你只觉字字沉重，读到最后头痛欲裂，勉强记住几个偏旁，也算有所得。',
            effects: [
              { type: 'cult', amount: [20, 60] }
            ]
          }
        ]
      },
      {
        text: '拓下碑文带走',
        hint: '不求甚解，留待来日',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你以布帛拓下残文，卷好收进怀里。日后总有用得上的一天。',
            effects: [
              { type: 'flag', key: 'has_broken_stele_rubbing', value: true },
              { type: 'cult', amount: [10, 40] }
            ]
          }
        ]
      },
      {
        text: '头昏，不看也罢',
        hint: '无风险',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你按了按眉心，转身离开。有些东西，不是此刻的你该读的。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_river_ferry',
    title: '野渡无人',
    desc: '暮色里一条渡船横在滩上，船夫是个佝偻老者，船钱只要一枚下品灵石。对岸灯火隐隐，只是水面黑得照不出星子，竹篙探下去，深不见底。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 6,
    weight: 9,
    once: false,
    choices: [
      {
        text: '付灵石渡河',
        hint: '花钱省事',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '船到中流，老者忽然开口，说了一段似懂非懂的旧事。你听着，竟觉得心静了不少。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-1, -1] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '替老人撑船',
        hint: '出力，或另有缘法',
        req: null,
        outcomes: [
          {
            weight: 70,
            log: '你接篙撑了半程，双臂酸麻。抵岸时老者从舱底摸出个小瓶塞给你。',
            effects: [
              { type: 'hp', amount: [-8, -3] },
              { type: 'pill', id: 'pill_huiqi', amount: [1, 1] }
            ]
          },
          {
            weight: 30,
            log: '你撑到一半，水下似有巨物擦过船底。老者只淡淡说了句"莫看"，你便不敢再问。',
            effects: [
              { type: 'hp', amount: [-12, -5] },
              { type: 'cult', amount: [40, 120] }
            ]
          }
        ]
      },
      {
        text: '沿岸走，不渡了',
        hint: '稳妥，多费脚力',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你沿着河岸走了大半夜，灯笼在身后越缩越小，终究熄了。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_rain_temple',
    title: '雨夜分食',
    desc: '破庙里挤着个衣衫褴褛的乞丐，抖着手讨口吃的。你怀里只剩半块干粮，庙外的雨一时半刻停不了，檐下积起一汪黑水。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 8,
    weight: 9,
    once: false,
    choices: [
      {
        text: '分他一半',
        hint: '舍口腹之欲，养道心',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '乞丐接过干粮，也不道谢，只把身子往旁边挪了挪，替你让出一块避风的干处。你那一夜睡得极沉。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] },
              { type: 'attr', attr: 'luck', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '独自吃完',
        hint: '饱腹，心中却空',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你就着雨水咽下干粮。乞食声渐渐低了，你不敢去看那个角落。',
            effects: [
              { type: 'hp', amount: [5, 15] },
              { type: 'attr', attr: 'daoHeart', amount: [-1, -1] }
            ]
          }
        ]
      },
      {
        text: '闭目打坐不理',
        hint: '不沾因果',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你盘膝入定，雨声渐远。待到天明，庙中只剩你一人。',
            effects: [
              { type: 'cult', amount: [15, 50] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_market_stall',
    title: '坊市旧摊',
    desc: '坊市角落的旧摊上堆着蒙尘杂物，摊主倚着货担打盹，标价低得可疑。你翻了两下，指腹触到一枚凉沁沁的物件，像是玉，又不像。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 10,
    weight: 11,
    once: false,
    choices: [
      {
        text: '单买那一件',
        hint: '小赌一把',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '摊主眼都没睁，挥挥手让你拿去。回家细看，竟是枚灵气未散的丹药。',
            effects: [
              { type: 'pill', id: 'pill_juqi', amount: [1, 2] }
            ]
          },
          {
            weight: 45,
            log: '那东西入手极寒，敲开一看，内里裹着一小块寒晶石。摊主捶胸顿足，却也只能认了。',
            effects: [
              { type: 'material', id: 'mat_hanjing', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '整摊包下',
        hint: '便宜，多半是废物',
        req: null,
        outcomes: [
          {
            weight: 40,
            log: '你花了些灵石把摊子清了。翻检半日，竟从破布里抖出一页残破的功法口诀。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-40, -20] },
              { type: 'technique', pool: 'fan', amount: 1 }
            ]
          },
          {
            weight: 60,
            log: '你花了些灵石把摊子清了，翻检半日，尽是锈铁烂布，唯有几块兽骨还能入药。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-40, -20] },
              { type: 'material', id: 'mat_shougu', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '不碰来路不明之物',
        hint: '无风险',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把东西放回原处。摊主翻了个身，含糊嘀咕了一句什么，你没听清。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_lost_child',
    title: '走失稚童',
    desc: '官道边蹲着个哭哑了嗓子的孩童，说与爹娘走散，只记得家在青石镇。你脚程快，可这一来一回，要耽搁半日工夫。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 10,
    weight: 8,
    once: false,
    choices: [
      {
        text: '送他回镇',
        hint: '费时，积阴德',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你牵着孩子走到镇上，那对夫妇跪地便拜。你摆摆手走了，身后哭声笑声混作一团。',
            effects: [
              { type: 'attr', attr: 'luck', amount: [2, 4] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '指个方向便走',
        hint: '不耽误行程',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你替他指了路，叮嘱沿官道走。走出很远回头，那孩子还站在原地。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [-1, 0] }
            ]
          }
        ]
      },
      {
        text: '给他几枚灵石',
        hint: '舍财免麻烦',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把身上的零碎灵石塞给他，又托了过路的商队捎带。孩子破涕为笑。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-10, -5] },
              { type: 'attr', attr: 'luck', amount: [1, 2] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_spring_eye',
    title: '山泉灵眼',
    desc: '岩壁下积着一汪清泉，水面上浮着缕缕白气，捧起来竟不凉手。泉眼深处隐约有光点游动，像活的，又像是你看久了眼花。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 8,
    weight: 9,
    once: false,
    choices: [
      {
        text: '掬饮几口',
        hint: '小补，即刻见效',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '泉水入喉温润，一路暖到丹田。你活动了下肩背，先前赶路的乏意一扫而空。',
            effects: [
              { type: 'hp', amount: [15, 40] },
              { type: 'cult', amount: [20, 60] }
            ]
          }
        ]
      },
      {
        text: '取水囊装满',
        hint: '留作日后再用',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你灌满水囊。此后数日饮水，修行时总觉比平日顺遂几分。',
            effects: [
              { type: 'buff', id: 'buff_cult', duration: 600, mult: 1.2 }
            ]
          }
        ]
      },
      {
        text: '泉眼有异，退开',
        hint: '无风险',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退后两步，那汪泉忽然汩汩翻涌了一阵，复又平静。你暗自庆幸没伸手。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_herb_patch',
    title: '药圃人家',
    desc: '山脚一户药农正在晒药，见你行路辛苦，招呼着要讨碗水喝。院里晒着几味寻常草药，只是最里侧的竹匾上，盖着一块洗得发白的旧布。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 8,
    weight: 9,
    once: false,
    choices: [
      {
        text: '讨水歇脚',
        hint: '安稳，或有小赠',
        req: null,
        outcomes: [
          {
            weight: 70,
            log: '老者与你闲谈半晌，临行塞给你一小包晒干的药材，说山里人没什么好送。',
            effects: [
              { type: 'hp', amount: [10, 25] },
              { type: 'material', id: 'mat_lingzhi', amount: [1, 1] }
            ]
          },
          {
            weight: 30,
            log: '你与老者投缘，他掀开那块旧布，里面竟是一株品相极好的血参，说是祖上留的，分你一点须子。',
            effects: [
              { type: 'material', id: 'mat_xueshen', amount: [1, 2] },
              { type: 'attr', attr: 'luck', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '出钱收药',
        hint: '花钱换灵材',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你按市价收了老者一筐药材，多给了些灵石。他乐得直搓手，硬塞了几味偏门的给你。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-30, -15] },
              { type: 'material', id: 'mat_lingzhi', amount: [2, 3] }
            ]
          }
        ]
      },
      {
        text: '道谢便走',
        hint: '不欠人情',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你饮了水，道了声谢便继续赶路。老者在身后喊了句"山路小心"。',
            effects: [
              { type: 'hp', amount: [5, 12] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_sword_lesson',
    title: '樵夫指点',
    desc: '溪边一个樵夫正劈柴，斧落之处，柴木应声而裂，断口齐整得不像蛮力所致。他瞥了你一眼，说：你这握剑的手，太紧了。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 10,
    weight: 8,
    once: false,
    choices: [
      {
        text: '虚心请教',
        hint: '放低姿态，或有真传',
        req: null,
        outcomes: [
          {
            weight: 75,
            log: '樵夫劈了十斧，只说"松"。你看了半日，忽然懂了松在哪里。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [1, 2] },
              { type: 'cult', amount: [40, 120] }
            ]
          },
          {
            weight: 25,
            log: '樵夫不答，只把斧头往你手里一塞。你抡了几下，斧柄震得虎口发麻，却悟到一丝发力的门道。',
            effects: [
              { type: 'hp', amount: [-10, -5] },
              { type: 'equip', pool: 'fan', amount: 1 }
            ]
          }
        ]
      },
      {
        text: '付灵石求教',
        hint: '诚意，但未必是钱的事',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '樵夫收了灵石，倒教了你两式粗浅的搏击路数。虽不精妙，胜在实用。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-15, -5] },
              { type: 'cult', amount: [30, 80] }
            ]
          }
        ]
      },
      {
        text: '一笑而去',
        hint: '不强求',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你笑了笑，拱手离开。身后斧声依旧，一下，又一下。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_night_inn',
    title: '夜雨投店',
    desc: '荒村客栈只剩一间空房，掌柜面露难色，说那间房夜里常有古怪响动，先前住过的客人都说睡不安稳。价钱倒是便宜。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 10,
    weight: 8,
    once: false,
    choices: [
      {
        text: '就住那间',
        hint: '省财，或有奇遇',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '夜半墙内传来轻微的叩击声，你循声撬开一块松动的砖，里面竟嵌着一块温润的玉。',
            effects: [
              { type: 'material', id: 'mat_hanjing', amount: [1, 1] },
              { type: 'attr', attr: 'spiritSense', amount: [1, 2] }
            ]
          },
          {
            weight: 40,
            log: '你一夜未睡踏实，天亮时却在窗台上发现一小撮发亮的砂粒。',
            effects: [
              { type: 'material', id: 'mat_xingchen', amount: [1, 1] },
              { type: 'hp', amount: [-15, -5] }
            ]
          }
        ]
      },
      {
        text: '加钱换柴房',
        hint: '破财求安',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你在柴房里将就一夜，虽有鼠虫作伴，倒也睡得安稳。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-20, -10] },
              { type: 'hp', amount: [10, 20] }
            ]
          }
        ]
      },
      {
        text: '连夜赶路',
        hint: '不宿凶宅',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你冒着雨出了村。走出半里回头，那间房的窗户，似乎亮着一盏不该亮的灯。',
            effects: [
              { type: 'hp', amount: [-10, -3] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_river_fisher',
    title: '江心钓叟',
    desc: '江心一叶扁舟，老翁独坐垂钓，鱼篓空空，却稳如磐石。你唤了两声，他才缓缓回头，说：这江里的鱼，都在底下看着你。',
    tier: 'good',
    minRealm: 0,
    maxRealm: 12,
    weight: 7,
    once: false,
    choices: [
      {
        text: '登舟请教',
        hint: '或有指点',
        req: null,
        outcomes: [
          {
            weight: 70,
            log: '老翁与你对坐半日，一句修行的话也没说，只让你看水面。你看着看着，心竟静了下来。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] },
              { type: 'buff', id: 'buff_daoheart', duration: 600, mult: 1.3 }
            ]
          },
          {
            weight: 30,
            log: '老翁抬手一甩，钓线破水，竟拽起一尾泛着银光的怪鱼，随手扔给你便撑船走了。',
            effects: [
              { type: 'material', id: 'mat_yaoxue', amount: [1, 2] },
              { type: 'pill', id: 'pill_huiqi', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '在岸上静观',
        hint: '不打扰，自有所悟',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你在岸上看了许久。日头偏西时，你忽然想起自己执念的一桩事，不由得失笑。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '转身离去',
        hint: '无所得',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你还有路要赶。走出很远，那叶扁舟仍钉在江心，一动不动。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_sect_task',
    title: '宗门差事',
    desc: '执事将一块玉牌拍在案上：后山有一批采回的灵材要分拣封存，做得仔细，宗门不亏待你。玉牌上的编号，透着股不近人情的冷。',
    tier: 'good',
    minRealm: 9,
    maxRealm: 14,
    weight: 12,
    once: false,
    choices: [
      {
        text: '尽心分拣',
        hint: '稳当的宗门贡献',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你分拣了一整夜，连最细的茎须都没弄错。执事验过，难得地点了点头。',
            effects: [
              { type: 'stones', quality: 'low', amount: [80, 200] },
              { type: 'material', id: 'mat_lingzhi', amount: [1, 3] }
            ]
          }
        ]
      },
      {
        text: '顺手留下一份',
        hint: '收益更多，但有风险',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '你扣下几味无人清点的灵材，账目竟真没对上。得了实惠，只是走出库房时，后背有些发凉。',
            effects: [
              { type: 'material', id: 'mat_xueshen', amount: [1, 2] },
              { type: 'attr', attr: 'daoHeart', amount: [-1, -1] }
            ]
          },
          {
            weight: 40,
            log: '第二天执事就查出了短少，你没抵赖，交了罚石才算了事。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-60, -30] },
              { type: 'material', id: 'mat_xueshen', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '告病推脱',
        hint: '不赚不赔',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你推说身上有伤，执事面无表情地收回玉牌。这份差事，此后也没再落到你头上。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_elder_hint',
    title: '长老点拨',
    desc: '讲经堂散了，一位闭目养神的长老忽然睁眼，目光落在你身上，停了停：你修行有些年头了，可知道自己卡在何处？',
    tier: 'good',
    minRealm: 9,
    maxRealm: 16,
    weight: 8,
    once: false,
    choices: [
      {
        text: '躬身请教',
        hint: '需悟性 30，收益极大',
        req: { attr: 'comprehension', min: 30 },
        outcomes: [
          {
            weight: 100,
            log: '长老只说了一句话。那句话在你识海中盘旋了整整三日，第四日清晨，你豁然开朗。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [2, 4] },
              { type: 'cult', amount: [200, 500] },
              { type: 'buff', id: 'buff_cult', duration: 900, mult: 1.5 }
            ]
          }
        ]
      },
      {
        text: '恭谨行礼退下',
        hint: '不冒进，亦有所得',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你行了一礼，说自己愚钝，不敢劳长老费心。长老笑了笑，说你倒还知道分寸。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] },
              { type: 'cult', amount: [60, 150] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_secret_chamber',
    title: '秘境石室',
    desc: '秘境深处豁然开朗，一间石室四壁无门，只在中央的蒲团上搁着一只落满灰的木匣。石壁上有几道浅浅的抓痕，像是有人在此困顿过。',
    tier: 'good',
    minRealm: 9,
    maxRealm: 16,
    weight: 8,
    once: false,
    choices: [
      {
        text: '开匣取物',
        hint: '或得宝物，或有埋伏',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '匣中静静躺着一枚玉简与几粒丹药。你收了东西，寻到出口时，石室在你身后无声合拢。',
            effects: [
              { type: 'pill', id: 'pill_juqi', amount: [1, 3] },
              { type: 'cult', amount: [100, 300] }
            ]
          },
          {
            weight: 40,
            log: '匣子一开，一缕灰气腾起。你屏息急退，仍吸进少许，胸口闷了半日。所幸匣底还是压着一块矿石。',
            effects: [
              { type: 'hp', amount: [-60, -25] },
              { type: 'material', id: 'mat_xuantie', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '先探四壁',
        hint: '费时，但稳妥',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你沿壁敲击，寻到一处暗格，里面是前人留下的一瓶疗伤丹。木匣你终究没开。',
            effects: [
              { type: 'pill', id: 'pill_liaoshang', amount: [1, 3] },
              { type: 'attr', attr: 'spiritSense', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '只取蒲团下之物',
        hint: '谨慎，所得较小',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你掀开蒲团，底下压着几块中品灵石，像是前人临走时特意留下的。你取了灵石，对空室一揖。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [1, 3] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_herb_garden',
    title: '药园夜盗',
    desc: '半夜被窸窣声惊醒，一个瘦小身影正扒着宗门药园的篱笆。月光下看得分明，是个十几岁的杂役弟子，怀里已揣了几株紫玉兰。',
    tier: 'good',
    minRealm: 9,
    maxRealm: 14,
    weight: 8,
    once: false,
    choices: [
      {
        text: '喝止并报执事',
        hint: '守规矩，得宗门赏识',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '弟子被拖走时一直回头看你。执事记了你一功，赏下的灵石，你握着觉得有些沉。',
            effects: [
              { type: 'stones', quality: 'low', amount: [100, 250] },
              { type: 'attr', attr: 'daoHeart', amount: [-1, 0] }
            ]
          }
        ]
      },
      {
        text: '悄悄放他走',
        hint: '担风险，结善缘',
        req: null,
        outcomes: [
          {
            weight: 65,
            log: '你松了手。数日后，那弟子在无人处塞给你一包药粉，说是他家乡的方子。',
            effects: [
              { type: 'pill', id: 'pill_liaoshang', amount: [1, 2] },
              { type: 'attr', attr: 'luck', amount: [1, 3] }
            ]
          },
          {
            weight: 35,
            log: '你放走了他，次日药园清点短了数，执事把账算到了当值的人头上，你赔了一笔。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-80, -40] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '装作没看见',
        hint: '不沾是非',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你翻了个身，闭上眼。窸窣声很快消失在夜色里。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_ancient_well',
    title: '古井寒泉',
    desc: '荒废的院落里有一口古井，井绳早烂，井口却冒着丝丝寒气。探头下望，水面平得像一面镜子，映出的却不是你的脸。',
    tier: 'good',
    minRealm: 9,
    maxRealm: 16,
    weight: 8,
    once: false,
    choices: [
      {
        text: '汲水炼化',
        hint: '寒气入体，但助修行',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你打上一桶寒泉，以气机缓缓炼化。泉水入体如针走经脉，熬过去后，丹田竟宽阔了几分。',
            effects: [
              { type: 'hp', amount: [-50, -20] },
              { type: 'cult', amount: [150, 400] }
            ]
          }
        ]
      },
      {
        text: '取寒晶石',
        hint: '井底有物，需胆量',
        req: null,
        outcomes: [
          {
            weight: 70,
            log: '你缒绳下井，井壁上嵌着数块寒晶石，触手冰寒。采了几块，上到井口时手指已没了知觉。',
            effects: [
              { type: 'material', id: 'mat_hanjing', amount: [1, 2] },
              { type: 'hp', amount: [-30, -15] }
            ]
          },
          {
            weight: 30,
            log: '井底比想象中深。你摸到一块拳头大的寒晶，正要再取，水面忽然翻涌，你慌忙攀绳而上。',
            effects: [
              { type: 'material', id: 'mat_hanjing', amount: [1, 1] },
              { type: 'attr', attr: 'spiritSense', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '封好井口离开',
        hint: '稳妥无险',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你搬来石板压住井口。临走回头，石板上似乎凝了一层薄薄的白霜。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_caravan',
    title: '商队同行',
    desc: '一支商队要穿过前面那段不太平的林子，管事见你是修行人，出价请你随行一程。镖旗在风里卷着，伙计们个个盯着你的脸色。',
    tier: 'good',
    minRealm: 9,
    maxRealm: 18,
    weight: 8,
    once: false,
    choices: [
      {
        text: '应下这趟镖',
        hint: '报酬丰厚，或有恶战',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '一路无事，管事爽快付了灵石，还额外赠你几味药材，说日后有缘再合作。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [1, 2] },
              { type: 'material', id: 'mat_ziyulan', amount: [1, 2] }
            ]
          },
          {
            weight: 40,
            log: '毒修退走，镖货一件没少，你自己挂了彩。管事看着你肩上的伤，把酬金又加了一倍。',
            effects: [
              { type: 'battle', power: 60, enemy: 'en_caibu_xiexiu', name: '林中毒修' },
              { type: 'hp', amount: [-80, -40] },
              { type: 'stones', quality: 'mid', amount: [2, 3] }
            ]
          }
        ]
      },
      {
        text: '只送至林口',
        hint: '折中之选',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你只护送到林口便折返，管事付了半程的钱，客客气气地道了别。',
            effects: [
              { type: 'stones', quality: 'low', amount: [150, 300] }
            ]
          }
        ]
      },
      {
        text: '婉言谢绝',
        hint: '不多事',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你摇摇头。商队渐渐走远，铃铛声在暮色里一声声淡了下去。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_fallen_sword',
    title: '坠剑荒丘',
    desc: '荒丘中央斜插着一柄断剑，剑身半没入土，周围寸草不生。风过时，剑身嗡嗡低鸣，像是在等什么人。',
    tier: 'good',
    minRealm: 9,
    maxRealm: 16,
    weight: 7,
    once: false,
    choices: [
      {
        text: '拔剑一试',
        hint: '需道心 25，或有剑缘',
        req: { attr: 'daoHeart', min: 25 },
        outcomes: [
          {
            weight: 70,
            log: '你双手握柄，断剑应声而出，剑身竟自行嗡鸣了一声。许是错觉，你握剑的手稳了些。',
            effects: [
              { type: 'equip', pool: 'ling', amount: 1 },
              { type: 'attr', attr: 'comprehension', amount: [1, 2] }
            ]
          },
          {
            weight: 30,
            log: '剑拔出来了，却是一柄锈蚀殆尽的凡铁，一抖便碎。剑下土里，倒埋着个旧锦囊。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '以土掩剑立碑',
        hint: '不取，积道心',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你以断剑为碑，堆土成坟，行了一礼。起身时，那低鸣声没有了。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] }
            ]
          }
        ]
      },
      {
        text: '不敢妄动，绕行',
        hint: '无风险',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你绕着荒丘走了半圈，回头再看，断剑仍在原处，纹丝未动。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_battlefield_relic',
    title: '古战场遗兵',
    desc: '雷雨过后，山坡被冲开一道深沟，露出层层白骨与断戟残戈。有几件兵器还泛着幽光，埋在土里的煞气被雨水激得升腾。',
    tier: 'good',
    minRealm: 9,
    maxRealm: 16,
    weight: 7,
    once: false,
    choices: [
      {
        text: '入沟搜寻',
        hint: '收获与煞气并存',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你从一具骸骨手边拾起一柄保存完好的短刃，刃上煞气未散，入手微沉。',
            effects: [
              { type: 'equip', pool: 'ling', amount: 1 },
              { type: 'hp', amount: [-40, -20] }
            ]
          },
          {
            weight: 45,
            log: '你寻了半日，只找到几块锈蚀的矿石。倒是被沟底煞气侵了心神，回来做了几夜噩梦。',
            effects: [
              { type: 'material', id: 'mat_xuantie', amount: [1, 2] },
              { type: 'hp', amount: [-60, -30] }
            ]
          }
        ]
      },
      {
        text: '就地焚香超度',
        hint: '不取分毫，但安亡魂',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你折枝为香，对着满沟白骨拜了三拜。当夜宿在坡下，竟一夜无梦，醒来神清气爽。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] },
              { type: 'buff', id: 'buff_daoheart', duration: 600, mult: 1.25 }
            ]
          }
        ]
      },
      {
        text: '远远避开',
        hint: '不惹因果',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你绕开深沟，加快脚步。风里隐隐有铁锈与腐土的气味。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_star_dew',
    title: '星辰凝露',
    desc: '夜半云开，天顶一颗星亮得不合常理，星光垂落如丝，在崖边草叶上凝成点点银露。方圆数里的虫鸣，都在这一瞬停了。',
    tier: 'good',
    minRealm: 15,
    maxRealm: null,
    weight: 8,
    once: false,
    choices: [
      {
        text: '采露服食',
        hint: '大补，但星光有主',
        req: null,
        outcomes: [
          {
            weight: 65,
            log: '银露入口，化为一缕精纯星力游走周身。你只觉神识通透，天地都清晰了几分。',
            effects: [
              { type: 'cult', amount: [400, 900] },
              { type: 'attr', attr: 'spiritSense', amount: [2, 4] }
            ]
          },
          {
            weight: 35,
            log: '露水将尽未尽时，那缕星光忽地一沉。你急退数丈，心口仍像被什么看了一眼，隐隐作痛。',
            effects: [
              { type: 'cult', amount: [200, 500] },
              { type: 'hp', amount: [-120, -60] }
            ]
          }
        ]
      },
      {
        text: '布阵引星力',
        hint: '需神识 60，收益更稳',
        req: { attr: 'spiritSense', min: 60 },
        outcomes: [
          {
            weight: 100,
            log: '你以石布下简陋的引灵阵，星力顺阵纹缓缓汇入丹田，无一丝外泄。这一夜，胜过苦修半载。',
            effects: [
              { type: 'cult', amount: [700, 1200] },
              { type: 'buff', id: 'buff_cult', duration: 900, mult: 1.6 }
            ]
          }
        ]
      },
      {
        text: '静观其变',
        hint: '不取，亦不损',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退到崖下看着。约莫一炷香后，星光骤收，天地重归漆黑，仿佛什么都没发生。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_dragon_vein',
    title: '地脉龙气',
    desc: '山腹深处传出沉闷的震动，一道地脉在此骤然隆起，岩层间渗出缕缕金气。金气所过之处，顽石竟有了玉色。',
    tier: 'good',
    minRealm: 15,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '盘坐吸纳',
        hint: '龙气霸道，需承受',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '金气入体，如刀刮骨。你咬牙熬住，经脉被一寸寸拓宽，丹田真气浑厚了不止一筹。',
            effects: [
              { type: 'hp', amount: [-150, -60] },
              { type: 'cult', amount: [500, 1000] }
            ]
          },
          {
            weight: 40,
            log: '龙气太烈，你只吸纳了少许便不得不收功，经脉刺痛了半日，但根基确乎稳了些。',
            effects: [
              { type: 'hp', amount: [-200, -100] },
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] },
              { type: 'cult', amount: [300, 600] }
            ]
          }
        ]
      },
      {
        text: '采脉中矿石',
        hint: '稳赚，但所得有限',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你顺着脉路凿下数块被龙气浸染的矿石，质地上乘。地脉震动渐平，你及时退了出去。',
            effects: [
              { type: 'material', id: 'mat_longlin', amount: [1, 2] },
              { type: 'stones', quality: 'high', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '退出山腹',
        hint: '地脉之下，不可轻犯',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退到山外，回望时整座山头都在微微起伏，像有什么在底下翻身。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_dao_forum',
    title: '大道法会',
    desc: '云台之上，一位老者正在讲法，座下听者寥寥。他不讲功法，只讲"何为道"。有听者中途拂袖而去，也有听者就地入定。',
    tier: 'good',
    minRealm: 15,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '静听三日',
        hint: '需悟性 50，收益极大',
        req: { attr: 'comprehension', min: 50 },
        outcomes: [
          {
            weight: 100,
            log: '第三日黄昏，你听见一句话，如惊雷落于识海。先前百年苦修中不通的关节，一朝贯通。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [3, 6] },
              { type: 'cult', amount: [800, 1600] },
              { type: 'buff', id: 'buff_cult', duration: 1200, mult: 1.8 }
            ]
          }
        ]
      },
      {
        text: '上前论道',
        hint: '锋芒毕露，或得或失',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你与老者辩了半日，虽落下风，却句句切中要害。老者抚掌而笑，赠你一枚丹药。',
            effects: [
              { type: 'pill', id: 'pill_wudao', amount: [1, 1] },
              { type: 'attr', attr: 'comprehension', amount: [2, 3] }
            ]
          },
          {
            weight: 45,
            log: '你言语间露了傲气，老者只淡淡看你一眼，你竟答不上话来。满座寂然，你拂袖退下。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [-2, -1] },
              { type: 'cult', amount: [100, 300] }
            ]
          }
        ]
      },
      {
        text: '听过便走',
        hint: '不执着',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你听了一炷香便离开了。道不在座上，也不在你走的方向上。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_immortal_shadow',
    title: '仙宫残影',
    desc: '天边云层忽然裂开一道缝，缝中隐现楼台殿宇，飞檐上悬着不曾见过的星辰。那景象只持续了数息，却让你周身的灵力都开始不受控制地流转。',
    tier: 'good',
    minRealm: 15,
    maxRealm: null,
    weight: 6,
    once: false,
    choices: [
      {
        text: '以神识探入',
        hint: '需神识 70，凶险异常',
        req: { attr: 'spiritSense', min: 70 },
        outcomes: [
          {
            weight: 60,
            log: '你的神识触到了那道缝隙。刹那间，无数看不懂的景象涌入识海，你昏睡了七日，醒来时眼中多了些什么。',
            effects: [
              { type: 'attr', attr: 'spiritSense', amount: [3, 6] },
              { type: 'cult', amount: [600, 1400] }
            ]
          },
          {
            weight: 40,
            log: '缝隙中传来一声极轻的叹息。你神识如遭重锤，吐血倒退，但那一声叹息，你记了一辈子。',
            effects: [
              { type: 'hp', amount: [-300, -150] },
              { type: 'attr', attr: 'daoHeart', amount: [3, 5] },
              { type: 'flag', key: 'heard_immortal_sigh', value: true }
            ]
          }
        ]
      },
      {
        text: '记下方位',
        hint: '留待日后',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你死死记下云缝出现的方位与时辰，那景象却已散去，天穹如常。',
            effects: [
              { type: 'flag', key: 'marked_immortal_gate', value: true },
              { type: 'cult', amount: [200, 400] }
            ]
          }
        ]
      },
      {
        text: '闭目收心',
        hint: '不看，则不乱',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你闭上眼，强压下翻涌的灵力。再睁眼时，云已合拢，天地如常。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_sword_grave',
    title: '剑冢问心',
    desc: '连绵的剑冢一眼望不到头，数万柄断剑插在红土里，剑柄朝着同一个方向。你走近时，无数剑鸣同时响起，问的却是同一个问题。',
    tier: 'good',
    minRealm: 12,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '拔剑应问',
        hint: '需道心 45，剑鸣择主',
        req: { attr: 'daoHeart', min: 45 },
        outcomes: [
          {
            weight: 100,
            log: '你随手拔起脚边一柄。万剑齐鸣骤停，唯有你手中这一柄，还在轻轻震着，像是在应你。',
            effects: [
              { type: 'equip', pool: 'xian', amount: 1 },
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] }
            ]
          }
        ]
      },
      {
        text: '听剑鸣而不答',
        hint: '不做选择，亦有悟',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你站了很久，终究没有回答。剑鸣渐息，你转身离去时，身后的剑冢安静得像一片坟。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [2, 3] },
              { type: 'cult', amount: [200, 500] }
            ]
          }
        ]
      },
      {
        text: '退到冢外',
        hint: '剑意太盛，不硬接',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退到红土之外，剑鸣才慢慢停下。有些问题，不是现在的你能答的。',
            effects: []
          }
        ]
      }
    ]
  },

  // ============================================================
  // BAD —— 16 条
  // ============================================================

  {
    id: 'enc_bandit_ambush',
    title: '山道劫匪',
    desc: '隘口两侧忽然滚下乱石，七八个蒙面汉子堵住去路，为首者掂着刀，只说了两个字：留下。你身后，退路也被一块巨石封死了。',
    tier: 'bad',
    minRealm: 0,
    maxRealm: 8,
    weight: 12,
    once: false,
    choices: [
      {
        text: '拔剑迎战',
        hint: '以命相搏，胜则尽得',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '匪首一倒，余众一哄而散。你搜了匪巢，倒有些散碎灵石。',
            effects: [
              { type: 'battle', power: 30, enemy: 'en_shanzei', name: '劫道匪首' },
              { type: 'stones', quality: 'low', amount: [40, 120] }
            ]
          },
          {
            weight: 40,
            log: '一场混战下来，你身上添了几道口子，怀中的灵石也被抢了大半。',
            effects: [
              { type: 'battle', power: 40, enemy: 'en_shanzei', name: '劫道匪首' },
              { type: 'hp', amount: [-70, -35] },
              { type: 'stones', quality: 'low', amount: [-60, -20] }
            ]
          }
        ]
      },
      {
        text: '破财买路',
        hint: '损失灵石，保全自身',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把灵石尽数丢在地上。匪首踢了踢，挥刀让你过去。你走出隘口，手心全是汗。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-80, -40] }
            ]
          }
        ]
      },
      {
        text: '趁乱夺路而逃',
        hint: '赌一把脚力',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你矮身从滚石缝里钻了出去，一路狂奔。身后骂声渐远，你只是丢了只鞋。',
            effects: [
              { type: 'hp', amount: [-25, -10] }
            ]
          },
          {
            weight: 45,
            log: '你跑出没几步便被石绊倒，被人揪着领子拖了回来，身上值钱的都被搜刮一空。',
            effects: [
              { type: 'hp', amount: [-80, -40] },
              { type: 'stones', quality: 'low', amount: [-120, -60] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_poison_mist',
    title: '瘴气毒雾',
    desc: '谷口浮着一层青紫色的雾，草木在雾中枯黄卷曲，却有药香隐隐从深处飘来。风向不稳，雾时进时退，像在试探着往外爬。',
    tier: 'bad',
    minRealm: 0,
    maxRealm: 10,
    weight: 10,
    once: false,
    choices: [
      {
        text: '屏息冲进去',
        hint: '雾中有药，但毒性极烈',
        req: null,
        outcomes: [
          {
            weight: 50,
            log: '你在雾中摸到几株药材，回来时嘴唇发紫，调息了整整一日才缓过来。',
            effects: [
              { type: 'hp', amount: [-70, -40] },
              { type: 'material', id: 'mat_ziyulan', amount: [1, 2] }
            ]
          },
          {
            weight: 50,
            log: '雾比你想的浓，你被呛得剧烈咳嗽，什么也没摸着就退了出来，肺腑像烧过一样。',
            effects: [
              { type: 'hp', amount: [-90, -50] }
            ]
          }
        ]
      },
      {
        text: '采草搓绳探路',
        hint: '费时，但能减轻毒性',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你以药草浸湿布巾蒙住口鼻，又用长绳探路，只入了数丈便退。虽未得宝，毒气却也伤不深。',
            effects: [
              { type: 'hp', amount: [-25, -10] }
            ]
          }
        ]
      },
      {
        text: '绕道而行',
        hint: '多走远路，安然无恙',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退回谷口另寻他路，多走了大半日。回头望去，那层雾还在原地慢慢打转。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_fake_pill',
    title: '假丹骗局',
    desc: '一个书生模样的修士拦住你，说是家中长辈病重，愿以低价出让一瓶"宗门秘制"的聚气丹。他指天发誓，眼神却总往你袖口瞟。',
    tier: 'bad',
    minRealm: 0,
    maxRealm: 10,
    weight: 9,
    once: false,
    choices: [
      {
        text: '买下丹药',
        hint: '可能是真的，多半不是',
        req: null,
        outcomes: [
          {
            weight: 25,
            log: '你回去开瓶一验，丹香纯正，竟真是好药。那书生或许确有难处。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-60, -30] },
              { type: 'pill', id: 'pill_juqi', amount: [1, 2] }
            ]
          },
          {
            weight: 75,
            log: '丹丸入口满嘴土腥，掰开一看，是泥团裹了点药渣。再回头，那书生早没了影。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-80, -40] },
              { type: 'hp', amount: [-20, -5] }
            ]
          }
        ]
      },
      {
        text: '验货再谈',
        hint: '需神识 20，可当场识破',
        req: { attr: 'spiritSense', min: 20 },
        outcomes: [
          {
            weight: 100,
            log: '你拈起一粒在鼻端一嗅，便冷笑着把瓶子推了回去。书生的脸，一阵红一阵白。',
            effects: [
              { type: 'attr', attr: 'spiritSense', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '摇头走开',
        hint: '不贪便宜，不吃亏',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你摆摆手，绕过他继续走。他在身后又去拦下一个过路的行商。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_snake_nest',
    title: '蛇窟',
    desc: '岩洞口的石缝里，密密麻麻盘着数十条青蛇，蛇尾扫过的地方草木尽枯。洞底深处，似乎压着一窝蛇卵，泛着幽幽的青光。',
    tier: 'bad',
    minRealm: 0,
    maxRealm: 8,
    weight: 9,
    once: false,
    choices: [
      {
        text: '火攻取卵',
        hint: '蛋可入药，但蛇群凶悍',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你以火折引燃枯草，浓烟驱散了大半蛇群，抢出两枚蛇卵。手上被咬了一口，麻了许久。',
            effects: [
              { type: 'hp', amount: [-50, -25] },
              { type: 'material', id: 'mat_yaodan', amount: [1, 1] }
            ]
          },
          {
            weight: 45,
            log: '火没烧起来，蛇群反倒被激怒，你被追出半里地，小腿上留下两排血牙印。',
            effects: [
              { type: 'hp', amount: [-90, -50] }
            ]
          }
        ]
      },
      {
        text: '烟熏逼退',
        hint: '不出手，慢慢来',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你采湿草堆在洞口，熏了整整一个时辰。蛇群退入深处，你捡了几条药力尚存的蛇蜕便走。',
            effects: [
              { type: 'material', id: 'mat_yaoxue', amount: [1, 2] },
              { type: 'hp', amount: [-15, -5] }
            ]
          }
        ]
      },
      {
        text: '退开，另寻他路',
        hint: '不惹蛇群',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退开数丈，绕山而行。回头时，洞口那点青光还在幽幽地亮着。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_swamp_sink',
    title: '泥沼陷足',
    desc: '看似坚硬的地面上，一脚踩下去便陷了半条腿，泥浆咕嘟咕嘟往上冒。四周的草木都长在浮土上，根须悬空，像一张张等着人的网。',
    tier: 'bad',
    minRealm: 0,
    maxRealm: 10,
    weight: 8,
    once: false,
    choices: [
      {
        text: '挣扎拔腿',
        hint: '越急越糟',
        req: null,
        outcomes: [
          {
            weight: 45,
            log: '你猛地一挣，腿是拔出来了，靴子却留在了泥里，人也摔得满身泥浆。',
            effects: [
              { type: 'hp', amount: [-40, -20] }
            ]
          },
          {
            weight: 55,
            log: '越动陷得越深，泥浆没到腰际。你慌忙抱住一处浮草，才勉强爬了出来。',
            effects: [
              { type: 'hp', amount: [-80, -40] },
              { type: 'cult', amount: [-100, -30] }
            ]
          }
        ]
      },
      {
        text: '卸力平躺呼救',
        hint: '冷静，可减损',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你强迫自己放松，仰面浮在泥上，一点点蹭到硬地。虽狼狈，却没伤到根本。',
            effects: [
              { type: 'hp', amount: [-25, -10] }
            ]
          }
        ]
      },
      {
        text: '原路退回去',
        hint: '放弃此行',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你小心翼翼踩着来时的脚印退回，再不敢往前一步。那片浮土，还在缓缓冒着气泡。',
            effects: [
              { type: 'hp', amount: [-10, -3] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_ghost_wall',
    title: '鬼打墙',
    desc: '走了半个时辰，又回到了那棵歪脖子树前。树杈上挂着你的衣角布条，那是你第一次路过时留下的记号。天，已经完全黑了。',
    tier: 'bad',
    minRealm: 0,
    maxRealm: 10,
    weight: 8,
    once: false,
    choices: [
      {
        text: '强行破路',
        hint: '以力破幻，或伤心神',
        req: null,
        outcomes: [
          {
            weight: 45,
            log: '你运起周身气机往一处冲，幻境如薄纸般破开。你冲出去的刹那，耳中嗡的一声，头痛欲裂。',
            effects: [
              { type: 'hp', amount: [-50, -20] },
              { type: 'attr', attr: 'daoHeart', amount: [-1, 0] }
            ]
          },
          {
            weight: 55,
            log: '你越冲越晕，直到天亮，幻境才自行散去。你发现自己整夜都在原地打转。',
            effects: [
              { type: 'hp', amount: [-70, -30] },
              { type: 'cult', amount: [-80, -20] }
            ]
          }
        ]
      },
      {
        text: '静坐待旦',
        hint: '以守代攻，稳妥',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你盘膝坐下，闭目数息，不再理会四周的响动。不知过了多久，鸡叫头遍，路就在脚下。',
            effects: [
              { type: 'hp', amount: [-15, -5] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_night_wolf',
    title: '荒村狼群',
    desc: '破败的村子里没人，只有一地干涸的暗褐痕迹。夜幕落下时，十几点幽绿的光在村口聚拢，低低的呜咽声由远及近，绕着圈子。',
    tier: 'bad',
    minRealm: 0,
    maxRealm: 8,
    weight: 8,
    once: false,
    choices: [
      {
        text: '守屋死战',
        hint: '借地利，但难免血光',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '你背靠断墙撑到天亮。头狼一倒，狼群四散，你身边堆着几具狼尸，自己也是遍体鳞伤。',
            effects: [
              { type: 'battle', power: 35, enemy: 'en_canglang', name: '头狼' },
              { type: 'hp', amount: [-80, -40] },
              { type: 'material', id: 'mat_shougu', amount: [1, 2] }
            ]
          },
          {
            weight: 40,
            log: '墙塌了一角，你被扑倒咬住肩头，好不容易才挣脱。狼群叼着你的包裹逃进了林子。',
            effects: [
              { type: 'hp', amount: [-120, -60] },
              { type: 'stones', quality: 'low', amount: [-50, -20] }
            ]
          }
        ]
      },
      {
        text: '燃火驱狼',
        hint: '耗材，但少受伤',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你拆了半间破屋燃起大火，狼群围着火光转了半夜，终究散了。天亮时你满身烟灰。',
            effects: [
              { type: 'hp', amount: [-25, -10] }
            ]
          }
        ]
      },
      {
        text: '学狼嚎周旋',
        hint: '赌狼群认不认你',
        req: null,
        outcomes: [
          {
            weight: 40,
            log: '你压着嗓子嚎了两声，狼群竟真犹疑了片刻，你趁隙翻墙遁走。',
            effects: [
              { type: 'hp', amount: [-20, -8] },
              { type: 'attr', attr: 'luck', amount: [1, 1] }
            ]
          },
          {
            weight: 60,
            log: '狼群非但没退，反而听出了破绽，一拥而上。你在乱咬中逃出村子，丢了半条命。',
            effects: [
              { type: 'hp', amount: [-100, -60] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_rival_ambush',
    title: '敌宗伏击',
    desc: '转过山坳，三道剑光成品字形当胸刺来，出手便是杀招。为首者袖口绣着敌对宗门的云纹，冷声道：上个月的账，今日一并清。',
    tier: 'bad',
    minRealm: 9,
    maxRealm: 16,
    weight: 10,
    once: false,
    choices: [
      {
        text: '结阵硬接',
        hint: '恶战，胜则扬名',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你以一敌三，硬生生撑到对方力竭。三人互视一眼，撂下句狠话退了。你拄剑喘息，心里却痛快。',
            effects: [
              { type: 'battle', power: 80, enemy: 'en_zongmen_zhifa', name: '敌宗三人' },
              { type: 'hp', amount: [-150, -70] },
              { type: 'cult', amount: [150, 400] }
            ]
          },
          {
            weight: 45,
            log: '三人配合老练，你左支右绌，被一剑穿肩。危急时你掷出符箓炸开缺口，狼狈脱身。',
            effects: [
              { type: 'battle', power: 100, enemy: 'en_zongmen_zhifa', name: '敌宗三人' },
              { type: 'hp', amount: [-250, -120] },
              { type: 'stones', quality: 'low', amount: [-100, -50] }
            ]
          }
        ]
      },
      {
        text: '且战且退',
        hint: '不逞强，保全为上',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你借着山势且挡且走，虽中了两剑，终究没被围死。逃出十余里，才敢停下包扎。',
            effects: [
              { type: 'hp', amount: [-120, -60] }
            ]
          }
        ]
      },
      {
        text: '报出师门名号',
        hint: '需声望，或可化解',
        req: { realm: 12 },
        outcomes: [
          {
            weight: 60,
            log: '你报出师门与长老名号，为首者脸色微变，收了剑。恩怨暂且记下，人先走了。',
            effects: []
          },
          {
            weight: 40,
            log: '对方冷笑一声：等的就是你这一门。剑势更急，你拼着伤势才突出重围。',
            effects: [
              { type: 'battle', power: 110, enemy: 'en_zongmen_zhifa', name: '敌宗三人' },
              { type: 'hp', amount: [-200, -100] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_demon_qi',
    title: '煞气侵体',
    desc: '路过一处废弃的祭坛，坛上残留的血痕历经百年不褪。你只多看了两眼，一股阴冷便顺着经脉往上爬，识海里泛起莫名的杀意。',
    tier: 'bad',
    minRealm: 9,
    maxRealm: 18,
    weight: 9,
    once: false,
    choices: [
      {
        text: '强行压制',
        hint: '以道心硬扛，伤身',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你强行运转真气将煞气逼出体外，呕出一口黑血，人却清醒了。经脉略受损，根基未动。',
            effects: [
              { type: 'hp', amount: [-100, -50] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] }
            ]
          },
          {
            weight: 45,
            log: '煞气狡诈，你压下去又浮上来，折腾一夜，人变得暴躁易怒，修行也滞涩了。',
            effects: [
              { type: 'hp', amount: [-150, -70] },
              { type: 'attr', attr: 'daoHeart', amount: [-2, -1] },
              { type: 'cult', amount: [-200, -80] }
            ]
          }
        ]
      },
      {
        text: '服丹化解',
        hint: '需破妄丹，损失减半',
        req: { item: 'pill_powang', count: 1 },
        outcomes: [
          {
            weight: 100,
            log: '破妄丹入口，识海一清，那股阴冷如雪遇春阳，悄无声息地化了。',
            effects: [
              { type: 'hp', amount: [-20, -10] }
            ]
          }
        ]
      },
      {
        text: '闭目诵经退走',
        hint: '不与之争，损失较轻',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你收敛心神，一步步退出祭坛范围。那股冷意追到坛边便停了，像有一道看不见的线。',
            effects: [
              { type: 'hp', amount: [-40, -15] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_formation_fail',
    title: '阵眼反噬',
    desc: '你依着残图布下聚灵阵，第七块玉牌落位的瞬间，地脉灵气忽然逆流，阵纹亮起刺目的红光。你意识到，图上少画了一笔。',
    tier: 'bad',
    minRealm: 9,
    maxRealm: 18,
    weight: 8,
    once: false,
    choices: [
      {
        text: '灌注灵力稳住',
        hint: '拼根基，或能挽回',
        req: null,
        outcomes: [
          {
            weight: 50,
            log: '你倾尽全力将灵气引入正轨，阵纹红光大盛后缓缓转青。阵法成了，你却脱力瘫倒。',
            effects: [
              { type: 'hp', amount: [-120, -60] },
              { type: 'cult', amount: [200, 500] }
            ]
          },
          {
            weight: 50,
            log: '灵气反冲，你被掀飞出去。玉牌碎了三块，地上炸出一个丈许深的坑。',
            effects: [
              { type: 'hp', amount: [-200, -100] },
              { type: 'stones', quality: 'mid', amount: [-2, -1] }
            ]
          }
        ]
      },
      {
        text: '及时撤去阵眼',
        hint: '断臂求生，减轻损失',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你抢在爆炸前抠出两块玉牌，阵法哑火。虽然前功尽弃，人却无碍。',
            effects: [
              { type: 'hp', amount: [-40, -15] },
              { type: 'stones', quality: 'low', amount: [-60, -30] }
            ]
          }
        ]
      },
      {
        text: '抽身远退',
        hint: '弃阵保命',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你头也不回地退开数十丈。身后传来一声闷响，尘土冲天而起。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-40, -20] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_cave_thief',
    title: '洞府失窃',
    desc: '回到洞府，禁制完好无损，库房里的灵石与药材却少了近半。地上没有脚印，只有一缕极淡的、不属于你的灵气残留。',
    tier: 'bad',
    minRealm: 9,
    maxRealm: 18,
    weight: 8,
    once: false,
    choices: [
      {
        text: '循灵气追查',
        hint: '或能追回，或有埋伏',
        req: null,
        outcomes: [
          {
            weight: 50,
            log: '你循着那缕灵气追出百里，在一处崖洞寻回了大半失物。窃贼早已遁走，只留下一地狼藉。',
            effects: [
              { type: 'stones', quality: 'low', amount: [80, 200] },
              { type: 'attr', attr: 'spiritSense', amount: [1, 2] }
            ]
          },
          {
            weight: 50,
            log: '灵气痕迹在半途断了。你追到一处岔路，非但没找回东西，还耗费了数日光阴。',
            effects: [
              { type: 'cult', amount: [-150, -50] }
            ]
          }
        ]
      },
      {
        text: '加固禁制了事',
        hint: '认栽，先堵漏洞',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把禁制重新推演了一遍，补上几处疏漏。东西是找不回来了，但至少不会再有下一次。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-100, -50] },
              { type: 'attr', attr: 'comprehension', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '暂时搬离',
        hint: '避其锋芒',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你收拾了残余的家当，另寻了一处隐蔽所在。老洞府的门，你没再回头看一眼。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-180, -80] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_poison_valley',
    title: '毒沼谷',
    desc: '谷中水泽泛着油亮的黑，水面浮着死鱼，岸边却生着一丛少见的九叶莲。莲花开得极盛，越盛越显得此地的毒，深不可测。',
    tier: 'bad',
    minRealm: 9,
    maxRealm: 18,
    weight: 8,
    once: false,
    choices: [
      {
        text: '涉水采莲',
        hint: '重宝，但毒入膏肓',
        req: null,
        outcomes: [
          {
            weight: 45,
            log: '你以真气护体涉水而过，采得九叶莲。上岸时双腿已浮起紫斑，服了丹药才压住毒性。',
            effects: [
              { type: 'hp', amount: [-120, -60] },
              { type: 'material', id: 'mat_jiuyelian', amount: [1, 2] }
            ]
          },
          {
            weight: 55,
            log: '水中毒瘴远比岸上浓烈，你走到一半便头晕目眩，勉强退回，九叶莲连影子都没摸着。',
            effects: [
              { type: 'hp', amount: [-180, -90] }
            ]
          }
        ]
      },
      {
        text: '以钓竿远取',
        hint: '需悟性，稳妥些',
        req: { attr: 'comprehension', min: 35 },
        outcomes: [
          {
            weight: 100,
            log: '你削竹为钩，以药饵引出莲茎，远岸采得一朵。虽费周折，中毒却浅。',
            effects: [
              { type: 'hp', amount: [-30, -10] },
              { type: 'material', id: 'mat_jiuyelian', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '记下位置离开',
        hint: '来日方长',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你在谷口做了记号。以你如今的修为，这莲花还是留给日后的自己吧。',
            effects: [
              { type: 'flag', key: 'marked_poison_valley', value: true }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_heart_demon',
    title: '心魔滋生',
    desc: '闭关至第七日，识海中忽然浮起一张脸——那是你此生最不愿再见的人。他笑着问你：修行至今，你究竟是为了什么？',
    tier: 'bad',
    minRealm: 15,
    maxRealm: null,
    weight: 9,
    once: false,
    choices: [
      {
        text: '以道心斩之',
        hint: '需道心 60，凶险',
        req: { attr: 'daoHeart', min: 60 },
        outcomes: [
          {
            weight: 65,
            log: '你直视那张脸，一字一句答了自己的道。幻象寸寸碎裂，识海前所未有的清明。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [3, 5] },
              { type: 'cult', amount: [400, 900] }
            ]
          },
          {
            weight: 35,
            log: '你答得迟疑了。心魔趁隙而入，你呕血出关，境界险些跌落。',
            effects: [
              { type: 'hp', amount: [-400, -200] },
              { type: 'attr', attr: 'daoHeart', amount: [-3, -1] }
            ]
          }
        ]
      },
      {
        text: '服丹守心',
        hint: '需破妄丹，可稳渡此劫',
        req: { item: 'pill_powang', count: 1 },
        outcomes: [
          {
            weight: 100,
            log: '破妄丹化开，心魔如镜花水月，看得见，却再扰不了你。你安然出关，心境更胜从前。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] }
            ]
          }
        ]
      },
      {
        text: '强行出关',
        hint: '中断闭关，伤及根本',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你咬破舌尖强行收功，睁开眼时浑身冷汗。心魔未除，只是被压了下去，来日还会再来。',
            effects: [
              { type: 'hp', amount: [-200, -100] },
              { type: 'attr', attr: 'daoHeart', amount: [-2, -1] },
              { type: 'flag', key: 'heart_demon_lingers', value: true }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_void_rift',
    title: '虚空裂隙',
    desc: '晴空之下，一道细如发丝的黑色裂痕悬在半空，周围的光都在往里面弯。裂痕边缘偶尔闪过不属于此界的颜色，看久了让人作呕。',
    tier: 'bad',
    minRealm: 15,
    maxRealm: null,
    weight: 8,
    once: false,
    choices: [
      {
        text: '探入神识',
        hint: '需神识 80，或窥天机',
        req: { attr: 'spiritSense', min: 80 },
        outcomes: [
          {
            weight: 45,
            log: '你的神识穿过裂隙，看见了一片没有天地的虚空，还有一瞬，仿佛有什么在看你。你惊醒时，冷汗湿透重衣。',
            effects: [
              { type: 'attr', attr: 'spiritSense', amount: [3, 5] },
              { type: 'hp', amount: [-200, -100] },
              { type: 'flag', key: 'saw_the_void', value: true }
            ]
          },
          {
            weight: 55,
            log: '神识刚触到裂口便被猛地一扯。你拼死收回，神魂受创，头痛了整整一月。',
            effects: [
              { type: 'hp', amount: [-450, -250] },
              { type: 'attr', attr: 'spiritSense', amount: [-2, -1] }
            ]
          }
        ]
      },
      {
        text: '以灵力封堵',
        hint: '积功德，耗修为',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你以自身灵力一层层糊住裂隙。裂痕缓缓弥合，你的修为也就此去了小半。天地间少了一处隐患。',
            effects: [
              { type: 'cult', amount: [-500, -200] },
              { type: 'attr', attr: 'daoHeart', amount: [3, 4] }
            ]
          }
        ]
      },
      {
        text: '远远绕开',
        hint: '不沾染，不自伤',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退到极远处，直到那点黑色从视野里消失。你忽然很想知道，这道缝的另一头，究竟是什么。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_heaven_gaze',
    title: '天罚之眼',
    desc: '乌云毫无征兆地聚拢，云心裂开一只竖瞳，缓缓扫过大地。你周身灵力忽然滞涩，仿佛被什么锁定了。那不是天劫，更像是天在看你一眼。',
    tier: 'bad',
    minRealm: 15,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '敛息蛰伏',
        hint: '藏形匿迹，稳妥',
        req: { attr: 'spiritSense', min: 60 },
        outcomes: [
          {
            weight: 100,
            log: '你将周身气机压至近乎于无，如草木般伏在山石之后。竖瞳扫过，未作停留，云层缓缓散去。',
            effects: [
              { type: 'hp', amount: [-60, -20] }
            ]
          }
        ]
      },
      {
        text: '逆天而对',
        hint: '锋芒毕露，凶险异常',
        req: null,
        outcomes: [
          {
            weight: 35,
            log: '你昂首与那只竖瞳对视。刹那间雷光灌顶，你硬受一击，浑身焦黑，丹田却在这一击中淬炼得更为凝实。',
            effects: [
              { type: 'hp', amount: [-600, -300] },
              { type: 'attr', attr: 'daoHeart', amount: [4, 6] },
              { type: 'cult', amount: [800, 1500] }
            ]
          },
          {
            weight: 65,
            log: '雷光落下的一瞬你便后悔了。你被劈得经脉寸断，勉强以残存灵力遁走，修养了数月。',
            effects: [
              { type: 'hp', amount: [-900, -500] },
              { type: 'cult', amount: [-600, -300] }
            ]
          }
        ]
      },
      {
        text: '遁入地脉',
        hint: '舍洞府，保性命',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你一头扎入附近的地脉裂隙，借厚土之气遮蔽自身。竖瞳扫了三遍，终于阖上。你从另一头钻出时，已离原地数百里。',
            effects: [
              { type: 'hp', amount: [-150, -60] },
              { type: 'stones', quality: 'mid', amount: [-3, -1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_betrayal',
    title: '故友反目',
    desc: '多年同行的道友约你在老地方相见，酒过三巡，他忽然放下杯子：那件东西，你一个人拿不稳。他的袖中，隐隐透出灵光。',
    tier: 'bad',
    minRealm: 12,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '先发制人',
        hint: '断义，或能自保',
        req: null,
        outcomes: [
          {
            weight: 55,
            // 战果由战斗系统判定，文案不作断言（否则打赢了却被写成"落荒而走"）
            log: '你抢在他出手前掀翻石桌。待到收手，两人都已见血。从此山高水长，再无此人。',
            effects: [
              { type: 'battle', power: 120, enemy: 'en_sanxiu', name: '反目的故友' },
              { type: 'hp', amount: [-250, -120] },
              { type: 'attr', attr: 'daoHeart', amount: [-2, -1] }
            ]
          },
          {
            weight: 45,
            log: '他早有防备。你一击未中，反被缠住，混战中失了先机，只顾脱身。',
            effects: [
              { type: 'battle', power: 140, enemy: 'en_sanxiu', name: '反目的故友' },
              { type: 'hp', amount: [-400, -200] }
            ]
          }
        ]
      },
      {
        text: '推杯换盏谈',
        hint: '需道心 50，或可化解',
        req: { attr: 'daoHeart', min: 50 },
        outcomes: [
          {
            weight: 65,
            log: '你替他斟满酒，说起当年共渡的那场劫难。他握着杯的手松了，末了长叹一声，起身走了。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [2, 4] },
              { type: 'attr', attr: 'luck', amount: [1, 2] }
            ]
          },
          {
            weight: 35,
            log: '他冷笑一声：旧情能值几个钱。话音未落，剑已出鞘。你猝不及防，负伤退走。',
            effects: [
              { type: 'hp', amount: [-300, -150] },
              { type: 'attr', attr: 'daoHeart', amount: [-2, -1] }
            ]
          }
        ]
      },
      {
        text: '让出机缘',
        hint: '弃利保身，也断情分',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把东西推到他面前，起身告辞。他没有拦你。走到门外，你听见杯盏碎裂的声音。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [-3, -1] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] }
            ]
          }
        ]
      }
    ]
  },

  // ============================================================
  // NEUTRAL —— 15 条
  // ============================================================

  {
    id: 'enc_sealed_box',
    title: '封灵石匣',
    desc: '石匣通体无纹，入手沉重得反常，摇晃时里面没有半点声响。匣缝里渗出的灵气时有时无，像是被封着，又像是快压不住了。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: null,
    weight: 10,
    once: false,
    choices: [
      {
        text: '强行破开',
        hint: '豪赌，福祸难料',
        req: null,
        outcomes: [
          {
            weight: 45,
            log: '匣开，一团精纯灵气扑面而来，里面竟是一枚品相极佳的丹药，还有半卷残图。',
            effects: [
              { type: 'pill', id: 'pill_juqi', amount: [1, 2] },
              { type: 'cult', amount: [100, 300] }
            ]
          },
          {
            weight: 55,
            log: '匣开的瞬间，封存百年的煞气炸开。你被震得气血翻涌，匣底只有一块普通矿石。',
            effects: [
              { type: 'hp', amount: [-80, -30] },
              { type: 'material', id: 'mat_xuantie', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '拿去坊市出售',
        hint: '落袋为安',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '坊市老板围着匣子转了三圈，出价不高不低。你懒得赌，收了灵石走人。',
            effects: [
              { type: 'stones', quality: 'low', amount: [60, 180] }
            ]
          }
        ]
      },
      {
        text: '原样埋回土里',
        hint: '不碰不知之物',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把石匣重新埋好，覆上浮土。走出很远，你总觉得那东西还在原地一下一下地跳。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_two_roads',
    title: '歧路',
    desc: '岔路口，一条路宽而平，人来人往；另一条窄而幽，草叶上还挂着露水，隐约有钟声从深处传来，不知是庙，还是别的什么。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 10,
    weight: 10,
    once: false,
    choices: [
      {
        text: '走宽阔大路',
        hint: '稳妥，或遇同行者',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '大路上你遇着一队行商，结伴走了半日，听了不少山野传闻，倒也长了些见识。',
            effects: [
              { type: 'cult', amount: [20, 60] },
              { type: 'attr', attr: 'luck', amount: [0, 1] }
            ]
          }
        ]
      },
      {
        text: '走幽深小径',
        hint: '难行，或有所遇',
        req: null,
        outcomes: [
          {
            weight: 50,
            log: '小径尽头是一座荒废的道观，供桌上积着厚灰，梁间却悬着一卷尚未朽尽的旧经。',
            effects: [
              { type: 'cult', amount: [60, 180] },
              { type: 'flag', key: 'found_old_temple', value: true }
            ]
          },
          {
            weight: 50,
            log: '小径越走越窄，最后断在一处断崖前。你只得原路退回，白费了半日脚程。',
            effects: [
              { type: 'hp', amount: [-15, -5] }
            ]
          }
        ]
      },
      {
        text: '在岔口静立',
        hint: '不急着选',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你在岔口站了许久，看行人来去。某一刻你忽然明白，路其实不在脚下。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [1, 2] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_drunk_taoist',
    title: '醉道人',
    desc: '路边歪着个醉道人，酒葫芦倒在脚边，嘴里嘟囔着谁也听不懂的话。见你走近，他忽然睁眼，笑说：小哥，赌一把？输了，我教你个乖。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 12,
    weight: 9,
    once: false,
    choices: [
      {
        text: '与他赌一局',
        hint: '输赢由天',
        req: null,
        outcomes: [
          {
            weight: 50,
            log: '道人输了，却半点不恼，随手在你掌心画了个符，说能挡一次小灾，便又睡了过去。',
            effects: [
              { type: 'attr', attr: 'luck', amount: [2, 4] },
              { type: 'buff', id: 'buff_luck', duration: 600, mult: 1.3 }
            ]
          },
          {
            weight: 50,
            log: '你输了。道人笑呵呵地讨了壶酒钱，末了拍拍你肩膀，说你这人还算输得起。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-30, -10] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '请他喝酒',
        hint: '舍财，听他胡言',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '道人喝得尽兴，半醉半醒间说了几句混话，你起初发笑，笑到一半却愣住了。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-20, -10] },
              { type: 'attr', attr: 'comprehension', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '绕开醉汉',
        hint: '无风险',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你不理会醉话，径直走过。身后传来一阵大笑，也不知在笑什么。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_abandoned_cart',
    title: '道旁弃车',
    desc: '道旁翻着一辆旧车，货箱摔开了，散落一地布帛与杂物。车辕上有几道新鲜的砍痕，车夫却不见踪影，四周静得反常。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 10,
    weight: 8,
    once: false,
    choices: [
      {
        text: '翻检有用之物',
        hint: '或有收获，或有惊吓',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你在布帛下翻出几味药材，还有一小袋灵石，想是车夫匆忙间落下的。',
            effects: [
              { type: 'stones', quality: 'low', amount: [30, 90] },
              { type: 'material', id: 'mat_lingzhi', amount: [1, 1] }
            ]
          },
          {
            weight: 45,
            log: '你刚掀开布帛，便见车底压着一具早已僵冷的尸首，砍痕与车辕上的如出一辙。你后退几步，什么也没拿。',
            effects: [
              { type: 'hp', amount: [-20, -5] },
              { type: 'attr', attr: 'spiritSense', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '查看车辙预警',
        hint: '谨慎，看懂局势',
        req: { attr: 'spiritSense', min: 25 },
        outcomes: [
          {
            weight: 100,
            log: '你俯身看车辙，发现劫掠者离开不久，正往你原定的方向去。你改道绕行，避开了一场是非。',
            effects: [
              { type: 'attr', attr: 'spiritSense', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '不加理会，快走',
        hint: '不惹麻烦',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你加快脚步越过弃车。风把一块布帛吹起，又轻轻落下。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_mirror_pool',
    title: '镜潭',
    desc: '潭水极静，静得能照出人的影子，连心里那点不愿示人的念头，仿佛也照了出来。你盯着水面，水里的那个"你"忽然先笑了一下。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 14,
    weight: 8,
    once: false,
    choices: [
      {
        text: '与"他"对视',
        hint: '需道心 30，直面己心',
        req: { attr: 'daoHeart', min: 30 },
        outcomes: [
          {
            weight: 100,
            log: '你没有回避，就那么看着。水中的倒影渐渐与你重合。你站起身时，心里空了一块，却也轻了一块。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] },
              { type: 'cult', amount: [80, 240] }
            ]
          }
        ]
      },
      {
        text: '掬水洗面',
        hint: '不想看，就此揭过',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你捧起一掬潭水泼在脸上，冰凉刺骨。再睁眼时，水面恢复了平静，倒影规规矩矩。',
            effects: [
              { type: 'hp', amount: [10, 25] }
            ]
          }
        ]
      },
      {
        text: '转身离开',
        hint: '有些东西不必看',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你没有再看第二眼。身后潭水轻响了一声，像是谁叹了口气。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_stone_gamble',
    title: '赌石坊',
    desc: '坊内堆着一排灰扑扑的原石，最大的价值连城，最小的可能一钱不值。老师傅眯着眼说，看皮壳是看不出内里的，全凭眼力，也全凭运气。',
    tier: 'neutral',
    minRealm: 9,
    maxRealm: 18,
    weight: 8,
    once: false,
    choices: [
      {
        text: '重金押大石',
        hint: '需中品灵石，豪赌',
        req: null,
        outcomes: [
          {
            weight: 35,
            log: '一刀下去，石心透出莹润玉色。满坊哗然，老师傅的手都抖了。',
            effects: [
              { type: 'stones', quality: 'high', amount: [1, 3] },
              { type: 'material', id: 'mat_xingchen', amount: [1, 2] }
            ]
          },
          {
            weight: 65,
            log: '石皮剥尽，里面是一团灰败的死玉，半点灵气也无。你把碎石踢到一边。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [-3, -2] }
            ]
          }
        ]
      },
      {
        text: '挑最不起眼的',
        hint: '以小博大',
        req: null,
        outcomes: [
          {
            weight: 50,
            log: '那块没人要的小石，切开后竟藏着一枚内丹。老师傅啧啧称奇，说是漏网之鱼。',
            effects: [
              { type: 'material', id: 'mat_neidan', amount: [1, 1] }
            ]
          },
          {
            weight: 50,
            log: '小石里空空如也。你倒不心疼，本就是买个乐子。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-50, -20] }
            ]
          }
        ]
      },
      {
        text: '只看不赌',
        hint: '不落把柄',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你站在一旁看了半晌，看别人切石，看别人或喜或悲。末了摇摇头走了。',
            effects: [
              { type: 'attr', attr: 'luck', amount: [0, 1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_merchant_debt',
    title: '人心难测',
    desc: '一个面熟的散修拦住你，说上回欠了你一笔灵石，今日特来归还，还多备了谢礼。你翻遍记忆，却怎么也想不起借过他一分一毫。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 14,
    weight: 8,
    once: false,
    choices: [
      {
        text: '收下并道谢',
        hint: '或有后患',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '他将灵石塞进你手里便走。数日后，你才听说有个散修打着你的名号在外招摇。',
            effects: [
              { type: 'stones', quality: 'low', amount: [50, 150] },
              { type: 'flag', key: 'name_borrowed', value: true }
            ]
          },
          {
            weight: 40,
            log: '你收下灵石，他连声道谢。此后杳无音信，倒像是真的还债。',
            effects: [
              { type: 'stones', quality: 'low', amount: [50, 150] },
              { type: 'attr', attr: 'luck', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '婉拒并问明',
        hint: '不吃不明之财',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你越问，他越含糊，最后讪讪收了东西走了。你看着他的背影，觉得有些眼熟，又想不起来。',
            effects: [
              { type: 'attr', attr: 'spiritSense', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '推说认错人了',
        hint: '干脆撇清',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你摇摇头说认错了。他愣了一下，赔了个不是便走了。你站在原地想了半天。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_wounded',
    title: '受伤修士',
    desc: '山涧边倒着个重伤的修士，胸口一道伤口黑气缭绕，显然中了毒手。他睁眼看你，嘴唇动了动，说的是"救我"，手却悄悄按在了储物袋上。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 16,
    weight: 9,
    once: false,
    choices: [
      {
        text: '出手施救',
        hint: '耗丹药，结善缘',
        req: { item: 'pill_liaoshang', count: 1 },
        outcomes: [
          {
            weight: 100,
            log: '你以疗伤丹替他压住毒势。他缓过来后深深一揖，从储物袋里取了件东西塞给你，踉跄着走了。',
            effects: [
              { type: 'material', id: 'mat_xueshen', amount: [1, 2] },
              { type: 'attr', attr: 'luck', amount: [1, 3] }
            ]
          }
        ]
      },
      {
        text: '替他引来路人',
        hint: '不亲自动手',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你在高处放了道讯烟，引来附近修士。你远远看着他被救走，没有靠近，也没有走开。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '绕道走开',
        hint: '不趟浑水',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退开几步，绕行而过。走出很远，还觉得那道目光钉在后背上。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [-1, 0] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_fog_guide',
    title: '雾中引路',
    desc: '大雾锁山，五步之外不辨人影。雾里忽然走出个提灯的童子，说前路险，愿带你出去。灯是青色的，照不亮脸，只照得见那盏灯。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 12,
    weight: 8,
    once: false,
    choices: [
      {
        text: '跟他走',
        hint: '或有捷径，或有算计',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '童子领你穿林过涧，小半日便出了雾。他指了指下山的路，转身没入雾中，连脚步声都没有。',
            effects: [
              { type: 'cult', amount: [40, 120] },
              { type: 'attr', attr: 'luck', amount: [1, 1] }
            ]
          },
          {
            weight: 45,
            log: '跟着走了一程，你越想越不对，猛然停步。再看时，那点青光已在十丈之外，径自飘远了。',
            effects: [
              { type: 'hp', amount: [-30, -10] },
              { type: 'attr', attr: 'spiritSense', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '留在原地等雾散',
        hint: '稳妥，但耗时间',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你靠着山石坐下，看那点青光在林间忽明忽暗，直到天亮雾散，它才彻底消失。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      },
      {
        text: '循着水声下山',
        hint: '靠自己',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你不信引路的孩子，只信自己的耳朵。顺水声走了半夜，果然摸到了山脚的溪涧。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [1, 1] },
              { type: 'hp', amount: [-15, -5] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_ancient_coin',
    title: '古钱',
    desc: '溪底淤泥里摸出一枚古钱，方孔圆廓，锈色斑驳，隐约铸着看不懂的符文。奇怪的是，把它贴在耳边，能听见极轻的、金属相击的声音。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 14,
    weight: 7,
    once: false,
    choices: [
      {
        text: '贴身收起',
        hint: '来路不明，或生变数',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '此后数日，你每逢险处总能提前半步避开。那枚古钱却一日比一日凉。',
            effects: [
              { type: 'attr', attr: 'luck', amount: [1, 3] },
              { type: 'flag', key: 'carries_ancient_coin', value: true }
            ]
          },
          {
            weight: 40,
            log: '收在怀里的第三夜，古钱忽然发烫，你惊醒时它已裂成两半，符文尽失。',
            effects: [
              { type: 'hp', amount: [-20, -5] }
            ]
          }
        ]
      },
      {
        text: '拿去给人鉴定',
        hint: '或有意外之财',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '坊市的老者只看了一眼便变了脸色，压低声音问你从哪得来的，随后摆手说不收不收。你越发觉得蹊跷。',
            effects: [
              { type: 'stones', quality: 'low', amount: [20, 60] },
              { type: 'flag', key: 'coin_identified', value: true }
            ]
          }
        ]
      },
      {
        text: '扔回溪里',
        hint: '不贪不明之物',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把古钱丢回水中。它落水时没有溅起水花，只发出一声很轻的、像是松了口气的响。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_beast_cub',
    title: '幼兽',
    desc: '草丛里蜷着一只受伤的幼兽，毛色雪白，前腿被兽夹咬住，正低声呜咽。它见你靠近，不逃，只是把头埋得更深。不远处的灌木里，有东西在喘息。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: 14,
    weight: 8,
    once: false,
    choices: [
      {
        text: '救下幼兽',
        hint: '或引母兽，凶险',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '你掰开兽夹，替它把伤口敷上药。幼兽舔了舔你的手，却没有走，只是歪头看你，像是在等一个说法。灌木里的喘息声也随之远去。',
            effects: [
              { type: 'attr', attr: 'luck', amount: [2, 3] },
              // 答应它跟你走 —— 仍要掷一次收服概率（见 systems/encounter.js 的 beast 效果），
              // 野物认路不认人，不是救了就必然归你。
              { type: 'beast' }
            ]
          },
          {
            weight: 45,
            log: '兽夹一松，灌木中猛地扑出一道白影。你侧身避开，手臂仍被撕开一道口子。母兽叼起幼兽，头也不回。',
            effects: [
              { type: 'hp', amount: [-60, -25] }
            ]
          }
        ]
      },
      {
        text: '取兽夹去卖',
        hint: '得小利，失气运',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你拆下兽夹，幼兽一瘸一拐地逃了。夹子上的铁质不错，能换几枚灵石。',
            effects: [
              { type: 'stones', quality: 'low', amount: [20, 50] },
              { type: 'attr', attr: 'daoHeart', amount: [-1, 0] }
            ]
          }
        ]
      },
      {
        text: '不惊动，退开',
        hint: '各安其命',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你放轻脚步退开。走出很远，那声呜咽还隐隐跟着你。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_star_gaze',
    title: '观星',
    desc: '夜宿山巅，星河低垂，仿佛一伸手就能摸到。你想起幼时有人教过你认星，那人是谁，却怎么也想不起来了。',
    tier: 'neutral',
    minRealm: 0,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '依星象推演',
        hint: '需悟性，或窥一丝天机',
        req: { attr: 'comprehension', min: 20 },
        outcomes: [
          {
            weight: 100,
            log: '你以星位推演气数，越推越心惊，末了却只剩一句：原来如此。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [1, 2] },
              { type: 'cult', amount: [60, 200] }
            ]
          }
        ]
      },
      {
        text: '静看一夜',
        hint: '什么都不做',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你就那么看了一夜。流星划过几道，你许了一个自己都觉得好笑的愿。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '生火早睡',
        hint: '休整',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你拢了堆火，倒头便睡。梦里似乎有人在教你认星，醒来却什么也不记得。',
            effects: [
              { type: 'hp', amount: [15, 35] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_riddle_door',
    title: '谜门',
    desc: '石门千年未启，门上刻着一行字：进者失一，退者得全。门后隐约有风声，像是空的，又像深不见底。',
    tier: 'neutral',
    minRealm: 9,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '推门而入',
        hint: '舍一物，换一缘',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '门后是一间空室，正中石台上搁着一卷功法。你取了它，出门时，怀里那件旧物不翼而飞。',
            effects: [
              { type: 'technique', pool: 'ling', amount: 1 },
              { type: 'hp', amount: [-30, -10] }
            ]
          },
          {
            weight: 45,
            log: '门后空无一物，只有一堵刻满字的墙。你读了半日，出来时觉得脑中多了些什么，又说不清。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [1, 2] },
              { type: 'cult', amount: [80, 240] }
            ]
          }
        ]
      },
      {
        text: '以字解题',
        hint: '需悟性 40，解谜而上',
        req: { attr: 'comprehension', min: 40 },
        outcomes: [
          {
            weight: 100,
            log: '你在门上补刻了一字。石屑簌簌落下，侧墙无声裂开一道暗门，里头摆着几瓶丹药。',
            effects: [
              { type: 'pill', id: 'pill_zhuji', amount: [1, 1] },
              { type: 'attr', attr: 'comprehension', amount: [1, 2] }
            ]
          }
        ]
      },
      {
        text: '不进门，退走',
        hint: '守全而不贪',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你对着石门一揖，转身走了。身后风声渐息，仿佛那门又睡了回去。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_beggar_immortal',
    title: '街角乞儿',
    desc: '坊市街角蹲着个脏兮兮的乞儿，伸手讨一枚灵石。旁人都绕着他走，说这孩子在这儿蹲了三年，从没人见他吃过东西。',
    tier: 'neutral',
    minRealm: 9,
    maxRealm: null,
    weight: 7,
    once: false,
    choices: [
      {
        text: '给他一枚灵石',
        hint: '或有所报',
        req: null,
        outcomes: [
          {
            weight: 60,
            log: '乞儿接过灵石，抬头看了你一眼。那一眼清澈得不像个乞儿。他往地上画了个圈便走了。你后来才发觉，那圈是一处地脉的方位。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-1, -1] },
              { type: 'attr', attr: 'luck', amount: [1, 3] },
              { type: 'flag', key: 'beggar_blessing', value: true }
            ]
          },
          {
            weight: 40,
            log: '乞儿收了灵石，什么也没说，缩回墙角继续打盹。你觉得这灵石给得有点冤。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-1, -1] }
            ]
          }
        ]
      },
      {
        text: '买碗面给他',
        hint: '费事，或见真章',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把热面端到他面前。乞儿看着那碗面，忽然笑了：三年了，头一个给我买面的。他吃完面，抹抹嘴，人就不见了。',
            effects: [
              { type: 'stones', quality: 'low', amount: [-10, -5] },
              { type: 'attr', attr: 'daoHeart', amount: [2, 3] },
              { type: 'flag', key: 'beggar_met', value: true }
            ]
          }
        ]
      },
      {
        text: '绕开走',
        hint: '不多事',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你从他身边绕过去。走出十几步回头，那孩子还蹲在原处，姿势一点没变。',
            effects: []
          }
        ]
      }
    ]
  },

  {
    id: 'enc_old_debt',
    title: '旧账',
    desc: '一封无署名的信送到洞府，信上只有一行字与一个旧日的印记——那是你早年欠下的一笔人情。信末说，三日后，旧地相见。',
    tier: 'neutral',
    minRealm: 12,
    maxRealm: null,
    weight: 6,
    once: false,
    choices: [
      {
        text: '如约赴会',
        hint: '守信，或入局',
        req: null,
        outcomes: [
          {
            weight: 55,
            log: '旧地只见一盏茶、一张空椅，茶尚温，人已去。桌角压着一枚丹药与一句"从此两清"。',
            effects: [
              { type: 'pill', id: 'pill_tiangang', amount: [1, 1] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] }
            ]
          },
          {
            weight: 45,
            log: '等你的是个陌生面孔，说旧人已故，债由他讨。他没要灵石，只要你一件旧物。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [-3, -1] },
              { type: 'flag', key: 'old_debt_paid', value: true }
            ]
          }
        ]
      },
      {
        text: '备礼厚偿',
        hint: '舍财了因果',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你备了厚礼赴约。对方收了礼，将那枚旧印还你，说了一句：你这人，还认账。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [-5, -2] },
              { type: 'attr', attr: 'luck', amount: [1, 2] },
              { type: 'flag', key: 'old_debt_paid', value: true }
            ]
          }
        ]
      },
      {
        text: '置之不理',
        hint: '不认旧账',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把信烧了，没有赴约。此后许久，你总觉得暗处有一双眼睛在等着什么。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [-2, -1] },
              { type: 'flag', key: 'old_debt_ignored', value: true }
            ]
          }
        ]
      }
    ]
  },

  // ============================================================
  // RARE —— 7 条
  // ============================================================

  {
    id: 'enc_guide_meeting',
    title: '初遇引路人',
    desc: '你尚且懵懂，在山道边救了个被人追杀的灰袍老者。他伤得不轻，靠在你背上断断续续说了半宿的话，讲的是山外有山、天外有天。天亮时他咳着血起身，从怀中摸出一册薄薄的手札塞给你，又指了一个方向。他说，若你日后能走到那里，或许会明白他今日为何偏偏倒在你的路上。说完，人便消失在晨雾里，连脚印都没留下。',
    tier: 'rare',
    minRealm: 0,
    maxRealm: 6,
    weight: 3,
    once: true,
    choices: [
      {
        text: '依手札修行',
        hint: '根基之始，影响深远',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '那册手札字迹潦草，讲的却都是最朴素的道理。你照着练了三个月，竟比旁人苦修一年还扎实。',
            effects: [
              { type: 'technique', pool: 'ling', amount: 1 },
              { type: 'attr', attr: 'comprehension', amount: [2, 4] },
              { type: 'cult', amount: [200, 500] },
              { type: 'flag', key: 'met_oldman', value: true }
            ]
          }
        ]
      },
      {
        text: '先问他是谁',
        hint: '追根究底，或失机缘',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你追问他来历，他只摇头笑了笑，说知道得越早，走得越慢。手札终究还是给了你，只是那方向，他没再指。',
            effects: [
              { type: 'technique', pool: 'fan', amount: 1 },
              { type: 'attr', attr: 'daoHeart', amount: [1, 2] },
              { type: 'flag', key: 'met_oldman', value: true }
            ]
          }
        ]
      },
      {
        text: '送他进镇求医',
        hint: '救人要紧，不问其他',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你把老者背进镇上的药铺，守了他两日。他醒来后什么也没说，只在你手心写了一笔，说这一笔够你用很久。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [3, 5] },
              { type: 'buff', id: 'buff_cult', duration: 1200, mult: 1.4 },
              { type: 'flag', key: 'met_oldman', value: true }
            ]
          }
        ]
      }
    ]
  },

  {
    // ⚠ 这条奇遇**不授予宗门身份**。
    //
    // 它原本叫「拜入宗门」，在炼气期（0~5 境）触发，选项只写了
    // flag: sect_inner / sect_outer —— 而全项目没有任何地方读这两个 flag，
    // 也从不调用 sect.js 的 joinSect()。于是玩家选了"拜入内门"，
    // state.sect.id 仍是 null，信息页照样显示"散修"，宗门页也进不去。
    // 而那三个 flag 是纯死数据。**承诺了却做不到，比不承诺更糟。**
    //
    // 现在改成"山门记名"：执事看出你根骨未定，让你留下名字、给块记名木牌，
    // 明说"道基筑成后再来"。这与 sect.js 的 JOIN_REALM = 9（筑基方可拜师）
    // 完全一致，宗门这条线从此只有一个入口——「宗门」标签页。
    id: 'enc_sect_join',
    title: '山门记名',
    desc: '山门大开，钟声三响。你随着人流走上九百级石阶，阶上刻着的都是历代弟子的名讳。执事按着名册一个个问来历、验灵根，轮到你时却停了停，抬头多看了你一眼。殿内香烟缭绕，祖师画像上的目光沉沉的。他合上册子，说：你根骨未定，此时入山，反倒误你。且把名字留下——他日道基筑成，持此再来，山门仍开着。',
    tier: 'rare',
    minRealm: 0,
    maxRealm: 5,
    weight: 3,
    once: true,
    choices: [
      {
        text: '留下名讳，领一块记名木牌',
        hint: '受执事青眼',
        req: { attr: 'comprehension', min: 15 },
        outcomes: [
          {
            weight: 100,
            log: '执事提笔在册尾添了你的名字，又从袖中取出一块素木牌递来，牌上只刻着一个"记"字。他说：这不是弟子的腰牌，是山门记着你的意思。你把它收进怀里，木牌贴着心口，是凉的。',
            effects: [
              { type: 'stones', quality: 'mid', amount: [1, 2] },
              { type: 'pill', id: 'pill_juqi', amount: [2, 4] },
              // 用 fan 而非 ling：炼气期 ling 品质的功法 minRealm 都 ≥ 8，
              // 而 encounter.js 会按 minRealm ≤ 当前境界过滤 —— 用 ling 的话
              // 炼气期抽出来永远是一句"并无合你根骨的功法"，等于空过。
              { type: 'technique', pool: 'fan', amount: 1 }
            ]
          }
        ]
      },
      {
        text: '只在外门簿上留个名',
        hint: '不求师承，只结个善缘',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你说自己不急着入门，只想在山门留个名字。执事并不见怪，翻到外门那本簿子，让你自己写。写完他看了一眼，说：字还稳。你下山时回头，钟声正响到第三声。',
            effects: [
              { type: 'stones', quality: 'low', amount: [200, 500] },
              { type: 'attr', attr: 'daoHeart', amount: [1, 3] }
            ]
          }
        ]
      },
      {
        text: '不受约束，独行',
        hint: '不受这份人情',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退后一步，说声叨扰，转身走下石阶。执事没有留你，只在身后说了一句：路是自己走的，山门不催人。钟声又响了一声，不知是不是为你。',
            effects: [
              { type: 'attr', attr: 'luck', amount: [2, 4] },
              { type: 'attr', attr: 'comprehension', amount: [1, 2] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_ancient_cave',
    title: '上古洞府',
    desc: '地动之后，山壁裂开一道深不可测的缝隙，缝隙里飘出的灵气浓得几乎化不开。你壮着胆子走进去，只见洞府四壁布满刀剑痕迹，像是有人在此厮杀过，又像是有人在此悟道。正中的石台上，一具坐化的骸骨保持着掐诀的姿势，指骨却少了一根。骸骨面前的虚空中，悬浮着一团缓缓旋转的灰光，似物非物，似气非气。你每靠近一步，丹田里的灵力便跳动得更急。',
    tier: 'rare',
    minRealm: 15,
    maxRealm: null,
    weight: 3,
    once: true,
    choices: [
      {
        text: '承其衣钵',
        hint: '需悟性 60，凶险而厚报',
        req: { attr: 'comprehension', min: 60 },
        outcomes: [
          {
            weight: 100,
            log: '你对着骸骨拜了三拜，伸手探入那团灰光。无数残缺的感悟涌来，你昏了七日，醒来时石台上只剩你自己的影子。',
            effects: [
              { type: 'technique', pool: 'xian', amount: 1 },
              { type: 'cult', amount: [1500, 3000] },
              { type: 'attr', attr: 'comprehension', amount: [4, 7] },
              { type: 'flag', key: 'ancient_inheritance', value: true }
            ]
          }
        ]
      },
      {
        text: '只取遗物',
        hint: '稳妥，收获亦丰',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你取了骸骨身侧的储物袋与几件法器，对着遗骸一揖，退出洞府。那团灰光始终在身后静静悬着。',
            effects: [
              { type: 'equip', pool: 'xian', amount: 1 },
              { type: 'material', id: 'mat_hundun', amount: [1, 2] },
              { type: 'stones', quality: 'high', amount: [2, 5] }
            ]
          }
        ]
      },
      {
        text: '封洞退走',
        hint: '不贪，不扰亡者',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你退到洞外，以碎石封住裂口。做完这一切，你长长舒了口气，像是替谁守住了一样东西。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [4, 6] },
              { type: 'lifespan', amount: [20, 60] },
              { type: 'flag', key: 'sealed_ancient_cave', value: true }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_true_dragon',
    title: '真龙升天',
    desc: '东海之上，乌云压得极低，海面却反常地平静。忽然万顷碧波齐齐下沉，一道鳞爪森然的巨影自水下升起，龙首昂然，直指苍穹。天上垂下亿万道霞光，条条如锁链，缠住龙身。真龙不挣，也不退，只发出一声长吟，整片海域的灵气都随之倒卷。你浮在半空，衣袍猎猎，心中竟生出一种说不清的悲怆——原来修行到了尽头，是这样一副模样。',
    tier: 'rare',
    minRealm: 18,
    maxRealm: null,
    weight: 2,
    once: true,
    choices: [
      {
        text: '入海沾龙气',
        hint: '需道心 65，浴血而进',
        req: { attr: 'daoHeart', min: 65 },
        outcomes: [
          {
            weight: 100,
            log: '你一头扎入翻涌的海中。龙气如万千钢针刺入经脉，你死死守住真灵不散。再浮上来时，周身气血如渊，隐隐有了龙象之力。',
            effects: [
              { type: 'hp', amount: [-500, -200] },
              { type: 'attr', attr: 'daoHeart', amount: [4, 7] },
              { type: 'cult', amount: [2000, 4000] },
              { type: 'buff', id: 'buff_combat', duration: 1200, mult: 1.6 }
            ]
          }
        ]
      },
      {
        text: '远观长吟',
        hint: '不涉险，只观道',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你停在云端，看真龙一寸寸撞碎那些霞光。龙吟散去时，你忽然落泪，自己也不知为何。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [3, 6] },
              { type: 'cult', amount: [800, 1800] },
              { type: 'flag', key: 'saw_true_dragon', value: true }
            ]
          }
        ]
      },
      {
        text: '拾取龙鳞',
        hint: '务实，得宝而去',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '龙尾扫过，几片碎鳞坠入浅滩。你抢在潮水合拢前拾了两片，滚烫如烙铁，却坚韧得不可思议。',
            effects: [
              { type: 'material', id: 'mat_longlin', amount: [1, 2] },
              { type: 'material', id: 'mat_longdanhua', amount: [1, 1] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_time_river',
    title: '岁月长河',
    desc: '你在坐忘之中忽然"看见"了一条河。河里漂着的不是水，是一段一段的年月：有你不记得的童年，有你尚未经历的暮年，也有一个背影，站在河心一动不动。你走近，才认出那是你自己，白发苍苍，正回头望着此刻的你。他张了张嘴，你却听不见声音。河对岸，一座残破的石碑半沉在光阴里，碑上刻着的，似乎是你的名字。你只觉一瞬很长，长得足够过一次完整的人生。',
    tier: 'rare',
    minRealm: 20,
    maxRealm: null,
    weight: 2,
    once: true,
    choices: [
      {
        text: '涉水取碑',
        hint: '需寿元换取，凶险',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你踏入河中，每一步都像老去十岁。触到石碑的一刻，你终于听清了那句话。碑文入怀，你被河水推回此岸，鬓角已染霜色。',
            effects: [
              { type: 'lifespan', amount: [-120, -40] },
              { type: 'attr', attr: 'comprehension', amount: [6, 10] },
              { type: 'cult', amount: [3000, 6000] },
              { type: 'flag', key: 'touched_time_river', value: true }
            ]
          }
        ]
      },
      {
        text: '与未来的自己对话',
        hint: '需道心 70，关乎道途',
        req: { attr: 'daoHeart', min: 70 },
        outcomes: [
          {
            weight: 100,
            log: '你没有去取碑，只在岸边坐下，与河心的白发人对视良久。他最终点头，抬手一挥，你眼前的河水骤然断流。你出定时，心境已截然不同。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [6, 10] },
              { type: 'buff', id: 'buff_cult', duration: 1800, mult: 2.0 },
              { type: 'flag', key: 'time_river_dialogue', value: true }
            ]
          }
        ]
      },
      {
        text: '收心退出坐忘',
        hint: '不入时间长河',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你强行收摄心神，长河在眼前碎成万点光尘。你睁开眼，洞府里的那盏灯，已经快烧到底了。',
            effects: [
              { type: 'hp', amount: [-200, -80] },
              { type: 'attr', attr: 'daoHeart', amount: [2, 4] }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_ascend_gate',
    title: '飞升之门',
    desc: '九天之上，云海尽头，一道门无声地立着。门框由你说不出名字的白玉铸成，门内没有光，也没有暗，只有一种极静的、仿佛能吞下一切的东西。你站在门前，忽然听不见自己的心跳，也听不见风。身后是你走过的万水千山，是故人、是仇敌、是那些来不及说的话。门前的地上，散落着几件旧物，都是历代飞升者最后抛下的东西。你抬手，门便轻轻震动了一下，像是在等你。',
    tier: 'rare',
    minRealm: 24,
    maxRealm: 25,
    weight: 1,
    once: true,
    choices: [
      {
        text: '推门而入',
        hint: '超脱此界，前路未知',
        req: { attr: 'daoHeart', min: 80 },
        outcomes: [
          {
            weight: 100,
            log: '你最后回望了一眼身后的天地，推门而入。门在你背后合拢，没有声音。此界之中，从此少了一个人，又仿佛从未少过。',
            effects: [
              { type: 'cult', amount: [10000, 20000] },
              { type: 'attr', attr: 'daoHeart', amount: [10, 15] },
              { type: 'flag', key: 'ascended', value: true }
            ]
          }
        ]
      },
      {
        text: '拾旧物而返',
        hint: '暂不飞升，厚积待时',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你弯腰拾起前人遗落的一枚玉佩，退后三步。门缓缓隐去。你知道自己还会再来，只是不是今日。',
            effects: [
              { type: 'equip', pool: 'shen', amount: 1 },
              { type: 'attr', attr: 'daoHeart', amount: [4, 6] },
              { type: 'lifespan', amount: [100, 300] }
            ]
          }
        ]
      },
      {
        text: '转身下山',
        hint: '此界尚有牵挂',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你没有推门。你想起山下还有一盏等你的灯，便转身踏上归途。云海翻涌，那道门在你身后一寸寸消散，像是懂了。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [6, 9] },
              { type: 'cult', amount: [2000, 4000] },
              { type: 'flag', key: 'refused_ascension', value: true }
            ]
          }
        ]
      }
    ]
  },

  {
    id: 'enc_spirit_root_awaken',
    title: '灵根蜕变',
    desc: '一场大病，你烧得人事不省，梦中有人将手按在你丹田之上，说了句：这条根，本不该是这般模样。醒来时，你摸到丹田里那点微弱的灵光竟变得清亮了许多，周身经脉像是被人细细梳理过一遍。窗外草木无风自动，齐刷刷朝着你所在的方向低头。你忽然想起幼时测灵根，管事的摇了摇头，说你这资质，是修不出头的。可此刻丹田里的那点光，正一下一下地跳，跳得比心跳还稳。',
    tier: 'rare',
    minRealm: 3,
    maxRealm: null,
    weight: 2,
    once: true,
    choices: [
      {
        text: '顺其自然',
        hint: '根基重塑，稳中求进',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你没有刻意引导，只由着那股暖流自行流转。数日后，你发觉修行比从前顺遂了不止一倍，连吐纳都轻松许多。',
            effects: [
              { type: 'attr', attr: 'comprehension', amount: [3, 5] },
              { type: 'attr', attr: 'spiritSense', amount: [2, 4] },
              { type: 'buff', id: 'buff_cult', duration: 1800, mult: 1.7 }
            ]
          }
        ]
      },
      {
        text: '强行引气冲脉',
        hint: '激进，收益大风险高',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你以那股暖流猛冲闭塞的经脉，痛得几乎昏死。三个时辰后，你吐出一口黑血，丹田竟开阔如渊。',
            effects: [
              { type: 'hp', amount: [-300, -120] },
              { type: 'cult', amount: [800, 1600] },
              { type: 'attr', attr: 'comprehension', amount: [2, 4] }
            ]
          }
        ]
      },
      {
        text: '封住异象',
        hint: '藏拙，低调行事',
        req: null,
        outcomes: [
          {
            weight: 100,
            log: '你收敛气机，压下异象。此后你依旧是旁人眼中那个资质平平的修士，只有你自己知道，丹田里的光有多亮。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [3, 5] },
              { type: 'attr', attr: 'luck', amount: [2, 3] },
              { type: 'flag', key: 'spirit_root_hidden', value: true }
            ]
          }
        ]
      }
    ]
  }
  ,
  // ==================== V3.0 立场抉择 ====================
  // 全局唯一一次。这是"立场"系统唯一的入魔入口，所以文案必须把代价写清楚，
  // 玩家的选择不能是在不知情的情况下按下去的。
  {
    id: 'enc_demonic_temptation',
    title: '心魔之约',
    desc: '闭关至第九日，识海深处浮起一道影子。它与你一般模样，只是眉眼间没有半分犹豫。"你循规蹈矩修了这些年，"它说，"可曾见过哪个守规矩的，先一步登了天？"它摊开手，掌心是一枚漆黑的道种，正在缓慢跳动，像一颗心脏。',
    tier: 'rare',
    minRealm: 9,
    maxRealm: null,
    weight: 2,
    once: true,
    choices: [
      {
        text: '接过道种',
        hint: null,
        req: null,
        outcomes: [
          {
            weight: 1,
            log: '你握住了那枚道种。它在你掌心融化的瞬间，你听见自己心里有什么东西，轻轻地断了。此后修行一日千里，但天劫会更难，坊市会坐地起价，正道宗门永不再收你。你已无法回头。',
            effects: [
              { type: 'stance', value: 'xiedao' },
              { type: 'attr', attr: 'daoHeart', amount: [-12, -8] }
            ]
          }
        ]
      },
      {
        text: '斩灭心魔',
        hint: null,
        req: null,
        outcomes: [
          {
            weight: 65,
            log: '你一剑斩落。影子笑了笑，散作飞灰——但你知道，它只是退回去了。道心经此一炼，反倒更坚。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [5, 9] },
              { type: 'cult', amount: [400, 1200] }
            ]
          },
          {
            weight: 35,
            log: '你出手的刹那犹豫了一瞬。那一瞬被它抓住了。你虽斩灭了心魔，识海却被反噬得不轻。',
            effects: [
              { type: 'attr', attr: 'daoHeart', amount: [1, 3] },
              { type: 'hp', amount: [-120, -60] }
            ]
          }
        ]
      }
    ]
  }

  ,
  ...COMPANION_ENCOUNTERS
];
