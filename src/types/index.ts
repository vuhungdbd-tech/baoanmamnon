export type UserRole = 'ADMIN' | 'BGH' | 'GVCN';

export type TeachingScope = 'ALL' | 'NHA_TRE' | 'MAU_GIAO';

export type InputCalculationMode = 'MODE_1_TOTAL_PRESENT' | 'MODE_2_TOTAL_ABSENT' | 'MODE_3_ALL_THREE';

export type ReportStatus = 'NOT_REPORTED' | 'REPORTED' | 'LOCKED';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  assigned_class_id?: string;
  teaching_scope?: TeachingScope; // Phân quyền nhập: 'NHA_TRE' (chỉ nhập lớp Nhà trẻ), 'MAU_GIAO' (chỉ nhập lớp Mẫu giáo), 'ALL' (toàn trường)
  active: boolean;
  phone?: string;
  created_at: string;
}

export interface SchoolSettings {
  id: string;
  school_name: string;
  short_name: string;
  department_name?: string; // e.g. "PHÒNG GD&ĐT HUYỆN ĐIỆN BIÊN ĐÔNG"
  sub_department_name?: string; // e.g. "UBND HUYỆN ĐIỆN BIÊN ĐÔNG"
  address: string;
  commune: string;
  province: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  principal_name: string;
  principal_title: string;
  reporter_name?: string;
  reporter_title?: string;
  report_title: string;
  footer_text: string;
  developer_name?: string;
  developer_contact?: string;
  primary_color: string;
  input_mode: InputCalculationMode;
  enable_campuses: boolean;
  // Cấu hình năm học & xếp loại thi đua tuần
  week1_start_date?: string; // Ngày bắt đầu Tuần 1 (mặc định: '2026-09-07')
  school_days_per_week?: number; // Số ngày học trong tuần (mặc định: 5 ngày, thứ 2 đến thứ 6)
  ranking_threshold_excellent?: number; // Ngưỡng xếp loại Xuất sắc (mặc định: 98%)
  ranking_threshold_good?: number; // Ngưỡng xếp loại Tốt (mặc định: 95%)
  ranking_threshold_fair?: number; // Ngưỡng xếp loại Khá (mặc định: 90%)
  // Cấu hình cộng điểm thi đua báo cáo sớm
  enable_early_report_bonus?: boolean; // Bật tính điểm thưởng báo sớm (mặc định: true)
  early_report_deadline?: string; // Giờ quy định báo sớm (mặc định: '07:30')
  early_report_bonus_points?: number; // Số điểm cộng mỗi ngày báo sớm (mặc định: 0.5)
  early_report_max_bonus?: number; // Điểm cộng tối đa mỗi tuần (mặc định: 2.5)
  created_at: string;
  updated_at: string;
}

export interface SchoolYear {
  id: string;
  name: string; // e.g. "2025-2026", "2026-2027"
  is_active: boolean;
  is_locked?: boolean;
  created_at: string;
}

export interface Campus {
  id: string;
  name: string; // e.g. "Phân hiệu chính", "Phân hiệu Nà Sản", "Phân hiệu Suối Lư"
  active: boolean;
  principal_name?: string;
  principal_title?: string;
  reporter_name?: string;
  reporter_title?: string;
  created_at: string;
}

export interface ClassItem {
  id: string;
  class_name: string; // e.g. "6A1", "6A9", "9D1"
  grade: number; // 6, 7, 8, 9
  school_year_id: string;
  campus_id?: string;
  homeroom_teacher_id?: string;
  active: boolean;
  is_locked?: boolean;
  sort_order?: number;
  created_at: string;
}

export interface IndicatorGroup {
  id: string;
  name: string; // e.g. "Học sinh toàn trường", "Học sinh bán trú", "Học sinh nội trú"
  code: string; // e.g. "ALL", "BOARDING_HALF", "BOARDING_FULL", "WEEKEND_STAY"
  enabled: boolean;
  sort_order: number;
  show_total: boolean;
  show_present: boolean;
  show_absent: boolean;
  show_percentage: boolean;
  column_header_override?: string;
  created_at: string;
}

export interface AbsentStudent {
  id?: string; // ID liên kết với danh sách học sinh
  full_name: string;
  gender?: 'MALE' | 'FEMALE';
  address?: string;
  reason?: string;
  is_excused?: boolean; // Có phép (P) hay Không phép (KP)
  isBoarding?: boolean;
}

