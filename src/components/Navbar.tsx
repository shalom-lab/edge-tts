import React from 'react';
import { Volume2, Sliders, SplitSquareVertical, ListMusic, BookOpen, History } from 'lucide-react';

interface NavbarProps {
  activeTab: 'single' | 'ab' | 'batch' | 'catalog';
  onTabChange: (tab: 'single' | 'ab' | 'batch' | 'catalog') => void;
  voiceCount: number;
  historyCount: number;
  onOpenHistory: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  voiceCount,
  historyCount,
  onOpenHistory,
}) => {
  const tabs = [
    { id: 'single', label: '单音色测试', icon: Sliders },
    { id: 'ab', label: 'AB 盲听/对比', icon: SplitSquareVertical },
    { id: 'batch', label: '批量试听', icon: ListMusic },
    { id: 'catalog', label: '全部音色库', icon: BookOpen },
  ] as const;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-800 text-base sm:text-lg">
                  Edge TTS 音色实验室
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60 rounded">
                  微软神经网络语音
                </span>
              </div>
              <p className="text-xs text-slate-600 hidden sm:block">
                支持 300+ 免费高保真音色 · 语速/音调/音量精调 · MP3 导出
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center space-x-1 sm:space-x-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-600'}`} />
                  <span className="hidden md:inline">{tab.label}</span>
                  <span className="md:hidden">
                    {tab.id === 'single' ? '单测' : tab.id === 'ab' ? '对比' : tab.id === 'batch' ? '批量' : '音色'}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Actions & Status */}
          <div className="flex items-center space-x-2.5">
            {voiceCount > 0 && (
              <span className="hidden lg:inline-flex items-center px-2 py-1 rounded text-xs font-mono text-slate-600 bg-slate-100">
                已载入 {voiceCount} 款音色
              </span>
            )}
            <button
              onClick={onOpenHistory}
              className="relative flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/80 transition-colors"
              title="查看测试历史"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">历史记录</span>
              {historyCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold text-white bg-blue-600 rounded-full">
                  {historyCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
