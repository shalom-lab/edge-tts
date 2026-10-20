import React, { useState, useMemo } from 'react';
import { X, Search, Star, Volume2, Check } from 'lucide-react';
import { VoiceItem } from '../types';

interface VoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  voices: VoiceItem[];
  selectedVoice: string;
  onSelectVoice: (voiceShortName: string) => void;
  favorites: string[];
  onToggleFavorite: (voiceShortName: string) => void;
  onQuickAudition: (voiceShortName: string) => void;
  auditioningVoice: string | null;
}

export const VoiceSelectorModal: React.FC<VoiceSelectorModalProps> = ({
  isOpen,
  onClose,
  voices,
  selectedVoice,
  onSelectVoice,
  favorites,
  onToggleFavorite,
  onQuickAudition,
  auditioningVoice,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<'all' | 'Female' | 'Male'>('all');

  const categories = [
    { id: 'all', label: '全部音色' },
    { id: 'fav', label: '我的收藏' },
    { id: 'zh-mainland', label: '普通话推荐' },
    { id: 'zh-dialect', label: '方言特色' },
    { id: 'en', label: '英语 (美/英)' },
    { id: 'ja-ko', label: '日韩语' },
    { id: 'other', label: '其它外语' },
  ];

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      // Category filter
      if (selectedCategory === 'fav' && !favorites.includes(v.shortName)) {
        return false;
      }
      if (selectedCategory !== 'all' && selectedCategory !== 'fav' && v.category !== selectedCategory) {
        return false;
      }

      // Gender filter
      if (selectedGender !== 'all' && v.gender !== selectedGender) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchLabel = v.label.toLowerCase().includes(q);
        const matchShort = v.shortName.toLowerCase().includes(q);
        const matchLocale = v.locale.toLowerCase().includes(q);
        const matchDesc = v.desc.toLowerCase().includes(q);
        const matchTags = v.tags.some((t) => t.toLowerCase().includes(q));
        if (!matchLabel && !matchShort && !matchLocale && !matchDesc && !matchTags) {
          return false;
        }
      }

      return true;
    });
  }, [voices, selectedCategory, selectedGender, search, favorites]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              选择 Edge TTS 音色
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              共找到 {filteredVoices.length} 款可用音色 · 支持即时试听与收藏
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索音色名称、拼音、代号、方言（如 晓晓、云希、东北话、粤语、Jenny）..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1.5 items-center">
            {categories.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {cat.label}
                  {cat.id === 'fav' && favorites.length > 0 && ` (${favorites.length})`}
                </button>
              );
            })}

            <div className="h-4 w-[1px] bg-slate-300 mx-1 hidden sm:block" />

            {/* Gender filter */}
            {(['all', 'Female', 'Male'] as const).map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGender(g)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  selectedGender === g
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {g === 'all' ? '全部性别' : g === 'Female' ? '女声' : '男声'}
              </button>
            ))}
          </div>
        </div>

        {/* Voice List Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredVoices.length === 0 ? (
            <div className="py-16 text-center text-slate-600">
              <p className="text-sm font-medium">未找到匹配的音色</p>
              <p className="text-xs text-slate-600 mt-1">请尝试更换筛选条件或关键词</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredVoices.map((voice) => {
                const isSelected = selectedVoice === voice.shortName;
                const isFav = favorites.includes(voice.shortName);
                const isAuditioning = auditioningVoice === voice.shortName;

                return (
                  <div
                    key={voice.shortName}
                    className={`relative flex flex-col justify-between p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-2xs'
                    }`}
                  >
                    <div>
                      {/* Top Row: Name, Gender & Favorite */}
                      <div className="flex items-start justify-between gap-1 mb-1.5">
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

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(voice.shortName);
                          }}
                          className={`p-1 rounded-md transition-colors ${
                            isFav ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-slate-400'
                          }`}
                          title={isFav ? '取消收藏' : '加入收藏'}
                        >
                          <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      </div>

                      {/* Technical identifier */}
                      <p className="text-2xs font-mono text-slate-600 truncate mb-1.5">
                        {voice.shortName}
                      </p>

                      {/* Description */}
                      <p className="text-xs text-slate-600 line-clamp-2 mb-2">
                        {voice.desc}
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {voice.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded text-2xs bg-slate-100 text-slate-600"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Bottom Buttons: Quick Audition & Select */}
                    <div className="flex items-center space-x-2 pt-2 border-t border-slate-100">
                      <button
                        onClick={() => onQuickAudition(voice.shortName)}
                        disabled={isAuditioning}
                        className={`flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 text-xs font-medium rounded-lg transition-colors ${
                          isAuditioning
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                        title="试听一段例句"
                      >
                        <Volume2 className={`w-3.5 h-3.5 ${isAuditioning ? 'animate-pulse' : ''}`} />
                        <span>{isAuditioning ? '试听中...' : '试听'}</span>
                      </button>

                      <button
                        onClick={() => {
                          onSelectVoice(voice.shortName);
                          onClose();
                        }}
                        className={`flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 text-xs font-medium rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        {isSelected ? <Check className="w-3.5 h-3.5" /> : null}
                        <span>{isSelected ? '当前使用' : '选用'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span>提示：Edge TTS 音色完全基于微软官方神经网络在线语音库生成</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 font-medium hover:bg-slate-50 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