export interface Student {
  id: string;
  class_id: string;
  full_name: string;
  gender?: 'MALE' | 'FEMALE';
  address?: string;
  is_ethnic?: boolean; // Dân tộc thiểu số
  isBoarding?: boolean;
  birth_date?: string;
  created_at?: string;
}

export interface AgeGroupStat {
  total: number;     // Sĩ số trẻ sinh năm này
  present: number;   // Đi học hôm nay
  absent?: number;   // Vắng hôm nay
  boarding: number;  // Suất ăn hôm nay
}

export interface PreschoolDailyData {
  // Sĩ số học sinh
  female_count?: number; // Trong đó Nữ
  ethnic_count?: number; // Dân tộc thiểu số (DTTS)
  female_ethnic_count?: number; // Nữ DTTS
  poor_count?: number; // Trẻ hộ nghèo / cận nghèo
  disabled_count?: number; // Trẻ khuyết tật

  // Chuyên cần / Có mặt hôm nay
  present_female_count?: number; // Nữ có mặt
  present_ethnic_count?: number; // DTTS có mặt

  // Nghỉ học / Vắng hôm nay
  absent_excused?: number; // Vắng có phép (P)
  absent_unexcused?: number; // Vắng không phép (KP)

  // Bán trú (Báo suất ăn nhà bếp hàng ngày)
  boarding_count?: number; // Tổng số trẻ ăn bán trú tại trường hôm nay
  lunch_count?: number; // Số suất ăn trưa (bữa chính)
  snack_count?: number; // Số suất ăn phụ / xế
  breakfast_count?: number; // Số suất ăn sáng
  diet_type?: 'COM' | 'CHAO' | 'BOT' | 'HON_HOP'; // Loại khẩu phần ăn
  canceled_count?: number; // Số trẻ báo cắt suất ăn hôm nay

  // === BÁO ĂN BÁN TRÚ THEO ĐỘ TUỔI (ĂN NHÀ TRẺ & ĂN MẪU GIÁO) ===
  boarding_nha_tre?: number; // Tổng số trẻ ăn Nhà trẻ (sinh 2024, 2025, 2026)
  boarding_mau_giao?: number; // Tổng số trẻ ăn Mẫu giáo (sinh 2021, 2022, 2023)
  lunch_nha_tre?: number; // Suất ăn trưa Nhà trẻ
  lunch_mau_giao?: number; // Suất ăn trưa Mẫu giáo
  snack_nha_tre?: number; // Suất ăn xế Nhà trẻ
  snack_mau_giao?: number; // Suất ăn xế Mẫu giáo

  // === SĨ SỐ & ĐI HỌC THEO KHỐI (NHÀ TRẺ & MẪU GIÁO) ===
  total_nha_tre?: number; // Sĩ số Nhà trẻ
  total_mau_giao?: number; // Sĩ số Mẫu giáo
  present_nha_tre?: number; // Đi học Nhà trẻ
  present_mau_giao?: number; // Đi học Mẫu giáo
  absent_nha_tre?: number; // Nghỉ Nhà trẻ
  absent_mau_giao?: number; // Nghỉ Mẫu giáo

  // === THỐNG KÊ CHI TIẾT THEO TỪNG NĂM SINH (2025, 2024, 2023, 2022, 2021, 2026) ===
  age_stats?: Record<string, AgeGroupStat>;

  // Bản đồ số ăn / sĩ số theo năm sinh
  boarding_by_year?: Record<string, number>;
  total_by_year?: Record<string, number>;
  present_by_year?: Record<string, number>;

  // Theo dõi sức khỏe & dịch bệnh trẻ mầm non
  health_issue_count?: number; // Số trẻ có biểu hiện sức khỏe cần theo dõi (sốt, mệt...)
  health_note?: string; // Ghi chú sức khỏe (sốt, uống thuốc theo đơn phụ huynh gửi...)
}

export interface DailyReport {
  id: string;
  class_id: string;
  report_date: string; // YYYY-MM-DD
  created_by: string; // Profile ID
  status: 'DRAFT' | 'SUBMITTED' | 'LOCKED';
  notes?: string;
  absent_students?: AbsentStudent[];
  reported_time?: string; // Giờ nộp báo cáo (HH:mm) ví dụ: "07:15"
  preschool_data?: PreschoolDailyData;
  created_at: string;
  updated_at: string;
  locked_at?: string;
}

