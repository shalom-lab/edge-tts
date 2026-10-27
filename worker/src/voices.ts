/** Curated voices matching frontend — only Edge TTS readaloud live voices (2026-10). */

export type VoiceCategory =
  | 'zh-mainland'
  | 'zh-dialect'
  | 'zh-other'
  | 'en'
  | 'ja-ko'
  | 'other';

export interface VoiceItem {
  shortName: string;
  name: string;
  locale: string;
  gender: string;
  friendlyName: string;
  label: string;
  desc: string;
  tags: string[];
  featured: boolean;
  category: VoiceCategory;
  suggestedCodec: string;
}

const VOICE_META: Record<
  string,
  {
 label: string; desc: string; tags: string[]; featured?: boolean }
> = {
  'zh-CN-XiaoxiaoNeural': {
    label: '晓晓',
    desc: '温柔亲切，全能通用女声（最受欢迎）',
    tags: ['爆款推荐', '全能女声', '情感有声'],
    featured: true,
  },
  'zh-CN-YunxiNeural': {
    label: '云希',
    desc: '活力沉稳，影视解说男神（短视频爆款）',
    tags: ['爆款解说', '热门男声', '短视频'],
    featured: true,
  },
  'zh-CN-YunjianNeural': {
    label: '云健',
    desc: '磁性浑厚，影视剧情与纪录片',
    tags: ['磁性男声', '影视解说', '纪录片'],
    featured: true,
  },
  'zh-CN-XiaoyiNeural': {
    label: '晓伊',
    desc: '知性从容，广播散文与小说叙事',
    tags: ['知性女声', '广播电台', '长文有声'],
    featured: true,
  },
  'zh-CN-YunyangNeural': {
    label: '云扬',
    desc: '专业标准，新闻资讯与政企播报',
    tags: ['新闻播音', '正气男声', '政企宣传'],
    featured: true,
  },
  'zh-CN-YunxiaNeural': {
    label: '云夏',
    desc: '阳光朝气，少年男孩与童趣科普',
    tags: ['阳光少年', '科普读物'],
    featured: true,
  },
  'zh-CN-liaoning-XiaobeiNeural': {
    label: '晓北 (东北话)',
    desc: '辽宁口音，诙谐幽默接地气',
    tags: ['东北方言', '搞笑段子', '特色方言'],
    featured: true,
  },
  'zh-CN-shaanxi-XiaoniNeural': {
    label: '晓妮 (陕西话)',
    desc: '秦腔陕味，淳朴豪爽乡土特色',
    tags: ['陕西方言', '特色方言'],
    featured: true,
  },
  'zh-HK-HiuMaanNeural': {
    label: '晓曼 (粤语)',
    desc: '标准粤语女声，清晰纯正自然',
    tags: ['粤语女声', '香港话'],
    featured: true,
  },
  'zh-HK-WanLungNeural': {
    label: '云龙 (粤语)',
    desc: '标准粤语男声，稳重干练',
    tags: ['粤语男声', '香港话'],
    featured: true,
  },
  'zh-HK-HiuGaaiNeural': {
    label: '晓佳 (粤语)',
    desc: '地道港风女声，电台风格',
    tags: ['粤语女声', '港风电台'],
    featured: false,
  },
  'zh-TW-HsiaoChenNeural': {
    label: '晓臻 (台湾腔)',
    desc: '台式国语女声，温柔娇俏甜美',
    tags: ['台湾国语', '温柔甜美'],
    featured: true,
  },
  'zh-TW-HsiaoYuNeural': {
    label: '晓雨 (台湾腔)',
    desc: '清新知性台普，自然亲切',
    tags: ['台湾国语', '清新自然'],
    featured: false,
  },
  'zh-TW-YunJheNeural': {
    label: '云哲 (台湾腔)',
    desc: '台湾国语男声，阳光文艺青年',
    tags: ['台湾国语', '阳光男声'],
    featured: true,
  },
  'en-US-JennyNeural': {
    label: 'Jenny (美音)',
    desc: '自然流畅全能美音女声',
    tags: ['美音推荐', '自然英语'],
    featured: true,
  },
  'en-US-GuyNeural': {
    label: 'Guy (美音)',
    desc: '磁性稳重美音男声',
    tags: ['美音男声', '视频配音'],
    featured: true,
  },
  'en-US-AriaNeural': {
    label: 'Aria (美音)',
    desc: '清爽富有表现力美音女声',
    tags: ['美音女声', '表现力'],
    featured: true,
  },
  'en-GB-SoniaNeural': {
    label: 'Sonia (英音)',
    desc: '典雅纯正英式发音女声',
    tags: ['英音纯正', 'BBC风格'],
    featured: true,
  },
  'en-GB-RyanNeural': {
    label: 'Ryan (英音)',
    desc: '英伦绅士温和男声',
    tags: ['英音男声', '绅士英音'],
    featured: true,
  },
  'ja-JP-NanamiNeural': {
    label: '七海 (Nanami 日语)',
    desc: '甜美自然清澈日语女声',
    tags: ['日语女声', 'ACG动漫'],
    featured: true,
  },
  'ja-JP-KeitaNeural': {
    label: '圭太 (Keita 日语)',
    desc: '阳光年轻清爽日语男声',
    tags: ['日语男声'],
    featured: true,
  },
  'ko-KR-SunHiNeural': {
    label: '善熙 (Sun-Hi 韩语)',
    desc: '温柔动人韩剧风格女声',
    tags: ['韩语女声', '韩剧范'],
    featured: true,
  },
};

