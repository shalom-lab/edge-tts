import React from 'react';
import { X, Play, Download, Trash2, ArrowUpRight, History } from 'lucide-react';
import { SynthHistoryItem } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: SynthHistoryItem[];
  onPlayItem: (item: SynthHistoryItem) => void;
  onLoadItemToStudio: (item: SynthHistoryItem) => void;
  onClearHistory: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onPlayItem,
  onLoadItemToStudio,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-800">
              合成测试历史记录 ({history.length})
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {history.length === 0 ? (
            <div className="py-20 text-center text-slate-600">
              <History className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium">暂无历史记录</p>
              <p className="text-xs text-slate-600 mt-1">
                在测试台合成的每一段语音都会自动保存在这里
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                  <span className="font-semibold text-slate-800">
                    {item.voiceLabel}
                  </span>
                  <span className="font-mono">{formatTime(item.timestamp)}</span>
                </div>

                <p className="text-xs text-slate-700 line-clamp-2 mb-2 leading-relaxed">
                  {item.text}
                </p>

                <div className="flex items-center justify-between text-2xs text-slate-600 pt-2 border-t border-slate-200/60">
                  <div className="flex space-x-2">
                    <span>
                      语速: {item.config.rate >= 0 ? `+${item.config.rate}%` : `${item.config.rate}%`}
                    </span>
                    <span>
                      音调: {item.config.pitch >= 0 ? `+${item.config.pitch}Hz` : `${item.config.pitch}Hz`}
                    </span>
                    <span>{(item.fileSize / 1024).toFixed(1)} KB</span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => onPlayItem(item)}
                      className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                      title="播放"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={item.audioBlobUrl}
                      download={`EdgeTTS_${item.voiceLabel}_${item.timestamp}.mp3`}
                      className="p-1.5 text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                      title="下载"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        onLoadItemToStudio(item);
                        onClose();
                      }}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors"
                      title="将此条文本与参数载入工作台"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Drawer Footer */}
        {history.length > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <button
              onClick={onClearHistory}
              className="flex items-center space-x-1 text-xs text-red-600 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空所有记录</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-white border border-slate-300 text-xs font-medium text-slate-700 rounded-lg hover:bg-slate-100"
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