export interface DailyReportValue {
  id: string;
  report_id: string;
  indicator_group_id: string;
  total_count: number;
  present_count: number;
  absent_count: number;
  created_at: string;
  updated_at: string;
}

export interface SystemLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action: 'CREATE' | 'UPDATE' | 'LOCK' | 'UNLOCK' | 'SETTINGS_CHANGE' | 'DELETE';
  class_name?: string;
  report_date?: string;
  old_data?: any;
  new_data?: any;
  created_at: string;
}

export interface ClassReportRow {
  classItem: ClassItem;
  teacher?: Profile;
  report?: DailyReport;
  status: ReportStatus;
  values: Record<string, { total: number; present: number; absent: number; rate: number }>;
  preschool?: PreschoolDailyData;
  overallRate: number; // Tỷ lệ vắng % toàn lớp
  overallPresentRate: number;
}

export interface PreschoolSchoolTotals {
  totalStudents: number;
  femaleStudents: number;
  ethnicStudents: number;
  femaleEthnicStudents: number;
  poorStudents: number;
  disabledStudents: number;
  presentStudents: number;
  presentFemale: number;
  presentEthnic: number;
  absentStudents: number;
  absentExcused: number;
  absentUnexcused: number;
  boardingCount: number;
  lunchCount: number;
  snackCount: number;
  canceledCount: number;

  // Ăn theo độ tuổi: Nhà trẻ vs Mẫu giáo
  boardingNhaTre?: number;
  boardingMauGiao?: number;
  lunchNhaTre?: number;
  lunchMauGiao?: number;
  snackNhaTre?: number;
  snackMauGiao?: number;

  // Sĩ số & Đi học Nhà trẻ vs Mẫu giáo
  totalNhaTre?: number;
  totalMauGiao?: number;
  presentNhaTre?: number;
  presentMauGiao?: number;
  absentNhaTre?: number;
  absentMauGiao?: number;

  // Chi tiết theo từng năm sinh
  byYear?: Record<string, {
    total: number;
    present: number;
    absent: number;
    boarding: number;
  }>;

  healthIssueCount: number;
  attendanceRate: number;
  boardingRate: number;
}

export interface PreschoolBirthYearConfig {
  year: number;
  label: string;
  shortLabel: string;
  category: 'NHA_TRE' | 'MAU_GIAO';
  groupName: string;
  description: string;
}

export const PRESCHOOL_BIRTH_YEARS: PreschoolBirthYearConfig[] = [
  { year: 2026, label: 'Sinh 2026 (< 1 tuổi)', shortLabel: '2026 (<1T)', category: 'NHA_TRE', groupName: 'Nhóm trẻ sơ sinh', description: 'Trẻ dưới 12 tháng' },
  { year: 2025, label: 'Sinh 2025 (1 - 2 tuổi)', shortLabel: '2025 (1-2T)', category: 'NHA_TRE', groupName: 'Nhóm trẻ bé', description: 'Trẻ 12 - 24 tháng' },
  { year: 2024, label: 'Sinh 2024 (2 - 3 tuổi)', shortLabel: '2024 (2-3T)', category: 'NHA_TRE', groupName: 'Nhóm trẻ 24-36T', description: 'Trẻ 24 - 36 tháng' },
  { year: 2023, label: 'Sinh 2023 (3 - 4 tuổi)', shortLabel: '2023 (3-4T)', category: 'MAU_GIAO', groupName: 'Độ tuổi 3 - 4 tuổi', description: 'Trẻ 3 - 4 tuổi' },
  { year: 2022, label: 'Sinh 2022 (4 - 5 tuổi)', shortLabel: '2022 (4-5T)', category: 'MAU_GIAO', groupName: 'Độ tuổi 4 - 5 tuổi', description: 'Trẻ 4 - 5 tuổi' },
  { year: 2021, label: 'Sinh 2021 (5 - 6 tuổi)', shortLabel: '2021 (5-6T)', category: 'MAU_GIAO', groupName: 'Mẫu giáo Lớn', description: 'Trẻ 5 - 6 tuổi (Lớp Lá)' },
];