const MALE_VOICES = new Set([
  'zh-CN-YunxiNeural',
  'zh-CN-YunjianNeural',
  'zh-CN-YunyangNeural',
  'zh-CN-YunxiaNeural',
  'zh-HK-WanLungNeural',
  'zh-TW-YunJheNeural',
  'en-US-GuyNeural',
  'en-GB-RyanNeural',
  'ja-JP-KeitaNeural',
]);

const CATEGORY_ORDER: Record<string, number> = {
  'zh-mainland': 1,
  'zh-dialect': 2,
  en: 3,
  'ja-ko': 4,
  other: 5,
};

function localeFromShortName(shortName: string): string {
  return shortName.replace(/-[A-Z][A-Za-z0-9]*Neural$/, '');
}

function categorizeVoice(shortName: string, locale: string): VoiceCategory {
  if (locale.startsWith('zh-CN')) {
    if (
      shortName.includes('liaoning') ||
      shortName.includes('shaanxi') ||
      shortName.includes('sichuan')
    ) {
      return 'zh-dialect';
    }
    return 'zh-mainland';
  }
  if (locale.startsWith('zh-HK') || locale.startsWith('zh-TW')) {
    return 'zh-dialect';
  }
  if (locale.startsWith('en-')) return 'en';
  if (locale.startsWith('ja-') || locale.startsWith('ko-')) return 'ja-ko';
  return 'other';
}

function processVoice(shortName: string): VoiceItem {
  const locale = localeFromShortName(shortName);
  const gender = MALE_VOICES.has(shortName) ? 'Male' : 'Female';
  const meta = VOICE_META[shortName];
  const category = categorizeVoice(shortName, locale);
  const label = meta?.label ?? shortName;
  const namePart = shortName.split('-').pop()?.replace(/Neural$/, '') ?? shortName;

  return {
    shortName,
    name: `Microsoft Server Speech Text to Speech Voice (${locale}, ${namePart})`,
    locale,
    gender,
    friendlyName: `Microsoft ${label} Online (Natural) - ${locale} (${gender})`,
    label,
    desc: meta?.desc ?? `${locale} ${gender}`,
    tags: meta?.tags ?? [locale, gender === 'Female' ? '女声' : '男声'],
    featured: !!meta?.featured,
    category,
    suggestedCodec: 'audio-24khz-48kbitrate-mono-mp3',
  };
}

export function getCuratedVoices(): VoiceItem[] {
  return Object.keys(VOICE_META)
    .map(processVoice)
    .sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      const orderA = CATEGORY_ORDER[a.category] || 99;
      const orderB = CATEGORY_ORDER[b.category] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.shortName.localeCompare(b.shortName);
    });
}
