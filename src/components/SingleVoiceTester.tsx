import React, { useState } from 'react';
import {
  Volume2,
  Sparkles,
  RotateCcw,
  Code2,
  ChevronRight,
  SlidersHorizontal,
  Flame,
  Check,
  FileText,
  AlertCircle
} from 'lucide-react';
import { VoiceItem, ProsodyConfig, SynthHistoryItem } from '../types';
import { PRESET_SAMPLES } from '../data/presets';
import { AudioPlayer } from './AudioPlayer';
import { synthesizeAudioApi, generateSsml } from '../services/ttsApi';

interface SingleVoiceTesterProps {
  voices: VoiceItem[];
  selectedVoice: VoiceItem | null;
  onOpenVoiceModal: () => void;
  onSelectVoice: (shortName: string) => void;
  onAddHistory: (item: SynthHistoryItem, audioBlob: Blob) => void;
}

export const SingleVoiceTester: React.FC<SingleVoiceTesterProps> = ({
  voices,
  selectedVoice,
  onOpenVoiceModal,
  onSelectVoice,
  onAddHistory,
}) => {
  const [text, setText] = useState<string>(
    '你好！我是微软 Edge 神经网络超自然音色。我能以极其生动流畅、情感丰满的声调为您朗读任何文案，快来调整语速和音调体验吧！'
  );

  const [config, setConfig] = useState<ProsodyConfig>({
    rate: 0,
    pitch: 0,
    volume: 0,
    format: 'audio-24khz-96kbitrate-mono-mp3',
  });

  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioMeta, setAudioMeta] = useState<{ durationMs: number; bytes: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // SSML view mode
  const [showSsml, setShowSsml] = useState(false);
  const [isCustomSsml, setIsCustomSsml] = useState(false);
  const [customSsmlText, setCustomSsmlText] = useState('');

  // Quick switch chips (popular voices)
  const popularVoiceCodes = [
    'zh-CN-XiaoxiaoNeural',
    'zh-CN-YunxiNeural',
    'zh-CN-YunjianNeural',
    'zh-CN-XiaoyiNeural',
    'zh-CN-liaoning-XiaobeiNeural',
    'zh-CN-shaanxi-XiaoniNeural',
    'zh-TW-HsiaoChenNeural',
    'en-US-JennyNeural',
  ];

  const popularVoices = voices.filter((v) => popularVoiceCodes.includes(v.shortName));

  const handleApplyPreset = (sampleId: string) => {
    const found = PRESET_SAMPLES.find((s) => s.id === sampleId);
    if (found) {
      setText(found.text);
      if (found.recommendedVoice && voices.some((v) => v.shortName === found.recommendedVoice)) {
        onSelectVoice(found.recommendedVoice);
      }
    }
  };

  const handleRandomPreset = () => {
    const random = PRESET_SAMPLES[Math.floor(Math.random() * PRESET_SAMPLES.length)];
    if (random) {
      setText(random.text);
      if (random.recommendedVoice && voices.some((v) => v.shortName === random.recommendedVoice)) {
        onSelectVoice(random.recommendedVoice);
      }
    }
  };

  const handleResetConfig = () => {
    setConfig({
      rate: 0,
      pitch: 0,
      volume: 0,
      format: 'audio-24khz-96kbitrate-mono-mp3',
    });
  };

  const handleSynthesize = async () => {
    if (!text.trim() && !isCustomSsml) {
      setErrorMessage('请输入要测试的文字内容');
      return;
    }

    const currentVoiceName = selectedVoice?.shortName || 'zh-CN-XiaoxiaoNeural';
    setIsSynthesizing(true);
    setErrorMessage(null);

    try {
      const result = await synthesizeAudioApi(
        text,
        currentVoiceName,
        config,
        isCustomSsml ? customSsmlText : undefined
      );

      setAudioUrl(result.blobUrl);
      setAudioMeta({
        durationMs: result.durationMs,
        bytes: result.bytes,
      });

      // Save to history
      onAddHistory(
        {
          id: 'hist_' + Date.now(),
          text: isCustomSsml ? customSsmlText : text,
          voice: currentVoiceName,
          voiceLabel: selectedVoice?.label || currentVoiceName,
          config: { ...config },
          audioBlobUrl: result.blobUrl,
          fileSize: result.bytes,
          durationMs: result.durationMs,
          timestamp: Date.now(),
        },
        result.blob
      );
    } catch (err: unknown) {
      console.error('Synthesis error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const generatedSsmlCode = selectedVoice
    ? generateSsml(text, selectedVoice.shortName, config)
    : '';

  return (
    <div className="space-y-6">
      {/* Voice selection & Quick switch bar */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Current Voice Details */}
          <div className="flex items-start sm:items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold text-slate-800">
                  {selectedVoice?.label || '选择音色'}
                </span>
                {selectedVoice && (
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      selectedVoice.gender === 'Female'
                        ? 'bg-pink-50 text-pink-700 border border-pink-200/60'
                        : 'bg-sky-50 text-sky-700 border border-sky-200/60'
                    }`}
                  >
                    {selectedVoice.gender === 'Female' ? '女声' : '男声'}
                  </span>
                )}
                {selectedVoice?.featured && (
                  <span className="flex items-center space-x-0.5 px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                    <Flame className="w-3 h-3 text-amber-500 fill-current" />
                    <span>热门推荐</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                {selectedVoice?.desc || '请选择一款微软超自然音色'} ·{' '}
                <span className="font-mono text-slate-600">{selectedVoice?.shortName}</span>
              </p>
            </div>
          </div>

          {/* Change Voice Action */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={onOpenVoiceModal}
              className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-2xs"
            >
              <span>更换音色库</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Voice Switch Chips */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-600 shrink-0 font-medium">快速切换常用:</span>
            {popularVoices.map((v) => {
              const active = selectedVoice?.shortName === v.shortName;
              return (
                <button
                  key={v.shortName}
                  onClick={() => onSelectVoice(v.shortName)}
                  className={`shrink-0 px-2.5 py-1 rounded-md transition-colors flex items-center space-x-1 ${
                    active
                      ? 'bg-blue-100/80 text-blue-800 font-semibold border border-blue-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {active && <Check className="w-3 h-3 text-blue-600" />}
                  <span>{v.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Studio Grid: Input Text & Parameter Tuning */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Text Input & Presets (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
            {/* Presets Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>测试例文快速填入</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleRandomPreset}
                  className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>随机示例</span>
                </button>
                <button
                  onClick={() => setText('')}
                  className="text-xs text-slate-600 hover:text-slate-600 transition-colors"
                >
                  清空
                </button>
              </div>
            </div>

            {/* Presets Pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {PRESET_SAMPLES.slice(0, 8).map((sample) => (
                <button
                  key={sample.id}
                  onClick={() => handleApplyPreset(sample.id)}
                  className="px-2.5 py-1 text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80 rounded-md transition-colors"
                  title={sample.text}
                >
                  {sample.title}
                </button>
              ))}
            </div>

            {/* Textarea or Custom SSML */}
            {!isCustomSsml ? (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <label htmlFor="tts-text-input" className="font-medium text-slate-700">测试文本内容</label>
                  <span>{text.length} 字</span>
                </div>
                <textarea
                  id="tts-text-input"
                  rows={6}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="在此输入需要测试发音的中文、英文、方言或多语种段落..."
                  className="w-full p-3.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 leading-relaxed resize-y placeholder-slate-400"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs text-slate-600">
                  <label htmlFor="custom-ssml-input" className="font-medium text-slate-700">直接输入原始 SSML 代码</label>
                  <span className="text-amber-600">高级模式</span>
                </div>
                <textarea
                  id="custom-ssml-input"
                  rows={6}
                  value={customSsmlText}
                  onChange={(e) => setCustomSsmlText(e.target.value)}
                  placeholder="<speak version='1.0'>...</speak>"
                  className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-400 rounded-lg focus:outline-hidden leading-relaxed resize-y"
                />
              </div>
            )}

            {/* SSML preview toggle */}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  if (!isCustomSsml) {
                    setCustomSsmlText(generatedSsmlCode);
                  }
                  setIsCustomSsml(!isCustomSsml);
                }}
                className="flex items-center space-x-1 text-slate-600 hover:text-blue-600 transition-colors"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>{isCustomSsml ? '切换回常规文本输入' : '直接编辑原始 SSML'}</span>
              </button>

              <button
                onClick={() => setShowSsml(!showSsml)}
                className="text-slate-600 hover:text-blue-600 transition-colors"
              >
                {showSsml ? '隐藏 SSML 预览' : '查看实时 SSML 标签'}
              </button>
            </div>

            {/* Expanded SSML preview */}
            {showSsml && !isCustomSsml && (
              <div className="mt-3 p-3 bg-slate-900 rounded-lg text-slate-300 text-2xs font-mono overflow-x-auto relative">
                <pre>{generatedSsmlCode}</pre>
                <button
                  onClick={() => navigator.clipboard.writeText(generatedSsmlCode)}
                  className="absolute top-2 right-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-2xs rounded border border-slate-700"
                >
                  复制 SSML
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Audio Parameters Tuning (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-1.5 text-sm font-semibold text-slate-800">
                <SlidersHorizontal className="w-4 h-4 text-blue-600" />
                <span>声音特性精细调节</span>
              </div>
              <button
                onClick={handleResetConfig}
                className="flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-700 transition-colors"
                title="恢复所有参数到默认值"
              >
                <RotateCcw className="w-3 h-3" />
                <span>重置默认</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* Rate (语速) */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-medium text-slate-700">语速 (Rate)</span>
                  <span className="font-mono text-blue-600 font-semibold">
                    {config.rate >= 0 ? `+${config.rate}%` : `${config.rate}%`}{' '}
                    <span className="text-slate-600 font-normal">
                      ({(1 + config.rate / 100).toFixed(2)}x)
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={100}
                  step={5}
                  value={config.rate}
                  onChange={(e) => setConfig({ ...config, rate: parseInt(e.target.value, 10) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-2xs text-slate-600 mt-1">
                  <span>-50% (缓慢)</span>
                  <div className="flex space-x-1">
                    {[
                      { l: '0.8x', v: -20 },
                      { l: '正常', v: 0 },
                      { l: '1.25x', v: 25 },
                      { l: '1.5x', v: 50 },
                    ].map((item) => (
                      <button
                        key={item.l}
                        onClick={() => setConfig({ ...config, rate: item.v })}
                        className={`px-1.5 py-0.5 rounded ${
                          config.rate === item.v ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100'
                        }`}
                      >
                        {item.l}
                      </button>
                    ))}
                  </div>
                  <span>+100% (极快)</span>
                </div>
              </div>

              {/* Pitch (音调) */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-medium text-slate-700">音调 (Pitch)</span>
                  <span className="font-mono text-blue-600 font-semibold">
                    {config.pitch >= 0 ? `+${config.pitch}Hz` : `${config.pitch}Hz`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={config.pitch}
                  onChange={(e) => setConfig({ ...config, pitch: parseInt(e.target.value, 10) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-2xs text-slate-600 mt-1">
                  <span>-50Hz (低沉浑厚)</span>
                  <div className="flex space-x-1">
                    {[
                      { l: '低沉', v: -15 },
                      { l: '标准', v: 0 },
                      { l: '高亢', v: 15 },
                    ].map((item) => (
                      <button
                        key={item.l}
                        onClick={() => setConfig({ ...config, pitch: item.v })}
                        className={`px-1.5 py-0.5 rounded ${
                          config.pitch === item.v ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100'
                        }`}
                      >
                        {item.l}
                      </button>
                    ))}
                  </div>
                  <span>+50Hz (清脆高亢)</span>
                </div>
              </div>

              {/* Volume (音量) */}
              <div>
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="font-medium text-slate-700">音量 (Volume)</span>
                  <span className="font-mono text-blue-600 font-semibold">
                    {config.volume >= 0 ? `+${config.volume}%` : `${config.volume}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={5}
                  value={config.volume}
                  onChange={(e) => setConfig({ ...config, volume: parseInt(e.target.value, 10) })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-2xs text-slate-600 mt-1">
                  <span>-50% (柔和)</span>
                  <button
                    onClick={() => setConfig({ ...config, volume: 0 })}
                    className={`px-1.5 py-0.5 rounded ${
                      config.volume === 0 ? 'bg-blue-100 text-blue-700 font-medium' : 'hover:bg-slate-100'
                    }`}
                  >
                    标准 100%
                  </button>
                  <span>+50% (响亮)</span>
                </div>
              </div>

              {/* Format selection */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  音频编码质量
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, format: 'audio-24khz-96kbitrate-mono-mp3' })
                    }
                    className={`p-2 rounded-lg border text-left transition-colors ${
                      config.format === 'audio-24khz-96kbitrate-mono-mp3'
                        ? 'border-blue-500 bg-blue-50/50 text-blue-800'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold">96 kbps MP3</div>
                    <div className="text-2xs text-slate-600">高质量 24kHz (推荐)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, format: 'audio-24khz-48kbitrate-mono-mp3' })
                    }
                    className={`p-2 rounded-lg border text-left transition-colors ${
                      config.format === 'audio-24khz-48kbitrate-mono-mp3'
                        ? 'border-blue-500 bg-blue-50/50 text-blue-800'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="font-semibold">48 kbps MP3</div>
                    <div className="text-2xs text-slate-600">极速较小体积</div>
                  </button>
                </div>
              </div>
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2 text-red-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Synthesize Button */}
            <div className="mt-5">
              <button
                onClick={handleSynthesize}
                disabled={isSynthesizing}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-sm text-white flex items-center justify-center space-x-2 shadow-xs transition-all ${
                  isSynthesizing
                    ? 'bg-blue-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.99]'
                }`}
              >
                {isSynthesizing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>正在合成微软超自然音色...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    <span>合成并即时试听</span>
                  </>
                )}
              </button>
              <p className="text-2xs text-center text-slate-600 mt-1.5">
                支持短按即时试听 · 极速毫秒级响应
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Synthesis Result & Player */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
          <span>试听播放器</span>
        </h3>
        <AudioPlayer
          audioUrl={audioUrl}
          voiceLabel={selectedVoice?.label}
          durationMs={audioMeta?.durationMs}
          bytes={audioMeta?.bytes}
          downloadFileName={`EdgeTTS_${selectedVoice?.label || 'voice'}_${Date.now()}.mp3`}
        />
      </div>
    </div>
  );
};