export interface PreschoolGradeConfig {
  id: string;
  code: string;
  grade_num: number; // 1: Nhà trẻ, 4: MG Lớn (hoặc số khối tùy chọn)
  name: string; // Tên khối
  category: 'NHA_TRE' | 'MAU_GIAO'; // Khối Nhà trẻ hay Mẫu giáo
  age_range: string; // Độ tuổi quy định: "24 - 36 tháng", "5 - 6 tuổi"
  birth_years: number[]; // Các năm sinh áp dụng, ví dụ: [2025, 2024], [2021]...
  description?: string;
  sort_order: number;
}

export const DEFAULT_PRESCHOOL_GRADES: PreschoolGradeConfig[] = [
  {
    id: 'grade_nt',
    code: 'NT',
    grade_num: 1,
    name: 'Khối Nhà trẻ',
    category: 'NHA_TRE',
    age_range: '24 - 36 tháng',
    birth_years: [2025, 2024],
    description: 'Nhóm trẻ từ 24 đến 36 tháng tuổi (Dưới 3 tuổi, sinh năm 2025, 2024)',
    sort_order: 1,
  },
  {
    id: 'grade_mg_be',
    code: 'MG_BE',
    grade_num: 2,
    name: 'Khối Mẫu giáo Bé',
    category: 'MAU_GIAO',
    age_range: '3 - 4 tuổi',
    birth_years: [2023],
    description: 'Lớp Mẫu giáo Bé - 3 đến 4 tuổi (Lớp Mầm, sinh năm 2023)',
    sort_order: 2,
  },
  {
    id: 'grade_mg_nho',
    code: 'MG_NHO',
    grade_num: 3,
    name: 'Khối Mẫu giáo Nhỡ',
    category: 'MAU_GIAO',
    age_range: '4 - 5 tuổi',
    birth_years: [2022],
    description: 'Lớp Mẫu giáo Nhỡ - 4 đến 5 tuổi (Lớp Chồi, sinh năm 2022)',
    sort_order: 3,
  },
  {
    id: 'grade_mg_lon',
    code: 'MG_LON',
    grade_num: 4,
    name: 'Khối Mẫu giáo Lớn',
    category: 'MAU_GIAO',
    age_range: '5 - 6 tuổi',
    birth_years: [2021],
    description: 'Lớp Mẫu giáo Lớn - 5 đến 6 tuổi (Lớp Lá, sinh năm 2021, phổ cập GDMN 5 tuổi)',
    sort_order: 4,
  },
  {
    id: 'grade_mg_ghep',
    code: 'MG_GHEP',
    grade_num: 5,
    name: 'Khối Mẫu giáo Ghép',
    category: 'MAU_GIAO',
    age_range: '3 - 6 tuổi',
    birth_years: [2023, 2022, 2021],
    description: 'Lớp Mẫu giáo Ghép đa độ tuổi',
    sort_order: 5,
  },
];

export const PRE_SCHOOL_AGE_GROUPS = [
  { code: 'NHA_TRE', label: 'Khối Nhà trẻ (24 - 36 tháng)', shortLabel: 'Nhà trẻ (24-36T)', grade: 1, category: 'NHA_TRE' },
  { code: 'BE_3_4', label: 'Khối Mẫu giáo Bé (3 - 4 tuổi)', shortLabel: 'MG Bé (3-4T)', grade: 2, category: 'MAU_GIAO' },
  { code: 'NHO_4_5', label: 'Khối Mẫu giáo Nhỡ (4 - 5 tuổi)', shortLabel: 'MG Nhỡ (4-5T)', grade: 3, category: 'MAU_GIAO' },
  { code: 'LON_5_6', label: 'Khối Mẫu giáo Lớn (5 - 6 tuổi)', shortLabel: 'MG Lớn (5-6T)', grade: 4, category: 'MAU_GIAO' },
  { code: 'GHEP_3_6', label: 'Khối Mẫu giáo Ghép (3 - 6 tuổi)', shortLabel: 'MG Ghép (3-6T)', grade: 5, category: 'MAU_GIAO' },
] as const;

