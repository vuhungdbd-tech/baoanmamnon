import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import {
  School,
  LogIn,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Award,
  GraduationCap,
  Calendar,
  Settings2,
  ArrowRight,
  UserCheck,
  Plus,
  Check,
  X,
  Sparkles,
  AlertCircle,
  Lock,
  Unlock,
  Trash2,
  MapPin,
  Users,
  Search,
} from 'lucide-react';
import { SchoolYear, Profile } from '../types';
import { PWAInstallButton } from '../components/PWAInstallButton';
import { isSupabaseConnected } from '../services/supabase';
import { removeVietnameseTones } from '../utils/vietnamese';

interface LoginPageProps {
  onLoginSuccess: (targetPath?: string) => void;
  isAdminRoute?: boolean;
  onNavigateToAdmin?: () => void;
  onNavigateToPublic?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  isAdminRoute = false,
  onNavigateToAdmin,
  onNavigateToPublic,
}) => {
  const { currentUser, login, allUsers, switchUser, reloadUsers } = useAuth();
  const {
    settings,
    classes,
    campuses,
    years,
    activeYear,
    setActiveSchoolYear,
    saveSchoolYear,
    deleteSchoolYear,
    toggleLockSchoolYear,
    preschoolGrades,
    cleanDuplicateTeachers,
  } = useSchool();

  // Mode: strictly determined by URL route (isAdminRoute ? 'ADMIN' : 'GVCN')
  const activeTab: 'GVCN' | 'ADMIN' = isAdminRoute ? 'ADMIN' : 'GVCN';

  // GVCN Selection State
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [selectedCampusTabId, setSelectedCampusTabId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sso_saved_campus_tab_id') || '';
    }
    return '';
  });
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');

  // Admin / BGH Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // School Year Config Modal State (ADMIN ONLY)
  const [showYearModal, setShowYearModal] = useState(false);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [newYearName, setNewYearName] = useState('');
  const [yearError, setYearError] = useState('');
  const [isSavingYear, setIsSavingYear] = useState(false);

  // Tự động dọn dẹp các tài khoản GVCN trùng lặp (nếu có) và tải lại người dùng khi mở trang đăng nhập
  useEffect(() => {
    const initClean = async () => {
      try {
        await cleanDuplicateTeachers();
        await reloadUsers();
      } catch (err) {
        console.warn('Auto clean duplicate teachers on login error:', err);
      }
    };
    initClean();
  }, []);

  // Initialize selected class & teacher on mount
  useEffect(() => {
    if (isAdminRoute) return;
    const savedClassId = localStorage.getItem('sso_saved_class_id');
    const savedTeacherId = localStorage.getItem('sso_saved_teacher_id');
    const savedCampusId = localStorage.getItem('sso_saved_campus_tab_id');

    if (savedClassId) {
      setSelectedClassId(savedClassId);
    }
    if (savedTeacherId) {
      setSelectedTeacherId(savedTeacherId);
    }
    if (savedCampusId) {
      setSelectedCampusTabId(savedCampusId);
    }
  }, [isAdminRoute]);

  // Sync and save selection of class
  useEffect(() => {
    if (selectedClassId) {
      localStorage.setItem('sso_saved_class_id', selectedClassId);
    }
  }, [selectedClassId]);

  // Save selected teacher
  useEffect(() => {
    if (selectedTeacherId) {
      localStorage.setItem('sso_saved_teacher_id', selectedTeacherId);
    }
  }, [selectedTeacherId]);

  // Sync teacher when selectedClassId changes
  useEffect(() => {
    if (!selectedClassId) {
      setSelectedTeacherId('');
      return;
    }

    const currentCls = classes.find((c) => c.id === selectedClassId);
    if (!currentCls) {
      setSelectedTeacherId('');
      return;
    }

    // Find teacher assigned to this class
    let teacher = allUsers.find(
      (u) =>
        u.role === 'GVCN' &&
        (u.id === currentCls.homeroom_teacher_id || u.assigned_class_id === currentCls.id)
    );

    // Fallback search by email
    if (!teacher) {
      teacher = allUsers.find(
        (u) =>
          u.role === 'GVCN' &&
          u.email.toLowerCase().includes(currentCls.class_name.toLowerCase())
      );
    }

    // Fallback to any teacher
    if (!teacher) {
      teacher = allUsers.find((u) => u.role === 'GVCN');
    }

    if (teacher) {
      setSelectedTeacherId(teacher.id);
    }
  }, [selectedClassId, classes, allUsers]);

  // Selected Class and Teacher objects
  const currentClass = classes.find((c) => c.id === selectedClassId);
  const currentTeacher = allUsers.find((u) => u.id === selectedTeacherId);

  const getCampusName = (campusId?: string) => {
    if (!campusId) return 'Khu chính';
    const campus = campuses.find(c => c.id === campusId);
    return campus ? campus.name : 'Khu chính';
  };

  // Handle GVCN Quick One-Click Login
  const handleGVCNLogin = async () => {
    if (!selectedTeacherId) {
      setError('Vui lòng chọn lớp và giáo viên chủ nhiệm.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await switchUser(selectedTeacherId);
      // GVCN is directly navigated to attendance input
      onLoginSuccess('/attendance');
    } catch {
      setError('Không thể đăng nhập. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin/BGH Standard Form Login
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const cleanEmail = email.toLowerCase().trim();
      
      const targetUser = allUsers.find(u => u.email.toLowerCase() === cleanEmail);
      if (targetUser && targetUser.role === 'GVCN') {
        setError('Tài khoản của bạn là Giáo viên, không được phép đăng nhập qua cổng Quản trị. Vui lòng chuyển sang thẻ GIÁO VIÊN CHỦ NHIỆM.');
        setIsSubmitting(false);
        return;
      }

      if (cleanEmail === 'admin@db.edu.vn' || cleanEmail === 'admin' || cleanEmail === 'admin@xadung.edu.vn') {
        const p = password.trim();
        if (p !== 'admin123456@' && p !== 'admin123456' && p !== '123456' && p !== 'admin') {
          setError('Mật khẩu Quản trị không đúng! Vui lòng kiểm tra lại.');
          setIsSubmitting(false);
          return;
        }
      }
      const ok = await login(email);
      if (ok) {
        onLoginSuccess('/admin');
      } else {
        setError('Email hoặc tài khoản không chính xác. Vui lòng thử lại.');
      }
    } catch {
      setError('Đã xảy ra lỗi khi đăng nhập.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle 1-click Quick Login for testing
  const handleQuickLogin = async (userId: string, targetPath: string = '/dashboard') => {
    await switchUser(userId);
    const targetUser = allUsers.find(u => u.id === userId);
    if (targetUser?.role === 'ADMIN' || targetUser?.role === 'BGH' || isAdminRoute) {
      onLoginSuccess('/admin');
    } else {
      onLoginSuccess(targetPath);
    }
  };

  // Open Admin Year Modal with verification check
  const handleOpenAdminYearModal = () => {
    if (currentUser?.role === 'ADMIN' || isAdminUnlocked) {
      setIsAdminUnlocked(true);
    } else {
      setIsAdminUnlocked(false);
      setAdminPasswordInput('');
      setAdminAuthError('');
    }
    setShowYearModal(true);
  };

  // Verify admin password before accessing year configuration
  const handleVerifyAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminAuthError('');
    const input = adminPasswordInput.trim();
    if (input === 'admin123456@' || input === 'admin123456' || input === '123456' || input === 'admin123' || input === 'admin') {
      setIsAdminUnlocked(true);
      setAdminAuthError('');
    } else {
      setAdminAuthError('Mật khẩu Quản trị không chính xác! Vui lòng thử lại.');
    }
  };

  // Handle switching active school year (Admin only)
  const handleSelectSchoolYear = async (yearId: string) => {
    try {
      await setActiveSchoolYear(yearId);
    } catch (e) {
      console.error('Failed to set active school year:', e);
    }
  };

  // Handle locking/unlocking year (Admin only)
  const handleToggleLockYear = async (yearId: string, currentLocked?: boolean) => {
    try {
      await toggleLockSchoolYear(yearId, !currentLocked);
    } catch (e) {
      console.error('Failed to toggle lock year:', e);
    }
  };

  // Handle deleting school year (Admin only)
  const handleDeleteYear = async (yearId: string) => {
    if (yearId === activeYear?.id) {
      alert('Không thể xóa năm học đang áp dụng!');
      return;
    }
    if (confirm('Bạn có chắc chắn muốn xóa năm học này?')) {
      try {
        await deleteSchoolYear(yearId);
      } catch (e) {
        console.error('Failed to delete school year:', e);
      }
    }
  };

  // Handle adding new school year (Admin only)
  const handleAddNewSchoolYear = async (e: React.FormEvent) => {
    e.preventDefault();
    setYearError('');
    const trimmed = newYearName.trim();
    if (!trimmed) {
      setYearError('Vui lòng nhập tên năm học (ví dụ: 2027-2028).');
      return;
    }

    // Check if duplicate
    const exists = years.some((y) => y.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setYearError('Năm học này đã tồn tại trong danh sách.');
      return;
    }

    setIsSavingYear(true);
    try {
      const newYearId = `year_${trimmed.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}`;
      const newYear: SchoolYear = {
        id: newYearId,
        name: trimmed,
        is_active: true,
        is_locked: false,
        created_at: new Date().toISOString(),
      };
      await saveSchoolYear(newYear);
      await setActiveSchoolYear(newYearId);
      setNewYearName('');
    } catch {
      setYearError('Có lỗi xảy ra khi lưu năm học.');
    } finally {
      setIsSavingYear(false);
    }
  };

  // Danh sách GVCN đã được lọc trùng tên tuyệt đối (mỗi giáo viên chỉ xuất hiện đúng 1 lần)
  const gvcnUsers = useMemo(() => {
    const rawGvcn = allUsers.filter((u) => u.role === 'GVCN');
    const sorted = [...rawGvcn].sort((a, b) => {
      const aAssigned = classes.some((c) => c.id === a.assigned_class_id || c.homeroom_teacher_id === a.id) ? 1 : 0;
      const bAssigned = classes.some((c) => c.id === b.assigned_class_id || c.homeroom_teacher_id === b.id) ? 1 : 0;
      if (bAssigned !== aAssigned) return bAssigned - aAssigned;
      const aPhone = a.phone ? 1 : 0;
      const bPhone = b.phone ? 1 : 0;
      if (bPhone !== aPhone) return bPhone - aPhone;
      return a.full_name.localeCompare(b.full_name);
    });

    const result: Profile[] = [];
    const seenNames = new Set<string>();

    for (const u of sorted) {
      const normName = removeVietnameseTones(u.full_name.trim().toLowerCase()).replace(/\s+/g, ' ');
      if (!normName) continue;

      if (seenNames.has(normName)) {
        // Đã có giáo viên này trong danh sách -> bỏ qua ngay, tuyệt đối không hiển thị trùng lặp!
        continue;
      }
      seenNames.add(normName);
      result.push(u);
    }
    return result;
  }, [allUsers, classes]);

  // Danh sách các phân hiệu đang hoạt động
  const activeCampuses = useMemo(() => {
    return campuses.filter((c) => c.active !== false);
  }, [campuses]);

  // ID phân hiệu chính/mặc định đầu tiên
  const primaryCampusId = useMemo(() => {
    return activeCampuses[0]?.id || 'c_1';
  }, [activeCampuses]);

  // Danh sách thẻ phân hiệu (Campus Tabs)
  const campusTabs = useMemo(() => {
    if (activeCampuses.length === 0) {
      return [
        {
          id: 'ALL',
          name: 'Toàn trường',
          classCount: classes.length,
          teacherCount: gvcnUsers.length,
        },
      ];
    }

    const tabs = activeCampuses.map((camp) => {
      const campClasses = classes.filter((c) => (c.campus_id || primaryCampusId) === camp.id);
      const campClassIds = new Set(campClasses.map((c) => c.id));
      const campTeacherIds = new Set(campClasses.map((c) => c.homeroom_teacher_id).filter(Boolean));

      const campTeachers = gvcnUsers.filter((u) => {
        if (campTeacherIds.has(u.id)) return true;
        if (u.assigned_class_id && campClassIds.has(u.assigned_class_id)) return true;
        return false;
      });

      return {
        id: camp.id,
        name: camp.name,
        classCount: campClasses.length,
        teacherCount: campTeachers.length,
      };
    });

    // Thêm thẻ "Toàn trường" nếu trường có nhiều hơn 1 phân hiệu
    if (tabs.length > 1) {
      tabs.push({
        id: 'ALL',
        name: 'Toàn trường',
        classCount: classes.length,
        teacherCount: gvcnUsers.length,
      });
    }

    return tabs;
  }, [activeCampuses, primaryCampusId, classes, gvcnUsers]);

  // ID phân hiệu đang được kích hoạt thực tế
  const activeCampusTabId = useMemo(() => {
    if (selectedCampusTabId && (selectedCampusTabId === 'ALL' || campusTabs.some((t) => t.id === selectedCampusTabId))) {
      return selectedCampusTabId;
    }
    // Nếu có lớp đã chọn, ưu tiên phân hiệu của lớp đó
    if (selectedClassId) {
      const cls = classes.find((c) => c.id === selectedClassId);
      const clsCampus = cls?.campus_id || primaryCampusId;
      if (campusTabs.some((t) => t.id === clsCampus)) {
        return clsCampus;
      }
    }
    return campusTabs[0]?.id || 'ALL';
  }, [selectedCampusTabId, campusTabs, selectedClassId, classes, primaryCampusId]);

  // Danh sách lớp học thuộc phân hiệu đã chọn
  const filteredCampusClasses = useMemo(() => {
    if (activeCampusTabId === 'ALL') {
      return classes;
    }
    return classes.filter((c) => (c.campus_id || primaryCampusId) === activeCampusTabId);
  }, [classes, primaryCampusId, activeCampusTabId]);

  // Nhóm lớp học theo khối mầm non (dành cho dropdown chọn lớp)
  const classesByPreschoolGrade = useMemo(() => {
    return preschoolGrades.map((pg) => ({
      gradeConfig: pg,
      classes: filteredCampusClasses.filter((c) => c.grade === pg.grade_num),
    }));
  }, [preschoolGrades, filteredCampusClasses]);

  // Danh sách GVCN thuộc phân hiệu đã chọn (giúp GVCN tìm tên cực nhanh)
  const campusGvcnUsers = useMemo(() => {
    if (activeCampusTabId === 'ALL') {
      return gvcnUsers;
    }
    const campClassIds = new Set(filteredCampusClasses.map((c) => c.id));
    const campTeacherIds = new Set(filteredCampusClasses.map((c) => c.homeroom_teacher_id).filter(Boolean));

    return gvcnUsers.filter((u) => {
      if (campTeacherIds.has(u.id)) return true;
      if (u.assigned_class_id && campClassIds.has(u.assigned_class_id)) return true;
      return false;
    });
  }, [gvcnUsers, filteredCampusClasses, activeCampusTabId]);

  // Kết quả tìm kiếm nhanh tên giáo viên trên toàn trường
  const teacherSearchResults = useMemo(() => {
    const q = removeVietnameseTones(teacherSearchTerm.trim().toLowerCase());
    if (!q) return [];
    return gvcnUsers.filter((u) => {
      const name = removeVietnameseTones(u.full_name.toLowerCase());
      const cls = classes.find(
        (c) => c.id === u.assigned_class_id || c.homeroom_teacher_id === u.id
      );
      const clsName = cls ? removeVietnameseTones(cls.class_name.toLowerCase()) : '';
      return name.includes(q) || clsName.includes(q);
    }).slice(0, 8);
  }, [teacherSearchTerm, gvcnUsers, classes]);

  // Xử lý khi nhấn chọn thẻ phân hiệu
  const handleSelectCampusTab = (campusId: string) => {
    setSelectedCampusTabId(campusId);
    try {
      localStorage.setItem('sso_saved_campus_tab_id', campusId);
    } catch {}

    const targetClasses = campusId === 'ALL'
      ? classes
      : classes.filter((c) => (c.campus_id || primaryCampusId) === campusId);

    if (targetClasses.length > 0) {
      const isClassInCampus = targetClasses.some((c) => c.id === selectedClassId);
      if (!isClassInCampus) {
        // Tự động chuyển sang lớp đầu tiên của phân hiệu này
        const firstCls = targetClasses[0];
        setSelectedClassId(firstCls.id);

        const assignedTeacher = allUsers.find(
          (u) =>
            u.role === 'GVCN' &&
            (u.id === firstCls.homeroom_teacher_id || u.assigned_class_id === firstCls.id)
        );
        if (assignedTeacher) {
          setSelectedTeacherId(assignedTeacher.id);
        } else {
          const campTeacher = gvcnUsers.find((u) =>
            targetClasses.some((c) => c.homeroom_teacher_id === u.id || c.id === u.assigned_class_id)
          );
          if (campTeacher) {
            setSelectedTeacherId(campTeacher.id);
          }
        }
      }
    }
  };

  // Xử lý khi chọn giáo viên trực tiếp (từ card hoặc search)
  const handleSelectTeacher = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    const matchedClass = classes.find(
      (c) =>
        c.homeroom_teacher_id === teacherId ||
        c.id === allUsers.find((u) => u.id === teacherId)?.assigned_class_id
    );
    if (matchedClass) {
      setSelectedClassId(matchedClass.id);
      const clsCampus = matchedClass.campus_id || primaryCampusId;
      if (clsCampus && activeCampusTabId !== 'ALL' && activeCampusTabId !== clsCampus) {
        setSelectedCampusTabId(clsCampus);
        try {
          localStorage.setItem('sso_saved_campus_tab_id', clsCampus);
        } catch {}
      }
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-100 via-slate-50 to-slate-200 flex flex-col justify-center py-4 px-4 sm:px-6 lg:px-8">
      {!isSupabaseConnected() && (
        <div className="sm:mx-auto sm:w-full sm:max-w-lg mb-6 animate-in fade-in slide-in-from-top-4">
          <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900 leading-relaxed">
              <strong className="block font-bold mb-1">Cảnh báo: Dữ liệu đang lưu cục bộ!</strong>
              Mọi cấu hình hiện tại chưa được lưu lên Supabase do trình duyệt này chưa có thông số kết nối.
              Hãy đăng nhập bằng tài khoản Quản trị, vào <strong>Cài đặt Hệ thống &gt; Supabase</strong> để điền URL & API Key, sau đó bấm <strong>Lấy dữ liệu từ Cloud</strong> để đồng bộ.
            </div>
          </div>
        </div>
      )}

      {/* Header Branding */}
      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center">
        <div
          className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/10 flex-shrink-0"
          style={{ backgroundColor: settings?.primary_color || '#1e40af' }}
        >
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="w-8 h-8 object-contain rounded-xl" />
          ) : (
            <School className="w-8 h-8" />
          )}
        </div>
        <h1 className="mt-2 text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
          SỔ BÁO CÁO SĨ SỐ ĐIỆN TỬ
        </h1>
        <p className="mt-0.5 text-sm font-bold text-blue-700">
          {settings?.school_name || 'Hệ thống Quản lý Báo cáo Sĩ số'}
        </p>
        {(settings?.commune || settings?.province) ? (
          <p className="text-xs text-slate-500 mt-0.5">
            {[settings.commune, settings.province].filter(Boolean).join(' • ')}
          </p>
        ) : (
          <p className="text-xs text-slate-500 mt-0.5">
            Sổ điện tử theo dõi chuyên cần & sĩ số học sinh hằng ngày
          </p>
        )}
        <div className="mt-4 flex justify-center">
          <PWAInstallButton />
        </div>
      </div>

      {/* School Year Info Bar */}
      <div className="mt-3 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className={`bg-white/90 backdrop-blur-xs border rounded-xl px-3.5 py-2 shadow-xs flex items-center justify-between gap-2 ${
          isAdminRoute ? 'border-purple-200/80' : 'border-blue-200/80'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isAdminRoute ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
            }`}>
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                Năm học hoạt động
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-black ${isAdminRoute ? 'text-purple-950' : 'text-blue-950'}`}>
                  Năm học {activeYear?.name || '2026-2027'}
                </span>
                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Đang áp dụng
                </span>
              </div>
            </div>
          </div>

          {isAdminRoute && (
            <button
              type="button"
              onClick={handleOpenAdminYearModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 hover:bg-purple-50 border border-purple-200 transition-colors flex-shrink-0"
              title="Cấu hình năm học (Dành riêng cho Quản trị viên)"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Cấu hình năm học</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Login Card */}
      <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-lg">
        {isAdminRoute ? (
          /* DÀNH RIÊNG CHO URL /admin */
          <div className="bg-white shadow-xl rounded-2xl border border-purple-200 overflow-hidden">
            {/* Header on card for Admin */}
            <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 text-white p-5 text-center relative overflow-hidden">
              <div className="w-12 h-12 rounded-2xl bg-white/10 text-purple-200 border border-white/20 flex items-center justify-center mx-auto mb-2 shadow-inner">
                <ShieldCheck className="w-6 h-6 text-purple-300" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-purple-200 border border-white/20 mb-1.5">
                <span>URL: /admin</span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white uppercase">
                ĐĂNG NHẬP BAN GIÁM HIỆU & QUẢN TRỊ VIÊN
              </h2>
              <p className="text-xs text-purple-200/80 mt-1 max-w-sm mx-auto">
                Cổng quản trị dành cho BGH và Quản trị viên trường học
              </p>
            </div>

            <div className="p-4 sm:p-5">
              {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleAdminSubmit}>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Email hoặc Tên đăng nhập <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      required
                      placeholder="Nhập email hoặc tên đăng nhập..."
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Mật khẩu Quản trị <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1 relative">
                    <input
                      type="password"
                      required
                      placeholder="Nhập mật khẩu..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors shadow-2xs"
                    />
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                  </div>
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all disabled:opacity-50"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>{isSubmitting ? 'Đang xác thực...' : 'ĐĂNG NHẬP QUẢN TRỊ'}</span>
                  </button>
                </div>
              </form>

              {/* Quick Testing 1-Click for Admin/BGH if available */}
              {allUsers.filter(u => u.role === 'ADMIN' || u.role === 'BGH').length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 text-center">
                    Đăng nhập nhanh (Tài khoản Quản trị / BGH)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {allUsers.filter(u => u.role === 'ADMIN' || u.role === 'BGH').slice(0, 4).map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleQuickLogin(u.id, '/admin')}
                        className="p-2 rounded-lg border border-purple-100 bg-purple-50/50 hover:bg-purple-100/80 text-left transition-colors flex items-center gap-2"
                      >
                        <div className="w-6 h-6 rounded-md bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold">
                          {u.role === 'ADMIN' ? 'AD' : 'BGH'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-purple-950 truncate">{u.full_name}</div>
                          <div className="text-[9px] text-purple-600 font-medium truncate">{u.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Back link to teacher view */}
              {onNavigateToPublic && (
                <div className="mt-4 pt-3 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={onNavigateToPublic}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-700 font-semibold transition-colors"
                  >
                    <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                    <span>Quay lại Cổng Giáo viên (Báo cáo sĩ số)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* DÀNH CHO CỬA SỔ ĐĂNG NHẬP CHÍNH (GIÁO VIÊN CHỦ NHIỆM) - KHÔNG CÓ TAB HOẶC NÚT QUẢN TRỊ */
          <div className="bg-white shadow-xl rounded-2xl border border-slate-200 overflow-hidden">
            {/* Header on card for GVCN */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-blue-700" />
                <span className="text-xs font-black text-blue-900 uppercase tracking-tight">
                  CỔNG BÁO CÁO SĨ SỐ - GIÁO VIÊN CHỦ NHIỆM
                </span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                Điểm danh nhanh
              </span>
            </div>

            <div className="p-4 sm:p-5">
              {error && (
                <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-900 flex items-start gap-2 leading-relaxed">
                  <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Đăng nhập nhanh cho GVCN:</span> Chọn <strong>thẻ Phân hiệu</strong> của bạn bên dưới, sau đó chạm vào tên mình hoặc lớp để vào báo cáo sĩ số ngay.
                  </div>
                </div>

                {/* TÌM KIẾM NHANH TÊN GIÁO VIÊN / LỚP HỌC */}
                <div className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Tìm nhanh theo tên Giáo viên hoặc Tên lớp..."
                      value={teacherSearchTerm}
                      onChange={(e) => setTeacherSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50/60 shadow-2xs"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                    {teacherSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setTeacherSearchTerm('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Xóa tìm kiếm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* KẾT QUẢ TÌM KIẾM NHANH */}
                  {teacherSearchTerm.trim() && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 p-1.5 max-h-56 overflow-y-auto">
                      {teacherSearchResults.length === 0 ? (
                        <div className="p-3 text-center text-xs text-slate-500">
                          Không tìm thấy giáo viên hoặc lớp phù hợp với "{teacherSearchTerm}"
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Kết quả tìm kiếm ({teacherSearchResults.length})
                          </div>
                          {teacherSearchResults.map((teacher) => {
                            const teacherClass = classes.find(
                              (c) => c.id === teacher.assigned_class_id || c.homeroom_teacher_id === teacher.id
                            );
                            const campName = teacherClass ? getCampusName(teacherClass.campus_id) : 'Chưa gắn lớp';
                            return (
                              <button
                                key={teacher.id}
                                type="button"
                                onClick={() => {
                                  handleSelectTeacher(teacher.id);
                                  setTeacherSearchTerm('');
                                }}
                                className="w-full text-left p-2 rounded-lg hover:bg-blue-50 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center flex-shrink-0">
                                    {teacher.full_name.trim().charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-slate-900 truncate">
                                      {teacher.full_name}
                                    </div>
                                    <div className="text-[10px] text-slate-500 truncate">
                                      {teacherClass ? `Lớp ${teacherClass.class_name}` : 'Chưa phân lớp'} • {campName}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex-shrink-0">
                                  Chọn
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 1. THẺ CÁC PHÂN HIỆU / ĐIỂM TRƯỜNG */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>Thẻ phân hiệu / Điểm trường <span className="text-red-500">*</span></span>
                    </label>
                    <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      {campusTabs.find((t) => t.id === activeCampusTabId)?.name || 'Phân hiệu'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1">
                    {campusTabs.map((tab) => {
                      const isActive = activeCampusTabId === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleSelectCampusTab(tab.id)}
                          className={`group flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex-shrink-0 cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-2 ring-blue-400'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {tab.id === 'ALL' ? (
                            <School className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                          ) : (
                            <MapPin className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-blue-600'}`} />
                          )}
                          <span>{tab.name}</span>
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                              isActive ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {tab.teacherCount} GV
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. BẢNG CHỌN NHANH GIÁO VIÊN TRONG PHÂN HIỆU */}
                {campusGvcnUsers.length > 0 ? (
                  <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                        <span>Giáo viên {campusTabs.find((t) => t.id === activeCampusTabId)?.name || 'phân hiệu'}:</span>
                      </div>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full">
                        Chạm để chọn
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-0.5">
                      {campusGvcnUsers.map((teacher) => {
                        const isSelected = selectedTeacherId === teacher.id;
                        const teacherClass = classes.find(
                          (c) => c.id === teacher.assigned_class_id || c.homeroom_teacher_id === teacher.id
                        );
                        return (
                          <button
                            key={teacher.id}
                            type="button"
                            onClick={() => handleSelectTeacher(teacher.id)}
                            className={`p-2 rounded-xl text-left border flex items-center justify-between gap-2 transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                                : 'bg-white hover:bg-blue-50/50 border-slate-200 text-slate-800 hover:border-blue-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                                  isSelected ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {teacher.full_name.trim().charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                  {teacher.full_name}
                                </div>
                                <div className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-blue-700 font-semibold'}`}>
                                  {teacherClass ? `Lớp ${teacherClass.class_name}` : 'Chưa phân lớp'}
                                </div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                                <Check className="w-3.5 h-3.5 text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                    Phân hiệu này chưa có giáo viên nào được phân công. Bạn có thể chọn lớp bên dưới hoặc chuyển sang thẻ <strong>Toàn trường</strong>.
                  </div>
                )}

                {/* 3. DROPDOWN LỚP HỌC (ĐÃ LỌC THEO PHÂN HIỆU) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Lớp học thuộc phân hiệu <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => {
                      const newClsId = e.target.value;
                      setSelectedClassId(newClsId);
                      const targetCls = classes.find((c) => c.id === newClsId);
                      if (targetCls) {
                        const assignedTeacher = allUsers.find(
                          (u) =>
                            u.role === 'GVCN' &&
                            (u.id === targetCls.homeroom_teacher_id || u.assigned_class_id === targetCls.id)
                        );
                        if (assignedTeacher) {
                          setSelectedTeacherId(assignedTeacher.id);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-2xs"
                  >
                    <option value="" disabled>-- Vui lòng chọn lớp học --</option>
                    {classesByPreschoolGrade.map(({ gradeConfig, classes: gradeClasses }) => {
                      if (gradeClasses.length === 0) return null;
                      return (
                        <optgroup key={gradeConfig.id} label={`${gradeConfig.name} (${gradeConfig.age_range})`}>
                          {gradeClasses.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              Lớp {cls.class_name} ({getCampusName(cls.campus_id)})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>

                {/* 4. DROPDOWN GIÁO VIÊN CHỦ NHIỆM */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Tên Giáo viên chủ nhiệm <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[10px] text-blue-600 font-semibold">Tự nhận diện theo lớp</span>
                  </div>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => handleSelectTeacher(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors shadow-2xs"
                  >
                    <option value="" disabled>-- Vui lòng chọn giáo viên chủ nhiệm --</option>
                    {(campusGvcnUsers.length > 0 ? campusGvcnUsers : gvcnUsers).map((teacher) => {
                      const teacherClass = classes.find(
                        (c) => c.id === teacher.assigned_class_id || c.homeroom_teacher_id === teacher.id
                      );
                      return (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.full_name} {teacherClass ? `(Lớp ${teacherClass.class_name})` : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Teacher Info Preview Card */}
                  {currentTeacher && (() => {
                    const teacherAssignedClass = classes.find(
                      (c) => c.id === currentTeacher.assigned_class_id || c.homeroom_teacher_id === currentTeacher.id
                    ) || currentClass;
                    const campName = teacherAssignedClass ? getCampusName(teacherAssignedClass.campus_id) : '';
                    return (
                      <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-xs">
                            {currentTeacher.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-black text-slate-900 truncate">
                              {currentTeacher.full_name}
                            </div>
                            <div className="text-[10px] text-blue-700 font-bold flex items-center gap-1.5 mt-0.5">
                              <span>GVCN {teacherAssignedClass ? `Lớp ${teacherAssignedClass.class_name}` : ''}</span>
                              {campName && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-600 font-semibold">{campName}</span>
                                </>
                              )}
                              <span>•</span>
                              <span className="text-slate-500 font-medium">Năm {activeYear?.name || '2026-2027'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Check className="w-2.5 h-2.5" />
                            Sẵn sàng
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Big Action Button: Vào báo cáo sĩ số ngay */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleGVCNLogin}
                    disabled={isSubmitting || !selectedTeacherId}
                    className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-md text-sm font-black text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50"
                  >
                    <span>VÀO BÁO CÁO SĨ SỐ NGAY</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-center text-[10px] text-slate-400 mt-1.5">
                    Hệ thống sẽ chuyển trực tiếp vào màn hình nhập sĩ số của lớp {currentClass?.class_name || ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL CẤU HÌNH NĂM HỌC - CHỈ QUẢN TRỊ VIÊN CÓ QUYỀN */}
      {showYearModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                  isAdminUnlocked ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {isAdminUnlocked ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {isAdminUnlocked ? 'CẤU HÌNH NĂM HỌC (QUẢN TRỊ)' : 'XÁC THỰC QUYỀN HẠN QUẢN TRỊ'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isAdminUnlocked
                      ? 'Thêm, kích hoạt và quản lý năm học hoạt động'
                      : 'Chỉ Quản trị viên mới có quyền cấu hình năm học'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowYearModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STEP 1: Admin Password Verification if not yet verified */}
            {!isAdminUnlocked ? (
              <form onSubmit={handleVerifyAdmin} className="mt-5 space-y-4">
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Quyền hạn bảo mật:</span> Chức năng cấu hình năm học chỉ dành riêng cho <strong>Quản trị viên (ADMIN)</strong>. Vui lòng nhập mật khẩu Quản trị để tiếp tục.
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Mật khẩu Quản trị viên
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      autoFocus
                      required
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      placeholder="Nhập mật khẩu Quản trị..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-2xs"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
                  </div>
                </div>

                {adminAuthError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{adminAuthError}</span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowYearModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Xác nhận quyền Quản trị</span>
                  </button>
                </div>
              </form>
            ) : (
              /* STEP 2: Full Admin School Year Management */
              <div className="mt-4 space-y-5">
                {/* Admin badge */}
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Đã xác thực quyền <strong>Quản trị viên (ADMIN)</strong></span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Toàn quyền
                  </span>
                </div>

                {/* Add New School Year Form */}
                <form onSubmit={handleAddNewSchoolYear} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Thêm năm học mới vào hệ thống
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newYearName}
                        onChange={(e) => setNewYearName(e.target.value)}
                        placeholder="Ví dụ: 2027-2028"
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 font-semibold shadow-2xs"
                      />
                      <button
                        type="submit"
                        disabled={isSavingYear || !newYearName.trim()}
                        className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 transition-colors flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0 shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{isSavingYear ? 'Đang lưu...' : 'Thêm năm học'}</span>
                      </button>
                    </div>
                    {yearError && (
                      <p className="text-xs text-red-600 font-semibold mt-1">{yearError}</p>
                    )}
                  </div>
                </form>

                {/* List of existing school years */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Danh sách năm học & Trạng thái áp dụng
                  </label>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {years.map((y) => {
                      const isActive = y.id === activeYear?.id;
                      return (
                        <div
                          key={y.id}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                            isActive
                              ? 'bg-purple-50/70 border-purple-300 ring-1 ring-purple-400/30'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Calendar className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-purple-700' : 'text-slate-400'}`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold truncate ${isActive ? 'text-purple-950' : 'text-slate-800'}`}>
                                  Năm học {y.name}
                                </span>
                                {y.is_locked && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                                    Đã khóa
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {isActive ? 'Đang áp dụng toàn trường' : 'Chưa áp dụng'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {/* Toggle Lock Button */}
                            <button
                              type="button"
                              onClick={() => handleToggleLockYear(y.id, y.is_locked)}
                              title={y.is_locked ? 'Mở khóa năm học' : 'Khóa năm học này'}
                              className={`p-1.5 rounded-lg border text-xs transition-colors ${
                                y.is_locked
                                  ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {y.is_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>

                            {/* Delete button (only if not active) */}
                            {!isActive && (
                              <button
                                type="button"
                                onClick={() => handleDeleteYear(y.id)}
                                title="Xóa năm học"
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Active or Switch Button */}
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-600 text-white shadow-2xs">
                                <Check className="w-3 h-3" />
                                Đang áp dụng
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectSchoolYear(y.id);
                                }}
                                className="px-3 py-1 rounded-lg text-xs font-bold text-slate-700 border border-slate-300 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300 transition-colors"
                              >
                                Kích hoạt
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer close button */}
                <div className="pt-3 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowYearModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    Hoàn tất & Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
