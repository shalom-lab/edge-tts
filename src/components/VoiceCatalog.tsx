import React, { useState, useMemo } from 'react';
import { Search, Star, Volume2, ArrowRight } from 'lucide-react';
import { VoiceItem } from '../types';

interface VoiceCatalogProps {
  voices: VoiceItem[];
  favorites: string[];
  onToggleFavorite: (shortName: string) => void;
  onSelectVoiceForStudio: (shortName: string) => void;
  onQuickAudition: (shortName: string) => void;
  auditioningVoice: string | null;
}

export const VoiceCatalog: React.FC<VoiceCatalogProps> = ({
  voices,
  favorites,
  onToggleFavorite,
  onSelectVoiceForStudio,
  onQuickAudition,
  auditioningVoice,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<'all' | 'Female' | 'Male'>('all');
  const [pageSize, setPageSize] = useState<number>(36);

  const categories = [
    { id: 'all', label: '全部' },
    { id: 'fav', label: '我的收藏' },
    { id: 'zh-mainland', label: '普通话推荐' },
    { id: 'zh-dialect', label: '地方方言/港台' },
    { id: 'en', label: '美英英文' },
    { id: 'ja-ko', label: '日韩语' },
    { id: 'other', label: '多国小语种' },
  ];

  const filteredVoices = useMemo(() => {
    return voices.filter((v) => {
      if (selectedCategory === 'fav' && !favorites.includes(v.shortName)) {
        return false;
      }
      if (selectedCategory !== 'all' && selectedCategory !== 'fav' && v.category !== selectedCategory) {
        return false;
      }
      if (selectedGender !== 'all' && v.gender !== selectedGender) {
        return false;
      }
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

  const displayedVoices = filteredVoices.slice(0, pageSize);

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              全量 Edge TTS 神经网络音色库
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              总计 {voices.length} 款全球在线音色 · 当前筛选出 {filteredVoices.length} 款
            </p>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索音色名称、代号、地区或标签（如 晓晓、云希、粤语、Jenny、en-US）..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPageSize(36);
            }}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap gap-1.5 items-center">
            {categories.map((c) => {
              const active = selectedCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCategory(c.id);
                    setPageSize(36);
                  }}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    active
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.label}
                  {c.id === 'fav' && favorites.length > 0 && ` (${favorites.length})`}
                </button>
              );
            })}
          </div>

          <div className="flex items-center space-x-1 text-xs">
            {(['all', 'Female', 'Male'] as const).map((g) => (
              <button
                key={g}
                onClick={() => {
                  setSelectedGender(g);
                  setPageSize(36);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedGender === g
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {g === 'all' ? '全部性别' : g === 'Female' ? '女声' : '男声'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of Voices */}
      {displayedVoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-600">
          <p className="text-sm font-medium">没有找到符合条件的音色</p>
          <p className="text-xs text-slate-600 mt-1">请尝试清除搜索条件或选择“全部”分类</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {displayedVoices.map((voice) => {
            const isFav = favorites.includes(voice.shortName);
            const isAuditioning = auditioningVoice === voice.shortName;

            return (
              <div
                key={voice.shortName}
                className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs hover:border-slate-300 hover:shadow-2xs transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar */}
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
                      onClick={() => onToggleFavorite(voice.shortName)}
                      className={`p-1 rounded-md transition-colors ${
                        isFav
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-slate-300 hover:text-slate-400'
                      }`}
                      title={isFav ? '取消收藏' : '加入收藏'}
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {/* Locale & Code */}
                  <div className="flex items-center space-x-1.5 text-2xs font-mono text-slate-600 mb-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {voice.locale}
                    </span>
                    <span className="truncate">{voice.shortName}</span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 line-clamp-2 mb-2">
                    {voice.desc}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {voice.tags.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded text-2xs bg-slate-50 text-slate-600 border border-slate-200/60"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center space-x-2">
                  <button
                    onClick={() => onQuickAudition(voice.shortName)}
                    disabled={isAuditioning}
                    className={`flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 text-xs font-medium rounded-lg transition-colors ${
                      isAuditioning
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Volume2 className={`w-3.5 h-3.5 ${isAuditioning ? 'animate-pulse' : ''}`} />
                    <span>{isAuditioning ? '试听中...' : '试听例句'}</span>
                  </button>

                  <button
                    onClick={() => onSelectVoiceForStudio(voice.shortName)}
                    className="flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    <span>去测试</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More Button */}
      {pageSize < filteredVoices.length && (
        <div className="text-center pt-2">
          <button
            onClick={() => setPageSize((prev) => prev + 36)}
            className="px-5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-2xs transition-colors"
          >
            加载更多音色 (已展示 {pageSize} / {filteredVoices.length})
          </button>
        </div>
      )}
    </div>
  );
};
