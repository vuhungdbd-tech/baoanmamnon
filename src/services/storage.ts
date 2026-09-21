import {
  Profile,
  SchoolSettings,
  SchoolYear,
  Campus,
  ClassItem,
  IndicatorGroup,
  DailyReport,
  DailyReportValue,
  SystemLog,
  ClassReportRow,
  ReportStatus,
  SchoolOffDay,
  AttendanceRankingSummary,
  ClassAttendanceRank,
  AttendancePeriodType,
  CampusRankingSummary,
  SchoolWeekInfo,
  PreschoolDailyData,
  PreschoolSchoolTotals,
  AbsentStudent,
  PreschoolGradeConfig,
  DEFAULT_PRESCHOOL_GRADES,
  getPreschoolBirthYearsForSchoolYear,
  getDefaultPreschoolGradesForSchoolYear,
  parseSchoolStartYear,
} from '../types';
import { getSupabaseClient, isSupabaseConnected } from './supabase';
import {
  DEFAULT_WEEK1_START_DATE,
  DEFAULT_SCHOOL_DAYS_PER_WEEK,
  DEFAULT_EARLY_REPORT_DEADLINE,
  DEFAULT_EARLY_REPORT_BONUS_PER_DAY,
  DEFAULT_EARLY_REPORT_MAX_BONUS,
  getSchoolWeekFromDate,
  getSchoolWeekInfo,
  checkIsReportEarly,
  addDaysToDateStr,
  parseDateParts,
  getTodayDateStr,
} from '../utils/schoolWeeks';
import { getTeacherAllowedScope } from '../utils/preschoolPermissions';
import { removeVietnameseTones } from '../utils/vietnamese';

const STORAGE_KEYS = {
  SETTINGS: 'sso_school_settings_v1',
  YEARS: 'sso_school_years_v1',
  CAMPUSES: 'sso_campuses_v1',
  CLASSES: 'sso_classes_v1',
  PROFILES: 'sso_profiles_v1',
  INDICATORS: 'sso_indicator_groups_v1',
  REPORTS: 'sso_daily_reports_v1',
  VALUES: 'sso_daily_report_values_v1',
  LOGS: 'sso_system_logs_v1',
  OFF_DAYS: 'sso_school_off_days_v1',
  STUDENTS: 'sso_students_v1',
  PRESCHOOL_GRADES: 'sso_preschool_grades_v1',
  DELETED_PROFILE_IDS: 'sso_deleted_profile_ids_v1',
};

export function getDeletedProfileIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_PROFILE_IDS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

export function recordDeletedProfileIds(ids: string[]) {
  if (typeof window === 'undefined' || !ids || ids.length === 0) return;
  try {
    const set = getDeletedProfileIds();
    ids.forEach((id) => set.add(id));
    localStorage.setItem(STORAGE_KEYS.DELETED_PROFILE_IDS, JSON.stringify(Array.from(set)));
  } catch {}
}

export interface TableSyncStatus {
  table: string;
  label: string;
  localCount: number;
  cloudCount: number;
  inSync: boolean;
  error?: string;
}

// Cross-tab and in-tab realtime notification channel
const realtimeChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('sso_attendance_realtime')
    : null;

export function notifyRealtimeChange(table: string, payload?: any) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sso_realtime_update', { detail: { table, payload } }));
    realtimeChannel?.postMessage({ table, payload, timestamp: Date.now() });
  }
}

export function subscribeRealtime(callback: (event: { table: string; payload?: any }) => void) {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = (e: any) => {
    callback(e.detail);
  };
  const handleBroadcast = (e: MessageEvent) => {
    callback(e.data);
  };

  window.addEventListener('sso_realtime_update', handleCustom);
  realtimeChannel?.addEventListener('message', handleBroadcast);

  // If Supabase is connected, subscribe to Postgres changes across all core tables
  const supabase = getSupabaseClient();
  let channel: any = null;
  if (supabase) {
    try {
      channel = supabase
        .channel('public:all_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_reports' }, (payload) => {
          callback({ table: 'daily_reports', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_report_values' }, (payload) => {
          callback({ table: 'daily_report_values', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, (payload) => {
          callback({ table: 'classes', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'school_settings' }, (payload) => {
          callback({ table: 'school_settings', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'school_years' }, (payload) => {
          callback({ table: 'school_years', payload });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'indicator_groups' }, (payload) => {
          callback({ table: 'indicator_groups', payload });
        })
        .subscribe();
    } catch (e) {
      console.warn('Supabase realtime subscription failed:', e);
    }
  }

  return () => {
    window.removeEventListener('sso_realtime_update', handleCustom);
    realtimeChannel?.removeEventListener('message', handleBroadcast);
    if (channel && supabase) {
      supabase.removeChannel(channel);
    }
  };
}

// ----------------------------------------------------
// INITIAL SEED DATA BUILDER (MẶC ĐỊNH RỖNG ĐỂ CẤU HÌNH TỪ ĐẦU)
// ----------------------------------------------------
export const STORAGE_CLEAN_VERSION_KEY = 'sso_clean_state_v3_blank_slate';

export function getInitialData() {
  const now = new Date().toISOString();
  const settings: SchoolSettings = {
    id: 'school_01',
    school_name: '',
    short_name: '',
    department_name: '',
    sub_department_name: '',
    address: '',
    commune: '',
    province: '',
    phone: '',
    email: '',
    website: '',
    logo_url: '',
    principal_name: '',
    principal_title: 'Hiệu trưởng',
    reporter_name: '',
    reporter_title: 'Người lập biểu',
    report_title: 'BÁO CÁO SĨ SỐ HỌC SINH',
    footer_text: '',
    developer_name: 'Nguyễn Hùng',
    developer_contact: 'hungthcsnongu@gmail.com',
    primary_color: '#1d4ed8',
    input_mode: 'MODE_1_TOTAL_PRESENT',
    enable_campuses: false,
    week1_start_date: DEFAULT_WEEK1_START_DATE,
    school_days_per_week: DEFAULT_SCHOOL_DAYS_PER_WEEK,
    ranking_threshold_excellent: 98,
    ranking_threshold_good: 95,
    ranking_threshold_fair: 90,
    enable_early_report_bonus: true,
    early_report_deadline: DEFAULT_EARLY_REPORT_DEADLINE,
    early_report_bonus_points: DEFAULT_EARLY_REPORT_BONUS_PER_DAY,
    early_report_max_bonus: DEFAULT_EARLY_REPORT_MAX_BONUS,
    created_at: now,
    updated_at: now,
  };

  const years: SchoolYear[] = [
    { id: 'year_2026_2027', name: '2026-2027', is_active: true, is_locked: false, created_at: now },
  ];

  const campuses: Campus[] = [];

  const indicators: IndicatorGroup[] = [
    {
      id: 'ig_all',
      name: 'Học sinh toàn trường',
      code: 'ALL',
      enabled: true,
      sort_order: 1,
      show_total: true,
      show_present: true,
      show_absent: true,
      show_percentage: true,
      column_header_override: 'Học sinh toàn trường',
      created_at: now,
    },
    {
      id: 'ig_boarding_half',
      name: 'Học sinh bán trú',
      code: 'BOARDING_HALF',
      enabled: true,
      sort_order: 2,
      show_total: true,
      show_present: true,
      show_absent: true,
      show_percentage: true,
      column_header_override: 'Học sinh bán trú',
      created_at: now,
    },
  ];

  const classes: ClassItem[] = [];

  const profiles: Profile[] = [
    {
      id: 'u_admin',
      full_name: 'Quản trị viên Hệ thống',
      email: 'admin@db.edu.vn',
      role: 'ADMIN',
      active: true,
      phone: '',
      created_at: now,
    },
  ];

  const dailyReports: DailyReport[] = [];
  const dailyReportValues: DailyReportValue[] = [];
  const logs: SystemLog[] = [];

  return {
    settings,
    years,
    campuses,
    indicators,
    classes,
    profiles,
    dailyReports,
    dailyReportValues,
    logs,
  };
}

// Reset toàn bộ dữ liệu cục bộ về trạng thái rỗng để người dùng cấu hình từ đầu
export function resetAllDataToEmpty() {
  if (typeof window === 'undefined') return;
  const seed = getInitialData();
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(seed.settings));
  localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(seed.years));
  localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(seed.campuses));
  localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(seed.indicators));
  localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(seed.classes));
  localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(seed.profiles));
  localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(seed.dailyReports));
  localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(seed.dailyReportValues));
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(seed.logs));
  localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify([]));
  localStorage.setItem(STORAGE_CLEAN_VERSION_KEY, 'v3_blank_slate');
  localStorage.setItem('sso_current_user_id', 'u_admin');
  notifyRealtimeChange('all_reset');
}

// Ensure initial data exists in storage
export function ensureInitialized() {
  if (typeof window === 'undefined') return;

  if (localStorage.getItem(STORAGE_CLEAN_VERSION_KEY) !== 'v3_blank_slate') {
    resetAllDataToEmpty();
    return;
  }

  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    resetAllDataToEmpty();
  }
}

// Non-blocking background sync helper with timeout limit
function syncToSupabase(task: () => Promise<any>) {
  const supabase = getSupabaseClient();
  if (!supabase || !isSupabaseConnected()) return;

  Promise.resolve().then(async () => {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase sync timeout')), 4000)
      );
      await Promise.race([task(), timeoutPromise]);
    } catch (err) {
      console.warn('Background Supabase sync notice:', err);
    }
  });
}

// Safely merge items fetched from cloud without wiping local-first edits or newly created local items
function mergeCloudIntoLocal<T extends { id: string }>(storageKey: string, cloudItems: T[]) {
  if (!cloudItems || cloudItems.length === 0) return;
  try {
    const rawLocal = localStorage.getItem(storageKey);
    const currentLocal: T[] = rawLocal ? JSON.parse(rawLocal) : [];
    const map = new Map<string, T>();

    // Put local items first so local changes take precedence over stale cloud fetches
    currentLocal.forEach((item) => {
      if (item && item.id) map.set(item.id, item);
    });

    const isProfilesTable = storageKey === STORAGE_KEYS.PROFILES;
    const deletedProfileIds = isProfilesTable ? getDeletedProfileIds() : new Set<string>();

    let addedNew = false;
    cloudItems.forEach((c) => {
      if (!c || !c.id) return;
      if (isProfilesTable && deletedProfileIds.has(c.id)) {
        // Bản ghi này đã bị người dùng/hệ thống dọn dẹp, không được kéo lại từ Cloud!
        return;
      }

      // Nếu là bảng profiles và role là GVCN, chặn nếu đã có GVCN trùng họ tên trong local
      if (isProfilesTable) {
        const p = c as unknown as Profile;
        if (p.role === 'GVCN') {
          const normName = removeVietnameseTones(p.full_name?.trim()?.toLowerCase() || '').replace(/\s+/g, ' ');
          if (normName) {
            for (const existing of map.values()) {
              const exProfile = existing as unknown as Profile;
              if (exProfile.role === 'GVCN') {
                const exNorm = removeVietnameseTones(exProfile.full_name?.trim()?.toLowerCase() || '').replace(/\s+/g, ' ');
                if (exNorm === normName) {
                  // Đã có giáo viên này trong máy, bỏ qua bản ghi trùng lặp từ cloud
                  return;
                }
              }
            }
          }
        }
      }

      if (!map.has(c.id)) {
        map.set(c.id, c);
        addedNew = true;
      }
    });

    if (addedNew) {
      const merged = Array.from(map.values());
      localStorage.setItem(storageKey, JSON.stringify(merged));
      notifyRealtimeChange(storageKey);
    }
  } catch (err) {
    console.warn('mergeCloudIntoLocal error:', err);
  }
}

// ----------------------------------------------------
// STORAGE SERVICE CRUD & FULL SUPABASE PERSISTENCE API
// ----------------------------------------------------

/**
 * Đảm bảo các ràng buộc khóa ngoại (Foreign Keys) cho bảng daily_reports tồn tại trên Supabase
 * Tránh triệt để lỗi 23503 (Key is not present in table "classes", "profiles", "indicator_groups").
 */
