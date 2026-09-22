import React from 'react';
import { School, Layers, FileSpreadsheet, Database, MapPin, ShieldCheck } from 'lucide-react';

interface SettingsNavTabsProps {
  currentPath: string;
  onNavigate?: (path: string) => void;
}

export const SettingsNavTabs: React.FC<SettingsNavTabsProps> = ({ currentPath, onNavigate }) => {
  const tabs = [
    {
      path: '/admin',
      label: 'Cổng Quản trị (/admin)',
      icon: ShieldCheck,
      isAdminHub: true,
    },
    {
      path: '/settings/school',
      label: 'Cấu hình trường & Năm học',
      icon: School,
    },
    {
      path: '/settings/campuses',
      label: 'Phân hiệu / Điểm trường',
      icon: MapPin,
    },
    {
      path: '/settings/indicators',
      label: 'Nhóm chỉ tiêu (Bán trú / Lớp)',
      icon: Layers,
    },
    {
      path: '/settings/report-template',
      label: 'Thiết lập biểu mẫu báo cáo',
      icon: FileSpreadsheet,
    },
    {
      path: '/settings/supabase',
      label: 'Kết nối Supabase & CSDL Đám mây',
      icon: Database,
    },
  ];

  const handleNav = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    try {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      window.location.hash = path;
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-xs mb-6 overflow-x-auto no-print">
      <div className="flex items-center gap-1.5 min-w-max">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentPath === tab.path;
          return (
            <button
              key={tab.path}
              type="button"
              onClick={() => handleNav(tab.path)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? tab.isAdminHub
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-blue-600 text-white shadow-xs'
                  : tab.isAdminHub
                  ? 'text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : tab.isAdminHub ? 'text-purple-600' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