export function getPreschoolGradeLabel(grade?: number, full = false): string {
  switch (grade) {
    case 1:
      return full ? 'Khối Nhà trẻ (24 - 36 tháng)' : 'Nhà trẻ (24-36T)';
    case 2:
      return full ? 'Khối Mẫu giáo Bé (3 - 4 tuổi)' : 'MG Bé (3-4T)';
    case 3:
      return full ? 'Khối Mẫu giáo Nhỡ (4 - 5 tuổi)' : 'MG Nhỡ (4-5T)';
    case 4:
      return full ? 'Khối Mẫu giáo Lớn (5 - 6 tuổi)' : 'MG Lớn (5-6T)';
    case 5:
      return full ? 'Khối Mẫu giáo Ghép (3 - 6 tuổi)' : 'MG Ghép (3-6T)';
    default:
      return full ? `Khối lớp ${grade || ''}` : `Khối ${grade || ''}`;
  }
}

export type AttendancePeriodType = 'WEEK' | 'MONTH' | 'YEAR';

export interface SchoolOffDay {
  id: string;
  date: string; // YYYY-MM-DD
  name: string; // e.g. "Nghỉ lễ Quốc Khánh 2/9", "Nghỉ Tết", "Nghỉ rét đậm"
  type: 'HOLIDAY' | 'WEEKEND' | 'WEATHER' | 'SPECIAL' | 'OTHER';
  applies_to?: string; // 'ALL' or specific campus_id
  created_at: string;
}

export interface ClassAttendanceRank {
  rank: number; // Thứ hạng hiển thị trong danh sách hiện tại
  schoolRank: number; // Thứ hạng toàn trường (1 .. N)
  totalClassesInSchool: number; // Tổng số lớp toàn trường
  campusId?: string;
  campusName?: string;
  campusRank: number; // Thứ hạng trong phân hiệu / điểm trường
  totalClassesInCampus: number; // Tổng số lớp trong phân hiệu đó
  classItem: ClassItem;
  teacher?: Profile;
  enrollment: number; // Sĩ số học sinh
  validSchoolDays: number; // Số ngày học thực tế tính thi đua (đã trừ ngày nghỉ)
  reportedDays: number; // Số ngày lớp đã báo cáo
  totalPossibleAttendances: number; // Tổng số lượt học sinh cần đến lớp
  totalPresentAttendances: number; // Tổng số lượt học sinh có mặt
  totalAbsentAttendances: number; // Tổng số lượt học sinh vắng
  attendanceRate: number; // Tỷ lệ duy trì sĩ số (% có mặt)
  absentRate: number; // Tỷ lệ vắng (%)
  // Điểm cộng và thời gian báo sớm thi đua
  earlyReportDays: number; // Số ngày báo sớm (trước giờ quy định)
  earlyBonusPoints: number; // Tổng điểm cộng báo cáo sớm
  averageReportTime?: string; // Giờ nộp báo cáo trung bình (ví dụ: '07:15')
  totalScore: number; // Điểm thi đua tổng hợp = attendanceRate + earlyBonusPoints
  classification: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'NEEDS_IMPROVEMENT';
  classificationLabel: string;
}

export interface CampusRankingSummary {
  campusId: string;
  campusName: string;
  totalClasses: number;
  totalStudents: number;
  totalPresent: number;
  totalAbsent: number;
  attendanceRate: number;
  rankings: ClassAttendanceRank[];
  topPerformers: ClassAttendanceRank[];
}

export interface SchoolWeekInfo {
  weekNumber: number;
  startDate: string; // YYYY-MM-DD (Thứ 2)
  endDate: string; // YYYY-MM-DD (Hết Thứ 6)
  label: string; // e.g. "Tuần 1 (07/09 - 11/09/2026)"
  isCurrent?: boolean;
}

export interface AttendanceRankingSummary {
  periodType: AttendancePeriodType;
  periodLabel: string;
  weekNumber?: number;
  schoolWeekInfo?: SchoolWeekInfo;
  dateRange: { start: string; end: string };
  totalDaysInRange: number;
  totalExcludedDays: number;
  excludedOffDays: Array<{ date: string; name: string }>;
  totalValidDays: number; // Số ngày học tính thi đua
  schoolAttendanceRate: number; // Tỷ lệ toàn trường
  totalStudents: number;
  totalPresent: number;
  totalAbsent: number;
  rankings: ClassAttendanceRank[];
  topPerformers: ClassAttendanceRank[];
  campusSummaries: CampusRankingSummary[];
}