async function ensureReportDependenciesInSupabase(
  supabase: any,
  classId: string,
  user?: Profile,
  groupIds: string[] = []
): Promise<void> {
  if (!supabase) return;
  try {
    // 1. Đảm bảo user profile tồn tại trên Supabase để tránh lỗi daily_reports_created_by_fkey
    if (user?.id) {
      try {
        await supabase.from('profiles').upsert({
          id: user.id,
          full_name: user.full_name || 'Người dùng',
          email: user.email || `${user.id}@school.edu.vn`,
          role: user.role || 'GVCN',
          active: user.active !== false,
          phone: user.phone || '',
          created_at: user.created_at || new Date().toISOString(),
        });
      } catch (e) {
        console.warn('ensureProfile in Supabase notice:', e);
      }
    }

    // 2. Đảm bảo class tồn tại trên Supabase để triệt để tránh lỗi 23503: daily_reports_class_id_fkey
    const rawClasses = localStorage.getItem(STORAGE_KEYS.CLASSES) || localStorage.getItem('classes');
    const classes: ClassItem[] = rawClasses ? JSON.parse(rawClasses) : [];
    const cls = classes.find((c) => c.id === classId);

    // Kiểm tra xem lớp đã có sẵn trên Supabase chưa
    let classExistsOnCloud = false;
    try {
      const { data: existingCloudClass } = await supabase
        .from('classes')
        .select('id')
        .eq('id', classId)
        .maybeSingle();
      if (existingCloudClass && existingCloudClass.id) {
        classExistsOnCloud = true;
      }
    } catch (e) {}

    if (!classExistsOnCloud) {
      // Đảm bảo school_year tồn tại nếu lớp có gắn school_year_id
      let validYearId: string | null = null;
      if (cls?.school_year_id) {
        try {
          const rawYears = localStorage.getItem(STORAGE_KEYS.YEARS);
          const years: SchoolYear[] = rawYears ? JSON.parse(rawYears) : [];
          const y = years.find((item) => item.id === cls.school_year_id);
          if (y) {
            await supabase.from('school_years').upsert({
              id: y.id,
              name: y.name || '2026-2027',
              is_active: y.is_active !== false,
              is_locked: !!y.is_locked,
              created_at: y.created_at || new Date().toISOString(),
            });
            validYearId = y.id;
          }
        } catch (e) {
          console.warn('ensure school_year notice:', e);
        }
      }

      // Đảm bảo campus tồn tại nếu lớp có gắn campus_id
      let validCampusId: string | null = null;
      if (cls?.campus_id) {
        try {
          const rawCampuses = localStorage.getItem(STORAGE_KEYS.CAMPUSES);
          const campuses: Campus[] = rawCampuses ? JSON.parse(rawCampuses) : [];
          const cp = campuses.find((item) => item.id === cls.campus_id);
          if (cp) {
            await supabase.from('campuses').upsert({
              id: cp.id,
              name: cp.name || 'Điểm trường',
              active: cp.active !== false,
              created_at: cp.created_at || new Date().toISOString(),
            });
            validCampusId = cp.id;
          }
        } catch (e) {
          console.warn('ensure campus notice:', e);
        }
      }

      // Chuẩn bị payload lớp học hợp lệ theo schema database (không gửi student_count)
      const classPayload: any = {
        id: classId,
        class_name: cls?.class_name || `Lớp ${classId}`,
        grade: Math.max(1, Math.min(12, Number(cls?.grade) || 1)),
        active: cls?.active !== false,
        is_locked: !!cls?.is_locked,
        sort_order: Number(cls?.sort_order) || 0,
        created_at: cls?.created_at || new Date().toISOString(),
      };
      if (validYearId) classPayload.school_year_id = validYearId;
      if (validCampusId) classPayload.campus_id = validCampusId;

      let { error: clsErr } = await supabase.from('classes').upsert(classPayload);
      if (clsErr) {
        // Thử lại với các foreign keys nullable để chắc chắn bảng classes có id này
        const strippedPayload = {
          ...classPayload,
          school_year_id: null,
          campus_id: null,
          homeroom_teacher_id: null,
        };
        const { error: retryErr } = await supabase.from('classes').upsert(strippedPayload);
        if (retryErr) {
          console.error('Failed to upsert class to Supabase:', retryErr);
        }
      }
    }

    // 3. Đảm bảo indicator_groups tồn tại trên Supabase để tránh lỗi daily_report_values_indicator_group_id_fkey
    if (groupIds && groupIds.length > 0) {
      const rawIndicators = localStorage.getItem(STORAGE_KEYS.INDICATORS);
      const indicators: IndicatorGroup[] = rawIndicators ? JSON.parse(rawIndicators) : [];
      for (const gid of groupIds) {
        const ig = indicators.find((item) => item.id === gid);
        if (ig) {
          try {
            await supabase.from('indicator_groups').upsert({
              id: ig.id,
              name: ig.name,
              code: ig.code,
              enabled: ig.enabled !== false,
              sort_order: Number(ig.sort_order) || 0,
              show_total: ig.show_total !== false,
              show_present: ig.show_present !== false,
              show_absent: ig.show_absent !== false,
              show_percentage: ig.show_percentage !== false,
              column_header_override: ig.column_header_override || null,
              created_at: ig.created_at || new Date().toISOString(),
            });
          } catch (e) {
            console.warn('ensure indicator_group in Supabase notice:', e);
          }
        }
      }
    }
  } catch (err) {
    console.warn('ensureReportDependenciesInSupabase notice:', err);
  }
}

