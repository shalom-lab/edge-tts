import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { MsEdgeTTS, OUTPUT_FORMAT, Voice } from 'msedge-tts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chinese voice label mapping
const VOICE_META: Record<string, { label: string; desc: string; tags: string[]; featured?: boolean }> = {
  'zh-CN-XiaoxiaoNeural': { label: '晓晓', desc: '温柔亲切，全能通用女声（最受欢迎）', tags: ['爆款推荐', '全能女声', '情感有声'], featured: true },
  'zh-CN-YunxiNeural': { label: '云希', desc: '活力沉稳，影视解说男神（短视频爆款）', tags: ['爆款解说', '热门男声', '短视频'], featured: true },
  'zh-CN-YunjianNeural': { label: '云健', desc: '磁性浑厚，影视剧情与纪录片', tags: ['磁性男声', '影视解说', '纪录片'], featured: true },
  'zh-CN-XiaoyiNeural': { label: '晓伊', desc: '知性从容，广播散文与小说叙事', tags: ['知性女声', '广播电台', '长文有声'], featured: true },
  'zh-CN-YunyangNeural': { label: '云扬', desc: '专业标准，新闻资讯与政企播报', tags: ['新闻播音', '正气男声', '政企宣传'], featured: true },
  'zh-CN-XiaochenNeural': { label: '晓辰', desc: '活泼清新，日常对话与助手播报', tags: ['清新女声', '日常对话'], featured: false },
  'zh-CN-XiaohanNeural': { label: '晓涵', desc: '温婉细腻，情感电台与治愈心语', tags: ['细腻情感', '治愈女声'], featured: true },
  'zh-CN-XiaomengNeural': { label: '晓梦', desc: '柔和甜美，有声书与童话故事', tags: ['故事有声', '柔美女声'], featured: false },
  'zh-CN-XiaomoNeural': { label: '晓墨', desc: '文艺清澈，散文诗歌与抒情独白', tags: ['文艺女声', '诗歌独白'], featured: true },
  'zh-CN-XiaoqiuNeural': { label: '晓秋', desc: '端庄稳重大气，晚间播音主持人', tags: ['端庄大气', '播音主持'], featured: false },
  'zh-CN-XiaoruiNeural': { label: '晓睿', desc: '成熟干练，商业资讯与严肃读物', tags: ['职场干练', '财经商务'], featured: false },
  'zh-CN-XiaoshuangNeural': { label: '晓双', desc: '软萌可爱，幼儿童话与卡通角色', tags: ['软萌童声', '儿童故事', '动漫配音'], featured: true },
  'zh-CN-XiaoxuanNeural': { label: '晓萱', desc: '知心开朗，生活杂谈与播客对话', tags: ['活泼亲和', '生活娱乐'], featured: false },
  'zh-CN-XiaoyanNeural': { label: '晓颜', desc: '专业耐听，标准智能客服与导航', tags: ['智能客服', '专业导航'], featured: false },
  'zh-CN-XiaoyouNeural': { label: '晓悠', desc: '轻快灵动，二次元与青春少女', tags: ['元气少女', '轻快灵动'], featured: true },
  'zh-CN-XiaozhenNeural': { label: '晓甄', desc: '治愈知性，舒缓睡前故事与随笔', tags: ['治愈温暖', '睡前有声'], featured: false },
  'zh-CN-YunfengNeural': { label: '云枫', desc: '沧桑浑厚，历史传奇与宏大史诗', tags: ['沧桑深沉', '历史纪录片'], featured: false },
  'zh-CN-YunhaoNeural': { label: '云皓', desc: '激昂有力，广告促销与热血旁白', tags: ['激情广告', '热血男声'], featured: true },
  'zh-CN-YunxiaNeural': { label: '云夏', desc: '阳光朝气，少年男孩与童趣科普', tags: ['阳光少年', '科普读物'], featured: false },
  'zh-CN-YunyeNeural': { label: '云野', desc: '沉浸叙事，悬疑探案与悬疑解说', tags: ['悬疑故事', '沉浸叙事'], featured: true },
  'zh-CN-YunzeNeural': { label: '云泽', desc: '从容醇厚，评书相声与纪实文学', tags: ['评书纪实', '浑厚男声'], featured: false },
  'zh-CN-liaoning-XiaobeiNeural': { label: '晓北 (东北话)', desc: '辽宁口音，诙谐幽默接地气', tags: ['东北方言', '搞笑段子', '特色方言'], featured: true },
  'zh-CN-shaanxi-XiaoniNeural': { label: '晓妮 (陕西话)', desc: '秦腔陕味，淳朴豪爽乡土特色', tags: ['陕西方言', '特色方言'], featured: true },
  'zh-CN-sichuan-YunxiNeural': { label: '云希 (四川话)', desc: '川渝口音，风趣幽默巴适得很', tags: ['四川方言', '特色方言', '川普'], featured: true },
  'zh-HK-HiuMaanNeural': { label: '晓曼 (粤语)', desc: '标准粤语女声，清晰纯正自然', tags: ['粤语女声', '香港话'], featured: true },
  'zh-HK-WanLungNeural': { label: '云龙 (粤语)', desc: '标准粤语男声，稳重干练', tags: ['粤语男声', '香港话'], featured: true },
  'zh-HK-HiuGaaiNeural': { label: '晓佳 (粤语)', desc: '地道港风女声，电台风格', tags: ['粤语女声', '港风电台'], featured: false },
  'zh-TW-HsiaoChenNeural': { label: '晓臻 (台湾腔)', desc: '台式国语女声，温柔娇俏甜美', tags: ['台湾国语', '温柔甜美'], featured: true },
  'zh-TW-HsiaoYuNeural': { label: '晓雨 (台湾腔)', desc: '清新知性台普，自然亲切', tags: ['台湾国语', '清新自然'], featured: false },
  'zh-TW-YunJheNeural': { label: '云哲 (台湾腔)', desc: '台湾国语男声，阳光文艺青年', tags: ['台湾国语', '阳光男声'], featured: true },
  'en-US-JennyNeural': { label: 'Jenny (美音)', desc: '自然流畅全能美音女声', tags: ['美音推荐', '自然英语'], featured: true },
  'en-US-GuyNeural': { label: 'Guy (美音)', desc: '磁性稳重美音男声', tags: ['美音男声', '视频配音'], featured: true },
  'en-US-AriaNeural': { label: 'Aria (美音)', desc: '清爽富有表现力美音女声', tags: ['美音女声', '表现力'], featured: true },
  'en-GB-SoniaNeural': { label: 'Sonia (英音)', desc: '典雅纯正英式发音女声', tags: ['英音纯正', 'BBC风格'], featured: true },
  'en-GB-RyanNeural': { label: 'Ryan (英音)', desc: '英伦绅士温和男声', tags: ['英音男声', '绅士英音'], featured: true },
  'ja-JP-NanamiNeural': { label: '七海 (Nanami 日语)', desc: '甜美自然清澈日语女声', tags: ['日语女声', 'ACG动漫'], featured: true },
  'ja-JP-KeitaNeural': { label: '圭太 (Keita 日语)', desc: '阳光年轻清爽日语男声', tags: ['日语男声'], featured: true },
  'ko-KR-SunHiNeural': { label: '善熙 (Sun-Hi 韩语)', desc: '温柔动人韩剧风格女声', tags: ['韩语女声', '韩剧范'], featured: true },
};

