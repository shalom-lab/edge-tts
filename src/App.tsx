import { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { SingleVoiceTester } from './components/SingleVoiceTester';
import { AbComparison } from './components/AbComparison';
import { BatchAudition } from './components/BatchAudition';
import { VoiceCatalog } from './components/VoiceCatalog';
import { VoiceSelectorModal } from './components/VoiceSelectorModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { VoiceItem, SynthHistoryItem } from './types';
import { fetchVoicesApi, synthesizeAudioApi } from './services/ttsApi';
import { clearHistory, loadHistory, saveHistoryItem } from './services/historyDb';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const [voiceLoadError, setVoiceLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'single' | 'ab' | 'batch' | 'catalog'>('single');
  const [selectedVoiceShortName, setSelectedVoiceShortName] = useState<string>('zh-CN-XiaoxiaoNeural');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Favorites stored in localStorage (small string list)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('edge_tts_favorites');
      return saved ? JSON.parse(saved) : ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'];
    } catch {
      return ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural'];
    }
  });

  // History list (IndexedDB + in-memory blob URLs)
  const [history, setHistory] = useState<SynthHistoryItem[]>([]);

  // Quick audition preview audio
  const [auditioningVoice, setAuditioningVoice] = useState<string | null>(null);
  const [auditionError, setAuditionError] = useState<string | null>(null);
  const auditionAudioRef = useRef<HTMLAudioElement | null>(null);
  const auditionBlobUrlRef = useRef<string | null>(null);
  const auditionGenRef = useRef(0);

  const loadVoices = async () => {
    setIsLoadingVoices(true);
    setVoiceLoadError(null);
    try {
      const list = await fetchVoicesApi();
      setVoices(list);
    } catch (err: unknown) {
      console.error('Failed to load voices:', err);
      setVoiceLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    loadVoices();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await loadHistory();
        if (!cancelled) setHistory(items);
      } catch (e) {
        console.error('Failed to load history from IndexedDB:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleFavorite = (shortName: string) => {
    setFavorites((prev) => {
      const next = prev.includes(shortName)
        ? prev.filter((s) => s !== shortName)
        : [...prev, shortName];
      try {
        localStorage.setItem('edge_tts_favorites', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const handleAddHistory = (item: SynthHistoryItem, audioBlob: Blob) => {
    setHistory((prev) => {
      // Revoke blob URL of any row we drop past the cap
      const next = [item, ...prev];
      const kept = next.slice(0, 30);
      for (const dropped of next.slice(30)) {
        try {
          URL.revokeObjectURL(dropped.audioBlobUrl);
        } catch {
          /* ignore */
        }
      }
      return kept;
    });
    void saveHistoryItem(item, audioBlob).catch((e) =>
      console.error('Failed to persist history:', e)
    );
  };

  const handleClearHistory = () => {
    for (const item of history) {
      try {
        URL.revokeObjectURL(item.audioBlobUrl);
      } catch {
        /* ignore */
      }
    }
    setHistory([]);
    void clearHistory().catch((e) => console.error('Failed to clear IndexedDB history:', e));
  };

  // Tiny silent WAV — unlocks <audio> during the click gesture before await synth.
  const SILENT_WAV =
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

  const revokeAuditionBlob = () => {
    if (auditionBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(auditionBlobUrlRef.current);
      } catch {
        /* ignore */
      }
      auditionBlobUrlRef.current = null;
    }
  };

  const showAuditionError = (msg: string) => {
    setAuditionError(msg);
    window.setTimeout(() => {
      setAuditionError((cur) => (cur === msg ? null : cur));
    }, 5000);
  };

  // Quick audition player for previewing voices in modal / catalog
  const handleQuickAudition = async (shortName: string) => {
    const voiceObj = voices.find((v) => v.shortName === shortName);
    if (!voiceObj) {
      showAuditionError('未找到该音色，请刷新页面后重试');
      return;
    }

    let sampleText = '你好，我是微软神经网络语音。很高兴为你读出这句话！';
    if (voiceObj.locale.startsWith('en')) {
      sampleText = 'Hello! This is Microsoft neural text-to-speech voice test.';
    } else if (voiceObj.locale.startsWith('ja')) {
      sampleText = 'こんにちは！マイクロソフトの自然な音声テストです。';
    } else if (voiceObj.locale.startsWith('ko')) {
      sampleText = '안녕하세요! 마이크로소프트 인공지능 음성 테스트입니다.';
    } else if (voiceObj.locale.startsWith('zh-HK')) {
      sampleText = '雷好啊！我係微軟嘅自然廣東話語音。';
    } else if (voiceObj.shortName.includes('liaoning')) {
      sampleText = '哎呀妈呀，我是辽宁话音色，老铁听听中不中！';
    } else if (voiceObj.shortName.includes('sichuan')) {
      sampleText = '巴适得很！我是四川话音色，听起来安逸不？';
    }

    const audio = auditionAudioRef.current;
    const gen = ++auditionGenRef.current;
    setAuditionError(null);
    setAuditioningVoice(shortName);

    // Unlock autoplay while we still have the user gesture (before network await).
    if (audio) {
      try {
        audio.pause();
        audio.src = SILENT_WAV;
        audio.muted = true;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
      } catch {
        // Ignore unlock failures; real play() below will surface errors.
        audio.muted = false;
      }
    }

    try {
      const res = await synthesizeAudioApi(sampleText, shortName, {
        rate: 0,
        pitch: 0,
        volume: 0,
        format: 'audio-24khz-96kbitrate-mono-mp3',
      });

      // A newer audition click superseded this one.
      if (gen !== auditionGenRef.current) {
        try {
          URL.revokeObjectURL(res.blobUrl);
        } catch {
          /* ignore */
        }
        return;
      }

      if (!auditionAudioRef.current) {
        throw new Error('音频播放器未就绪');
      }

      revokeAuditionBlob();
      auditionBlobUrlRef.current = res.blobUrl;
      const el = auditionAudioRef.current;
      el.pause();
      el.src = res.blobUrl;
      el.load();
      await el.play();
      // Keep auditioningVoice until onEnded / onError; do not clear in finally.
    } catch (e) {
      if (gen !== auditionGenRef.current) return;
      console.error('Quick audition error:', e);
      setAuditioningVoice(null);
      const msg = e instanceof Error ? e.message : String(e);
      const playBlocked =
        /NotAllowedError|play\(\) failed|user didn't interact|autoplay/i.test(msg) ||
        (e instanceof DOMException && e.name === 'NotAllowedError');
      showAuditionError(
        playBlocked
          ? '浏览器拦截了自动播放，请再点一次「试听例句」'
          : `试听失败: ${msg}`
      );
    }
  };

  const selectedVoice =
    voices.find((v) => v.shortName === selectedVoiceShortName) ||
    voices[0] ||
    null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      <audio
        ref={auditionAudioRef}
        playsInline
        preload="auto"
        onEnded={() => setAuditioningVoice(null)}
        onError={() => {
          setAuditioningVoice(null);
          showAuditionError('音频无法播放（格式或网络异常）');
        }}
      />

      {auditionError && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] px-4 py-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl shadow-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{auditionError}</span>
          <button
            type="button"
            onClick={() => setAuditionError(null)}
            className="text-red-600 hover:text-red-900 text-xs font-medium shrink-0"
          >
            关闭
          </button>
        </div>
      )}

      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        voiceCount={voices.length}
        historyCount={history.length}
        onOpenHistory={() => setIsHistoryOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Loading state for voices */}
        {isLoadingVoices && voices.length === 0 && (
          <div className="py-24 text-center">
            <div className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-base font-semibold text-slate-800">正在加载精选音色…</h3>
            <p className="text-xs text-slate-600 mt-1">
              列表来自本站精选目录；合成走 Cloudflare Worker
            </p>
          </div>
        )}

        {/* Error state */}
        {voiceLoadError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>加载音色失败: {voiceLoadError}</span>
            </div>
            <button
              onClick={loadVoices}
              className="flex items-center space-x-1 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-medium rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>重试</span>
            </button>
          </div>
        )}

        {/* Active Tab View */}
        {!isLoadingVoices && (
          <div>
            {activeTab === 'single' && (
              <SingleVoiceTester
                voices={voices}
                selectedVoice={selectedVoice}
                onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
                onSelectVoice={setSelectedVoiceShortName}
                onAddHistory={handleAddHistory}
              />
            )}

            {activeTab === 'ab' && <AbComparison voices={voices} />}

            {activeTab === 'batch' && <BatchAudition voices={voices} />}

            {activeTab === 'catalog' && (
              <VoiceCatalog
                voices={voices}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onSelectVoiceForStudio={(shortName) => {
                  setSelectedVoiceShortName(shortName);
                  setActiveTab('single');
                }}
                onQuickAudition={handleQuickAudition}
                auditioningVoice={auditioningVoice}
              />
            )}
          </div>
        )}
      </main>

      {/* Voice Selector Modal / Drawer */}
      <VoiceSelectorModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        voices={voices}
        selectedVoice={selectedVoiceShortName}
        onSelectVoice={(name) => setSelectedVoiceShortName(name)}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onQuickAudition={handleQuickAudition}
        auditioningVoice={auditioningVoice}
      />

      {/* History Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onPlayItem={(item) => {
          const el = auditionAudioRef.current;
          if (!el) return;
          setAuditionError(null);
          el.pause();
          el.src = item.audioBlobUrl;
          el.load();
          void el.play().catch((err) => {
            console.error('History play error:', err);
            showAuditionError(
              err instanceof Error ? `播放失败: ${err.message}` : '播放失败'
            );
          });
        }}
        onLoadItemToStudio={(item) => {
          setSelectedVoiceShortName(item.voice);
          setActiveTab('single');
        }}
        onClearHistory={handleClearHistory}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-4 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Edge TTS 音色测试实验室 · 微软官方神经网络在线语音</span>
          <span>免 API Key · 超自然高保真 · 语速音调自适应 · MP3 音频导出</span>
        </div>
      </footer>
    </div>
  );
}
