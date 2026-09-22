import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { isSupabaseConnected } from '../services/supabase';
import { StorageService } from '../services/storage';
import {
  ShieldCheck,
  ShieldAlert,
  Layers,
  Users,
  School,
  MapPin,
  FileSpreadsheet,
  Database,
  Calendar,
  Settings,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Upload,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  ExternalLink,
  ClipboardList,
  BarChart3,
  Trophy,
  Copy,
  Check,
  Building,
  GraduationCap
} from 'lucide-react';

interface AdminPortalPageProps {
  onNavigate: (path: string) => void;
}

export const AdminPortalPage: React.FC<AdminPortalPageProps> = ({ onNavigate }) => {
  const { currentUser, allUsers, isAdmin, isBGH, logout, reloadUsers } = useAuth();
  const {
    settings,
    classes,
    campuses,
    years,
    activeYear,
    indicators,
    students,
    cleanDuplicateTeachers: cleanDuplicatesSchool,
  } = useSchool();

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState(false);

  // If user is GVCN, show restricted access screen
  if (currentUser && currentUser.role === 'GVCN') {
    return (
      <div className="max-w-2xl mx-auto my-12 bg-white rounded-2xl shadow-xl border border-amber-200 overflow-hidden p-6 sm:p-8 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-800 mb-3">
          <span>Khu vực bảo mật: URL /admin</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
          Truy cập Quản trị (/admin) bị giới hạn
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          Trang Quản trị (<strong>URL /admin</strong>) chỉ dành riêng cho <strong>Quản trị viên (ADMIN)</strong> và <strong>Ban Giám Hiệu (BGH)</strong> để cấu hình trường học, phân công lớp và quản lý tài khoản.
          <br />
          Tài khoản hiện tại của bạn: <strong className="text-blue-700">{currentUser.full_name}</strong> (Vai trò: Giáo viên Chủ nhiệm).
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/attendance')}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-md flex items-center justify-center gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            <span>Vào Điểm danh Sĩ số của Lớp</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await logout();
              onNavigate('/admin');
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 font-bold text-sm flex items-center justify-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            <span>Đăng nhập Tài khoản Quản trị</span>
          </button>
        </div>
      </div>
    );
  }

  // Copy current URL to clipboard
  const handleCopyAdminUrl = () => {
    try {
      const url = `${window.location.origin}/admin`;
      navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Run duplicate teacher cleaning
  const handleCleanDuplicates = async () => {
    setCleaningDuplicates(true);
    setCleanMessage(null);
    try {
      const res = await cleanDuplicatesSchool();
      await reloadUsers();
      if (res.removedCount > 0) {
        setCleanMessage(`Đã dọn dẹp thành công ${res.removedCount} tài khoản GVCN trùng lặp.`);
      } else {
        setCleanMessage('Hệ thống dữ liệu sạch sẽ: Không có tài khoản GVCN nào bị trùng lặp.');
      }
    } catch (err: any) {
      setCleanMessage(`Lỗi khi dọn dẹp: ${err.message || 'Thao tác thất bại'}`);
    } finally {
      setCleaningDuplicates(false);
    }
  };

  // Export full JSON backup
  const handleExportBackup = () => {
    try {
      const backupData = {
        exportedAt: new Date().toISOString(),
        version: '2.0',
        schoolName: settings?.school_name || '',
        activeYear: activeYear?.name || '',
        settings,
        classes,
        campuses,
        years,
        indicators,
        users: allUsers.map(u => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role, assigned_class_id: u.assigned_class_id })),
        studentsCount: students.length,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_quantri_${settings?.short_name || 'truong'}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupSuccess(true);
      setTimeout(() => setBackupSuccess(false), 3000);
    } catch (err) {
      alert('Không thể xuất bản sao lưu');
    }
  };

  // Summary statistics
  const totalClasses = classes.length;
  const nhaTreClasses = classes.filter(c => (c.grade && c.grade <= 2) || c.class_name.toLowerCase().includes('nhà trẻ') || c.class_name.toLowerCase().includes('nha tre')).length;
  const mauGiaoClasses = totalClasses - nhaTreClasses;
  const totalStudents = students.length;
  const totalUsers = allUsers.length;
  const totalTeachers = allUsers.filter(u => u.role === 'GVCN').length;
  const totalBGH = allUsers.filter(u => u.role === 'BGH').length;
  const totalAdmins = allUsers.filter(u => u.role === 'ADMIN').length;
  const isCloudConnected = isSupabaseConnected();

  // Admin modules
  const adminModules = [
    {
      id: 'classes',
      title: 'Quản lý Lớp học & Học sinh',
      description: 'Cấu hình khối Nhà trẻ / Mẫu giáo, phân bổ điểm trường, phân công GVCN và quản lý danh sách học sinh từng lớp.',
      icon: Layers,
      color: 'bg-blue-600',
      badge: `${totalClasses} lớp học`,
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      path: '/classes',
      actions: ['Thêm lớp mới', 'Danh sách học sinh', 'Khóa nhập điểm danh']
    },
    {
      id: 'users',
      title: 'Quản trị Tài khoản & Phân quyền',
      description: 'Quản lý tài khoản Ban Giám Hiệu, Giáo viên Chủ nhiệm; phân công lớp, cấp lại mật khẩu và dọn dẹp tài khoản trùng.',
      icon: Users,
      color: 'bg-purple-600',
      badge: `${totalUsers} tài khoản (${totalTeachers} GVCN)`,
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
      path: '/users',
      actions: ['Thêm tài khoản', 'Phân công lớp', 'Cấp lại mật khẩu']
    },
    {
      id: 'school',
      title: 'Cấu hình Trường & Năm học',
      description: 'Tên trường, tên viết tắt, cơ quan chủ quản (Sở/Phòng GD&ĐT), kích hoạt năm học hoạt động, khóa sổ năm học cũ.',
      icon: School,
      color: 'bg-emerald-600',
      badge: activeYear?.name ? `Năm học ${activeYear.name}` : 'Cấu hình',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      path: '/settings/school',
      actions: ['Đổi tên trường', 'Thêm năm học mới', 'Khóa sổ năm học']
    },
    {
      id: 'campuses',
      title: 'Phân hiệu / Điểm trường',
      description: 'Quản lý các điểm trường lẻ, phân bổ lớp học theo khu vực, người ký duyệt và người lập biểu cho từng phân hiệu.',
      icon: MapPin,
      color: 'bg-amber-600',
      badge: `${campuses.length} điểm trường`,
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      path: '/settings/campuses',
      actions: ['Thêm điểm trường', 'Phụ trách điểm trường', 'Người ký duyệt']
    },
    {
      id: 'indicators',
      title: 'Nhóm chỉ tiêu & Bán trú',
      description: 'Thiết lập các nhóm chỉ tiêu theo dõi: ăn trưa, ăn sáng, phụ huynh đóng góp, suất ăn nhà trẻ / mẫu giáo theo quy định PGD.',
      icon: Settings,
      color: 'bg-indigo-600',
      badge: `${indicators.length} nhóm chỉ tiêu`,
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      path: '/settings/indicators',
      actions: ['Chỉ tiêu ăn bán trú', 'Chỉ tiêu chuyên cần', 'Tùy chỉnh nhóm']
    },
    {
      id: 'report-template',
      title: 'Thiết lập Mẫu biểu Báo cáo',
      description: 'Cấu hình biểu mẫu xuất Excel báo cáo ngày & tháng chuẩn quy định Phòng GD&ĐT, tùy chỉnh người ký và căn lề in ấn.',
      icon: FileSpreadsheet,
      color: 'bg-rose-600',
      badge: 'Chuẩn PGD Excel',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      path: '/settings/report-template',
      actions: ['Tùy biến tiêu đề', 'Chữ ký Hiệu trưởng', 'Cấu hình xuất Excel']
    },
    {
      id: 'supabase',
      title: 'Đồng bộ Supabase & CSDL Đám mây',
      description: 'Cấu hình kết nối đám mây thời gian thực, tự động sao lưu dữ liệu sĩ số, đồng bộ đa thiết bị điện thoại và máy tính.',
      icon: Database,
      color: 'bg-cyan-600',
      badge: isCloudConnected ? 'Cloud Đang Kết Nối' : 'CSDL Nội Bộ (Offline)',
      badgeColor: isCloudConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200',
      path: '/settings/supabase',
      actions: ['Kiểm tra kết nối', 'Sao lưu đám mây', 'Khởi tạo bảng SQL']
    },
    {
      id: 'daily-report',
      title: 'Báo cáo Sĩ số Toàn trường',
      description: 'Tổng hợp sĩ số chuyên cần, ăn bán trú toàn trường theo ngày, xuất file Excel chuẩn và duyệt số liệu các lớp gửi lên.',
      icon: Trophy,
      color: 'bg-teal-600',
      badge: 'Báo cáo Ngày & Tháng',
      badgeColor: 'bg-teal-50 text-teal-700 border-teal-200',
      path: '/reports/daily',
      actions: ['Xem báo cáo ngày', 'Xếp hạng thi đua', 'Xuất Excel']
    }
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-200">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-purple-800/40 relative overflow-hidden">
        {/* Background decorative effects */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-purple-500/30 text-purple-200 border border-purple-400/30 shadow-inner">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-300" />
                <span>CỔNG QUẢN TRỊ TRANG WEB</span>
              </span>

              <button
                type="button"
                onClick={handleCopyAdminUrl}
                title="Sao chép địa chỉ URL /admin"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
              >
                <span>URL: /admin</span>
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
              </button>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-slate-200 border border-white/10">
                <Calendar className="w-3.5 h-3.5 text-blue-300" />
                <span>Năm học {activeYear?.name || '2026-2027'}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white">
              TRUNG TÂM QUẢN TRỊ HỆ THỐNG
            </h1>

            <p className="text-sm text-purple-200/90 leading-relaxed font-medium">
              Chào mừng <strong className="text-white font-bold">{currentUser?.full_name}</strong> ({currentUser?.role === 'ADMIN' ? 'Quản trị viên Cấp cao' : 'Ban Giám Hiệu'}). Tại đây bạn có thể quản lý danh sách lớp học, phân công giáo viên, điều chỉnh năm học và cấu hình toàn bộ hệ thống trường học.
            </p>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 self-stretch lg:self-center">
            <button
              type="button"
              onClick={() => onNavigate('/classes')}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-xs hover:bg-slate-100 shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Quản lý Lớp học</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/users')}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Users className="w-4 h-4" />
              <span>Quản trị Tài khoản</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/reports/daily')}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/20 transition-all flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span>Báo cáo Ngày</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng số Lớp</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{totalClasses}</div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            {nhaTreClasses} Nhà trẻ • {mauGiaoClasses} Mẫu giáo
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tổng Học Sinh</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{totalStudents}</div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Danh sách hồ sơ học sinh
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cán bộ / GV</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{totalUsers}</div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            {totalTeachers} GVCN • {totalBGH} BGH
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phân hiệu</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{campuses.length}</div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Khu trung tâm & khu lẻ
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-indigo-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Chỉ tiêu Bán trú</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900">{indicators.length}</div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">
            Nhóm theo dõi & báo cáo
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs hover:border-cyan-300 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Đám mây Supabase</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isCloudConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              <Database className="w-4 h-4" />
            </div>
          </div>
          <div className="text-sm font-black text-slate-900 truncate">
            {isCloudConnected ? 'Đã Kết Nối' : 'Chế độ Offline'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium truncate">
            {isCloudConnected ? 'Đồng bộ Realtime' : 'Lưu trữ CSDL cục bộ'}
          </div>
        </div>
      </div>

      {/* Notice Message if cleaned */}
      {cleanMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-800 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span>{cleanMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setCleanMessage(null)}
            className="text-xs text-emerald-600 hover:text-emerald-900 font-bold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Admin Modules Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              CÁC PHÂN HỆ QUẢN TRỊ WEBSITE
            </h2>
            <p className="text-xs text-slate-500">
              Chọn một phân hệ bên dưới để cấu hình và vận hành hệ thống
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400">8 Chức năng</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {adminModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.id}
                onClick={() => onNavigate(mod.path)}
                className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className={`w-11 h-11 rounded-xl ${mod.color} text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${mod.badgeColor}`}>
                      {mod.badge}
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-slate-900 group-hover:text-blue-700 transition-colors mb-1.5">
                    {mod.title}
                  </h3>

                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-3 mb-4">
                    {mod.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600 group-hover:text-blue-800">
                  <span className="text-[11px] text-slate-400 font-semibold truncate">
                    {mod.actions[0]}
                  </span>
                  <div className="flex items-center gap-1">
                    <span>Quản lý</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Admin Utilities & System Maintenance Box */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>TIỆN ÍCH QUẢN TRỊ & BẢO TRÌ HỆ THỐNG</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Công cụ hỗ trợ Quản trị viên xử lý sự cố, dọn dẹp dữ liệu rác và sao lưu định kỳ
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportBackup}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>{backupSuccess ? 'Đã tải bản sao lưu!' : 'Sao lưu dữ liệu (JSON)'}</span>
            </button>
            <button
              type="button"
              onClick={handleCleanDuplicates}
              disabled={cleaningDuplicates}
              className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cleaningDuplicates ? 'animate-spin' : ''}`} />
              <span>Dọn dẹp GVCN trùng lặp</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Đường dẫn truy cập URL /admin</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              Bạn có thể truy cập thẳng vào trang Quản trị bằng cách nhập <code className="bg-slate-200/80 px-1.5 py-0.5 rounded text-blue-700 font-mono font-bold">/admin</code> trên thanh địa chỉ trình duyệt web.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-amber-600" />
              <span>Khóa sổ báo cáo & Phân quyền</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              Quản trị viên có quyền khóa hoặc mở khóa nhập điểm danh cho từng lớp hoặc toàn trường khi hết hạn nộp báo cáo hằng ngày.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Bảo vệ Dữ liệu CSDL</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              Dữ liệu được lưu trữ tự động trên thiết bị và đồng bộ hóa tức thời lên Cloud Supabase khi thiết bị có kết nối mạng Internet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