export interface ProcessedVoice {
  shortName: string;
  name: string;
  locale: string;
  gender: string;
  friendlyName: string;
  label: string;
  desc: string;
  tags: string[];
  featured: boolean;
  category: 'zh-mainland' | 'zh-dialect' | 'zh-other' | 'en' | 'ja-ko' | 'other';
  suggestedCodec: string;
}

let cachedVoices: ProcessedVoice[] | null = null;
let lastVoicesFetch = 0;

async function getProcessedVoices(): Promise<ProcessedVoice[]> {
  const now = Date.now();
  if (cachedVoices && now - lastVoicesFetch < 1000 * 60 * 60) {
    return cachedVoices;
  }

  try {
    const tts = new MsEdgeTTS({ enableLogger: false });
    const rawVoices: Voice[] = await tts.getVoices();

    const processed: ProcessedVoice[] = rawVoices.map((v) => {
      const shortName = v.ShortName;
      const locale = v.Locale;
      const meta = VOICE_META[shortName];

      let category: ProcessedVoice['category'] = 'other';
      if (locale.startsWith('zh-CN')) {
        if (shortName.includes('liaoning') || shortName.includes('shaanxi') || shortName.includes('sichuan')) {
          category = 'zh-dialect';
        } else {
          category = 'zh-mainland';
        }
      } else if (locale.startsWith('zh-HK') || locale.startsWith('zh-TW')) {
        category = 'zh-dialect';
      } else if (locale.startsWith('en-')) {
        category = 'en';
      } else if (locale.startsWith('ja-') || locale.startsWith('ko-')) {
        category = 'ja-ko';
      }

      const label = meta ? meta.label : (v.FriendlyName ? v.FriendlyName.replace(/^Microsoft /, '').replace(/ Online \(Natural\)/, '') : shortName);
      const desc = meta ? meta.desc : `${locale} ${v.Gender}`;
      const tags = meta ? meta.tags : [locale, v.Gender === 'Female' ? '女声' : '男声'];
      const featured = meta ? !!meta.featured : false;

      return {
        shortName,
        name: v.Name,
        locale,
        gender: v.Gender,
        friendlyName: v.FriendlyName,
        label,
        desc,
        tags,
        featured,
        category,
        suggestedCodec: v.SuggestedCodec,
      };
    });

    // Sort: Featured first, then zh-mainland, zh-dialect, en, ja-ko, others
    const categoryOrder: Record<string, number> = {
      'zh-mainland': 1,
      'zh-dialect': 2,
      'en': 3,
      'ja-ko': 4,
      'other': 5,
    };

    processed.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      const orderA = categoryOrder[a.category] || 99;
      const orderB = categoryOrder[b.category] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.shortName.localeCompare(b.shortName);
    });

    cachedVoices = processed;
    lastVoicesFetch = now;
    return processed;
  } catch (err) {
    console.error('Error fetching Edge TTS voices:', err);
    if (cachedVoices) return cachedVoices;
    throw err;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API 1: Get voices list
  app.get('/api/voices', async (_req, res) => {
    try {
      const voices = await getProcessedVoices();
      res.json({ success: true, count: voices.length, voices });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // API 2: Synthesize speech
  app.post('/api/synthesize', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        text,
        voice = 'zh-CN-XiaoxiaoNeural',
        rate = '+0%',
        pitch = '+0Hz',
        volume = '+0%',
        format = 'audio-24khz-96kbitrate-mono-mp3',
        rawSSML,
      } = req.body;

      if (!text && !rawSSML) {
        return res.status(400).json({ success: false, error: '缺少合成文本内容 (text)' });
      }

      const tts = new MsEdgeTTS({ enableLogger: false, connectionTimeoutMs: 15000 });

      // Determine output format
      let outputFormat = OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3;
      if (format === 'audio-24khz-48kbitrate-mono-mp3') {
        outputFormat = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
      } else if (format === 'webm-24khz-16bit-mono-opus') {
        outputFormat = OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS;
      }

      await tts.setMetadata(voice, outputFormat);

      let audioStream;
      if (rawSSML && typeof rawSSML === 'string' && rawSSML.trim().startsWith('<speak')) {
        const streamResult = tts.rawToStream(rawSSML);
        audioStream = streamResult.audioStream;
      } else {
        const prosodyOptions = {
          rate: typeof rate === 'number' ? (rate >= 0 ? `+${rate}%` : `${rate}%`) : rate,
          pitch: typeof pitch === 'number' ? (pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`) : pitch,
          volume: typeof volume === 'number' ? (volume >= 0 ? `+${volume}%` : `${volume}%`) : volume,
        };
        const streamResult = tts.toStream(text, prosodyOptions);
        audioStream = streamResult.audioStream;
      }

      const chunks: Buffer[] = [];
      let isEnded = false;

      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      audioStream.on('end', () => {
        if (isEnded) return;
        isEnded = true;
        const totalBuffer = Buffer.concat(chunks);
        const durationMs = Date.now() - startTime;

        const isWebm = format.includes('webm');
        const contentType = isWebm ? 'audio/webm' : 'audio/mpeg';
        const fileExt = isWebm ? 'webm' : 'mp3';
        const sanitizedVoice = voice.replace(/[^a-zA-Z0-9_-]/g, '');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', totalBuffer.length.toString());
        res.setHeader('X-Synthesis-Duration-Ms', durationMs.toString());
        res.setHeader('X-Audio-Bytes', totalBuffer.length.toString());
        res.setHeader('Content-Disposition', `inline; filename="edge_tts_${sanitizedVoice}_${Date.now()}.${fileExt}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        res.send(totalBuffer);
      });

      audioStream.on('error', (streamErr) => {
        if (isEnded) return;
        isEnded = true;
        console.error('Audio stream error during synthesis:', streamErr);
        res.status(500).json({ success: false, error: '音频流传输失败: ' + String(streamErr) });
      });
    } catch (err: unknown) {
      console.error('Synthesis request error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: '语音合成失败: ' + msg });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = process.env.PORT || 3000;
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Edge TTS App running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
