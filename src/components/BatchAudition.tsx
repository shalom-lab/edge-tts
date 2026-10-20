import React, { useState, useRef } from 'react';
import { ListMusic, Play, Pause, Download, Volume2, Sparkles, Check, AlertCircle } from 'lucide-react';
import { VoiceItem, ProsodyConfig } from '../types';
import { PRESET_SAMPLES } from '../data/presets';
import { synthesizeAudioApi } from '../services/ttsApi';

interface BatchAuditionProps {
  voices: VoiceItem[];
}

interface BatchItem {
  voice: VoiceItem;
  status: 'idle' | 'loading' | 'ready' | 'error';
  audioUrl?: string;
  bytes?: number;
  durationMs?: number;
  error?: string;
}

export const BatchAudition: React.FC<BatchAuditionProps> = ({ voices }) => {
  const [text, setText] = useState<string>(
    '天地之大，黎元为先。愿以寸心寄华夏，且将岁月赠山河。'
  );

  // Default selected voices for audition
  const defaultShortNames = [
    'zh-CN-XiaoxiaoNeural',
    'zh-CN-YunxiNeural',
    'zh-CN-YunjianNeural',
    'zh-CN-XiaohanNeural',
    'zh-CN-liaoning-XiaobeiNeural',
    'zh-TW-HsiaoChenNeural',
  ];

  const [selectedShortNames, setSelectedShortNames] = useState<string[]>(defaultShortNames);
  const [items, setItems] = useState<Record<string, BatchItem>>({});
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [currentlyPlayingVoice, setCurrentlyPlayingVoice] = useState<string | null>(null);
  const [isAutoPlayNext, setIsAutoPlayNext] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selectedVoicesList = voices.filter((v) => selectedShortNames.includes(v.shortName));

  const toggleSelectVoice = (shortName: string) => {
    if (selectedShortNames.includes(shortName)) {
      if (selectedShortNames.length <= 1) return; // Keep at least one
      setSelectedShortNames(selectedShortNames.filter((s) => s !== shortName));
    } else {
      setSelectedShortNames([...selectedShortNames, shortName]);
    }
  };

  const handleSelectGroup = (type: 'popular' | 'female' | 'male' | 'dialect') => {
    if (type === 'popular') {
      setSelectedShortNames([
        'zh-CN-XiaoxiaoNeural',
        'zh-CN-YunxiNeural',
        'zh-CN-YunjianNeural',
        'zh-CN-XiaohanNeural',
      ]);
    } else if (type === 'female') {
      const females = voices
        .filter((v) => v.locale.startsWith('zh-CN') && v.gender === 'Female')
        .slice(0, 6)
        .map((v) => v.shortName);
      setSelectedShortNames(females);
    } else if (type === 'male') {
      const males = voices
        .filter((v) => v.locale.startsWith('zh-CN') && v.gender === 'Male')
        .slice(0, 6)
        .map((v) => v.shortName);
      setSelectedShortNames(males);
    } else if (type === 'dialect') {
      const dialects = voices
        .filter((v) => v.category === 'zh-dialect')
        .slice(0, 6)
        .map((v) => v.shortName);
      setSelectedShortNames(dialects);
    }
  };

  const synthesizeSingle = async (voice: VoiceItem) => {
    const config: ProsodyConfig = {
      rate: 0,
      pitch: 0,
      volume: 0,
      format: 'audio-24khz-96kbitrate-mono-mp3',
    };

    setItems((prev) => ({
      ...prev,
      [voice.shortName]: { voice, status: 'loading' },
    }));

    try {
      const res = await synthesizeAudioApi(text, voice.shortName, config);
      setItems((prev) => ({
        ...prev,
        [voice.shortName]: {
          voice,
          status: 'ready',
          audioUrl: res.blobUrl,
          bytes: res.bytes,
          durationMs: res.durationMs,
        },
      }));
      return res.blobUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setItems((prev) => ({
        ...prev,
        [voice.shortName]: { voice, status: 'error', error: msg },
      }));
      return null;
    }
  };

  const handleBatchSynthesize = async () => {
    if (!text.trim()) {
      setErrorMessage('请输入批量试听的测试文本');
      return;
    }
    setErrorMessage(null);
    setIsBatchGenerating(true);

    for (const voice of selectedVoicesList) {
      await synthesizeSingle(voice);
    }

    setIsBatchGenerating(false);
  };

  const playVoiceAudio = (shortName: string) => {
    const item = items[shortName];
    if (!item?.audioUrl) {
      const voice = voices.find((v) => v.shortName === shortName);
      if (voice) {
        synthesizeSingle(voice).then((url) => {
          if (url && audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.play();
            setCurrentlyPlayingVoice(shortName);
          }
        });
      }
      return;
    }

    if (currentlyPlayingVoice === shortName) {
      audioRef.current?.pause();
      setCurrentlyPlayingVoice(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = item.audioUrl;
        audioRef.current.play();
        setCurrentlyPlayingVoice(shortName);
      }
    }
  };

  const handleAudioEnded = () => {
    if (!isAutoPlayNext || !currentlyPlayingVoice) {
      setCurrentlyPlayingVoice(null);
      return;
    }

    // Play next in selected order
    const currentIndex = selectedVoicesList.findIndex(
      (v) => v.shortName === currentlyPlayingVoice
    );
    if (currentIndex >= 0 && currentIndex < selectedVoicesList.length - 1) {
      const nextVoice = selectedVoicesList[currentIndex + 1];
      playVoiceAudio(nextVoice.shortName);
    } else {
      setCurrentlyPlayingVoice(null);
    }
  };

  return (
    <div className="space-y-6">
      <audio ref={audioRef} onEnded={handleAudioEnded} />

      {/* Control Banner */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <ListMusic className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">
              批量音色点播试听
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                const sample = PRESET_SAMPLES[Math.floor(Math.random() * PRESET_SAMPLES.length)];
                if (sample) setText(sample.text);
              }}
              className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>更换测试句子</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          选择多个候选音色，一键用相同文案批量合成，支持连续顺播试听，快速锁定最理想的配音角色。
        </p>

        {/* Text Area */}
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入要批量试听的一句话..."
          className="w-full p-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
        />

        {/* Preset Group Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-600 font-medium">快捷音色组:</span>
            <button
              onClick={() => handleSelectGroup('popular')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
            >
              经典爆款 4 人
            </button>
            <button
              onClick={() => handleSelectGroup('female')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
            >
              普通话女声组
            </button>
            <button
              onClick={() => handleSelectGroup('male')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
            >
              普通话男声组
            </button>
            <button
              onClick={() => handleSelectGroup('dialect')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
            >
              方言特色组
            </button>
          </div>

          <label className="flex items-center space-x-1.5 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isAutoPlayNext}
              onChange={(e) => setIsAutoPlayNext(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>连续播放下一个音色</span>
          </label>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex items-center space-x-3">
          <button
            onClick={handleBatchSynthesize}
            disabled={isBatchGenerating}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 shadow-2xs disabled:bg-blue-400"
          >
            {isBatchGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>批量合成中...</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                <span>一键合成所选 {selectedVoicesList.length} 款音色</span>
              </>
            )}
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Voice Selection Chips */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
        <div className="text-xs font-medium text-slate-700 mb-2.5">
          点击勾选/取消参与试听的音色（当前已选 {selectedShortNames.length} 个）：
        </div>
        <div className="flex flex-wrap gap-2">
          {voices
            .filter((v) => v.locale.startsWith('zh-') || v.featured)
            .map((v) => {
              const isChecked = selectedShortNames.includes(v.shortName);
              return (
                <button
                  key={v.shortName}
                  onClick={() => toggleSelectVoice(v.shortName)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
                    isChecked
                      ? 'bg-blue-50 text-blue-800 border border-blue-300'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-2xs ${
                      isChecked
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span>{v.label}</span>
                  <span className="text-2xs text-slate-600">
                    ({v.gender === 'Female' ? '女' : '男'})
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Audition Cards List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">
          试听列表与对比
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {selectedVoicesList.map((voice) => {
            const item = items[voice.shortName];
            const isPlaying = currentlyPlayingVoice === voice.shortName;
            const isLoading = item?.status === 'loading';
            const isReady = item?.status === 'ready' && !!item?.audioUrl;

            return (
              <div
                key={voice.shortName}
                className={`p-4 rounded-xl border transition-all ${
                  isPlaying
                    ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-slate-800 text-sm">
                        {voice.label}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-2xs font-medium ${
                          voice.gender === 'Female'
                            ? 'bg-pink-50 text-pink-700 border border-pink-200/60'
                            : 'bg-sky-50 text-sky-700 border border-sky-200/60'
                        }`}
                      >
                        {voice.gender === 'Female' ? '女声' : '男声'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                      {voice.desc}
                    </p>
                  </div>
                </div>

                {/* Status & Player Controls */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => playVoiceAudio(voice.shortName)}
                      disabled={isLoading}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                        isPlaying
                          ? 'bg-blue-600 text-white'
                          : isReady
                          ? 'bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                      title={isPlaying ? '暂停' : isReady ? '播放' : '点击合成并播放'}
                    >
                      {isLoading ? (
                        <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                      ) : isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>

                    <div className="text-xs">
                      {isPlaying && (
                        <span className="text-blue-600 font-medium animate-pulse">
                          正在播放...
                        </span>
                      )}
                      {!isPlaying && isReady && (
                        <span className="text-emerald-700 font-medium">
                          就绪 ({((item?.bytes || 0) / 1024).toFixed(1)} KB)
                        </span>
                      )}
                      {!isPlaying && !isReady && !isLoading && (
                        <span className="text-slate-600">点击合成试听</span>
                      )}
                      {isLoading && (
                        <span className="text-slate-600">正在生成...</span>
                      )}
                    </div>
                  </div>

                  {isReady && item.audioUrl && (
                    <a
                      href={item.audioUrl}
                      download={`EdgeTTS_${voice.label}.mp3`}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="下载该音色音频"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
