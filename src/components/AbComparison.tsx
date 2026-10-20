import React, { useState } from 'react';
import { SplitSquareVertical, Volume2, Sparkles, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { VoiceItem, ProsodyConfig } from '../types';
import { PRESET_SAMPLES } from '../data/presets';
import { AudioPlayer } from './AudioPlayer';
import { synthesizeAudioApi } from '../services/ttsApi';

interface AbComparisonProps {
  voices: VoiceItem[];
}

export const AbComparison: React.FC<AbComparisonProps> = ({ voices }) => {
  const [text, setText] = useState<string>(
    '生活的真谛不在于追逐风口，而在于内心的宁静与执着。无论世界多么喧嚣，愿你的心中始终有一方晴空。'
  );

  // Side A State
  const [voiceA, setVoiceA] = useState<string>('zh-CN-XiaoxiaoNeural');
  const [configA, setConfigA] = useState<ProsodyConfig>({
    rate: 0,
    pitch: 0,
    volume: 0,
    format: 'audio-24khz-96kbitrate-mono-mp3',
  });
  const [audioUrlA, setAudioUrlA] = useState<string | null>(null);
  const [metaA, setMetaA] = useState<{ durationMs: number; bytes: number } | null>(null);
  const [loadingA, setLoadingA] = useState(false);

  // Side B State
  const [voiceB, setVoiceB] = useState<string>('zh-CN-YunxiNeural');
  const [configB, setConfigB] = useState<ProsodyConfig>({
    rate: 0,
    pitch: 0,
    volume: 0,
    format: 'audio-24khz-96kbitrate-mono-mp3',
  });
  const [audioUrlB, setAudioUrlB] = useState<string | null>(null);
  const [metaB, setMetaB] = useState<{ durationMs: number; bytes: number } | null>(null);
  const [loadingB, setLoadingB] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const voiceObjA = voices.find((v) => v.shortName === voiceA);
  const voiceObjB = voices.find((v) => v.shortName === voiceB);

  const handleSynthesizeSide = async (side: 'A' | 'B') => {
    if (!text.trim()) {
      setErrorMessage('请输入要对比的测试文本');
      return;
    }
    setErrorMessage(null);

    if (side === 'A') {
      setLoadingA(true);
      try {
        const res = await synthesizeAudioApi(text, voiceA, configA);
        setAudioUrlA(res.blobUrl);
        setMetaA({ durationMs: res.durationMs, bytes: res.bytes });
      } catch (err: unknown) {
        setErrorMessage('音色 A 合成失败: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setLoadingA(false);
      }
    } else {
      setLoadingB(true);
      try {
        const res = await synthesizeAudioApi(text, voiceB, configB);
        setAudioUrlB(res.blobUrl);
        setMetaB({ durationMs: res.durationMs, bytes: res.bytes });
      } catch (err: unknown) {
        setErrorMessage('音色 B 合成失败: ' + (err instanceof Error ? err.message : String(err)));
      } finally {
        setLoadingB(false);
      }
    }
  };

  const handleSynthesizeBoth = async () => {
    if (!text.trim()) {
      setErrorMessage('请输入要对比的测试文本');
      return;
    }
    setErrorMessage(null);
    setLoadingA(true);
    setLoadingB(true);

    try {
      const [resA, resB] = await Promise.all([
        synthesizeAudioApi(text, voiceA, configA),
        synthesizeAudioApi(text, voiceB, configB),
      ]);
      setAudioUrlA(resA.blobUrl);
      setMetaA({ durationMs: resA.durationMs, bytes: resA.bytes });
      setAudioUrlB(resB.blobUrl);
      setMetaB({ durationMs: resB.durationMs, bytes: resB.bytes });
    } catch (err: unknown) {
      setErrorMessage('合成失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingA(false);
      setLoadingB(false);
    }
  };

  const swapVoices = () => {
    const tempVoice = voiceA;
    const tempConfig = { ...configA };
    const tempUrl = audioUrlA;
    const tempMeta = metaA;

    setVoiceA(voiceB);
    setConfigA(configB);
    setAudioUrlA(audioUrlB);
    setMetaA(metaB);

    setVoiceB(tempVoice);
    setConfigB(tempConfig);
    setAudioUrlB(tempUrl);
    setMetaB(tempMeta);
  };

  return (
    <div className="space-y-6">
      {/* Intro & Text Prompt */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <SplitSquareVertical className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">
              A / B 双音色并排对比测试
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
              <span>换一句文案</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600">
          针对同一段文本，实时对比不同音色、语速或音调的表现，帮你挑选最契合项目的声音。
        </p>

        <div>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入统一测试文本..."
            className="w-full p-3 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
          />
        </div>

        {/* Action button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleSynthesizeBoth}
              disabled={loadingA || loadingB}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center space-x-2 shadow-2xs disabled:bg-blue-300"
            >
              {loadingA || loadingB ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在合成 A &amp; B ...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>一键同时合成 A &amp; B 音频</span>
                </>
              )}
            </button>

            <button
              onClick={swapVoices}
              className="p-2.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              title="交换 A 和 B 的音色与参数"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-slate-600">
            合成后可点击对应播放器分别播放比对
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Side-by-side comparison columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column A */}
        <div className="bg-white rounded-xl border border-blue-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-blue-100">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-md bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                A
              </span>
              <span className="font-semibold text-slate-800 text-sm">音色方案 A</span>
            </div>
            <button
              onClick={() => handleSynthesizeSide('A')}
              disabled={loadingA}
              className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-medium transition-colors"
            >
              {loadingA ? '合成中...' : '单独生成 A'}
            </button>
          </div>

          {/* Voice A Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">选择音色</label>
            <select
              value={voiceA}
              onChange={(e) => setVoiceA(e.target.value)}
              className="w-full p-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-500"
            >
              {voices.map((v) => (
                <option key={v.shortName} value={v.shortName}>
                  {v.label} ({v.shortName}) - {v.gender === 'Female' ? '女' : '男'}
                </option>
              ))}
            </select>
            {voiceObjA && (
              <p className="text-xs text-slate-600 mt-1">{voiceObjA.desc}</p>
            )}
          </div>

          {/* Parameters for A */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>语速</span>
                <span className="font-mono text-blue-600 font-medium">
                  {configA.rate >= 0 ? `+${configA.rate}%` : `${configA.rate}%`}
                </span>
              </div>
              <input
                type="range"
                min={-50}
                max={100}
                step={5}
                value={configA.rate}
                onChange={(e) => setConfigA({ ...configA, rate: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>音调</span>
                <span className="font-mono text-blue-600 font-medium">
                  {configA.pitch >= 0 ? `+${configA.pitch}Hz` : `${configA.pitch}Hz`}
                </span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                step={5}
                value={configA.pitch}
                onChange={(e) => setConfigA({ ...configA, pitch: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          {/* Player A */}
          <div className="pt-2">
            <AudioPlayer
              audioUrl={audioUrlA}
              voiceLabel={`方案 A (${voiceObjA?.label || voiceA})`}
              durationMs={metaA?.durationMs}
              bytes={metaA?.bytes}
              downloadFileName={`EdgeTTS_A_${voiceObjA?.label || 'voiceA'}.mp3`}
              autoPlay={false}
            />
          </div>
        </div>

        {/* Column B */}
        <div className="bg-white rounded-xl border border-indigo-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-indigo-100">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-md bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
                B
              </span>
              <span className="font-semibold text-slate-800 text-sm">音色方案 B</span>
            </div>
            <button
              onClick={() => handleSynthesizeSide('B')}
              disabled={loadingB}
              className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-medium transition-colors"
            >
              {loadingB ? '合成中...' : '单独生成 B'}
            </button>
          </div>

          {/* Voice B Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">选择音色</label>
            <select
              value={voiceB}
              onChange={(e) => setVoiceB(e.target.value)}
              className="w-full p-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:border-indigo-500"
            >
              {voices.map((v) => (
                <option key={v.shortName} value={v.shortName}>
                  {v.label} ({v.shortName}) - {v.gender === 'Female' ? '女' : '男'}
                </option>
              ))}
            </select>
            {voiceObjB && (
              <p className="text-xs text-slate-600 mt-1">{voiceObjB.desc}</p>
            )}
          </div>

          {/* Parameters for B */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>语速</span>
                <span className="font-mono text-indigo-600 font-medium">
                  {configB.rate >= 0 ? `+${configB.rate}%` : `${configB.rate}%`}
                </span>
              </div>
              <input
                type="range"
                min={-50}
                max={100}
                step={5}
                value={configB.rate}
                onChange={(e) => setConfigB({ ...configB, rate: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>音调</span>
                <span className="font-mono text-indigo-600 font-medium">
                  {configB.pitch >= 0 ? `+${configB.pitch}Hz` : `${configB.pitch}Hz`}
                </span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                step={5}
                value={configB.pitch}
                onChange={(e) => setConfigB({ ...configB, pitch: parseInt(e.target.value, 10) })}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
            </div>
          </div>

          {/* Player B */}
          <div className="pt-2">
            <AudioPlayer
              audioUrl={audioUrlB}
              voiceLabel={`方案 B (${voiceObjB?.label || voiceB})`}
              durationMs={metaB?.durationMs}
              bytes={metaB?.bytes}
              downloadFileName={`EdgeTTS_B_${voiceObjB?.label || 'voiceB'}.mp3`}
              autoPlay={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