export const StorageService = {
  // --- 1. School Settings ---
  async getSettings(): Promise<SchoolSettings> {
    ensureInitialized();
    let s: SchoolSettings | null = null;
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('school_settings').select('*').limit(1).maybeSingle();
        if (!error && data) {
          s = data;
        }
      } catch (err) {
        console.warn('Supabase fetch settings fallback to local', err);
      }
    }
    
    if (!s) {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      s = raw ? JSON.parse(raw) : getInitialData().settings;
    }

    let needsSave = false;
    
    if (s && !s.enable_campuses) {
      // Auto-enable if we have campuses in DB
      const campusesRaw = localStorage.getItem(STORAGE_KEYS.CAMPUSES);
      const campuses = campusesRaw ? JSON.parse(campusesRaw) : [];
      if (campuses.length > 0) {
        s.enable_campuses = true;
        needsSave = true;
      }
    }

    if (s && (s.report_title === 'BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH' || s.report_title?.includes('HỌC SINH SĨ SỐ HỌC SINH'))) {
      s.report_title = s.report_title.replace('BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH', 'BÁO CÁO SĨ SỐ HỌC SINH');
      needsSave = true;
    }
    if (s && s.developer_name === undefined) {
      s.developer_name = 'Nguyễn Hùng';
      s.developer_contact = 'hungthcsnongu@gmail.com';
      needsSave = true;
    }
    if (s && s.address && s.address.includes('Huyện Điện Biên Đông')) {
      s.address = s.address.replace(', Huyện Điện Biên Đông', '').replace('Huyện Điện Biên Đông, ', '').replace('Huyện Điện Biên Đông', '').trim();
      needsSave = true;
    }
    if (s && !s.week1_start_date) {
      s.week1_start_date = DEFAULT_WEEK1_START_DATE;
      needsSave = true;
    }

    if (s) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
      if (needsSave && supabase && isSupabaseConnected()) {
        try {
          await supabase.from('school_settings').upsert(s);
        } catch (e) {
          console.error(e);
        }
      }
    }
    return s as SchoolSettings;
  },

  async getSchoolSettings(): Promise<SchoolSettings> {
    return this.getSettings();
  },

  async updateSettings(settings: Partial<SchoolSettings>, updatedBy?: Profile): Promise<SchoolSettings> {
    ensureInitialized();
    const current = await this.getSettings();
    const updated: SchoolSettings = {
      ...current,
      ...settings,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { error } = await supabase.from('school_settings').upsert(updated);
        if (error) console.error('Supabase update school_settings error:', error);
      } catch (e) {
        console.error('Supabase update settings error:', e);
      }
    }

    if (updatedBy) {
      await this.addLog({
        user_id: updatedBy.id,
        user_name: updatedBy.full_name,
        user_role: updatedBy.role,
        action: 'SETTINGS_CHANGE',
        old_data: current,
        new_data: updated,
      });
    }

    notifyRealtimeChange('school_settings', updated);
    return updated;
  },

  // --- 2. School Years ---
  async getSchoolYears(): Promise<SchoolYear[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('school_years').select('*').order('created_at', { ascending: true });
        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch school_years fallback to local', err);
      }
    }
    const raw = localStorage.getItem(STORAGE_KEYS.YEARS);
    return raw ? JSON.parse(raw) : [];
  },

  async saveSchoolYear(year: SchoolYear): Promise<void> {
    const list = await this.getSchoolYears();
    const index = list.findIndex((y) => y.id === year.id);
    if (index >= 0) {
      list[index] = year;
    } else {
      list.push(year);
    }
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { error } = await supabase.from('school_years').upsert(year);
        if (error) console.error('Supabase upsert school_years error:', error);
      } catch (e) {
        console.error('Supabase saveSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  async setActiveSchoolYear(yearId: string): Promise<void> {
    const list = await this.getSchoolYears();
    const updated = list.map((y) => ({
      ...y,
      is_active: y.id === yearId,
    }));
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(updated));

    const activeY = updated.find((y) => y.id === yearId);
    if (activeY) {
      // Tự động tịnh tiến cấu hình Khối mầm non & Năm sinh tương ứng với Năm học mới
      const newGrades = getDefaultPreschoolGradesForSchoolYear(activeY.name);
      localStorage.setItem(STORAGE_KEYS.PRESCHOOL_GRADES, JSON.stringify(newGrades));
      notifyRealtimeChange('preschool_grades', newGrades);
    }

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_years').update({ is_active: false }).neq('id', yearId);
        await supabase.from('school_years').update({ is_active: true }).eq('id', yearId);
      } catch (e) {
        console.error('Supabase setActiveSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  async deleteSchoolYear(yearId: string): Promise<void> {
    const list = await this.getSchoolYears();
    const filtered = list.filter((y) => y.id !== yearId);
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_years').delete().eq('id', yearId);
      } catch (e) {
        console.error('Supabase deleteSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  async toggleLockSchoolYear(yearId: string, locked: boolean): Promise<void> {
    const list = await this.getSchoolYears();
    const updated = list.map((y) => (y.id === yearId ? { ...y, is_locked: locked } : y));
    localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(updated));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('school_years').update({ is_locked: locked }).eq('id', yearId);
      } catch (e) {
        console.error('Supabase toggleLockSchoolYear error:', e);
      }
    }

    notifyRealtimeChange('school_years');
  },

  // --- 3. Campuses ---
  async getCampuses(): Promise<Campus[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('campuses').select('*').order('created_at', { ascending: true });
        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch campuses fallback to local', err);
      }
    }
    const raw = localStorage.getItem(STORAGE_KEYS.CAMPUSES);
    const campuses = raw ? JSON.parse(raw) : [];

    // Auto-seed requested campuses if none exist
    if (campuses.length === 0) {
      const defaultCampuses = [
        { id: 'c_1', name: 'Phân hiệu chính', active: true, created_at: new Date().toISOString() },
        { id: 'c_2', name: 'Phân hiệu Suối Lư', active: true, created_at: new Date().toISOString() },
        { id: 'c_3', name: 'Phân hiệu Nà Sản', active: true, created_at: new Date().toISOString() },
      ];
      localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(defaultCampuses));
      
      const settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
      if (settings && !settings.enable_campuses) {
        settings.enable_campuses = true;
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      }

      const classesRaw = localStorage.getItem(STORAGE_KEYS.CLASSES);
      if (classesRaw) {
        let classes = JSON.parse(classesRaw);
        classes = classes.map((c: any, i: number) => ({
          ...c,
          campus_id: c.campus_id || defaultCampuses[i % defaultCampuses.length].id
        }));
        localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
      }
      return defaultCampuses;
    }

    return campuses;
  },

  async saveCampus(campus: Campus): Promise<void> {
    const list = await this.getCampuses();
    const idx = list.findIndex((c) => c.id === campus.id);
    if (idx >= 0) list[idx] = campus;
    else list.push(campus);
    localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('campuses').upsert(campus);
      } catch (e) {
        console.error('Supabase saveCampus error:', e);
      }
    }

    notifyRealtimeChange('campuses');
  },

  async deleteCampus(campusId: string): Promise<void> {
    const list = await this.getCampuses();
    const filtered = list.filter((c) => c.id !== campusId);
    localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('campuses').delete().eq('id', campusId);
      } catch (e) {
        console.error('Supabase deleteCampus error:', e);
      }
    }

    notifyRealtimeChange('campuses');
  },

  // --- 4. Indicator Groups ---
  async getIndicatorGroups(): Promise<IndicatorGroup[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase.from('indicator_groups').select('*').order('sort_order', { ascending: true });
        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch indicator_groups fallback to local', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEYS.INDICATORS);
    let groups: IndicatorGroup[] = raw ? JSON.parse(raw) : [];

    let migrated = false;
    groups = groups.map((g) => {
      if (g.id === 'ig_all' && g.name.toLowerCase() === 'học sinh toàn trường') {
        migrated = true;
        return {
          ...g,
          name: 'Học sinh của lớp theo cấu hình',
          column_header_override: 'Học sinh của lớp theo cấu hình',
        };
      }
      return g;
    });

    const hasBoardingFull = groups.some((g) => g.id === 'ig_boarding_full');
    if (hasBoardingFull) {
      groups = groups.filter((g) => g.id !== 'ig_boarding_full');
      migrated = true;
    }

    if (migrated) {
      localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(groups));
    }

    return groups.sort((a, b) => a.sort_order - b.sort_order);
  },

  async saveIndicatorGroup(group: IndicatorGroup): Promise<void> {
    const list = await this.getIndicatorGroups();
    const idx = list.findIndex((g) => g.id === group.id);
    if (idx >= 0) list[idx] = group;
    else list.push(group);
    list.sort((a, b) => a.sort_order - b.sort_order);
    localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(list));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('indicator_groups').upsert(group);
      } catch (e) {
        console.error('Supabase saveIndicatorGroup error:', e);
      }
    }

    notifyRealtimeChange('indicator_groups');
  },

  async deleteIndicatorGroup(groupId: string): Promise<void> {
    const list = await this.getIndicatorGroups();
    const filtered = list.filter((g) => g.id !== groupId);
    localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(filtered));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('indicator_groups').delete().eq('id', groupId);
      } catch (e) {
        console.error('Supabase deleteIndicatorGroup error:', e);
      }
    }

    notifyRealtimeChange('indicator_groups');
  },

  // --- Preschool Grade Configuration (Khối Nhà trẻ & Khối Mẫu giáo) ---
  async getPreschoolGrades(): Promise<PreschoolGradeConfig[]> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.PRESCHOOL_GRADES);
    let grades: PreschoolGradeConfig[] = [];
    if (!raw) {
      grades = [...DEFAULT_PRESCHOOL_GRADES];
      localStorage.setItem(STORAGE_KEYS.PRESCHOOL_GRADES, JSON.stringify(grades));
    } else {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Lọc bỏ cấu hình Khối 6, Khối 7... không thuộc mầm non nếu có từ trước
          grades = parsed.filter((g) => !/^Khối\s*[6-9]\b/i.test(g.name?.trim() || ''));
          if (grades.length === 0) {
            grades = [...DEFAULT_PRESCHOOL_GRADES];
          }
        } else {
          grades = [...DEFAULT_PRESCHOOL_GRADES];
        }
      } catch {
        grades = [...DEFAULT_PRESCHOOL_GRADES];
      }
    }

    return grades.sort((a: PreschoolGradeConfig, b: PreschoolGradeConfig) => a.sort_order - b.sort_order);
  },

  async savePreschoolGrades(grades: PreschoolGradeConfig[]): Promise<boolean> {
    localStorage.setItem(STORAGE_KEYS.PRESCHOOL_GRADES, JSON.stringify(grades));
    notifyRealtimeChange('preschool_grades', grades);
    return true;
  },

  async resetPreschoolGradesToDefault(): Promise<PreschoolGradeConfig[]> {
    const years = await this.getSchoolYears();
    const active = years.find((y) => y.is_active) || years[0];
    const defaultGrades = getDefaultPreschoolGradesForSchoolYear(active?.name);
    localStorage.setItem(STORAGE_KEYS.PRESCHOOL_GRADES, JSON.stringify(defaultGrades));
    notifyRealtimeChange('preschool_grades', defaultGrades);
    return [...defaultGrades];
  },

  // --- 5. Classes ---
  async getClasses(): Promise<ClassItem[]> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.CLASSES);
    let data: ClassItem[] = raw ? JSON.parse(raw) : [];

    if (data.length === 0) {
      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          const { data: cloudData, error } = await supabase.from('classes').select('*').order('sort_order', { ascending: true });
          if (!error && cloudData && cloudData.length > 0) {
            localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(cloudData));
            data = cloudData;
          }
        } catch (err) {
          console.warn('Supabase fetch classes fallback to local', err);
        }
      }
    } else {
      syncToSupabase(async () => {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: cloudData, error } = await supabase.from('classes').select('*').order('sort_order', { ascending: true });
          if (!error) {
            if (cloudData && cloudData.length > 0) {
              mergeCloudIntoLocal(STORAGE_KEYS.CLASSES, cloudData);
            }
            // Tự động đẩy các lớp cục bộ chưa có trên Cloud lên Supabase để tránh lỗi khóa ngoại
            const cloudIds = new Set((cloudData || []).map((c: any) => c.id));
            const missingInCloud = data.filter((c) => !cloudIds.has(c.id));
            if (missingInCloud.length > 0) {
              const toUpsert = missingInCloud.map((c) => ({
                id: c.id,
                class_name: c.class_name,
                grade: Math.max(1, Math.min(12, Number(c.grade) || 1)),
                school_year_id: c.school_year_id || null,
                campus_id: c.campus_id || null,
                homeroom_teacher_id: c.homeroom_teacher_id || null,
                active: c.active !== false,
                is_locked: !!c.is_locked,
                sort_order: Number(c.sort_order) || 0,
                created_at: c.created_at || new Date().toISOString(),
              }));
              const { error: upErr } = await supabase.from('classes').upsert(toUpsert);
              if (upErr) {
                const fallback = toUpsert.map((c) => ({
                  ...c,
                  school_year_id: null,
                  campus_id: null,
                  homeroom_teacher_id: null,
                }));
                await supabase.from('classes').upsert(fallback);
              }
            }
          }
        }
      });
    }

    // Only fix invalid/missing numeric grades (hoặc lớp mang số khối THCS 6, 7... không thuộc mầm non)
    let hasModifiedLegacyGrades = false;
    data = data.map((c) => {
      let g = Number(c.grade);
      if (isNaN(g) || g <= 0 || g >= 6) {
        hasModifiedLegacyGrades = true;
        const nameLower = (c.class_name || '').toLowerCase();
        if (nameLower.startsWith('nt') || nameLower.includes('nhà trẻ') || nameLower.includes('nha tre') || nameLower.includes('24-36')) {
          g = 1; // Khối Nhà trẻ
        } else if (nameLower.includes('ghép') || nameLower.includes('ghep') || nameLower.includes('mgg') || nameLower.includes('3-5') || nameLower.includes('3+4') || nameLower.includes('4+5') || nameLower.includes('3-4')) {
          g = 5; // Khối MG Ghép
        } else if (nameLower.includes('bé') || nameLower.includes('be') || nameLower.includes('3t') || nameLower.includes('mầm') || nameLower.includes('mam')) {
          g = 2; // Khối MG Bé
        } else if (nameLower.includes('nhỡ') || nameLower.includes('nho') || nameLower.includes('chồi') || nameLower.includes('choi') || nameLower.includes('4t')) {
          g = 3; // Khối MG Nhỡ
        } else {
          g = 5; // Mặc định MG Ghép
        }
        return { ...c, grade: g };
      }
      return c;
    });

    if (hasModifiedLegacyGrades) {
      localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(data));
      notifyRealtimeChange('classes');
    }

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return data.sort((a, b) => {
      if (a.grade !== b.grade) {
        return (a.grade || 0) - (b.grade || 0);
      }
      return collator.compare(a.class_name, b.class_name);
    });
  },

  async saveClass(classItem: ClassItem): Promise<void> {
    const list = await this.getClasses();
    const idx = list.findIndex((c) => c.id === classItem.id);
    if (idx >= 0) list[idx] = classItem;
    else list.push(classItem);
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    list.sort((a, b) => {
      if (a.grade !== b.grade) {
        return (a.grade || 0) - (b.grade || 0);
      }
      return collator.compare(a.class_name, b.class_name);
    });
    localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(list));

    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) {
        const cleanItem: any = {
          id: classItem.id,
          class_name: classItem.class_name,
          grade: Math.max(1, Math.min(12, Number(classItem.grade) || 1)),
          school_year_id: classItem.school_year_id || null,
          campus_id: classItem.campus_id || null,
          homeroom_teacher_id: classItem.homeroom_teacher_id || null,
          active: classItem.active !== false,
          is_locked: !!classItem.is_locked,
          sort_order: Number(classItem.sort_order) || 0,
          created_at: classItem.created_at || new Date().toISOString(),
        };
        let { error: cErr } = await supabase.from('classes').upsert(cleanItem);
        if (cErr) {
          const stripped = {
            ...cleanItem,
            school_year_id: null,
            campus_id: null,
            homeroom_teacher_id: null,
          };
          await supabase.from('classes').upsert(stripped);
        }
      }
    });

    // 2-way sync with homeroom teacher profile
    if (classItem.homeroom_teacher_id) {
      try {
        const rawProfiles = localStorage.getItem(STORAGE_KEYS.PROFILES);
        if (rawProfiles) {
          const profiles: Profile[] = JSON.parse(rawProfiles);
          let pModified = false;
          profiles.forEach((p) => {
            if (p.id === classItem.homeroom_teacher_id) {
              if (p.assigned_class_id !== classItem.id) {
                p.assigned_class_id = classItem.id;
                p.role = 'GVCN';
                pModified = true;
              }
            } else if (p.assigned_class_id === classItem.id) {
              p.assigned_class_id = undefined;
              pModified = true;
            }
          });
          if (pModified) {
            localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
            const assignedTeacher = profiles.find((p) => p.id === classItem.homeroom_teacher_id);
            if (assignedTeacher) {
              syncToSupabase(async () => {
                const supabase = getSupabaseClient();
                if (supabase) await supabase.from('profiles').upsert(assignedTeacher);
              });
            }
          }
        }
      } catch (e) {
        console.warn('Error in saveClass two-way sync profile:', e);
      }
    }

    notifyRealtimeChange('classes');
  },

  async deleteClass(classId: string): Promise<void> {
    const list = await this.getClasses();
    const filtered = list.filter((c) => c.id !== classId);
    localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(filtered));

    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.from('classes').delete().eq('id', classId);
    });

    notifyRealtimeChange('classes');
  },

  async toggleClassLock(classId: string, isLocked: boolean): Promise<void> {
    const list = await this.getClasses();
    const target = list.find((c) => c.id === classId);
    if (target) {
      target.is_locked = isLocked;
      localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(list));

      syncToSupabase(async () => {
        const supabase = getSupabaseClient();
        if (supabase) await supabase.from('classes').update({ is_locked: isLocked }).eq('id', classId);
      });

      notifyRealtimeChange('classes');
    }
  },

  // --- 5.5. Students ---
  async getStudents(): Promise<import('../types').Student[]> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    let data: import('../types').Student[] = raw ? JSON.parse(raw) : [];

    if (data.length === 0) {
      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          const { data: cloudData, error } = await supabase.from('students').select('*').order('full_name', { ascending: true });
          if (!error && cloudData && cloudData.length > 0) {
            localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(cloudData));
            data = cloudData;
          }
        } catch (err) {
          console.warn('Supabase fetch students fallback to local', err);
        }
      }
    } else {
      syncToSupabase(async () => {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data: cloudData, error } = await supabase.from('students').select('*').order('full_name', { ascending: true });
          if (!error && cloudData && cloudData.length > 0) {
            mergeCloudIntoLocal(STORAGE_KEYS.STUDENTS, cloudData);
          }
        }
      });
    }

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return data.sort((a, b) => collator.compare(a.full_name, b.full_name));
  },

  async saveStudent(student: import('../types').Student): Promise<void> {
    const list = await this.getStudents();
    const idx = list.findIndex((s) => s.id === student.id);
    if (idx >= 0) list[idx] = student;
    else list.push(student);
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    list.sort((a, b) => collator.compare(a.full_name, b.full_name));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(list));

    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.from('students').upsert(student);
    });

    notifyRealtimeChange('students');
  },

  async deleteStudent(studentId: string): Promise<void> {
    const list = await this.getStudents();
    const filtered = list.filter((s) => s.id !== studentId);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(filtered));

    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.from('students').delete().eq('id', studentId);
    });

    notifyRealtimeChange('students');
  },

  async getStudentsByClass(classId: string): Promise<import('../types').Student[]> {
    const all = await this.getStudents();
    return all.filter((s) => s.class_id === classId);
  },

  async saveStudents(students: import('../types').Student[]): Promise<void> {
    const all = await this.getStudents();
    const updated = [...all];
    for (const student of students) {
      const idx = updated.findIndex((s) => s.id === student.id);
      if (idx >= 0) updated[idx] = student;
      else updated.push(student);
    }
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    updated.sort((a, b) => collator.compare(a.full_name, b.full_name));
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(updated));

    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.from('students').upsert(students);
    });

    notifyRealtimeChange('students');
  },

  // --- 6. Profiles (Users) ---
  async getProfiles(): Promise<Profile[]> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.PROFILES);
    let list: Profile[] = raw ? JSON.parse(raw) : getInitialData().profiles;

    if (!raw) {
      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
          if (!error && data && data.length > 0) {
            localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(data));
            list = data;
          }
        } catch (err) {
          console.warn('Supabase fetch profiles fallback to local', err);
        }
      }
    } else {
      syncToSupabase(async () => {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
          if (!error && data && data.length > 0) {
            mergeCloudIntoLocal(STORAGE_KEYS.PROFILES, data);
          }
        }
      });
    }

    let modified = false;

    // Load classes and preschool grades to infer teaching scope if missing
    let classesList: ClassItem[] = [];
    let pgList: PreschoolGradeConfig[] = [];
    try {
      const rawClasses = localStorage.getItem(STORAGE_KEYS.CLASSES);
      if (rawClasses) classesList = JSON.parse(rawClasses);
      const rawGrades = localStorage.getItem(STORAGE_KEYS.PRESCHOOL_GRADES);
      if (rawGrades) pgList = JSON.parse(rawGrades);
    } catch {}

    // 1. Loại bỏ các ID nằm trong danh sách đã xóa (Tombstone)
    const deletedIds = getDeletedProfileIds();
    if (deletedIds.size > 0) {
      const filtered = list.filter((p) => !deletedIds.has(p.id));
      if (filtered.length !== list.length) {
        list = filtered;
        modified = true;
      }
    }

    // 2. Tự động deduplicate các tài khoản GVCN có họ tên trùng nhau:
    const gvcnNormMap = new Map<string, Profile>();
    const cleanedProfiles: Profile[] = [];
    const idsToRemoveNow: string[] = [];

    for (const p of list) {
      if (p.role !== 'GVCN') {
        cleanedProfiles.push(p);
        continue;
      }

      const normName = removeVietnameseTones(p.full_name?.trim()?.toLowerCase() || '').replace(/\s+/g, ' ');
      if (!normName) {
        cleanedProfiles.push(p);
        continue;
      }

      const existing = gvcnNormMap.get(normName);
      if (!existing) {
        gvcnNormMap.set(normName, p);
      } else {
        // So sánh để chọn bản ghi tốt nhất
        const pAssigned = !!p.assigned_class_id || classesList.some((c) => c.homeroom_teacher_id === p.id);
        const exAssigned = !!existing.assigned_class_id || classesList.some((c) => c.homeroom_teacher_id === existing.id);

        let winner = existing;
        let loser = p;

        if (pAssigned && !exAssigned) {
          winner = p;
          loser = existing;
          gvcnNormMap.set(normName, winner);
        }

        if (!winner.phone && loser.phone) winner.phone = loser.phone;
        if (!winner.assigned_class_id && loser.assigned_class_id) winner.assigned_class_id = loser.assigned_class_id;

        idsToRemoveNow.push(loser.id);
        modified = true;
      }
    }

    if (idsToRemoveNow.length > 0) {
      recordDeletedProfileIds(idsToRemoveNow);
    }

    for (const p of gvcnNormMap.values()) {
      cleanedProfiles.push(p);
    }
    list = cleanedProfiles;

    list = list.map((p) => {
      if (p.role === 'ADMIN' && p.email !== 'admin@db.edu.vn') {
        p.email = 'admin@db.edu.vn';
        modified = true;
      }
      if (p.role === 'GVCN') {
        if (!p.teaching_scope) {
          p.teaching_scope = getTeacherAllowedScope(p, classesList, pgList);
          modified = true;
        }
        // Reconcile assignment from class
        const matchingClass = classesList.find((c) => c.homeroom_teacher_id === p.id);
        if (matchingClass && p.assigned_class_id !== matchingClass.id) {
          p.assigned_class_id = matchingClass.id;
          modified = true;
        }
      }
      return p;
    });
    if (modified) {
      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));
    }
    return list;
  },

  async saveProfile(profile: Profile): Promise<void> {
    const list = await this.getProfiles();
    const idx = list.findIndex((p) => p.id === profile.id);
    if (idx >= 0) list[idx] = profile;
    else list.push(profile);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(list));

    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.from('profiles').upsert(profile);
    });

    // 2-way sync with class
    if (profile.role === 'GVCN' && profile.assigned_class_id) {
      try {
        const rawClasses = localStorage.getItem(STORAGE_KEYS.CLASSES);
        if (rawClasses) {
          const classes: ClassItem[] = JSON.parse(rawClasses);
          let cModified = false;
          classes.forEach((c) => {
            if (c.id === profile.assigned_class_id) {
              if (c.homeroom_teacher_id !== profile.id) {
                c.homeroom_teacher_id = profile.id;
                cModified = true;
              }
            } else if (c.homeroom_teacher_id === profile.id) {
              c.homeroom_teacher_id = undefined;
              cModified = true;
            }
          });
          if (cModified) {
            localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
            const assignedClass = classes.find((c) => c.id === profile.assigned_class_id);
            if (assignedClass) {
              syncToSupabase(async () => {
                const supabase = getSupabaseClient();
                if (supabase) await supabase.from('classes').upsert(assignedClass);
              });
            }
          }
        }
      } catch (e) {
        console.warn('Error in saveProfile two-way sync class:', e);
      }
    }

    notifyRealtimeChange('profiles');
  },

  async deleteProfile(profileId: string): Promise<void> {
    const list = await this.getProfiles();
    const filtered = list.filter((p) => p.id !== profileId);
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(filtered));

    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.from('profiles').delete().eq('id', profileId);
    });

    notifyRealtimeChange('profiles');
  },

  /**
   * Kiểm tra xem hiện có bao nhiêu tài khoản GVCN bị trùng tên trong hệ thống
   */
  async getDuplicateProfilesSummary(): Promise<{
    duplicateGroupsCount: number;
    duplicateAccountsCount: number;
    details: Array<{ name: string; count: number; ids: string[] }>;
  }> {
    const profiles = await this.getProfiles();
    const gvcnList = profiles.filter((p) => p.role === 'GVCN');
    const groupMap = new Map<string, Profile[]>();

    for (const p of gvcnList) {
      const key = removeVietnameseTones(p.full_name.trim().toLowerCase());
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(p);
    }

    const details: Array<{ name: string; count: number; ids: string[] }> = [];
    let duplicateAccountsCount = 0;

    for (const [, group] of groupMap.entries()) {
      if (group.length > 1) {
        duplicateAccountsCount += (group.length - 1);
        details.push({
          name: group[0].full_name,
          count: group.length,
          ids: group.map((p) => p.id),
        });
      }
    }

    return {
      duplicateGroupsCount: details.length,
      duplicateAccountsCount,
      details,
    };
  },

  /**
   * Tự động quét và dọn dẹp các tài khoản GVCN bị trùng lặp họ tên
   * Giữ lại tài khoản có phân công lớp hoặc đầy đủ thông tin nhất, xóa các tài khoản thừa
   */
  async deduplicateProfiles(): Promise<{
    removedCount: number;
    cleanedNames: string[];
    affectedProfiles: string[];
  }> {
    const [allProfiles, allClasses] = await Promise.all([
      this.getProfiles(),
      this.getClasses(),
    ]);

    const gvcnList = allProfiles.filter((p) => p.role === 'GVCN');
    const groupMap = new Map<string, Profile[]>();

    for (const p of gvcnList) {
      const key = removeVietnameseTones(p.full_name.trim().toLowerCase()).replace(/\s+/g, ' ');
      if (!key) continue;
      if (!groupMap.has(key)) {
        groupMap.set(key, []);
      }
      groupMap.get(key)!.push(p);
    }

    const cleanedNames: string[] = [];
    const removedIds = new Set<string>();
    let classesModified = false;
    const updatedClasses = [...allClasses];
    const updatedProfiles = [...allProfiles];

    for (const [, group] of groupMap.entries()) {
      if (group.length <= 1) continue;

      // Sắp xếp ưu tiên:
      // 1. Tài khoản đang được gán lớp (homeroom_teacher_id hoặc assigned_class_id)
      // 2. Tài khoản có số điện thoại
      // 3. Tài khoản có email thật (không bắt đầu bằng gv_auto)
      // 4. Tài khoản tạo sớm nhất
      const scored = group.map((p) => {
        let score = 0;
        const isAssigned = updatedClasses.some(
          (c) => c.homeroom_teacher_id === p.id || c.id === p.assigned_class_id
        );
        if (isAssigned) score += 100;
        if (p.phone && p.phone.trim().length > 0) score += 20;
        if (p.email && !p.email.startsWith('gv_') && !p.email.includes('example')) score += 10;
        return { profile: p, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const winner = scored[0].profile;
      cleanedNames.push(`${winner.full_name} (${group.length - 1} bản ghi trùng)`);

      for (let i = 1; i < scored.length; i++) {
        const loser = scored[i].profile;
        removedIds.add(loser.id);

        if (!winner.phone && loser.phone) winner.phone = loser.phone;
        if (!winner.assigned_class_id && loser.assigned_class_id) winner.assigned_class_id = loser.assigned_class_id;

        // Chuyển bất kỳ lớp nào đang liên kết với loser sang trỏ vào winner
        for (const cls of updatedClasses) {
          if (cls.homeroom_teacher_id === loser.id) {
            cls.homeroom_teacher_id = winner.id;
            classesModified = true;
          }
        }
      }
    }

    if (removedIds.size === 0) {
      return { removedCount: 0, cleanedNames: [], affectedProfiles: [] };
    }

    // Ghi nhận các ID bị xóa vào tombstone để tránh bị Cloud pull ngược lại
    recordDeletedProfileIds(Array.from(removedIds));

    // Lưu danh sách profiles đã dọn dẹp
    const remainingProfiles = updatedProfiles.filter((p) => !removedIds.has(p.id));
    localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(remainingProfiles));

    if (classesModified) {
      localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(updatedClasses));
    }

    // Đồng bộ lên Supabase Cloud
    syncToSupabase(async () => {
      const supabase = getSupabaseClient();
      if (supabase) {
        const deleteArray = Array.from(removedIds);
        await supabase.from('profiles').delete().in('id', deleteArray);
        if (classesModified) {
          for (const cls of updatedClasses) {
            await supabase.from('classes').upsert(cls);
          }
        }
      }
    });

    notifyRealtimeChange('profiles');
    if (classesModified) {
      notifyRealtimeChange('classes');
    }

    return {
      removedCount: removedIds.size,
      cleanedNames,
      affectedProfiles: Array.from(removedIds),
    };
  },

  // --- 7. Daily Reports & Values ---
  async getDailyReport(
    classId: string,
    reportDate: string
  ): Promise<{ report?: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();
    const supabase = getSupabaseClient();

    if (supabase && isSupabaseConnected()) {
      try {
        const { data: rep, error: rErr } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('class_id', classId)
          .eq('report_date', reportDate)
          .maybeSingle();

        if (!rErr && rep) {
          const { data: vals, error: vErr } = await supabase
            .from('daily_report_values')
            .select('*')
            .eq('report_id', rep.id);

          if (!vErr && vals) {
            // Update local cache
            const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
            const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
            const rIdx = reports.findIndex((r) => r.id === rep.id);
            if (rIdx >= 0) reports[rIdx] = rep;
            else reports.push(rep);
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

            const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
            let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
            allValues = allValues.filter((v) => v.report_id !== rep.id).concat(vals);
            localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));

            return { report: rep, values: vals };
          }
        }
      } catch (err) {
        console.warn('Supabase fetch report fallback to local:', err);
      }
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const report = reports.find((r) => r.class_id === classId && r.report_date === reportDate);

    if (!report) {
      return { report: undefined, values: [] };
    }

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
    const values = allValues.filter((v) => v.report_id === report.id);

    return { report, values };
  },

  async getLatestReportForClass(
    classId: string,
    beforeDate?: string
  ): Promise<{ report?: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();
    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];

    // Filter by class and date (if provided), sort descending by report_date
    const classReports = reports
      .filter((r) => r.class_id === classId && (!beforeDate || r.report_date < beforeDate))
      .sort((a, b) => b.report_date.localeCompare(a.report_date));

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    for (const r of classReports) {
      const vals = allValues.filter((v) => v.report_id === r.id);
      const hasPositiveTotal = vals.some((v) => v.total_count > 0);
      if (hasPositiveTotal) {
        return { report: r, values: vals };
      }
    }

    return { report: undefined, values: [] };
  },

  async saveDailyReport(
    classId: string,
    reportDate: string,
    user: Profile,
    valuesByGroup: Record<string, { total: number; present: number; absent: number }>,
    notes?: string,
    absent_students?: AbsentStudent[],
    preschool_data?: PreschoolDailyData
  ): Promise<{ report: DailyReport; values: DailyReportValue[] }> {
    ensureInitialized();

    // Guard: Prevent saving empty report where total is 0
    const maxTotal = Object.values(valuesByGroup).reduce(
      (acc, curr) => Math.max(acc, Number(curr.total) || 0),
      0
    );
    if (maxTotal <= 0) {
      throw new Error('Không thể lưu báo cáo rỗng: Sĩ số tổng số học sinh của lớp phải lớn hơn 0.');
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const existingIndex = reports.findIndex((r) => r.class_id === classId && r.report_date === reportDate);

    const reportId = existingIndex >= 0 ? reports[existingIndex].id : `rep_${reportDate}_${classId}_${Date.now()}`;
    const oldReport = existingIndex >= 0 ? { ...reports[existingIndex] } : null;

    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const initialReportedTime = existingIndex >= 0 && reports[existingIndex].reported_time
      ? reports[existingIndex].reported_time
      : currentTimeStr;

    const report: DailyReport = {
      id: reportId,
      class_id: classId,
      report_date: reportDate,
      created_by: user.id,
      status: 'SUBMITTED',
      notes: notes ?? (existingIndex >= 0 ? reports[existingIndex].notes : ''),
      absent_students: absent_students ?? (existingIndex >= 0 ? reports[existingIndex].absent_students : undefined),
      reported_time: initialReportedTime,
      preschool_data: preschool_data ?? (existingIndex >= 0 ? reports[existingIndex].preschool_data : undefined),
      created_at: existingIndex >= 0 ? reports[existingIndex].created_at : now.toISOString(),
      updated_at: now.toISOString(),
    };

    if (existingIndex >= 0) {
      reports[existingIndex] = report;
    } else {
      reports.push(report);
    }
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

    // Update values
    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
    allValues = allValues.filter((v) => v.report_id !== reportId);

    const newValues: DailyReportValue[] = [];
    Object.entries(valuesByGroup).forEach(([groupId, vals]) => {
      const vItem: DailyReportValue = {
        id: `val_${reportId}_${groupId}`,
        report_id: reportId,
        indicator_group_id: groupId,
        total_count: vals.total,
        present_count: vals.present,
        absent_count: vals.absent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      allValues.push(vItem);
      newValues.push(vItem);
    });

    localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));

    // PERSIST DIRECTLY TO SUPABASE (Non-blocking for instant UI response)
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      Promise.resolve().then(async () => {
        try {
          // 1. Đảm bảo lớp học và các khóa ngoại phụ thuộc đã tồn tại trên Supabase
          await ensureReportDependenciesInSupabase(
            supabase,
            classId,
            user,
            Object.keys(valuesByGroup)
          );

          // Chuẩn bị dữ liệu report để gửi lên Supabase
          let repData: any = { ...report };
          let { error: repErr } = await supabase.from('daily_reports').upsert(repData);

          // Nếu Supabase báo lỗi 23503 foreign key (classes hoặc profiles) -> đảm bảo dependencies và retry
          if (repErr && (repErr.code === '23503' || repErr.message?.includes('violates foreign key constraint'))) {
            if (repErr.message?.includes('classes') || repErr.details?.includes('classes')) {
              await ensureReportDependenciesInSupabase(supabase, classId, user, Object.keys(valuesByGroup));
              const retryClassRes = await supabase.from('daily_reports').upsert(repData);
              repErr = retryClassRes.error;
            } else if (repErr.message?.includes('profiles') || repErr.details?.includes('profiles')) {
              repData = { ...repData, created_by: null };
              const retryProfRes = await supabase.from('daily_reports').upsert(repData);
              repErr = retryProfRes.error;
            }
          }

          // Nếu Supabase báo lỗi chưa có cột reported_time (schema cache cũ) -> loại bỏ reported_time và thử lại
          if (repErr && (repErr.message?.includes('reported_time') || repErr.code === 'PGRST204')) {
            const { reported_time: _unused, ...repWithoutTime } = repData;
            const retryRes = await supabase.from('daily_reports').upsert(repWithoutTime);
            repErr = retryRes.error;
          }

          if (repErr) {
            console.error('Supabase upsert daily_reports error:', repErr);
            // Nếu daily_reports không tạo/lưu được vào CSDL thì dừng lại, không upsert values để tránh lỗi 23503 foreign key
            return;
          }

          if (newValues.length > 0) {
            let { error: valErr } = await supabase.from('daily_report_values').upsert(newValues);
            if (valErr && (valErr.code === '23503' || valErr.message?.includes('violates foreign key constraint'))) {
              // Thử đảm bảo lại indicator_groups và retry
              await ensureReportDependenciesInSupabase(supabase, classId, user, Object.keys(valuesByGroup));
              const retryValRes = await supabase.from('daily_report_values').upsert(newValues);
              valErr = retryValRes.error;
            }
            if (valErr) console.error('Supabase upsert daily_report_values error:', valErr);
          }
        } catch (err) {
          console.error('Supabase sync report error:', err);
        }
      });
    }

    // Add audit log
    // Read from localStorage synchronously to prevent blocking the UI
    const rawClasses = localStorage.getItem('classes') || localStorage.getItem(STORAGE_KEYS.CLASSES);
    let cls;
    try {
       const classes = rawClasses ? JSON.parse(rawClasses) : [];
       cls = classes.find(c => c.id === classId);
    } catch(e) {}

    // Fire and forget log for instant UI
    this.addLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: oldReport ? 'UPDATE' : 'CREATE',
      class_name: cls?.class_name || classId,
      report_date: reportDate,
      old_data: oldReport,
      new_data: { valuesByGroup, notes },
    }).catch(console.error);

    notifyRealtimeChange('daily_reports', { reportId, classId, reportDate });
    return { report, values: newValues };
  },

  async lockReport(reportId: string, locked: boolean, adminUser: Profile): Promise<void> {
    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const rep = reports.find((r) => r.id === reportId);
    if (rep) {
      rep.status = locked ? 'LOCKED' : 'SUBMITTED';
      rep.locked_at = locked ? new Date().toISOString() : undefined;
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConnected()) {
        try {
          await supabase
            .from('daily_reports')
            .update({
              status: rep.status,
              locked_at: rep.locked_at || null,
            })
            .eq('id', reportId);
        } catch (e) {
          console.error('Supabase lockReport error:', e);
        }
      }

      const classes = await this.getClasses();
      const cls = classes.find((c) => c.id === rep.class_id);
      await this.addLog({
        user_id: adminUser.id,
        user_name: adminUser.full_name,
        user_role: adminUser.role,
        action: locked ? 'LOCK' : 'UNLOCK',
        class_name: cls?.class_name,
        report_date: rep.report_date,
      });

      notifyRealtimeChange('daily_reports');
    }
  },

  /**
   * Reset / Xóa báo cáo sĩ số của một lớp theo ngày về trạng thái CHƯA BÁO CÁO (nếu báo cáo nhầm)
   */
  async deleteDailyReport(classId: string, reportDate: string, user: Profile): Promise<boolean> {
    ensureInitialized();

    // Kiểm tra quyền
    const isAllowed = user.role === 'ADMIN' || user.role === 'BGH' || (user.role === 'GVCN' && user.assigned_class_id === classId);
    if (!isAllowed) {
      throw new Error('Bạn không có quyền reset báo cáo sĩ số này!');
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const reportToDelete = reports.find((r) => r.class_id === classId && r.report_date === reportDate);

    if (!reportToDelete) {
      return false;
    }
    
    // Kiểm tra khóa
    if (reportToDelete.status === 'LOCKED') {
      throw new Error('Báo cáo đã bị khóa, không thể reset!');
    }

    // 1. Xóa khỏi danh sách reports cục bộ
    const filteredReports = reports.filter((r) => r.id !== reportToDelete.id);
    localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(filteredReports));

    // 2. Xóa các giá trị chỉ tiêu tương ứng trong daily_report_values
    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
    const filteredValues = allValues.filter((v) => v.report_id !== reportToDelete.id);
    localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(filteredValues));

    // 3. Xóa trên Supabase nếu có kết nối
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        await supabase.from('daily_report_values').delete().eq('report_id', reportToDelete.id);
        await supabase.from('daily_reports').delete().eq('id', reportToDelete.id);
      } catch (err) {
        console.error('Supabase delete daily report error:', err);
      }
    }

    // 4. Ghi log kiểm toán
    const classes = await this.getClasses();
    const cls = classes.find((c) => c.id === classId);
    await this.addLog({
      user_id: user.id,
      user_name: user.full_name,
      user_role: user.role,
      action: 'DELETE',
      class_name: cls?.class_name || classId,
      report_date: reportDate,
      old_data: reportToDelete,
      new_data: { status: 'NOT_REPORTED', note: 'Reset trạng thái báo cáo nhầm về Chưa báo cáo' },
    });

    notifyRealtimeChange('daily_reports', { classId, reportDate, action: 'RESET' });
    return true;
  },

  async lockAllReportsForDate(reportDate: string, locked: boolean, adminUser: Profile, campusId?: string): Promise<void> {
    ensureInitialized();
    const classes = await this.getClasses();
    let targetClasses = classes.filter((c) => c.active);
    if (campusId && campusId !== 'all') {
      targetClasses = targetClasses.filter((c) => c.campus_id === campusId);
    }

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const now = new Date().toISOString();

    const supabase = getSupabaseClient();
    const isConnected = supabase && isSupabaseConnected();

    let changed = false;

    for (const cls of targetClasses) {
      const existingIndex = reports.findIndex((r) => r.class_id === cls.id && r.report_date === reportDate);
      if (existingIndex >= 0) {
        if (reports[existingIndex].status !== (locked ? 'LOCKED' : 'SUBMITTED')) {
          reports[existingIndex].status = locked ? 'LOCKED' : 'SUBMITTED';
          reports[existingIndex].locked_at = locked ? now : undefined;
          changed = true;

          if (isConnected) {
            try {
              await supabase
                .from('daily_reports')
                .update({
                  status: reports[existingIndex].status,
                  locked_at: reports[existingIndex].locked_at || null,
                })
                .eq('id', reports[existingIndex].id);
            } catch (e) {
              console.error('Supabase lockAllReports error:', e);
            }
          }
        }
      } else if (locked) {
        // Create empty locked report for unreported classes
        const newReport: DailyReport = {
          id: `rep_${reportDate}_${cls.id}_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
          class_id: cls.id,
          report_date: reportDate,
          created_by: adminUser.id,
          created_at: now,
          updated_at: now,
          status: 'LOCKED',
          locked_at: now,
          notes: '',
          absent_students: [],
        };
        reports.push(newReport);
        changed = true;

        if (isConnected) {
          try {
            await ensureReportDependenciesInSupabase(supabase, cls.id, adminUser, []);
            await supabase.from('daily_reports').insert(newReport);
          } catch (e) {
            console.error('Supabase insert locked report error:', e);
          }
        }
      }
    }

    if (changed) {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

      await this.addLog({
        user_id: adminUser.id,
        user_name: adminUser.full_name,
        user_role: adminUser.role,
        action: locked ? 'LOCK' : 'UNLOCK',
        class_name: campusId && campusId !== 'all' ? `Tất cả lớp (${campusId})` : 'Tất cả lớp',
        report_date: reportDate,
      });

      notifyRealtimeChange('daily_reports');
    }
  },

  // --- 8. Aggregate Reports for Day ---
  async getDailyAggregate(reportDate: string, campusId?: string): Promise<{
    date: string;
    totalClasses: number;
    reportedClasses: number;
    unreportedClasses: number;
    rows: ClassReportRow[];
    totals: Record<string, { total: number; present: number; absent: number; rate: number }>;
    overallSchool: { total: number; present: number; absent: number; rate: number; presentRate: number };
    preschoolTotals: PreschoolSchoolTotals;
  }> {
    ensureInitialized();

    // Pull fresh data from Supabase if connected
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data: cloudReports } = await supabase
          .from('daily_reports')
          .select('*')
          .eq('report_date', reportDate);

        if (cloudReports) {
          const repIds = cloudReports.map((r) => r.id);
          const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
          let reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
          
          // Giữ lại các ngày khác, riêng ngày reportDate chỉ giữ lại các báo cáo còn tồn tại trên cloud
          const cloudSet = new Set(repIds);
          reports = reports.filter((r) => r.report_date !== reportDate || cloudSet.has(r.id));
          cloudReports.forEach((cRep) => {
            const idx = reports.findIndex((r) => r.id === cRep.id);
            if (idx >= 0) reports[idx] = cRep;
            else reports.push(cRep);
          });
          localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

          if (repIds.length > 0) {
            const { data: cloudValues } = await supabase
              .from('daily_report_values')
              .select('*')
              .in('report_id', repIds);

            if (cloudValues) {
              const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
              let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
              allValues = allValues.filter((v) => !repIds.includes(v.report_id)).concat(cloudValues);
              localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));
            }
          }
        }
      } catch (err) {
        console.warn('Supabase fetch daily aggregate reports fallback to local:', err);
      }
    }

    const [classes, profiles, indicators, schoolYears] = await Promise.all([
      this.getClasses(),
      this.getProfiles(),
      this.getIndicatorGroups(),
      this.getSchoolYears(),
    ]);

    const activeSchoolYear = schoolYears.find((y) => y.is_active) || schoolYears[0];
    const birthYearConfigs = getPreschoolBirthYearsForSchoolYear(activeSchoolYear?.name);
    const initialByYear: Record<string, { total: number; present: number; absent: number; boarding: number }> = {};
    birthYearConfigs.forEach((by) => {
      initialByYear[String(by.year)] = { total: 0, present: 0, absent: 0, boarding: 0 };
    });

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    const dayReports = reports.filter((r) => r.report_date === reportDate);

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    let activeClasses = (classes || []).filter((c) => c && c.active);
    if (campusId && campusId !== 'all') {
      activeClasses = activeClasses.filter(c => c && c.campus_id === campusId);
    }
    const totalClasses = activeClasses.length;

    let reportedClasses = 0;
    const totals: Record<string, { total: number; present: number; absent: number; rate: number }> = {};
    (indicators || []).forEach((ig) => {
      if (ig && ig.id) {
        totals[ig.id] = { total: 0, present: 0, absent: 0, rate: 0 };
      }
    });

    const preschoolTotals: PreschoolSchoolTotals = {
      totalStudents: 0,
      femaleStudents: 0,
      ethnicStudents: 0,
      femaleEthnicStudents: 0,
      poorStudents: 0,
      disabledStudents: 0,
      presentStudents: 0,
      presentFemale: 0,
      presentEthnic: 0,
      absentStudents: 0,
      absentExcused: 0,
      absentUnexcused: 0,
      boardingCount: 0,
      lunchCount: 0,
      snackCount: 0,
      canceledCount: 0,
      boardingNhaTre: 0,
      boardingMauGiao: 0,
      lunchNhaTre: 0,
      lunchMauGiao: 0,
      snackNhaTre: 0,
      snackMauGiao: 0,
      totalNhaTre: 0,
      totalMauGiao: 0,
      presentNhaTre: 0,
      presentMauGiao: 0,
      absentNhaTre: 0,
      absentMauGiao: 0,
      byYear: initialByYear,
      healthIssueCount: 0,
      attendanceRate: 0,
      boardingRate: 0,
    };

    const rows: ClassReportRow[] = activeClasses.map((cls) => {
      const teacher = profiles.find((p) => p.id === cls.homeroom_teacher_id);
      const rep = dayReports.find((r) => r.class_id === cls.id);
      const repValues = rep ? allValues.filter((v) => v.report_id === rep.id) : [];
      const hasRealData = repValues.some((v) => (v.total_count || 0) > 0);
      const isReported = Boolean(rep && (hasRealData || rep.status === 'LOCKED'));
      let status: ReportStatus = 'NOT_REPORTED';

      if (cls.is_locked || rep?.status === 'LOCKED') {
        status = 'LOCKED';
      } else if (isReported) {
        status = 'REPORTED';
      }

      if (isReported) {
        reportedClasses++;
      }

      const values: Record<string, { total: number; present: number; absent: number; rate: number }> = {};

      indicators.forEach((ig) => {
        const val = repValues.find((v) => v.indicator_group_id === ig.id);
        const total = val ? val.total_count : 0;
        const present = val ? val.present_count : 0;
        const absent = val ? val.absent_count : 0;
        const rate = total > 0 ? (absent / total) * 100 : 0;

        values[ig.id] = { total, present, absent, rate };

        if (isReported) {
          if (!totals[ig.id]) {
            totals[ig.id] = { total: 0, present: 0, absent: 0, rate: 0 };
          }
          totals[ig.id].total += total;
          totals[ig.id].present += present;
          totals[ig.id].absent += absent;
        }
      });

      const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];
      const mainTotal = values[mainIndicator?.id]?.total || 0;
      const mainAbsent = values[mainIndicator?.id]?.absent || 0;
      const mainPresent = values[mainIndicator?.id]?.present || 0;

      const overallRate = mainTotal > 0 ? (mainAbsent / mainTotal) * 100 : 0;
      const overallPresentRate = mainTotal > 0 ? (mainPresent / mainTotal) * 100 : 0;

      // Preschool aggregation
      const psData = rep?.preschool_data;
      if (isReported && psData) {
        preschoolTotals.femaleStudents += Number(psData.female_count) || 0;
        preschoolTotals.ethnicStudents += Number(psData.ethnic_count) || 0;
        preschoolTotals.femaleEthnicStudents += Number(psData.female_ethnic_count) || 0;
        preschoolTotals.poorStudents += Number(psData.poor_count) || 0;
        preschoolTotals.disabledStudents += Number(psData.disabled_count) || 0;
        preschoolTotals.presentFemale += Number(psData.present_female_count) || 0;
        preschoolTotals.presentEthnic += Number(psData.present_ethnic_count) || 0;
        preschoolTotals.absentExcused += Number(psData.absent_excused) || 0;
        preschoolTotals.absentUnexcused += Number(psData.absent_unexcused) || 0;
        preschoolTotals.boardingCount += Number(psData.boarding_count) || 0;
        preschoolTotals.lunchCount += Number(psData.lunch_count) || Number(psData.boarding_count) || 0;
        preschoolTotals.snackCount += Number(psData.snack_count) || Number(psData.boarding_count) || 0;
        preschoolTotals.canceledCount += Number(psData.canceled_count) || 0;
        preschoolTotals.healthIssueCount += Number(psData.health_issue_count) || 0;

        // Báo ăn Nhà trẻ vs Mẫu giáo
        preschoolTotals.boardingNhaTre = (preschoolTotals.boardingNhaTre || 0) + (Number(psData.boarding_nha_tre) || 0);
        preschoolTotals.boardingMauGiao = (preschoolTotals.boardingMauGiao || 0) + (Number(psData.boarding_mau_giao) || 0);
        preschoolTotals.lunchNhaTre = (preschoolTotals.lunchNhaTre || 0) + (Number(psData.lunch_nha_tre) || 0);
        preschoolTotals.lunchMauGiao = (preschoolTotals.lunchMauGiao || 0) + (Number(psData.lunch_mau_giao) || 0);
        preschoolTotals.snackNhaTre = (preschoolTotals.snackNhaTre || 0) + (Number(psData.snack_nha_tre) || 0);
        preschoolTotals.snackMauGiao = (preschoolTotals.snackMauGiao || 0) + (Number(psData.snack_mau_giao) || 0);

        // Sĩ số & Có mặt Nhà trẻ vs Mẫu giáo
        preschoolTotals.totalNhaTre = (preschoolTotals.totalNhaTre || 0) + (Number(psData.total_nha_tre) || 0);
        preschoolTotals.totalMauGiao = (preschoolTotals.totalMauGiao || 0) + (Number(psData.total_mau_giao) || 0);
        preschoolTotals.presentNhaTre = (preschoolTotals.presentNhaTre || 0) + (Number(psData.present_nha_tre) || 0);
        preschoolTotals.presentMauGiao = (preschoolTotals.presentMauGiao || 0) + (Number(psData.present_mau_giao) || 0);
        preschoolTotals.absentNhaTre = (preschoolTotals.absentNhaTre || 0) + (Number(psData.absent_nha_tre) || 0);
        preschoolTotals.absentMauGiao = (preschoolTotals.absentMauGiao || 0) + (Number(psData.absent_mau_giao) || 0);

        // Thống kê theo từng năm sinh (2025, 2024, 2023, 2022, 2021, 2026...)
        if (psData.age_stats && preschoolTotals.byYear) {
          Object.entries(psData.age_stats).forEach(([yr, stats]) => {
            if (!preschoolTotals.byYear![yr]) {
              preschoolTotals.byYear![yr] = { total: 0, present: 0, absent: 0, boarding: 0 };
            }
            preschoolTotals.byYear![yr].total += Number(stats.total) || 0;
            preschoolTotals.byYear![yr].present += Number(stats.present) || 0;
            preschoolTotals.byYear![yr].absent += Number(stats.absent) || Math.max(0, (Number(stats.total) || 0) - (Number(stats.present) || 0));
            preschoolTotals.byYear![yr].boarding += Number(stats.boarding) || 0;
          });
        }
      }

      return {
        classId: cls.id,
        className: cls.class_name,
        grade: cls.grade,
        campusId: cls.campus_id,
        teacherName: teacher?.full_name || 'Chưa phân công',
        classItem: cls,
        teacher,
        report: rep,
        status,
        values,
        preschool: psData,
        overallRate,
        overallPresentRate,
      };
    });

    (indicators || []).forEach((ig) => {
      if (!ig) return;
      const t = totals[ig.id];
      if (t) {
        t.rate = t.total > 0 ? (t.absent / t.total) * 100 : 0;
      }
    });

    const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];
    const mainSchoolTotal = totals[mainIndicator?.id]?.total || 0;
    const mainSchoolPresent = totals[mainIndicator?.id]?.present || 0;
    const mainSchoolAbsent = totals[mainIndicator?.id]?.absent || 0;
    const mainSchoolRate = mainSchoolTotal > 0 ? (mainSchoolAbsent / mainSchoolTotal) * 100 : 0;
    const mainSchoolPresentRate = mainSchoolTotal > 0 ? (mainSchoolPresent / mainSchoolTotal) * 100 : 0;

    preschoolTotals.totalStudents = mainSchoolTotal;
    preschoolTotals.presentStudents = mainSchoolPresent;
    preschoolTotals.absentStudents = mainSchoolAbsent;
    preschoolTotals.attendanceRate = mainSchoolPresentRate;
    preschoolTotals.boardingRate = mainSchoolPresent > 0 ? (preschoolTotals.boardingCount / mainSchoolPresent) * 100 : 0;

    return {
      date: reportDate,
      totalClasses,
      reportedClasses,
      unreportedClasses: totalClasses - reportedClasses,
      rows,
      totals,
      overallSchool: {
        total: mainSchoolTotal,
        present: mainSchoolPresent,
        absent: mainSchoolAbsent,
        rate: mainSchoolRate,
        presentRate: mainSchoolPresentRate,
      },
      preschoolTotals,
    };
  },

  // --- 9. Monthly Aggregate ---
  async getMonthlyAggregate(yearMonth: string, campusId?: string): Promise<{
    yearMonth: string;
    totalDaysReported: number;
    totalAbsentAccumulated: number;
    avgAbsentRate: number;
    highestAbsentClass: { className: string; rate: number } | null;
    lowestAbsentClass: { className: string; rate: number } | null;
    dayStats: { date: string; reportedCount: number; totalStudents: number; absentStudents: number; rate: number }[];
  }> {
    ensureInitialized();

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data: cloudReports } = await supabase
          .from('daily_reports')
          .select('*')
          .gte('report_date', `${yearMonth}-01`)
          .lte('report_date', `${yearMonth}-31`);

        if (cloudReports && cloudReports.length > 0) {
          const repIds = cloudReports.map((r) => r.id);
          const { data: cloudValues } = await supabase
            .from('daily_report_values')
            .select('*')
            .in('report_id', repIds);

          if (cloudValues) {
            const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
            let reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
            cloudReports.forEach((cRep) => {
              const idx = reports.findIndex((r) => r.id === cRep.id);
              if (idx >= 0) reports[idx] = cRep;
              else reports.push(cRep);
            });
            localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));

            const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
            let allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
            allValues = allValues.filter((v) => !repIds.includes(v.report_id)).concat(cloudValues);
            localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(allValues));
          }
        }
      } catch (err) {
        console.warn('Supabase fetch monthly aggregate fallback to local:', err);
      }
    }

    const [allClasses, indicators] = await Promise.all([
      this.getClasses(),
      this.getIndicatorGroups(),
    ]);

    let activeClasses = allClasses.filter((c) => c.active);
    if (campusId && campusId !== 'all') {
      activeClasses = activeClasses.filter((c) => c.campus_id === campusId);
    }
    const activeClassIds = new Set(activeClasses.map((c) => c.id));

    const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
    // Only include reports for the active filtered classes
    const monthReports = reports.filter((r) => r.report_date.startsWith(yearMonth) && activeClassIds.has(r.class_id));

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    const dateMap = new Map<string, DailyReport[]>();
    monthReports.forEach((r) => {
      const list = dateMap.get(r.report_date) || [];
      list.push(r);
      dateMap.set(r.report_date, list);
    });

    const dayStats: { date: string; reportedCount: number; totalStudents: number; absentStudents: number; rate: number }[] = [];
    let totalAbsentAccumulated = 0;
    let sumRates = 0;

    const classStats = new Map<string, { className: string; total: number; absent: number }>();
    activeClasses.forEach((c) => classStats.set(c.id, { className: c.class_name, total: 0, absent: 0 }));

    Array.from(dateMap.keys()).sort().forEach((date) => {
      const repList = dateMap.get(date) || [];
      let dayTotal = 0;
      let dayAbsent = 0;

      repList.forEach((r) => {
        const val = allValues.find((v) => v.report_id === r.id && v.indicator_group_id === mainIndicator?.id);
        if (val) {
          dayTotal += val.total_count;
          dayAbsent += val.absent_count;

          const cStat = classStats.get(r.class_id);
          if (cStat) {
            cStat.total += val.total_count;
            cStat.absent += val.absent_count;
          }
        }
      });

      const dayRate = dayTotal > 0 ? (dayAbsent / dayTotal) * 100 : 0;
      totalAbsentAccumulated += dayAbsent;
      sumRates += dayRate;

      dayStats.push({
        date,
        reportedCount: repList.length,
        totalStudents: dayTotal,
        absentStudents: dayAbsent,
        rate: dayRate,
      });
    });

    const totalDaysReported = dayStats.length;
    const avgAbsentRate = totalDaysReported > 0 ? sumRates / totalDaysReported : 0;

    let highestAbsentClass: { className: string; rate: number } | null = null;
    let lowestAbsentClass: { className: string; rate: number } | null = null;

    Array.from(classStats.values()).forEach((c) => {
      if (c.total > 0) {
        const rate = (c.absent / c.total) * 100;
        if (!highestAbsentClass || rate > highestAbsentClass.rate) {
          highestAbsentClass = { className: c.className, rate };
        }
        if (!lowestAbsentClass || rate < lowestAbsentClass.rate) {
          lowestAbsentClass = { className: c.className, rate };
        }
      }
    });

    return {
      yearMonth,
      totalDaysReported,
      totalAbsentAccumulated,
      avgAbsentRate,
      highestAbsentClass,
      lowestAbsentClass,
      dayStats,
    };
  },

  // --- 9.1 Quản lý Ngày Nghỉ Học Sinh (Không xếp loại những ngày nghỉ) ---
  async getOffDays(): Promise<SchoolOffDay[]> {
    ensureInitialized();
    const raw = localStorage.getItem(STORAGE_KEYS.OFF_DAYS);
    if (!raw) {
      const defaultOffDays: SchoolOffDay[] = [
        { id: 'off_2026_09_02', date: '2026-09-02', name: 'Nghỉ lễ Quốc khánh 2/9', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2026_09_03', date: '2026-09-03', name: 'Nghỉ lễ Quốc khánh (Nghỉ bù)', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2026_11_20', date: '2026-11-20', name: 'Kỷ niệm Ngày Nhà giáo Việt Nam 20/11', type: 'SPECIAL', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2027_01_01', date: '2027-01-01', name: 'Nghỉ Tết Dương lịch', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2027_04_30', date: '2027-04-30', name: 'Nghỉ lễ 30/4 Giải phóng miền Nam', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
        { id: 'off_2027_05_01', date: '2027-05-01', name: 'Nghỉ Quốc tế Lao động 1/5', type: 'HOLIDAY', applies_to: 'ALL', created_at: new Date().toISOString() },
      ];
      localStorage.setItem(STORAGE_KEYS.OFF_DAYS, JSON.stringify(defaultOffDays));
      return defaultOffDays;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  async saveOffDay(offDay: SchoolOffDay): Promise<void> {
    const list = await this.getOffDays();
    const idx = list.findIndex((o) => o.id === offDay.id || o.date === offDay.date);
    if (idx >= 0) {
      list[idx] = offDay;
    } else {
      list.push(offDay);
    }
    localStorage.setItem(STORAGE_KEYS.OFF_DAYS, JSON.stringify(list));
    notifyRealtimeChange('off_days', list);
  },

  async deleteOffDay(id: string): Promise<void> {
    const list = await this.getOffDays();
    const updated = list.filter((o) => o.id !== id);
    localStorage.setItem(STORAGE_KEYS.OFF_DAYS, JSON.stringify(updated));
    notifyRealtimeChange('off_days', updated);
  },

  // --- 9.2 Tổng kết & Xếp hạng duy trì sĩ số (Tuần / Tháng / Năm - Loại trừ ngày nghỉ) ---
  async getAttendanceRanking(options: {
    periodType: AttendancePeriodType;
    startDate: string;
    endDate: string;
    periodLabel: string;
    weekNumber?: number;
    schoolWeekInfo?: SchoolWeekInfo;
    campusId?: string;
    grade?: number | 'ALL';
    excludeSundays?: boolean;
    excludeSaturdays?: boolean;
    excludeEmptySchoolDays?: boolean;
  }): Promise<AttendanceRankingSummary> {
    ensureInitialized();
    const {
      periodType,
      startDate,
      endDate,
      periodLabel,
      weekNumber,
      schoolWeekInfo,
      campusId = 'all',
      grade = 'ALL',
      excludeSundays = true,
      excludeSaturdays = periodType === 'WEEK' ? true : false,
      excludeEmptySchoolDays = true,
    } = options;

    const [allClasses, indicators, profiles, offDays, campuses, settings] = await Promise.all([
      this.getClasses(),
      this.getIndicatorGroups(),
      this.getProfiles(),
      this.getOffDays(),
      this.getCampuses(),
      this.getSettings(),
    ]);

    const thresholdExcellent = settings?.ranking_threshold_excellent ?? 98;
    const thresholdGood = settings?.ranking_threshold_good ?? 95;
    const thresholdFair = settings?.ranking_threshold_fair ?? 90;
    const enableEarlyBonus = settings?.enable_early_report_bonus ?? true;
    const earlyDeadline = settings?.early_report_deadline || DEFAULT_EARLY_REPORT_DEADLINE;
    const bonusPerDay = settings?.early_report_bonus_points ?? DEFAULT_EARLY_REPORT_BONUS_PER_DAY;
    const maxBonus = settings?.early_report_max_bonus ?? DEFAULT_EARLY_REPORT_MAX_BONUS;

    let targetClasses = allClasses.filter((c) => c.active);
    if (campusId && campusId !== 'all') {
      targetClasses = targetClasses.filter((c) => c.campus_id === campusId);
    }
    if (grade !== 'ALL') {
      targetClasses = targetClasses.filter((c) => c.grade === Number(grade));
    }

    const targetClassIds = new Set(targetClasses.map((c) => c.id));
    const mainIndicator = indicators.find((i) => i.code === 'ALL') || indicators[0];

    const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
    const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];

    const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
    const allValues: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];

    // Filter reports in date range
    const periodReports = reports.filter(
      (r) => r.report_date >= startDate && r.report_date <= endDate && targetClassIds.has(r.class_id)
    );

    // Group reports by date
    const reportsByDate = new Map<string, DailyReport[]>();
    periodReports.forEach((r) => {
      const list = reportsByDate.get(r.report_date) || [];
      list.push(r);
      reportsByDate.set(r.report_date, list);
    });

    // Generate list of all calendar days in [startDate, endDate] safely without timezone shifts
    const dateList: string[] = [];
    let curDate = startDate;
    while (curDate <= endDate) {
      dateList.push(curDate);
      curDate = addDaysToDateStr(curDate, 1);
    }

    const excludedOffDays: Array<{ date: string; name: string }> = [];
    const validDates: string[] = [];

    // Check each date
    dateList.forEach((dStr) => {
      const [y, m, d] = parseDateParts(dStr);
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      const dayOfWeek = dt.getDay(); // 0 = Sunday, 6 = Saturday

      // 1. Check Sunday
      if (excludeSundays && dayOfWeek === 0) {
        excludedOffDays.push({ date: dStr, name: 'Chủ nhật (Nghỉ cuối tuần)' });
        return;
      }

      // 2. Check Saturday if enabled
      if (excludeSaturdays && dayOfWeek === 6) {
        excludedOffDays.push({ date: dStr, name: 'Thứ bảy (Nghỉ cuối tuần)' });
        return;
      }

      // 3. Check OffDays registry
      const offMatch = offDays.find(
        (o) => o.date === dStr && (o.applies_to === 'ALL' || o.applies_to === campusId)
      );
      if (offMatch) {
        excludedOffDays.push({ date: dStr, name: offMatch.name });
        return;
      }

      // 4. Check if school had no reports (entire school day off)
      const dayReports = reportsByDate.get(dStr) || [];
      if (excludeEmptySchoolDays && dayReports.length === 0) {
        excludedOffDays.push({ date: dStr, name: 'Ngày không có lịch học / Toàn trường nghỉ' });
        return;
      }

      validDates.push(dStr);
    });

    // Calculate attendance score for ALL active classes first to determine both schoolRank and campusRank
    const allCalculatedRanks: ClassAttendanceRank[] = [];
    let totalSchoolPossible = 0;
    let totalSchoolPresent = 0;
    let totalSchoolAbsent = 0;

    const totalActiveSchoolClasses = allClasses.filter((c) => c.active).length;

    // Process all active classes
    allClasses.filter((c) => c.active).forEach((cls) => {
      const teacher = profiles.find((p) => p.id === cls.homeroom_teacher_id);
      const campusObj = campuses.find((c) => c.id === cls.campus_id);
      const cName = campusObj?.name || 'Khu chính';
      const cId = cls.campus_id || 'main';

      let classPossible = 0;
      let classPresent = 0;
      let classAbsent = 0;
      let reportedDays = 0;
      let earlyReportDays = 0;
      const reportTimes: string[] = [];
      let lastKnownTotal = 0;

      validDates.forEach((dateStr) => {
        const dayRep = reports.find((r) => r.class_id === cls.id && r.report_date === dateStr);
        if (dayRep) {
          reportedDays++;

          // Kiểm tra xem báo cáo có được gửi sớm trước giờ quy định không
          const { isEarly, timeStr } = checkIsReportEarly(dayRep, earlyDeadline);
          if (isEarly) {
            earlyReportDays++;
          }
          if (timeStr && timeStr !== '--:--') {
            reportTimes.push(timeStr);
          }

          const val = allValues.find(
            (v) => v.report_id === dayRep.id && v.indicator_group_id === mainIndicator?.id
          );
          if (val) {
            classPossible += val.total_count;
            classPresent += val.present_count;
            classAbsent += val.absent_count;
            if (val.total_count > 0) lastKnownTotal = val.total_count;
          }
        }
      });

      // If no report on valid dates, fallback enrollment
      if (lastKnownTotal === 0) {
        const anyRep = reports.find((r) => r.class_id === cls.id);
        if (anyRep) {
          const val = allValues.find((v) => v.report_id === anyRep.id && v.indicator_group_id === mainIndicator?.id);
          if (val) lastKnownTotal = val.total_count;
        }
      }

      const attendanceRate = classPossible > 0 ? (classPresent / classPossible) * 100 : 0;
      const absentRate = classPossible > 0 ? (classAbsent / classPossible) * 100 : 0;

      // Tính điểm cộng nộp báo cáo sớm
      const rawEarlyBonus = enableEarlyBonus ? earlyReportDays * bonusPerDay : 0;
      const earlyBonusPoints = maxBonus > 0 ? Math.min(rawEarlyBonus, maxBonus) : rawEarlyBonus;
      const roundedAttendanceRate = Math.round(attendanceRate * 100) / 100;
      const roundedEarlyBonus = Math.round(earlyBonusPoints * 100) / 100;
      const totalScore = Math.round((roundedAttendanceRate + roundedEarlyBonus) * 100) / 100;

      // Tính giờ báo cáo trung bình
      let averageReportTime: string | undefined = undefined;
      if (reportTimes.length > 0) {
        const totalMinutes = reportTimes.reduce((acc, t) => {
          const [h, m] = t.split(':').map(Number);
          return acc + (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
        }, 0);
        const avgMin = Math.round(totalMinutes / reportTimes.length);
        const avgH = Math.floor(avgMin / 60);
        const avgM = avgMin % 60;
        averageReportTime = `${String(avgH).padStart(2, '0')}:${String(avgM).padStart(2, '0')}`;
      }

      let classification: ClassAttendanceRank['classification'] = 'NEEDS_IMPROVEMENT';
      let classificationLabel = 'Cần cố gắng';

      if (classPossible > 0) {
        const evalScore = enableEarlyBonus ? totalScore : roundedAttendanceRate;
        if (evalScore >= thresholdExcellent) {
          classification = 'EXCELLENT';
          classificationLabel = 'Xuất sắc';
        } else if (evalScore >= thresholdGood) {
          classification = 'GOOD';
          classificationLabel = 'Tốt';
        } else if (evalScore >= thresholdFair) {
          classification = 'FAIR';
          classificationLabel = 'Khá';
        } else {
          classification = 'NEEDS_IMPROVEMENT';
          classificationLabel = 'Cần cố gắng';
        }
      } else {
        classificationLabel = 'Chưa có số liệu';
      }

      totalSchoolPossible += classPossible;
      totalSchoolPresent += classPresent;
      totalSchoolAbsent += classAbsent;

      allCalculatedRanks.push({
        rank: 0,
        schoolRank: 0,
        totalClassesInSchool: totalActiveSchoolClasses,
        campusId: cId,
        campusName: cName,
        campusRank: 0,
        totalClassesInCampus: 0,
        classItem: cls,
        teacher,
        enrollment: lastKnownTotal,
        validSchoolDays: validDates.length,
        reportedDays,
        totalPossibleAttendances: classPossible,
        totalPresentAttendances: classPresent,
        totalAbsentAttendances: classAbsent,
        attendanceRate: roundedAttendanceRate,
        absentRate: Math.round(absentRate * 100) / 100,
        earlyReportDays,
        earlyBonusPoints: roundedEarlyBonus,
        averageReportTime,
        totalScore,
        classification,
        classificationLabel,
      });
    });

    // So sánh thứ hạng thi đua toàn diện (Điểm tổng > Tỷ lệ chuyên cần > Số ngày báo sớm > Giờ nộp sớm > Ít vắng)
    const compareRanks = (a: ClassAttendanceRank, b: ClassAttendanceRank) => {
      // 1. Điểm thi đua tổng kết (đã bao gồm điểm thưởng báo sớm)
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // 2. Tỷ lệ chuyên cần (%)
      if (b.attendanceRate !== a.attendanceRate) {
        return b.attendanceRate - a.attendanceRate;
      }
      // 3. Số ngày báo sớm nhiều hơn
      if (b.earlyReportDays !== a.earlyReportDays) {
        return b.earlyReportDays - a.earlyReportDays;
      }
      // 4. Giờ báo cáo trung bình sớm hơn
      if (a.averageReportTime && b.averageReportTime && a.averageReportTime !== b.averageReportTime) {
        return a.averageReportTime.localeCompare(b.averageReportTime);
      }
      // 5. Ít lượt vắng hơn
      if (a.totalAbsentAttendances !== b.totalAbsentAttendances) {
        return a.totalAbsentAttendances - b.totalAbsentAttendances;
      }
      // 6. Số ngày đã báo cáo
      return b.reportedDays - a.reportedDays;
    };

    // 1. Sort all school-wide to calculate schoolRank
    allCalculatedRanks.sort(compareRanks);

    allCalculatedRanks.forEach((item, idx) => {
      item.schoolRank = idx + 1;
    });

    // 2. Group by campus to calculate campusRank and campusSummaries
    const campusGroups = new Map<string, ClassAttendanceRank[]>();
    allCalculatedRanks.forEach((item) => {
      const cId = item.campusId || 'main';
      const grp = campusGroups.get(cId) || [];
      grp.push(item);
      campusGroups.set(cId, grp);
    });

    const campusSummaries: CampusRankingSummary[] = [];

    // Order campuses: match order in campuses array if available
    const knownCampusIds = new Set<string>();
    campuses.forEach((c) => {
      knownCampusIds.add(c.id);
      const grp = campusGroups.get(c.id) || [];
      // Sort within campus with comprehensive emulation criteria
      grp.sort(compareRanks);

      grp.forEach((item, idx) => {
        item.campusRank = idx + 1;
        item.totalClassesInCampus = grp.length;
      });

      const totalStudents = grp.reduce((acc, r) => acc + r.enrollment, 0);
      const totalPresent = grp.reduce((acc, r) => acc + r.totalPresentAttendances, 0);
      const totalAbsent = grp.reduce((acc, r) => acc + r.totalAbsentAttendances, 0);
      const totalPossible = grp.reduce((acc, r) => acc + r.totalPossibleAttendances, 0);
      const attendanceRate = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 10000) / 100 : 0;

      campusSummaries.push({
        campusId: c.id,
        campusName: c.name,
        totalClasses: grp.length,
        totalStudents,
        totalPresent,
        totalAbsent,
        attendanceRate,
        rankings: grp,
        topPerformers: grp.filter((r) => r.totalScore > 0 || r.attendanceRate > 0).slice(0, 3),
      });
    });

    // Handle any remaining groups (e.g. main/unassigned)
    campusGroups.forEach((grp, cId) => {
      if (!knownCampusIds.has(cId)) {
        grp.sort(compareRanks);
        grp.forEach((item, idx) => {
          item.campusRank = idx + 1;
          item.totalClassesInCampus = grp.length;
        });

        const totalStudents = grp.reduce((acc, r) => acc + r.enrollment, 0);
        const totalPresent = grp.reduce((acc, r) => acc + r.totalPresentAttendances, 0);
        const totalAbsent = grp.reduce((acc, r) => acc + r.totalAbsentAttendances, 0);
        const totalPossible = grp.reduce((acc, r) => acc + r.totalPossibleAttendances, 0);
        const attendanceRate = totalPossible > 0 ? Math.round((totalPresent / totalPossible) * 10000) / 100 : 0;

        campusSummaries.push({
          campusId: cId,
          campusName: grp[0]?.campusName || 'Khu chính',
          totalClasses: grp.length,
          totalStudents,
          totalPresent,
          totalAbsent,
          attendanceRate,
          rankings: grp,
          topPerformers: grp.filter((r) => r.totalScore > 0 || r.attendanceRate > 0).slice(0, 3),
        });
      }
    });

    // 3. Filter list according to request criteria (campusId and grade)
    let filteredRanks = [...allCalculatedRanks];
    if (campusId && campusId !== 'all') {
      filteredRanks = filteredRanks.filter((r) => r.campusId === campusId || r.classItem.campus_id === campusId);
    }
    if (grade !== 'ALL') {
      filteredRanks = filteredRanks.filter((r) => r.classItem.grade === Number(grade));
    }

    // Set rank for display based on context
    filteredRanks.forEach((item, idx) => {
      if (campusId && campusId !== 'all') {
        item.rank = item.campusRank || (idx + 1);
      } else {
        item.rank = idx + 1;
      }
    });

    const topPerformers = filteredRanks.filter((r) => r.totalScore > 0 || r.attendanceRate > 0).slice(0, 3);
    const schoolAttendanceRate =
      totalSchoolPossible > 0
        ? Math.round((totalSchoolPresent / totalSchoolPossible) * 10000) / 100
        : 0;

    return {
      periodType,
      periodLabel,
      weekNumber,
      schoolWeekInfo,
      dateRange: { start: startDate, end: endDate },
      totalDaysInRange: dateList.length,
      totalExcludedDays: excludedOffDays.length,
      excludedOffDays,
      totalValidDays: validDates.length,
      schoolAttendanceRate,
      totalStudents: filteredRanks.reduce((acc, r) => acc + r.enrollment, 0),
      totalPresent: filteredRanks.reduce((acc, r) => acc + r.totalPresentAttendances, 0),
      totalAbsent: filteredRanks.reduce((acc, r) => acc + r.totalAbsentAttendances, 0),
      rankings: filteredRanks,
      topPerformers,
      campusSummaries,
    };
  },

  /**
   * Đồng bộ & Lấy nhanh thông tin xếp hạng thi đua cho lớp của GVCN
   */
  async getClassAttendanceRanking(classId: string, periodType: AttendancePeriodType = 'WEEK'): Promise<ClassAttendanceRank | null> {
    const settings = await this.getSettings();
    const week1Start = settings?.week1_start_date || DEFAULT_WEEK1_START_DATE;
    const todayStr = getTodayDateStr();
    let startDate = '';
    let endDate = '';
    let periodLabel = '';
    let weekNumber: number | undefined = undefined;
    let schoolWeekInfo: SchoolWeekInfo | undefined = undefined;

    if (periodType === 'WEEK') {
      schoolWeekInfo = getSchoolWeekFromDate(todayStr, week1Start);
      startDate = schoolWeekInfo.startDate;
      endDate = schoolWeekInfo.endDate;
      periodLabel = schoolWeekInfo.label;
      weekNumber = schoolWeekInfo.weekNumber;
    } else if (periodType === 'MONTH') {
      const d = new Date();
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      periodLabel = `Tháng ${month}/${year}`;
    } else {
      const d = new Date();
      const year = d.getFullYear();
      startDate = `${year}-09-01`;
      endDate = `${year + 1}-05-31`;
      periodLabel = 'Năm học';
    }

    const summary = await this.getAttendanceRanking({
      periodType,
      startDate,
      endDate,
      periodLabel,
      weekNumber,
      schoolWeekInfo,
      campusId: 'all',
      grade: 'ALL',
      excludeSundays: true,
      excludeSaturdays: true,
      excludeEmptySchoolDays: true,
    });

    const found = summary.rankings.find((r) => r.classItem.id === classId);
    return found || null;
  },

  // --- 10. Audit Logs ---
  async getLogs(limit: number = 50): Promise<SystemLog[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      try {
        const { data, error } = await supabase
          .from('system_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(data));
          return data;
        }
      } catch (err) {
        console.warn('Supabase fetch system_logs fallback to local', err);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    const logs: SystemLog[] = raw ? JSON.parse(raw) : [];
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, limit);
  },

  async addLog(log: Omit<SystemLog, 'id' | 'created_at'>): Promise<void> {
    const raw = localStorage.getItem(STORAGE_KEYS.LOGS);
    const logs: SystemLog[] = raw ? JSON.parse(raw) : [];
    const item: SystemLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: new Date().toISOString(),
    };
    logs.unshift(item);
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs.slice(0, 200)));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConnected()) {
      Promise.resolve().then(async () => {
        try {
          await supabase.from('system_logs').insert(item);
        } catch (e) {
          console.error('Supabase addLog error:', e);
        }
      });
    }
  },

  // --- 11. TWO-WAY MASS SYNC ENGINES ---

  /**
   * Uploads every table & row from Local Storage up to Supabase Cloud
   */
  async syncAllToSupabase(): Promise<{
    success: boolean;
    message: string;
    details: Record<string, { count: number; error?: string }>;
  }> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConnected()) {
      return {
        success: false,
        message: 'Chưa kết nối tới Supabase Cloud. Vui lòng cấu hình URL và API Key.',
        details: {},
      };
    }

    const details: Record<string, { count: number; error?: string }> = {};

    try {
      // 1. school_settings
      const settings = await this.getSettings();
      const { error: sErr } = await supabase.from('school_settings').upsert(settings);
      details.school_settings = { count: 1, error: sErr?.message };

      // 2. school_years
      const years = await this.getSchoolYears();
      if (years.length > 0) {
        const { error: yErr } = await supabase.from('school_years').upsert(years);
        details.school_years = { count: years.length, error: yErr?.message };
      }

      // 3. campuses
      const campuses = await this.getCampuses();
      if (campuses.length > 0) {
        const { error: cErr } = await supabase.from('campuses').upsert(campuses);
        details.campuses = { count: campuses.length, error: cErr?.message };
      }

      // 4. profiles
      const profiles = await this.getProfiles();
      if (profiles.length > 0) {
        const { error: pErr } = await supabase.from('profiles').upsert(profiles);
        details.profiles = { count: profiles.length, error: pErr?.message };
      }

      // 5. classes
      const classes = await this.getClasses();
      if (classes.length > 0) {
        const cleanClasses = classes.map((c) => ({
          id: c.id,
          class_name: c.class_name,
          grade: Math.max(1, Math.min(12, Number(c.grade) || 1)),
          school_year_id: c.school_year_id || null,
          campus_id: c.campus_id || null,
          homeroom_teacher_id: c.homeroom_teacher_id || null,
          active: c.active !== false,
          is_locked: !!c.is_locked,
          sort_order: Number(c.sort_order) || 0,
          created_at: c.created_at || new Date().toISOString(),
        }));
        let { error: clErr } = await supabase.from('classes').upsert(cleanClasses);
        if (clErr) {
          const stripped = cleanClasses.map((c) => ({
            ...c,
            school_year_id: null,
            campus_id: null,
            homeroom_teacher_id: null,
          }));
          const retry = await supabase.from('classes').upsert(stripped);
          clErr = retry.error;
        }
        details.classes = { count: classes.length, error: clErr?.message };
      }

      // 6. indicator_groups
      const indicators = await this.getIndicatorGroups();
      if (indicators.length > 0) {
        const { error: iErr } = await supabase.from('indicator_groups').upsert(indicators);
        details.indicator_groups = { count: indicators.length, error: iErr?.message };
      }

      // 7. daily_reports
      const rawReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
      const reports: DailyReport[] = rawReports ? JSON.parse(rawReports) : [];
      if (reports.length > 0) {
        // Upsert in batches of 50
        let repErrors: string | undefined;
        for (let i = 0; i < reports.length; i += 50) {
          const batch = reports.slice(i, i + 50);
          let { error: rErr } = await supabase.from('daily_reports').upsert(batch);
          if (rErr && (rErr.message?.includes('reported_time') || rErr.code === 'PGRST204')) {
            const batchCleaned = batch.map(({ reported_time, ...rest }) => rest);
            const retryRes = await supabase.from('daily_reports').upsert(batchCleaned);
            rErr = retryRes.error;
          }
          if (rErr) repErrors = rErr.message;
        }
        details.daily_reports = { count: reports.length, error: repErrors };
      }

      // 8. daily_report_values
      const rawValues = localStorage.getItem(STORAGE_KEYS.VALUES);
      const values: DailyReportValue[] = rawValues ? JSON.parse(rawValues) : [];
      if (values.length > 0) {
        let valErrors: string | undefined;
        for (let i = 0; i < values.length; i += 100) {
          const batch = values.slice(i, i + 100);
          const { error: vErr } = await supabase.from('daily_report_values').upsert(batch);
          if (vErr) valErrors = vErr.message;
        }
        details.daily_report_values = { count: values.length, error: valErrors };
      }

      // 9. system_logs
      const logs = await this.getLogs(100);
      if (logs.length > 0) {
        const { error: lErr } = await supabase.from('system_logs').upsert(logs);
        details.system_logs = { count: logs.length, error: lErr?.message };
      }

      const hasError = Object.values(details).some((d) => Boolean(d.error));

      let errorDetailsString = '';
      if (hasError) {
        const errorList = Object.entries(details)
          .filter(([_, d]) => Boolean(d.error))
          .map(([table, d]) => `${table}: ${d.error}`)
          .join(' | ');
        errorDetailsString = ` (Chi tiết: ${errorList}. Gợi ý: Hãy thử Copy kịch bản tạo bảng bên dưới và chạy lại trong Supabase SQL Editor để cập nhật cột mới).`;
      }

      return {
        success: !hasError,
        message: hasError
          ? `Đồng bộ hoàn tất một phần.${errorDetailsString}`
          : 'Đã đẩy toàn bộ thiết lập và dữ liệu lên Supabase thành công 100%!',
        details,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi đồng bộ lên Supabase: ${err?.message || err}`,
        details,
      };
    }
  },

  /**
   * Pulls every table & row from Supabase Cloud and saves to Local Storage
   */
  async syncAllFromSupabase(): Promise<{
    success: boolean;
    message: string;
    counts: Record<string, number>;
  }> {
    const supabase = getSupabaseClient();
    if (!supabase || !isSupabaseConnected()) {
      return {
        success: false,
        message: 'Chưa kết nối tới Supabase Cloud.',
        counts: {},
      };
    }

    const counts: Record<string, number> = {};

    try {
      const [
        { data: settings },
        { data: years },
        { data: campuses },
        { data: profiles },
        { data: classes },
        { data: indicators },
        { data: reports },
        { data: values },
        { data: logs },
      ] = await Promise.all([
        supabase.from('school_settings').select('*').limit(1).maybeSingle(),
        supabase.from('school_years').select('*'),
        supabase.from('campuses').select('*'),
        supabase.from('profiles').select('*'),
        supabase.from('classes').select('*'),
        supabase.from('indicator_groups').select('*'),
        supabase.from('daily_reports').select('*'),
        supabase.from('daily_report_values').select('*'),
        supabase.from('system_logs').select('*').limit(200),
      ]);

      if (settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        counts.school_settings = 1;
      }
      if (years && years.length > 0) {
        localStorage.setItem(STORAGE_KEYS.YEARS, JSON.stringify(years));
        counts.school_years = years.length;
      }
      if (campuses && campuses.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CAMPUSES, JSON.stringify(campuses));
        counts.campuses = campuses.length;
      }
      if (profiles && profiles.length > 0) {
        localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
        counts.profiles = profiles.length;
      }
      if (classes && classes.length > 0) {
        localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(classes));
        counts.classes = classes.length;
      }
      if (indicators && indicators.length > 0) {
        localStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(indicators));
        counts.indicator_groups = indicators.length;
      }
      if (reports && reports.length > 0) {
        localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(reports));
        counts.daily_reports = reports.length;
      }
      if (values && values.length > 0) {
        localStorage.setItem(STORAGE_KEYS.VALUES, JSON.stringify(values));
        counts.daily_report_values = values.length;
      }
      if (logs && logs.length > 0) {
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
        counts.system_logs = logs.length;
      }

      notifyRealtimeChange('all');

      return {
        success: true,
        message: 'Đã tải và đồng bộ toàn bộ dữ liệu từ Supabase Cloud về máy thành công!',
        counts,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Lỗi tải dữ liệu từ Supabase: ${err?.message || err}`,
        counts,
      };
    }
  },

  /**
   * Compare record counts between Local Cache and Supabase Cloud
   */
  async getSupabaseSyncStatus(): Promise<TableSyncStatus[]> {
    ensureInitialized();
    const supabase = getSupabaseClient();
    const connected = Boolean(supabase && isSupabaseConnected());

    const tableDefs = [
      { key: 'school_settings', label: 'Cấu hình nhà trường (school_settings)', storageKey: STORAGE_KEYS.SETTINGS, isObject: true },
      { key: 'school_years', label: 'Cấu hình năm học (school_years)', storageKey: STORAGE_KEYS.YEARS },
      { key: 'campuses', label: 'Phân hiệu / Điểm trường (campuses)', storageKey: STORAGE_KEYS.CAMPUSES },
      { key: 'profiles', label: 'Tài khoản người dùng (profiles)', storageKey: STORAGE_KEYS.PROFILES },
      { key: 'classes', label: 'Danh sách lớp học (classes)', storageKey: STORAGE_KEYS.CLASSES },
      { key: 'indicator_groups', label: 'Nhóm chỉ tiêu sĩ số (indicator_groups)', storageKey: STORAGE_KEYS.INDICATORS },
      { key: 'daily_reports', label: 'Sổ báo cáo sĩ số ngày (daily_reports)', storageKey: STORAGE_KEYS.REPORTS },
      { key: 'daily_report_values', label: 'Chi tiết số liệu chỉ tiêu (daily_report_values)', storageKey: STORAGE_KEYS.VALUES },
      { key: 'system_logs', label: 'Nhật ký thao tác & kiểm toán (system_logs)', storageKey: STORAGE_KEYS.LOGS },
    ];

    const results: TableSyncStatus[] = [];

    for (const def of tableDefs) {
      const raw = localStorage.getItem(def.storageKey);
      let localCount = 0;
      if (raw) {
        if (def.isObject) {
          localCount = 1;
        } else {
          try {
            const parsed = JSON.parse(raw);
            localCount = Array.isArray(parsed) ? parsed.length : 0;
          } catch {
            localCount = 0;
          }
        }
      }

      let cloudCount = 0;
      let errorMsg: string | undefined;

      if (connected && supabase) {
        try {
          const { count, error } = await supabase
            .from(def.key)
            .select('*', { count: 'exact', head: true });

          if (error) {
            errorMsg = error.message;
          } else {
            cloudCount = count || 0;
          }
        } catch (e: any) {
          errorMsg = e?.message || 'Không thể truy vấn';
        }
      }

      const isInSync = connected && !errorMsg && (
        def.key === 'system_logs'
          ? cloudCount >= localCount
          : localCount === cloudCount
      );

      results.push({
        table: def.key,
        label: def.label,
        localCount,
        cloudCount,
        inSync: isInSync,
        error: errorMsg,
      });
    }

    return results;
  },

  // --- Reset to Factory Default (Mặc định rỗng cấu hình mới) ---
  async resetToDefault(): Promise<void> {
    resetAllDataToEmpty();
  },
  async resetAllDataToEmpty(): Promise<void> {
    resetAllDataToEmpty();
  },
};
