import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSchool } from '../contexts/SchoolContext';
import { StorageService } from '../services/storage';
import {
  DailyReport,
  AbsentStudent,
  PreschoolDailyData,
  PRESCHOOL_BIRTH_YEARS,
  AgeGroupStat,
  getPreschoolBirthYearsForSchoolYear,
  parseSchoolStartYear,
} from '../types';
import {
  getTeacherAllowedScope,
  canTeacherInputClass,
  getPermittedClasses,
  getScopeLabel,
  getClassCategory,
} from '../utils/preschoolPermissions';
import {
  Calendar,
  GraduationCap,
  CheckCircle2,
  Lock,
  Save,
  Send,
  Clock,
  Sparkles,
  RotateCcw,
  ShieldAlert,
  UserX,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  User,
  AlertCircle,
  ClipboardList,
  X,
  FileText,
  UserPlus,
  Edit2,
  Utensils,
  HeartPulse,
  Baby,
  Users,
  Layers,
  Sparkle,
} from 'lucide-react';

interface AttendanceInputPageProps {
  initialClassId?: string;
  initialDate?: string;
  onSavedSuccess?: () => void;
  onNavigate?: (path: string) => void;
}

interface GroupInputState {
  total: number | '';
  present: number | '';
  absent: number | '';
}

const QUICK_REASONS = [
  'Ốm / sốt',
  'Ho, cảm cúm',
  'Đau mắt đỏ',
  'Tay chân miệng',
  'Thủy đậu',
  'Có phép',
  'Việc gia đình',
  'Thời tiết rét đậm',
];

export const AttendanceInputPage: React.FC<AttendanceInputPageProps> = ({
  initialClassId,
  initialDate,
  onSavedSuccess,
  onNavigate,
}) => {
  const { currentUser, isAdmin, isGVCN } = useAuth();
  const {
    settings,
    classes,
    preschoolGrades,
    indicators,
    campuses,
    students,
    activeYear,
    addStudent,
    updateStudent,
    deleteStudent,
    importStudents,
  } = useSchool();

  // Selected date defaults to today (or initialDate)
  const getToday = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const today = getToday();
  const [reportDate, setReportDate] = useState<string>(initialDate || today);

  // Teaching scope & permitted classes for current user
  const allowedScope = useMemo(() => {
    return getTeacherAllowedScope(currentUser, classes, preschoolGrades);
  }, [currentUser, classes, preschoolGrades]);

  const permittedClasses = useMemo(() => {
    return getPermittedClasses(currentUser, classes, preschoolGrades);
  }, [currentUser, classes, preschoolGrades]);

  // Selected class
  const defaultClassId = useMemo(() => {
    if (isGVCN && allowedScope !== 'ALL') {
      if (initialClassId && permittedClasses.some((c) => c.id === initialClassId)) {
        return initialClassId;
      }
      if (currentUser?.assigned_class_id && permittedClasses.some((c) => c.id === currentUser.assigned_class_id)) {
        return currentUser.assigned_class_id;
      }
      return permittedClasses[0]?.id || classes[0]?.id || '';
    }
    if (initialClassId) return initialClassId;
    if (currentUser?.assigned_class_id) return currentUser.assigned_class_id;
    return classes[0]?.id || '';
  }, [initialClassId, currentUser, classes, isGVCN, allowedScope, permittedClasses]);

  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClassId);

  // Auto-switch to permitted class if restricted teacher has an unpermitted class selected
  useEffect(() => {
    if (isGVCN && allowedScope !== 'ALL' && permittedClasses.length > 0) {
      if (!permittedClasses.some((c) => c.id === selectedClassId)) {
        setSelectedClassId(permittedClasses[0].id);
      }
    }
  }, [isGVCN, allowedScope, permittedClasses, selectedClassId]);

  const selectedClass = useMemo(() => {
    return classes.find((c) => c.id === selectedClassId);
  }, [classes, selectedClassId]);

  const isClassPermitted = useMemo(() => {
    if (!selectedClass) return false;
    return canTeacherInputClass(currentUser, selectedClass, classes, preschoolGrades);
  }, [currentUser, selectedClass, classes, preschoolGrades]);

  // Class students list
  const classStudents = useMemo(() => {
    return students.filter((s) => s.class_id === selectedClassId);
  }, [students, selectedClassId]);

  // Roster management states
  const [showRosterModal, setShowRosterModal] = useState<boolean>(false);
  const [newStudentName, setNewStudentName] = useState<string>('');
  const [newStudentAddress, setNewStudentAddress] = useState<string>('');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingStudentName, setEditingStudentName] = useState<string>('');
  const [editingStudentAddress, setEditingStudentAddress] = useState<string>('');
  const [bulkStudentText, setBulkStudentText] = useState<string>('');
  const [showBulkImport, setShowBulkImport] = useState<boolean>(false);

  // Existing report info
  const [existingReport, setExistingReport] = useState<DailyReport | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [absentStudents, setAbsentStudents] = useState<AbsentStudent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [quickFillNotice, setQuickFillNotice] = useState<string>('');
  const [showQuickPaste, setShowQuickPaste] = useState<boolean>(false);
  const [quickPasteText, setQuickPasteText] = useState<string>('');

  // Reset report state
  const [showResetConfirmModal, setShowResetConfirmModal] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string>('');

  // Values map: indicator_group_id -> { total, present, absent }
  const [formValues, setFormValues] = useState<Record<string, GroupInputState>>({});

  const activeSchoolYearBirthYears = useMemo(() => {
    return getPreschoolBirthYearsForSchoolYear(activeYear?.name);
  }, [activeYear?.name]);

  const startYear = useMemo(() => {
    return parseSchoolStartYear(activeYear?.name);
  }, [activeYear?.name]);

  const createDefaultAgeStats = (): Record<string, AgeGroupStat> => {
    const map: Record<string, AgeGroupStat> = {};
    activeSchoolYearBirthYears.forEach((by) => {
      map[String(by.year)] = { total: 0, present: 0, absent: 0, boarding: 0 };
    });
    return map;
  };

  // Helper xác định lớp thuộc khối Nhà trẻ
  const isNhaTreClass = (clsName?: string, grade?: any): boolean => {
    if (grade !== undefined && grade !== null) {
      if (grade === 1 || grade === '1' || grade === 'NHA_TRE') return true;
      const matchedPg = preschoolGrades?.find((p) => p.grade_num === Number(grade));
      if (matchedPg && matchedPg.category === 'NHA_TRE') return true;
      const gStr = typeof grade === 'string' ? grade.toUpperCase() : String(grade).toUpperCase();
      if (gStr.includes('NHA_TRE') || gStr.includes('NHÀ TRẺ') || gStr.includes('NHA TRE')) return true;
    }
    const upper = (clsName ? String(clsName) : '').toUpperCase().trim();
    return upper.startsWith('NT') || upper.includes('NHÀ TRẺ') || upper.includes('NHA TRE') || upper.includes('NHÓM TRẺ') || upper.includes('NHOM TRE');
  };

  // Helper lấy năm sinh chính mặc định cho lớp
  const getDefaultCohortYear = (clsName?: string, grade?: any): string => {
    const isNT = isNhaTreClass(clsName, grade);
    const cName = (clsName || '').toLowerCase();
    const isMam = cName.includes('bé') || cName.includes('mầm') || grade === 2;
    const isChoi = cName.includes('nhỡ') || cName.includes('chồi') || grade === 3;
    const isLa = cName.includes('lớn') || cName.includes('lá') || grade === 4;

    if (isNT) return String(startYear - 2);
    if (isMam) return String(startYear - 3);
    if (isChoi) return String(startYear - 4);
    if (isLa) return String(startYear - 5);
    return String(startYear - 3);
  };

  // Preschool granular statistics (Sĩ số, Chuyên cần, Bán trú, Sức khỏe, Độ tuổi)
  const [preschoolData, setPreschoolData] = useState<PreschoolDailyData>({
    female_count: 0,
    ethnic_count: 0,
    female_ethnic_count: 0,
    poor_count: 0,
    disabled_count: 0,
    present_female_count: 0,
    present_ethnic_count: 0,
    absent_excused: 0,
    absent_unexcused: 0,
    boarding_count: 0,
    boarding_nha_tre: 0,
    boarding_mau_giao: 0,
    lunch_count: 0,
    lunch_nha_tre: 0,
    lunch_mau_giao: 0,
    snack_count: 0,
    snack_nha_tre: 0,
    snack_mau_giao: 0,
    breakfast_count: 0,
    diet_type: 'COM',
    canceled_count: 0,
    health_issue_count: 0,
    health_note: '',
    total_nha_tre: 0,
    total_mau_giao: 0,
    present_nha_tre: 0,
    present_mau_giao: 0,
    absent_nha_tre: 0,
    absent_mau_giao: 0,
    age_stats: createDefaultAgeStats(),
  });

  const enabledIndicators = useMemo(() => {
    return indicators.filter((ig) => ig.enabled).sort((a, b) => a.sort_order - b.sort_order);
  }, [indicators]);

  // Danh mục năm sinh và độ tuổi Nhà trẻ tịnh tiến theo Năm học
  const nhaTreAgeGroupItems = useMemo(() => {
    const ntGrades = preschoolGrades.filter((g) => g.category === 'NHA_TRE');
    const baseItems = [
      { year: String(startYear - 1), ageRange: '1 - 2 tuổi', desc: `Trẻ sinh năm ${startYear - 1}` },
      { year: String(startYear - 2), ageRange: '2 - 3 tuổi (24-36 tháng)', desc: `Trẻ sinh năm ${startYear - 2}` },
      { year: String(startYear), ageRange: '< 1 tuổi', desc: `Trẻ sinh năm ${startYear} (nếu có)` },
    ];
    return baseItems.map((item) => {
      const yNum = Number(item.year);
      const matched = ntGrades.find((g) => g.birth_years?.includes(yNum));
      let ageLabel = item.ageRange;
      if (matched) {
        ageLabel = `${item.ageRange} (${matched.name})`;
      }
      return {
        year: item.year,
        ageLabel,
        note: item.desc,
        desc: item.desc,
      };
    });
  }, [startYear, preschoolGrades]);

  // Danh mục năm sinh và độ tuổi Mẫu giáo được đồng bộ từ cấu hình khối lớp thực tế & tịnh tiến theo Năm học
  const mauGiaoAgeGroupItems = useMemo(() => {
    const mgGrades = preschoolGrades.filter((g) => g.category === 'MAU_GIAO');
    const baseItems = [
      { year: String(startYear - 3), ageRange: '3 - 4 tuổi', desc: `Trẻ sinh năm ${startYear - 3}` },
      { year: String(startYear - 4), ageRange: '4 - 5 tuổi', desc: `Trẻ sinh năm ${startYear - 4}` },
      { year: String(startYear - 5), ageRange: '5 - 6 tuổi', desc: `Trẻ sinh năm ${startYear - 5}` },
    ];
    return baseItems.map((item) => {
      const yNum = Number(item.year);
      const matched = mgGrades.find((g) => g.birth_years?.includes(yNum));
      let ageLabel = item.ageRange;
      if (matched) {
        ageLabel = `${item.ageRange} (${matched.name})`;
      } else if (item.year === String(startYear - 5)) {
        ageLabel = '5 - 6 tuổi (MG Lớn)';
      }
      return {
        year: item.year,
        ageLabel,
        note: item.desc,
        desc: item.desc,
      };
    });
  }, [startYear, preschoolGrades]);

  const isAssignedTeacher = currentUser?.assigned_class_id === selectedClassId;
  const isLocked = Boolean(selectedClass?.is_locked || existingReport?.status === 'LOCKED');

  // Input calculation mode from school settings (or default to MODE_1_TOTAL_PRESENT)
  const inputMode = settings?.input_mode || 'MODE_1_TOTAL_PRESENT';

  const canReset = useMemo(() => {
    if (!existingReport) return false;
    // ADMIN hoặc BGH có quyền reset
    if (isAdmin || currentUser?.role === 'BGH') return true;
    // GVCN chỉ được reset nếu là lớp của mình và báo cáo chưa bị khóa
    if (currentUser?.role === 'GVCN' && isAssignedTeacher && !isLocked) return true;
    return false;
  }, [existingReport, isAdmin, currentUser, isAssignedTeacher, isLocked]);

  const handleResetReport = async () => {
    if (!selectedClassId || !reportDate || !currentUser) return;
    setIsResetting(true);
    setErrorMessage('');
    try {
      const ok = await StorageService.deleteDailyReport(selectedClassId, reportDate, currentUser);
      if (ok) {
        setExistingReport(null);
        setNotes('');
        setAbsentStudents([]);
        setShowResetConfirmModal(false);
        setResetSuccessMessage(
          `Đã reset báo cáo ngày ${reportDate.split('-').reverse().join('/')} của lớp ${selectedClass?.class_name || ''} về trạng thái CHƯA BÁO CÁO thành công!`
        );
        setTimeout(() => setResetSuccessMessage(''), 6000);

        // Reset form inputs
        const initialMap: Record<string, GroupInputState> = {};
        enabledIndicators.forEach((ig) => {
          initialMap[ig.id] = { total: '', present: '', absent: '' };
        });
        setFormValues(initialMap);

        if (onSavedSuccess) onSavedSuccess();
      } else {
        setErrorMessage('Không tìm thấy báo cáo để reset hoặc báo cáo đã được xóa trước đó.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi reset báo cáo');
    } finally {
      setIsResetting(false);
    }
  };

  // Reset success modal when changing date or class
  useEffect(() => {
    setSaveSuccess(false);
  }, [selectedClassId, reportDate]);

  // Auto sync boarding indicator group when preschool boarding counts change to avoid blank indicator error
  useEffect(() => {
    const boardingIg = enabledIndicators.find((ig) => ig.name.toLowerCase().includes('bán trú'));
    if (boardingIg) {
      const bPresent = preschoolData.boarding_count || 0;
      const bAbsent = preschoolData.canceled_count || 0;
      const bTotal = bPresent + bAbsent;

      setFormValues((prev) => {
        const cur = prev[boardingIg.id];
        if (
          !cur ||
          Number(cur.total) !== bTotal ||
          Number(cur.present) !== bPresent ||
          Number(cur.absent) !== bAbsent
        ) {
          return {
            ...prev,
            [boardingIg.id]: {
              total: bTotal,
              present: bPresent,
              absent: bAbsent,
            },
          };
        }
        return prev;
      });
    }
  }, [preschoolData.boarding_count, preschoolData.canceled_count, enabledIndicators]);

  // Load existing report for this class and date
  useEffect(() => {
    if (!selectedClassId || !reportDate) return;

    setLoading(true);
    setErrorMessage('');
    setQuickFillNotice('');

    StorageService.getDailyReport(selectedClassId, reportDate)
      .then(async ({ report, values }) => {
        setExistingReport(report || null);
        setNotes(report?.notes || '');
        setAbsentStudents(report?.absent_students || []);

        const initialMap: Record<string, GroupInputState> = {};

        // 1. Nếu ngày này đã có báo cáo và có dữ liệu sĩ số
        const hasExistingValidValues = values && values.some((v) => (v.total_count || 0) > 0);
        if (report && hasExistingValidValues) {
          enabledIndicators.forEach((ig) => {
            const val = values.find((v) => v.indicator_group_id === ig.id);
            if (val) {
              initialMap[ig.id] = {
                total: val.total_count,
                present: val.present_count,
                absent: val.absent_count,
              };
            } else {
              initialMap[ig.id] = {
                total: '',
                present: '',
                absent: '',
              };
            }
          });
          setFormValues(initialMap);
        } else {
          // 2. Chưa có báo cáo cho ngày này: Tìm báo cáo gần nhất trước đó của lớp để gợi ý sĩ số tổng
          try {
            const latestPrev = await StorageService.getLatestReportForClass(selectedClassId, reportDate);
            if (latestPrev.report && latestPrev.values.length > 0) {
              let suggestedTotal = 0;
              enabledIndicators.forEach((ig) => {
                const prevVal = latestPrev.values.find((v) => v.indicator_group_id === ig.id);
                if (prevVal && prevVal.total_count > 0) {
                  initialMap[ig.id] = {
                    total: prevVal.total_count,
                    present: prevVal.total_count, // Mặc định đủ cả lớp từ sĩ số chuẩn
                    absent: 0,
                  };
                  if (ig.id === enabledIndicators[0]?.id) {
                    suggestedTotal = prevVal.total_count;
                  }
                } else {
                  initialMap[ig.id] = {
                    total: 0,
                    present: 0,
                    absent: 0,
                  };
                }
              });
              setFormValues(initialMap);
              if (suggestedTotal > 0) {
                setQuickFillNotice(
                  `Đã tự động lấy Sĩ số (${suggestedTotal} học sinh) từ ngày gần nhất. Thầy/Cô hãy kiểm tra lại và gửi báo cáo.`
                );
                setTimeout(() => setQuickFillNotice(''), 5000);
              }
            } else {
              // Lớp chưa từng có báo cáo nào: Để trống để bắt buộc GVCN phải nhập số liệu
              enabledIndicators.forEach((ig) => {
                initialMap[ig.id] = {
                  total: '',
                  present: '',
                  absent: '',
                };
              });
              setFormValues(initialMap);
            }
          } catch (e) {
            enabledIndicators.forEach((ig) => {
              initialMap[ig.id] = {
                total: '',
                present: '',
                absent: '',
              };
            });
            setFormValues(initialMap);
          }
        }

        // Luôn cho phép GVCN và Admin nhập/chỉnh sửa khi báo cáo chưa bị khóa
        const lockedState = Boolean(selectedClass?.is_locked || report?.status === 'LOCKED');
        setIsEditMode(!lockedState || isAdmin);

        // Load preschool statistical data
        if (report?.preschool_data) {
          const raw = report.preschool_data;
          const mergedStats = createDefaultAgeStats();
          if (raw.age_stats) {
            Object.entries(raw.age_stats).forEach(([yr, v]) => {
              const p = Number(v.present) || 0;
              const b = Number(v.boarding);
              mergedStats[yr] = {
                total: Number(v.total) || 0,
                present: p,
                absent: Number(v.absent) || Math.max(0, (Number(v.total) || 0) - p),
                // Đồng bộ suất ăn với số trẻ có mặt nếu chưa thiết lập hoặc = 0 khi có mặt > 0
                boarding: b > 0 ? b : p,
              };
            });
          }

          const isNT = isNhaTreClass(selectedClass?.class_name, selectedClass?.grade);
          const mainVal = values?.find((v) => v.indicator_group_id === enabledIndicators[0]?.id);
          const presentCount = mainVal?.present_count ?? ((raw.present_nha_tre || 0) + (raw.present_mau_giao || 0));

          let bNT = Number(raw.boarding_nha_tre) || 0;
          let bMG = Number(raw.boarding_mau_giao) || 0;
          let bTotal = Number(raw.boarding_count) || 0;

          if (isNT) {
            if (bNT <= 0 && presentCount > 0) bNT = presentCount;
            if (bTotal <= 0 && presentCount > 0) bTotal = presentCount;
          } else {
            if (bMG <= 0 && presentCount > 0) bMG = presentCount;
            if (bTotal <= 0 && presentCount > 0) bTotal = presentCount;
          }

          setPreschoolData({
            ...raw,
            boarding_nha_tre: bNT,
            boarding_mau_giao: bMG,
            boarding_count: bTotal > 0 ? bTotal : presentCount,
            lunch_count: raw.lunch_count && raw.lunch_count > 0 ? raw.lunch_count : (bTotal > 0 ? bTotal : presentCount),
            snack_count: raw.snack_count && raw.snack_count > 0 ? raw.snack_count : (bTotal > 0 ? bTotal : presentCount),
            lunch_nha_tre: raw.lunch_nha_tre && raw.lunch_nha_tre > 0 ? raw.lunch_nha_tre : bNT,
            snack_nha_tre: raw.snack_nha_tre && raw.snack_nha_tre > 0 ? raw.snack_nha_tre : bNT,
            lunch_mau_giao: raw.lunch_mau_giao && raw.lunch_mau_giao > 0 ? raw.lunch_mau_giao : bMG,
            snack_mau_giao: raw.snack_mau_giao && raw.snack_mau_giao > 0 ? raw.snack_mau_giao : bMG,
            age_stats: mergedStats,
          });
        } else {
          // Initialize defaults from roster or existing class report
          const mainVal = values?.find((v) => v.indicator_group_id === enabledIndicators[0]?.id);
          const totalKids = (mainVal && mainVal.total_count > 0) ? mainVal.total_count : classStudents.length;
          const presentKids = (mainVal && mainVal.present_count >= 0) ? mainVal.present_count : totalKids;
          const absentKids = (mainVal && mainVal.absent_count >= 0) ? mainVal.absent_count : (totalKids - presentKids);

          const femaleInRoster = classStudents.filter((s) => s.gender === 'FEMALE').length;
          const ethnicInRoster = classStudents.filter((s) => s.is_ethnic).length;

          const defFemale = femaleInRoster > 0 ? femaleInRoster : Math.round(totalKids / 2);
          const defEthnic = ethnicInRoster > 0 ? ethnicInRoster : 0;

          // Suy đoán khối / độ tuổi mặc định theo lớp
          const cName = (selectedClass?.class_name || '').toLowerCase();
          const isNT = cName.includes('nhà trẻ') || cName.includes('nt') || selectedClass?.grade === 1;
          const isMam = cName.includes('bé') || cName.includes('mầm') || selectedClass?.grade === 2;
          const isChoi = cName.includes('nhỡ') || cName.includes('chồi') || selectedClass?.grade === 3;
          const isLa = cName.includes('lớn') || cName.includes('lá') || selectedClass?.grade === 4;

          let targetYear = String(startYear - 3);
          if (isNT) targetYear = String(startYear - 2);
          else if (isMam) targetYear = String(startYear - 3);
          else if (isChoi) targetYear = String(startYear - 4);
          else if (isLa) targetYear = String(startYear - 5);

          const defStats = createDefaultAgeStats();
          if (totalKids > 0 && defStats[targetYear]) {
            defStats[targetYear] = {
              total: totalKids,
              present: presentKids,
              absent: absentKids,
              boarding: presentKids,
            };
          }

          const isTargetNT = isNT || Number(targetYear) >= startYear - 2;

          setPreschoolData({
            female_count: defFemale,
            ethnic_count: defEthnic,
            female_ethnic_count: 0,
            poor_count: 0,
            disabled_count: 0,
            present_female_count: Math.min(defFemale, presentKids),
            present_ethnic_count: Math.min(defEthnic, presentKids),
            absent_excused: absentKids,
            absent_unexcused: 0,
            boarding_count: presentKids,
            boarding_nha_tre: isTargetNT ? presentKids : 0,
            boarding_mau_giao: !isTargetNT ? presentKids : 0,
            lunch_count: presentKids,
            lunch_nha_tre: isTargetNT ? presentKids : 0,
            lunch_mau_giao: !isTargetNT ? presentKids : 0,
            snack_count: presentKids,
            snack_nha_tre: isTargetNT ? presentKids : 0,
            snack_mau_giao: !isTargetNT ? presentKids : 0,
            breakfast_count: 0,
            diet_type: isTargetNT ? 'CHAO' : 'COM',
            canceled_count: absentKids,
            health_issue_count: 0,
            health_note: '',
            total_nha_tre: isTargetNT ? totalKids : 0,
            total_mau_giao: !isTargetNT ? totalKids : 0,
            present_nha_tre: isTargetNT ? presentKids : 0,
            present_mau_giao: !isTargetNT ? presentKids : 0,
            absent_nha_tre: isTargetNT ? absentKids : 0,
            absent_mau_giao: !isTargetNT ? absentKids : 0,
            age_stats: defStats,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [selectedClassId, reportDate, enabledIndicators, isAdmin, selectedClass?.is_locked]);

  // Đồng bộ tự động danh sách học sinh vắng theo số lượng vắng
  const syncAbsentListToCount = (targetCount: number) => {
    setAbsentStudents((prev) => {
      if (targetCount === 0) {
        // Nếu không vắng em nào và chưa nhập tên ai thì xóa trắng
        const hasFilled = prev.some((s) => s.full_name && s.full_name.trim() !== '');
        return hasFilled ? prev : [];
      }
      if (prev.length < targetCount) {
        // Tự động bổ sung các dòng mới để GVCN nhập tên trực tiếp
        const diff = targetCount - prev.length;
        const newSlots: AbsentStudent[] = Array.from({ length: diff }, () => ({
          full_name: '',
          address: '',
          reason: 'Ốm',
        }));
        return [...prev, ...newSlots];
      } else if (prev.length > targetCount) {
        // Chỉ lược bớt những ô chưa nhập tên từ dưới lên
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated.length <= targetCount) break;
          if (!updated[i].full_name || updated[i].full_name.trim() === '') {
            updated.splice(i, 1);
          }
        }
        return updated;
      }
      return prev;
    });
  };

  // Handle field change with automatic calculation
  const handleFieldChange = (
    groupId: string,
    field: 'total' | 'present' | 'absent',
    rawVal: string
  ) => {
    setFormValues((prev) => {
      const current = prev[groupId] || { total: 0, present: 0, absent: 0 };
      // Strip leading zeros unless the value is '0'
      const displayVal = rawVal.replace(/^0+(?!$)/, '');
      const next: GroupInputState = { ...current, [field]: displayVal };

      // Calculate based on numbers
      let total = parseInt(String(next.total) || '0', 10);
      let present = parseInt(String(next.present) || '0', 10);
      let absent = parseInt(String(next.absent) || '0', 10);
      
      if (field === 'total') {
        if (typeof current.absent === 'number' && current.absent <= total) {
          present = total - absent;
        } else if (typeof current.present === 'number' && current.present <= total) {
          absent = total - present;
        } else {
          present = total;
          absent = 0;
        }
      } else if (field === 'present') {
        absent = Math.max(0, total - present);
      } else if (field === 'absent') {
        present = Math.max(0, total - absent);
      }
      
      next.total = total;
      next.present = present;
      next.absent = absent;

      // Tự động lập danh sách học sinh vắng nếu là nhóm chỉ tiêu chính (Sĩ số trường / lớp)
      if (groupId === enabledIndicators[0]?.id && typeof next.absent === 'number') {
        syncAbsentListToCount(next.absent);

        // ĐỒNG BỘ MẦM NON: SỐ HS CÓ MẶT ĐỒNG BỘ VỚI XUẤT ĂN BÁN TRÚ
        setPreschoolData((prevPs) => {
          const stats = { ...(prevPs.age_stats || createDefaultAgeStats()) };
          const activeYears = Object.keys(stats).filter((yr) => (stats[yr].total || 0) > 0);
          let targetYear = activeYears.length === 1 ? activeYears[0] : '';
          if (!targetYear) {
            targetYear = getDefaultCohortYear(selectedClass?.class_name, selectedClass?.grade);
          }

          if (targetYear && stats[targetYear]) {
            stats[targetYear] = {
              total: total > 0 ? total : (stats[targetYear].total || total),
              present: present,
              absent: absent,
              boarding: present, // Suất ăn = Số có mặt
            };
          }

          const isNTClass = isNhaTreClass(selectedClass?.class_name, selectedClass?.grade);
          const bNT = isNTClass ? present : (prevPs.boarding_nha_tre || 0);
          const bMG = !isNTClass ? present : (prevPs.boarding_mau_giao || 0);

          return {
            ...prevPs,
            age_stats: stats,
            total_nha_tre: isNTClass ? (total > 0 ? total : prevPs.total_nha_tre) : prevPs.total_nha_tre,
            total_mau_giao: !isNTClass ? (total > 0 ? total : prevPs.total_mau_giao) : prevPs.total_mau_giao,
            present_nha_tre: isNTClass ? present : prevPs.present_nha_tre,
            present_mau_giao: !isNTClass ? present : prevPs.present_mau_giao,
            absent_nha_tre: isNTClass ? absent : prevPs.absent_nha_tre,
            absent_mau_giao: !isNTClass ? absent : prevPs.absent_mau_giao,
            boarding_nha_tre: bNT,
            boarding_mau_giao: bMG,
            lunch_nha_tre: bNT,
            lunch_mau_giao: bMG,
            snack_nha_tre: bNT,
            snack_mau_giao: bMG,
            boarding_count: present,
            lunch_count: present,
            snack_count: present,
            canceled_count: absent,
            present_female_count: Math.min(prevPs.female_count || 0, present),
            present_ethnic_count: Math.min(prevPs.ethnic_count || 0, present),
            absent_excused: absent,
            absent_unexcused: 0,
          };
        });
      }

      return {
        ...prev,
        [groupId]: next,
      };
    });
  };

  // Quick increment/decrement helper for mobile with >= 44px touch targets
  const adjustValue = (groupId: string, field: 'present' | 'absent', delta: number) => {
    const current = formValues[groupId] || { total: '', present: '', absent: '' };
    const curVal = typeof current[field] === 'number' ? (current[field] as number) : 0;
    const nextVal = Math.max(0, curVal + delta);
    handleFieldChange(groupId, field, String(nextVal));
  };

  // Quick preset for absentee count (0, 1, 2, 3 vắng)
  const setAbsentPreset = (groupId: string, absentCount: number) => {
    const current = formValues[groupId] || { total: '', present: '', absent: '' };
    const total = typeof current.total === 'number' ? current.total : Number(current.total) || 0;
    if (total <= 0) {
      setErrorMessage('Vui lòng nhập Tổng số học sinh của lớp trước khi chọn số em vắng.');
      return;
    }
    const actualAbsent = Math.min(absentCount, total);
    const actualPresent = Math.max(0, total - actualAbsent);

    setErrorMessage('');
    setFormValues((prev) => ({
      ...prev,
      [groupId]: {
        ...current,
        total,
        present: actualPresent,
        absent: actualAbsent,
      },
    }));

    // Cập nhật thống kê mầm non đồng bộ 100% (Số có mặt = Suất ăn)
    setPreschoolData((prev) => {
      const female = prev.female_count || 0;
      const ethnic = prev.ethnic_count || 0;

      const stats = { ...(prev.age_stats || createDefaultAgeStats()) };
      const activeYears = Object.keys(stats).filter((yr) => (stats[yr].total || 0) > 0);
      let targetYear = activeYears.length === 1 ? activeYears[0] : '';
      if (!targetYear) {
        targetYear = getDefaultCohortYear(selectedClass?.class_name, selectedClass?.grade);
      }

      if (targetYear && stats[targetYear]) {
        stats[targetYear] = {
          total: total > 0 ? total : (stats[targetYear].total || total),
          present: actualPresent,
          absent: actualAbsent,
          boarding: actualPresent,
        };
      }

      const isNTClass = isNhaTreClass(selectedClass?.class_name, selectedClass?.grade);
      const bNT = isNTClass ? actualPresent : (prev.boarding_nha_tre || 0);
      const bMG = !isNTClass ? actualPresent : (prev.boarding_mau_giao || 0);

      return {
        ...prev,
        age_stats: stats,
        absent_excused: actualAbsent,
        absent_unexcused: 0,
        present_female_count: Math.min(female, actualPresent),
        present_ethnic_count: Math.min(ethnic, actualPresent),
        present_nha_tre: isNTClass ? actualPresent : prev.present_nha_tre,
        present_mau_giao: !isNTClass ? actualPresent : prev.present_mau_giao,
        absent_nha_tre: isNTClass ? actualAbsent : prev.absent_nha_tre,
        absent_mau_giao: !isNTClass ? actualAbsent : prev.absent_mau_giao,
        boarding_nha_tre: bNT,
        boarding_mau_giao: bMG,
        lunch_nha_tre: bNT,
        lunch_mau_giao: bMG,
        snack_nha_tre: bNT,
        snack_mau_giao: bMG,
        boarding_count: actualPresent,
        lunch_count: actualPresent,
        snack_count: actualPresent,
        canceled_count: actualAbsent,
      };
    });

    // Tự động lập danh sách học sinh vắng cho nhóm chỉ tiêu chính
    if (groupId === enabledIndicators[0]?.id) {
      if (actualAbsent === 0) {
        setAbsentStudents([]);
      } else {
        syncAbsentListToCount(actualAbsent);
      }
    }
  };

  // 1-Tap Quick Action: "CẢ LỚP ĐỦ 100%"
  const handleSetFullAttendance = () => {
    if (!isClassPermitted) {
      setErrorMessage(`Thầy/Cô không có quyền nhập số liệu cho lớp này (Quyền phân công: ${getScopeLabel(allowedScope)}).`);
      return;
    }

    const mainGroup = enabledIndicators[0];
    const mainTotal = mainGroup ? Number(formValues[mainGroup.id]?.total) || 0 : 0;
    if (mainTotal <= 0) {
      setErrorMessage('Vui lòng nhập Sĩ số học sinh của lớp (Tổng số > 0) trước khi bấm Cả lớp đi đủ.');
      return;
    }

    setFormValues((prev) => {
      const nextMap: Record<string, GroupInputState> = {};
      enabledIndicators.forEach((ig) => {
        const cur = prev[ig.id] || { total: '', present: '', absent: '' };
        const total = typeof cur.total === 'number' ? cur.total : Number(cur.total) || 0;
        nextMap[ig.id] = {
          total,
          present: total,
          absent: 0,
        };
      });
      return nextMap;
    });

    setPreschoolData((prev) => {
      const stats = { ...(prev.age_stats || createDefaultAgeStats()) };
      const hasAnyAgeTotal = Object.values(stats as Record<string, AgeGroupStat>).some((s) => (s?.total || 0) > 0);

      const isNTClass = isNhaTreClass(selectedClass?.class_name, selectedClass?.grade);
      const defaultYear = getDefaultCohortYear(selectedClass?.class_name, selectedClass?.grade);

      if (!hasAnyAgeTotal && defaultYear && stats[defaultYear]) {
        stats[defaultYear] = {
          total: mainTotal,
          present: mainTotal,
          absent: 0,
          boarding: mainTotal,
        };
      } else {
        Object.keys(stats).forEach((yr) => {
          const t = stats[yr].total || 0;
          stats[yr] = {
            ...stats[yr],
            present: t,
            absent: 0,
            boarding: t,
          };
        });
      }

      let totNT = prev.total_nha_tre || 0;
      let totMG = prev.total_mau_giao || 0;

      if (isNTClass && totNT === 0) totNT = mainTotal;
      if (!isNTClass && totMG === 0) totMG = mainTotal;

      return {
        ...prev,
        present_female_count: prev.female_count || 0,
        present_ethnic_count: prev.ethnic_count || 0,
        absent_excused: 0,
        absent_unexcused: 0,
        total_nha_tre: totNT,
        total_mau_giao: totMG,
        present_nha_tre: totNT,
        absent_nha_tre: 0,
        present_mau_giao: totMG,
        absent_mau_giao: 0,
        boarding_nha_tre: totNT,
        boarding_mau_giao: totMG,
        lunch_nha_tre: totNT,
        lunch_mau_giao: totMG,
        snack_nha_tre: totNT,
        snack_mau_giao: totMG,
        boarding_count: mainTotal,
        lunch_count: mainTotal,
        snack_count: mainTotal,
        canceled_count: 0,
        age_stats: stats,
      };
    });

    setAbsentStudents([]);
    setErrorMessage('');
    setQuickFillNotice('Đã áp dụng: Cả lớp đi học đầy đủ 100% & Báo ăn đủ 100% (Vắng: 0)!');
    setTimeout(() => setQuickFillNotice(''), 3500);
  };

  // Cập nhật thống kê theo độ tuổi (Năm sinh 2025, 2024, 2023, 2022, 2021...)
  // ĐỒNG BỘ 100% GIỮA SỐ TRẺ CÓ MẶT VÀ XUẤT ĂN BÁN TRÚ
  const handleUpdateAgeStat = (
    year: string,
    field: 'total' | 'present' | 'absent' | 'boarding',
    val: number
  ) => {
    setPreschoolData((prev) => {
      const stats = { ...(prev.age_stats || createDefaultAgeStats()) };
      const cur = stats[year] || { total: 0, present: 0, absent: 0, boarding: 0 };

      let newTotal = field === 'total' ? Math.max(0, val) : cur.total;
      let newPresent = cur.present;
      let newAbsent = cur.absent;
      let newBoarding = cur.boarding;

      if (field === 'total') {
        newTotal = Math.max(0, val);
        if (newPresent > newTotal || (cur.total === 0 && newTotal > 0) || (cur.present === 0 && cur.absent === 0)) {
          newPresent = newTotal;
          newAbsent = 0;
          newBoarding = newTotal;
        } else {
          newAbsent = Math.max(0, newTotal - newPresent);
          newBoarding = newPresent;
        }
      } else if (field === 'present') {
        newPresent = Math.min(newTotal > 0 ? newTotal : val, Math.max(0, val));
        if (newTotal === 0 && val > 0) {
          newTotal = val;
        }
        newAbsent = Math.max(0, newTotal - newPresent);
        // ĐỒNG BỘ: SỐ TRẺ CÓ MẶT ĐI HỌC = SUẤT ĂN BÁN TRÚ
        newBoarding = newPresent;
      } else if (field === 'absent') {
        newAbsent = Math.min(newTotal, Math.max(0, val));
        newPresent = Math.max(0, newTotal - newAbsent);
        // ĐỒNG BỘ: SỐ TRẺ CÓ MẶT ĐI HỌC = SUẤT ĂN BÁN TRÚ
        newBoarding = newPresent;
      } else if (field === 'boarding') {
        newBoarding = Math.max(0, val);
        // ĐỒNG BỘ 2 CHIỀU: NẾU SỬA SUẤT ĂN THÌ SỐ TRẺ CÓ MẶT TỰ ĐỘNG ĐỒNG BỘ VỚI SUẤT ĂN
        newPresent = newBoarding;
        if (newTotal < newPresent) {
          newTotal = newPresent;
        }
        newAbsent = Math.max(0, newTotal - newPresent);
      }

      stats[year] = {
        total: newTotal,
        present: newPresent,
        absent: newAbsent,
        boarding: newBoarding,
      };

      // Tách danh sách năm sinh theo khối Nhà trẻ & Mẫu giáo
      const ntYears = nhaTreAgeGroupItems.map((item) => item.year);
      const mgYears = mauGiaoAgeGroupItems.map((item) => item.year);

      let totNT = 0;
      let presNT = 0;
      let absNT = 0;
      let boardNT = 0;
      ntYears.forEach((y) => {
        if (stats[y]) {
          totNT += Number(stats[y].total) || 0;
          presNT += Number(stats[y].present) || 0;
          absNT += Number(stats[y].absent) || 0;
          boardNT += Number(stats[y].boarding) || 0;
        }
      });

      let totMG = 0;
      let presMG = 0;
      let absMG = 0;
      let boardMG = 0;
      mgYears.forEach((y) => {
        if (stats[y]) {
          totMG += Number(stats[y].total) || 0;
          presMG += Number(stats[y].present) || 0;
          absMG += Number(stats[y].absent) || 0;
          boardMG += Number(stats[y].boarding) || 0;
        }
      });

      const grandTotal = totNT + totMG;
      const grandPresent = presNT + presMG;
      const grandAbsent = absNT + absMG;
      const grandBoarding = boardNT + boardMG;

      // Tự động đồng bộ sang ô nhập chung nếu tổng độ tuổi > 0
      if (grandTotal > 0 && enabledIndicators[0]) {
        const mainId = enabledIndicators[0].id;
        setFormValues((prevMap) => ({
          ...prevMap,
          [mainId]: {
            total: grandTotal,
            present: grandPresent,
            absent: grandAbsent,
          },
        }));
      }

      // Tự động đồng bộ danh sách học sinh vắng nếu có
      if (enabledIndicators[0]) {
        syncAbsentListToCount(grandAbsent);
      }

      return {
        ...prev,
        age_stats: stats,
        total_nha_tre: totNT,
        total_mau_giao: totMG,
        present_nha_tre: presNT,
        present_mau_giao: presMG,
        absent_nha_tre: absNT,
        absent_mau_giao: absMG,
        boarding_nha_tre: boardNT,
        boarding_mau_giao: boardMG,
        boarding_count: grandBoarding,
        lunch_count: grandBoarding,
        lunch_nha_tre: boardNT,
        lunch_mau_giao: boardMG,
        snack_count: grandBoarding,
        snack_nha_tre: boardNT,
        snack_mau_giao: boardMG,
        canceled_count: grandAbsent,
        absent_excused: grandAbsent,
        absent_unexcused: 0,
        present_female_count: Math.min(prev.female_count || 0, grandPresent),
        present_ethnic_count: Math.min(prev.ethnic_count || 0, grandPresent),
      };
    });
  };

  // Đồng bộ nhanh báo ăn bằng số trẻ có mặt theo từng độ tuổi
  const handleSyncBoardingToAttendance = () => {
    setPreschoolData((prev) => {
      const stats = { ...(prev.age_stats || createDefaultAgeStats()) };
      Object.keys(stats).forEach((yr) => {
        stats[yr] = {
          ...stats[yr],
          boarding: stats[yr].present || 0,
        };
      });

      const boardNT = prev.present_nha_tre || 0;
      const boardMG = prev.present_mau_giao || 0;
      const totalBoard = boardNT + boardMG;

      return {
        ...prev,
        age_stats: stats,
        boarding_nha_tre: boardNT,
        boarding_mau_giao: boardMG,
        lunch_nha_tre: boardNT,
        lunch_mau_giao: boardMG,
        snack_nha_tre: boardNT,
        snack_mau_giao: boardMG,
        boarding_count: totalBoard > 0 ? totalBoard : (Number(formValues[enabledIndicators[0]?.id]?.present) || 0),
        lunch_count: totalBoard > 0 ? totalBoard : (Number(formValues[enabledIndicators[0]?.id]?.present) || 0),
        snack_count: totalBoard > 0 ? totalBoard : (Number(formValues[enabledIndicators[0]?.id]?.present) || 0),
      };
    });
    setQuickFillNotice('Đã đồng bộ số suất ăn bằng số trẻ có mặt theo từng độ tuổi!');
    setTimeout(() => setQuickFillNotice(''), 3000);
  };

  // Chọn nhanh phân bổ sĩ số cả lớp vào 1 năm sinh chính của lớp
  const handleQuickAssignCohort = (year: string) => {
    const mainGroup = enabledIndicators[0];
    const total = mainGroup ? Number(formValues[mainGroup.id]?.total) || classStudents.length || 0 : 0;
    const present = mainGroup ? Number(formValues[mainGroup.id]?.present) || total : total;
    const absent = Math.max(0, total - present);

    if (total <= 0) {
      setErrorMessage('Vui lòng nhập Sĩ số lớp trước khi chọn gán độ tuổi.');
      return;
    }

    const stats = createDefaultAgeStats();
    stats[year] = {
      total,
      present,
      absent,
      boarding: present,
    };

    const isNT = Number(year) >= startYear - 2;

    setPreschoolData((prev) => ({
      ...prev,
      age_stats: stats,
      total_nha_tre: isNT ? total : 0,
      total_mau_giao: !isNT ? total : 0,
      present_nha_tre: isNT ? present : 0,
      present_mau_giao: !isNT ? present : 0,
      absent_nha_tre: isNT ? absent : 0,
      absent_mau_giao: !isNT ? absent : 0,
      boarding_nha_tre: isNT ? present : 0,
      boarding_mau_giao: !isNT ? present : 0,
      boarding_count: present,
      lunch_count: present,
      lunch_nha_tre: isNT ? present : 0,
      lunch_mau_giao: !isNT ? present : 0,
      snack_count: present,
      snack_nha_tre: isNT ? present : 0,
      snack_mau_giao: !isNT ? present : 0,
      diet_type: isNT ? 'CHAO' : 'COM',
    }));

    setQuickFillNotice(`Đã gán toàn bộ sĩ số lớp vào nhóm trẻ sinh năm ${year}!`);
    setTimeout(() => setQuickFillNotice(''), 3000);
  };

  // Absent student handlers
  const handleAddAbsentStudent = () => {
    const mainGroup = enabledIndicators[0];
    const mainTotal = mainGroup ? Number(formValues[mainGroup.id]?.total) || 0 : 0;
    if (mainTotal <= 0) {
      setErrorMessage('Vui lòng nhập Sĩ số lớp (Tổng số > 0) trước khi thêm học sinh vắng.');
      return;
    }
    setAbsentStudents((prev) => [...prev, { full_name: '', address: '', reason: 'Ốm' }]);

    // Tự động đồng bộ tăng số vắng ở chỉ tiêu chính nếu cần
    if (enabledIndicators[0]) {
      const mainId = enabledIndicators[0].id;
      setFormValues((prevVals) => {
        const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
        const total = typeof cur.total === 'number' ? cur.total : 0;
        const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
        const newAbsent = Math.max(curAbsent, absentStudents.length + 1);
        const newPresent = Math.max(0, total - newAbsent);
        return {
          ...prevVals,
          [mainId]: {
            ...cur,
            total,
            absent: newAbsent,
            present: newPresent,
          },
        };
      });
    }
  };

  const handleUpdateAbsentStudent = (index: number, field: keyof AbsentStudent, value: string | boolean) => {
    const updated = [...absentStudents];
    if (field === 'full_name') {
      const match = students.find(
        (s) => s.class_id === selectedClassId && s.full_name.trim().toLowerCase() === (value as string).trim().toLowerCase()
      );
      if (match) {
        updated[index] = {
          ...updated[index],
          id: match.id,
          full_name: match.full_name, // keep original case from roster
          address: match.address || '',
          isBoarding: match.isBoarding,
        };
      } else {
        updated[index] = { ...updated[index], id: undefined, full_name: value as string };
      }
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setAbsentStudents(updated);
  };

  const handleToggleStudentAbsence = (student: import('../types').Student) => {
    const isAlreadyAbsent = absentStudents.some(
      (s) => s.id === student.id || s.full_name.trim().toLowerCase() === student.full_name.trim().toLowerCase()
    );

    let updatedList: AbsentStudent[];
    if (isAlreadyAbsent) {
      updatedList = absentStudents.filter(
        (s) => s.id !== student.id && s.full_name.trim().toLowerCase() !== student.full_name.trim().toLowerCase()
      );
    } else {
      updatedList = [
        ...absentStudents,
        {
          id: student.id,
          full_name: student.full_name,
          address: student.address || '',
          reason: 'Ốm',
        },
      ];
    }
    setAbsentStudents(updatedList);

    // Auto sync absent count in formValues and preschool boarding meals
    if (enabledIndicators[0]) {
      const mainId = enabledIndicators[0].id;
      const cur = formValues[mainId] || { total: 0, present: 0, absent: 0 };
      const total = typeof cur.total === 'number' ? cur.total : 0;
      const newAbsent = updatedList.length;
      const newPresent = Math.max(0, total - newAbsent);

      setFormValues((prev) => ({
        ...prev,
        [mainId]: {
          ...cur,
          total,
          absent: newAbsent,
          present: newPresent,
        },
      }));

      // Đồng bộ sang preschoolData (số HS có mặt đồng bộ với xuất ăn)
      setPreschoolData((prev) => {
        const stats = { ...(prev.age_stats || createDefaultAgeStats()) };
        const activeYears = Object.keys(stats).filter((yr) => (stats[yr].total || 0) > 0);
        let targetYear = activeYears.length === 1 ? activeYears[0] : '';
        if (!targetYear) {
          targetYear = getDefaultCohortYear(selectedClass?.class_name, selectedClass?.grade);
        }

        if (targetYear && stats[targetYear]) {
          stats[targetYear] = {
            total: total > 0 ? total : (stats[targetYear].total || total),
            present: newPresent,
            absent: newAbsent,
            boarding: newPresent,
          };
        }

        const isNTClass = isNhaTreClass(selectedClass?.class_name, selectedClass?.grade);
        const bNT = isNTClass ? newPresent : (prev.boarding_nha_tre || 0);
        const bMG = !isNTClass ? newPresent : (prev.boarding_mau_giao || 0);

        return {
          ...prev,
          age_stats: stats,
          absent_excused: newAbsent,
          absent_unexcused: 0,
          boarding_count: newPresent,
          lunch_count: newPresent,
          snack_count: newPresent,
          canceled_count: newAbsent,
          boarding_nha_tre: bNT,
          boarding_mau_giao: bMG,
          lunch_nha_tre: bNT,
          lunch_mau_giao: bMG,
          snack_nha_tre: bNT,
          snack_mau_giao: bMG,
          present_nha_tre: isNTClass ? newPresent : prev.present_nha_tre,
          present_mau_giao: !isNTClass ? newPresent : prev.present_mau_giao,
          absent_nha_tre: isNTClass ? newAbsent : prev.absent_nha_tre,
          absent_mau_giao: !isNTClass ? newAbsent : prev.absent_mau_giao,
        };
      });
    }
  };

  const handleBulkImportStudents = async () => {
    if (!bulkStudentText.trim() || !selectedClassId) return;
    const lines = bulkStudentText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsedStudents: Array<Omit<import('../types').Student, 'id' | 'created_at'>> = [];
    
    lines.forEach((line) => {
      const cleaned = line.replace(/^[\d]+[\.\/\)\-\:\s]+/, '').replace(/^[\-\*\•\+]\s*/, '').trim();
      if (!cleaned) return;
      
      let name = cleaned;
      let address = '';
      
      const parts = cleaned.split(/[\-\:,]/).map((p) => p.trim());
      if (parts.length > 1) {
        name = parts[0];
        address = parts.slice(1).join(' - ');
      }
      
      parsedStudents.push({
        class_id: selectedClassId,
        full_name: name,
        address: address,
      });
    });
    
    if (parsedStudents.length > 0) {
      await importStudents(parsedStudents);
      setBulkStudentText('');
      setShowBulkImport(false);
      setQuickFillNotice(`Đã thêm ${parsedStudents.length} học sinh vào danh sách lớp!`);
      setTimeout(() => setQuickFillNotice(''), 3500);
    }
  };

  const handleAddSingleStudent = async () => {
    if (!newStudentName.trim() || !selectedClassId) return;
    await addStudent({
      class_id: selectedClassId,
      full_name: newStudentName.trim(),
      address: newStudentAddress.trim(),
    });
    setNewStudentName('');
    setNewStudentAddress('');
  };

  const handleStartEditStudent = (s: import('../types').Student) => {
    setEditingStudentId(s.id);
    setEditingStudentName(s.full_name);
    setEditingStudentAddress(s.address || '');
  };
  
  const handleSaveEditStudent = async () => {
    if (!editingStudentId || !editingStudentName.trim()) return;
    await updateStudent(editingStudentId, {
      full_name: editingStudentName.trim(),
      address: editingStudentAddress.trim(),
    });
    setEditingStudentId(null);
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa học sinh ${name} khỏi danh sách lớp?`)) {
      await deleteStudent(id);
    }
  };

  const handleRemoveAbsentStudent = (index: number) => {
    const updated = [...absentStudents];
    updated.splice(index, 1);
    setAbsentStudents(updated);

    // Tự động đồng bộ giảm số vắng ở chỉ tiêu chính nếu đang bằng số em trong danh sách
    if (enabledIndicators[0]) {
      const mainId = enabledIndicators[0].id;
      setFormValues((prevVals) => {
        const cur = prevVals[mainId] || { total: 0, present: 0, absent: 0 };
        const total = typeof cur.total === 'number' ? cur.total : 0;
        const curAbsent = typeof cur.absent === 'number' ? cur.absent : 0;
        if (curAbsent > updated.length) {
          const newAbsent = updated.length;
          const newPresent = Math.max(0, total - newAbsent);
          return {
            ...prevVals,
            [mainId]: {
              ...cur,
              total,
              absent: newAbsent,
              present: newPresent,
            },
          };
        }
        return prevVals;
      });
    }
  };

  // Dán nhanh danh sách học sinh vắng từ Zalo / Tin nhắn
  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;

    const lines = quickPasteText
      .split(/[\n;]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const parsed: AbsentStudent[] = [];

    lines.forEach((line) => {
      // Bỏ số thứ tự 1., 2/ hoặc gạch đầu dòng -, *
      const cleaned = line.replace(/^[\d]+[\.\/\)\-\:\s]+/, '').replace(/^[\-\*\•\+]\s*/, '').trim();
      if (!cleaned) return;

      let fullName = cleaned;
      let reason = 'Ốm';
      let address = '';

      // Tách lý do trong ngoặc đơn () hoặc ngoặc vuông []
      const parenMatch = cleaned.match(/^(.*?)\s*[\(\[](.*?)[\)\]]$/);
      if (parenMatch) {
        fullName = parenMatch[1].trim();
        const inside = parenMatch[2].trim();
        const parts = inside.split(/[,;\-]/).map((p) => p.trim());
        reason = parts[0] || 'Ốm';
        if (parts[1]) address = parts[1];
      } else {
        // Tách theo dấu gạch ngang hoặc hai chấm
        const dashParts = cleaned.split(/[\-\:]/).map((p) => p.trim());
        if (dashParts.length > 1) {
          fullName = dashParts[0].trim();
          reason = dashParts[1].trim() || 'Ốm';
          if (dashParts[2]) address = dashParts[2].trim();
        }
      }

      if (fullName) {
        const match = students.find(
          (s) => s.class_id === selectedClassId && s.full_name.trim().toLowerCase() === fullName.trim().toLowerCase()
        );
        parsed.push({
          id: match?.id,
          full_name: match ? match.full_name : fullName,
          address: match ? (match.address || '') : (address || ''),
          reason: reason || 'Ốm',
        });
      }
    });

    if (parsed.length > 0) {
      setAbsentStudents(parsed);
      setShowQuickPaste(false);
      setQuickPasteText('');
      setQuickFillNotice(`Đã tự động thêm ${parsed.length} học sinh vắng vào danh sách!`);
      setTimeout(() => setQuickFillNotice(''), 3500);

      // Tự động đồng bộ sĩ số vắng ở nhóm chỉ tiêu chính
      if (enabledIndicators[0]) {
        const mainId = enabledIndicators[0].id;
        setFormValues((prev) => {
          const cur = prev[mainId] || { total: 0, present: 0, absent: 0 };
          const total = typeof cur.total === 'number' ? cur.total : 0;
          const newAbsent = parsed.length;
          const newPresent = Math.max(0, total - newAbsent);
          return {
            ...prev,
            [mainId]: {
              ...cur,
              total,
              absent: newAbsent,
              present: newPresent,
            },
          };
        });
      }
    }
  };

  // Validation rules check
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    // 1. Kiểm tra nhóm chỉ tiêu chính (Sĩ số học sinh cả lớp)
    const mainGroup = enabledIndicators[0];
    const mainVals = mainGroup ? formValues[mainGroup.id] : null;
    const mainTotal = mainVals && typeof mainVals.total === 'number' ? mainVals.total : Number(mainVals?.total) || 0;

    if (!mainVals || mainVals.total === '' || mainTotal <= 0) {
      errors.push('Chưa nhập số liệu sĩ số: Tổng số học sinh của lớp phải lớn hơn 0.');
    }

    let hasAnyPositiveTotal = false;

    enabledIndicators.forEach((ig) => {
      const gVals = formValues[ig.id];
      if (!gVals) return;

      const rawTotal = gVals.total;
      const rawPresent = gVals.present;
      const rawAbsent = gVals.absent;

      // Không cho phép để trống ô số liệu
      if (rawTotal === '' || rawPresent === '' || rawAbsent === '') {
        errors.push(`Nhóm "${ig.name}": Vui lòng điền đầy đủ các ô số liệu (nhập số 0 nếu không có).`);
        return;
      }

      const total = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal) || 0;
      const present = typeof rawPresent === 'number' ? rawPresent : Number(rawPresent) || 0;
      const absent = typeof rawAbsent === 'number' ? rawAbsent : Number(rawAbsent) || 0;

      if (total > 0) {
        hasAnyPositiveTotal = true;
      }

      if (total < 0 || present < 0 || absent < 0) {
        errors.push(`Nhóm "${ig.name}": Số lượng không được nhỏ hơn 0.`);
      }

      if (present > total) {
        errors.push(`Nhóm "${ig.name}": Số có mặt (${present}) vượt quá tổng số (${total}).`);
      }

      if (absent > total) {
        errors.push(`Nhóm "${ig.name}": Số vắng (${absent}) vượt quá tổng số (${total}).`);
      }

      if (total > 0 && present + absent !== total) {
        errors.push(
          `Nhóm "${ig.name}": Có mặt (${present}) + Vắng (${absent}) = ${present + absent}, phải bằng Tổng số (${total}).`
        );
      }
    });

    // Thống kê Mầm non validation
    const female = preschoolData.female_count || 0;
    const ethnic = preschoolData.ethnic_count || 0;
    const presentFemale = preschoolData.present_female_count || 0;
    const presentEthnic = preschoolData.present_ethnic_count || 0;
    const boarding = preschoolData.boarding_count || 0;

    const mainPresent = mainVals && typeof mainVals.present === 'number' ? mainVals.present : Number(mainVals?.present) || 0;
    const mainAbsent = mainVals && typeof mainVals.absent === 'number' ? mainVals.absent : Number(mainVals?.absent) || 0;

    // Kiểm tra tính khớp nhau giữa tổng số ở các độ tuổi và số lượng chung của lớp (nếu có nhập độ tuổi)
    const totalAgeKids = (preschoolData.total_nha_tre || 0) + (preschoolData.total_mau_giao || 0);
    const presentAgeKids = (preschoolData.present_nha_tre || 0) + (preschoolData.present_mau_giao || 0);
    const absentAgeKids = (preschoolData.absent_nha_tre || 0) + (preschoolData.absent_mau_giao || 0);

    if (totalAgeKids > 0 && totalAgeKids !== mainTotal) {
      errors.push(`Tổng sĩ số từ các nhóm tuổi (${totalAgeKids} em) không khớp với Tổng số trẻ cả lớp (${mainTotal} em) ở mục Thống kê chung.`);
    }
    if (totalAgeKids > 0 && presentAgeKids !== mainPresent) {
      errors.push(`Tổng số đi học từ các nhóm tuổi (${presentAgeKids} em) không khớp với Tổng số trẻ có mặt (${mainPresent} em) ở mục Thống kê chung.`);
    }
    if (totalAgeKids > 0 && absentAgeKids !== mainAbsent) {
      errors.push(`Tổng số vắng nghỉ từ các nhóm tuổi (${absentAgeKids} em) không khớp với Tổng số trẻ nghỉ (${mainAbsent} em) ở mục Thống kê chung.`);
    }

    // Kiểm tra phân loại nghỉ phép / không phép phải bằng tổng vắng của lớp
    const totalAbsentExcuses = (preschoolData.absent_excused || 0) + (preschoolData.absent_unexcused || 0);
    if (mainAbsent > 0 && totalAbsentExcuses !== mainAbsent) {
      errors.push(`Số trẻ nghỉ Có phép (${preschoolData.absent_excused || 0}) + Không phép (${preschoolData.absent_unexcused || 0}) = ${totalAbsentExcuses} em, không khớp với Tổng số trẻ nghỉ (${mainAbsent} em).`);
    }

    if (female > mainTotal) {
      errors.push(`Số trẻ Nữ (${female}) không được vượt quá Sĩ số lớp (${mainTotal}).`);
    }
    if (ethnic > mainTotal) {
      errors.push(`Số trẻ DTTS (${ethnic}) không được vượt quá Sĩ số lớp (${mainTotal}).`);
    }

    if (presentFemale > female) {
      errors.push(`Số trẻ Nữ có mặt (${presentFemale}) không được vượt quá tổng số trẻ Nữ của lớp (${female}).`);
    }
    if (presentEthnic > ethnic) {
      errors.push(`Số trẻ DTTS có mặt (${presentEthnic}) không được vượt quá tổng số trẻ DTTS của lớp (${ethnic}).`);
    }
    if (boarding > mainPresent) {
      errors.push(`Số trẻ ăn bán trú (${boarding}) không được vượt quá số trẻ có mặt đi học (${mainPresent}).`);
    }

    if (!hasAnyPositiveTotal && errors.length === 0) {
      errors.push('Thầy/Cô chưa nhập số liệu báo cáo. Vui lòng nhập sĩ số trước khi gửi.');
    }

    return errors;
  }, [formValues, enabledIndicators, preschoolData]);

  const isValid = validationErrors.length === 0;

  // Compute summary for sticky mobile bar
  const mobileSummary = useMemo(() => {
    const mainGroup = enabledIndicators[0];
    if (!mainGroup) return null;
    const v = formValues[mainGroup.id];
    return {
      total: typeof v?.total === 'number' ? v.total : Number(v?.total) || 0,
      present: typeof v?.present === 'number' ? v.present : Number(v?.present) || 0,
      absent: typeof v?.absent === 'number' ? v.absent : Number(v?.absent) || 0,
    };
  }, [enabledIndicators, formValues]);

  // Handle Save
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    if (!isClassPermitted) {
      setErrorMessage(
        `Thầy/Cô không có quyền gửi báo cáo cho lớp này! Quyền phân công của Thầy/Cô là: ${getScopeLabel(allowedScope)}. Chỉ được nhập báo cáo cho các lớp thuộc ${getScopeLabel(allowedScope)}.`
      );
      return;
    }

    // Kiểm tra bắt buộc có sĩ số học sinh
    const mainGroup = enabledIndicators[0];
    const mainVals = mainGroup ? formValues[mainGroup.id] : null;
    const mainTotal = mainVals && typeof mainVals.total === 'number' ? mainVals.total : Number(mainVals?.total) || 0;

    if (!isValid || mainTotal <= 0) {
      setErrorMessage(
        validationErrors[0] ||
        'Không thể gửi báo cáo: Thầy/Cô chưa nhập số liệu sĩ số trẻ của lớp (Tổng số trẻ phải lớn hơn 0)!'
      );
      const errorEl = document.getElementById('validation-error-box');
      if (errorEl) {
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (isLocked && !isAdmin) {
      setErrorMessage('Báo cáo đã bị khóa, bạn không có quyền sửa đổi.');
      return;
    }

    if (!currentUser) return;

    try {
      const payload: Record<string, { total: number; present: number; absent: number }> = {};
      enabledIndicators.forEach((ig) => {
        const val = formValues[ig.id] || { total: 0, present: 0, absent: 0 };
        payload[ig.id] = {
          total: Number(val.total) || 0,
          present: Number(val.present) || 0,
          absent: Number(val.absent) || 0,
        };
      });

      const res = await StorageService.saveDailyReport(
        selectedClassId,
        reportDate,
        currentUser,
        payload,
        notes,
        absentStudents,
        preschoolData
      );

      setExistingReport(res.report);
      setSaveSuccess(true);
      setIsEditMode(true);

      if (onSavedSuccess) {
        onSavedSuccess();
      }

      // Scroll smoothly to top on mobile to see confirmation
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Error saving report:', err);
      setErrorMessage(err?.message || 'Không thể lưu báo cáo. Vui lòng kiểm tra lại số liệu.');
    }
  };

  if (classes.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 py-8">
        <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <GraduationCap className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Chưa có lớp học trong hệ thống</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Hệ thống đang ở trạng thái mặc định rỗng. Quản trị viên vui lòng thêm lớp học để bắt đầu điểm danh và báo cáo sĩ số.
          </p>
          {onNavigate && (isAdmin || !isGVCN) && (
            <button
              type="button"
              onClick={() => onNavigate('/classes')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 shadow-xs transition-colors"
            >
              Cấu hình lớp học ngay
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-28 sm:pb-12">
      {/* 1. Mobile-Optimized Class & Teacher Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs flex-shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md">
                  GVCN Điểm Danh
                </span>
                {selectedClass && (
                  <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                    {preschoolGrades.find((p) => p.grade_num === selectedClass.grade)?.name || `Khối ${selectedClass.grade}`}
                  </span>
                )}
                {isGVCN && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                      allowedScope === 'NHA_TRE'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : allowedScope === 'MAU_GIAO'
                        ? 'bg-teal-100 text-teal-900 border border-teal-300'
                        : 'bg-blue-100 text-blue-900 border border-blue-300'
                    }`}
                  >
                    {allowedScope === 'NHA_TRE' && <Baby className="w-3 h-3 text-amber-600" />}
                    {allowedScope === 'MAU_GIAO' && <GraduationCap className="w-3 h-3 text-teal-600" />}
                    {allowedScope === 'ALL' && <Sparkles className="w-3 h-3 text-blue-600" />}
                    <span>{allowedScope === 'NHA_TRE' ? 'Chỉ nhập Nhà trẻ' : allowedScope === 'MAU_GIAO' ? 'Chỉ nhập Mẫu giáo' : 'Toàn trường'}</span>
                  </span>
                )}
              </div>
              <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight mt-0.5">
                {selectedClass ? `LỚP ${selectedClass.class_name}` : 'BÁO CÁO SĨ SỐ'}
              </h1>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs font-bold text-slate-800 line-clamp-1">{currentUser?.full_name}</div>
            <div className="text-[11px] text-slate-500 font-medium">
              {isAssignedTeacher ? `GVCN Phụ trách` : currentUser?.role}
            </div>
          </div>
        </div>

        {/* Date & Class pickers tailored for phone touch ergonomics */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Date Picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Ngày báo cáo
              </label>
              {reportDate !== today && (
                <button
                  type="button"
                  onClick={() => setReportDate(today)}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800"
                >
                  Về hôm nay
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <Calendar className="w-4 h-4 text-blue-600 absolute left-3 pointer-events-none" />
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full pl-9 pr-3 h-11 text-sm font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Class Selector (Filtered by Teaching Scope for GVCN) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                Lớp phụ trách
              </label>
              {isGVCN && allowedScope !== 'ALL' && (
                <span className="text-[10px] font-bold text-slate-500">
                  {permittedClasses.length} lớp được phép
                </span>
              )}
            </div>
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full px-3 h-11 text-sm font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden cursor-pointer appearance-none"
              >
                {(() => {
                  const classPool = isGVCN && allowedScope !== 'ALL' ? permittedClasses : classes;
                  if (classPool.length === 0) {
                    return <option value="">-- Không có lớp thuộc khối được phân công --</option>;
                  }

                  if (settings?.enable_campuses && campuses.length > 0) {
                    return (
                      <>
                        {campuses.map((campus) => {
                          const campusClasses = classPool.filter((c) => c.campus_id === campus.id);
                          if (campusClasses.length === 0) return null;
                          return (
                            <optgroup key={campus.id} label={campus.name}>
                              {campusClasses.map((c) => {
                                const pg = preschoolGrades.find((p) => p.grade_num === c.grade);
                                return (
                                  <option key={c.id} value={c.id}>
                                    Lớp {c.class_name} ({pg ? pg.name : `Khối ${c.grade}`})
                                  </option>
                                );
                              })}
                            </optgroup>
                          );
                        })}
                        {classPool.filter((c) => !c.campus_id).length > 0 && (
                          <optgroup label="Chưa xếp phân hiệu">
                            {classPool.filter((c) => !c.campus_id).map((c) => {
                              const pg = preschoolGrades.find((p) => p.grade_num === c.grade);
                              return (
                                <option key={c.id} value={c.id}>
                                  Lớp {c.class_name} ({pg ? pg.name : `Khối ${c.grade}`})
                                </option>
                              );
                            })}
                          </optgroup>
                        )}
                      </>
                    );
                  }

                  return classPool.map((c) => {
                    const pg = preschoolGrades.find((p) => p.grade_num === c.grade);
                    return (
                      <option key={c.id} value={c.id}>
                        Lớp {c.class_name} ({pg ? `${pg.name} - ${pg.age_range}` : `Khối ${c.grade}`})
                      </option>
                    );
                  });
                })()}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
            </div>
            <button
              type="button"
              onClick={() => setShowRosterModal(true)}
              className="mt-2 w-full h-9 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>Cập nhật Danh sách Học sinh ({classStudents.length} em)</span>
            </button>
          </div>
        </div>

        {/* Permission Notice Banner for Restricted Teachers */}
        {!isClassPermitted && (
          <div className="mt-3.5 p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-xs">Giới hạn quyền nhập theo quy định Mầm Non</div>
              <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                Tài khoản của Thầy/Cô được phân công dạy <strong>{getScopeLabel(allowedScope)}</strong>.
                Theo quy định, Thầy/Cô chỉ được nhập điểm danh và báo cáo số liệu cho các lớp thuộc <strong>{getScopeLabel(allowedScope)}</strong>.
              </p>
              {permittedClasses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedClassId(permittedClasses[0].id)}
                  className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                >
                  <span>Chuyển sang lớp phụ trách: {permittedClasses[0].class_name}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. Fast 1-Tap Action: "CẢ LỚP ĐI ĐỦ" for fast mobile attendance */}
        {isEditMode && !isLocked && isClassPermitted && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={handleSetFullAttendance}
              className="w-full h-11 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 active:scale-98 transition-all shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <Check className="w-4 h-4 text-emerald-700 stroke-[3] flex-shrink-0" />
              <span className="truncate">⚡ Điểm danh nhanh: Cả lớp đi đủ (0 vắng)</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Fill Notice Toast */}
      {quickFillNotice && (
        <div className="bg-emerald-600 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span className="leading-tight">{quickFillNotice}</span>
        </div>
      )}

      {/* Reset Success Message Toast */}
      {resetSuccessMessage && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{resetSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setResetSuccessMessage('')}
            className="text-white/80 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Existing Report / Lock Notification Banner */}
      {existingReport && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-emerald-900">
                Đã có báo cáo ngày {reportDate.split('-').reverse().join('/')}
              </h3>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Lớp <span className="font-bold">{selectedClass?.class_name}</span> đã lưu lúc{' '}
                {new Date(existingReport.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}. Thầy/Cô có thể chỉnh sửa số liệu hoặc hủy về trạng thái Chưa báo cáo nếu gửi nhầm.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 sm:pt-0 flex-wrap">
            {isLocked ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 whitespace-nowrap">
                <Lock className="w-3.5 h-3.5" /> Đã khóa
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 whitespace-nowrap">
                <Check className="w-3.5 h-3.5" /> Sẵn sàng cập nhật
              </span>
            )}

            {canReset && (
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
                title="Hủy/Reset báo cáo ngày này về Chưa báo cáo nếu báo cáo nhầm"
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span>Reset báo cáo nhầm</span>
              </button>
            )}
          </div>
        </div>
      )}

      {isLocked && (
        <div className="bg-slate-100 border border-slate-300 rounded-2xl p-3.5 flex items-center gap-2.5">
          <Lock className="w-5 h-5 text-slate-600 flex-shrink-0" />
          <div className="text-xs text-slate-700">
            <span className="font-bold">Báo cáo lớp này đã bị khóa.</span> Liên hệ BGH nếu cần mở khóa.
          </div>
        </div>
      )}

      {/* Success Modal Window */}
      {saveSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-500 relative">
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 sm:p-8 text-center relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white opacity-10 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-white opacity-10 rounded-full blur-2xl"></div>
              
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center shadow-xl mx-auto mb-4 relative z-10 animate-bounce">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600" />
              </div>
              
              <h3 className="font-black text-xl sm:text-2xl text-white tracking-wide drop-shadow-sm flex items-center justify-center gap-2 relative z-10">
                THÀNH CÔNG <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-300 animate-pulse" />
              </h3>
            </div>
            
            <div className="p-6 text-center space-y-5">
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Báo cáo sĩ số của lớp <span className="font-bold text-slate-900">{selectedClass?.class_name}</span> đã được lưu và đồng bộ thành công lên hệ thống toàn trường.
              </p>
              
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setSaveSuccess(false)}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md transition-all active:scale-98"
                >
                  Đóng cửa sổ
                </button>
                {onNavigate && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setSaveSuccess(false);
                        onNavigate('/reports/daily');
                      }}
                      className="w-full py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-sm rounded-xl transition-all active:scale-98 flex items-center justify-center gap-1.5"
                    >
                      <span>Xem Biểu Mẫu Toàn Trường</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSaveSuccess(false);
                        onNavigate('/dashboard');
                      }}
                      className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl transition-all active:scale-98"
                    >
                      Về Bảng điều khiển
                    </button>
                  </>
                )}
              </div>
              
              <div className="pt-2">
                <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium tracking-wide">
                  Ứng dụng được phát triển bởi: <span className="font-bold text-slate-500">Vũ Hùng - SĐT: 0984246993</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Main Input Form - Mẫu báo cáo dành riêng cho Trường Mầm Non */}
      <form onSubmit={(e) => handleSave(e)} className="space-y-4">
        {/* Banner tiêu chuẩn Mầm Non */}
        <div className="bg-gradient-to-r from-amber-500/10 via-pink-500/10 to-emerald-500/10 border border-amber-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs flex-shrink-0">
              <Baby className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                  Biểu mẫu Mầm Non
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Lớp: <strong className="text-slate-900">{selectedClass?.class_name}</strong>
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                Nhập số liệu sĩ số, chuyên cần, báo ăn bán trú và tình hình sức khỏe của trẻ
              </p>
            </div>
          </div>

          {(!isLocked || isAdmin) && (
            <button
              type="button"
              onClick={handleSetFullAttendance}
              className="w-full sm:w-auto h-10 px-4 rounded-xl text-xs font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-95 flex-shrink-0 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
              <span>⚡ CẢ LỚP ĐI ĐỦ 100% & ĂN ĐỦ</span>
            </button>
          )}
        </div>

        {/* KHỐI 1: SĨ SỐ TRẺ & CHUYÊN CẦN THEO ĐỘ TUỔI (NĂM SINH) */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 font-black text-xs flex items-center justify-center">
                1
              </div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                SĨ SỐ & CHUYÊN CẦN THEO ĐỘ TUỔI (NĂM SINH)
              </h3>
            </div>
            
            {/* Tỷ lệ có mặt & Tóm tắt */}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const mainId = enabledIndicators[0]?.id || 'ig_all';
                const t = Number(formValues[mainId]?.total) || 0;
                const p = Number(formValues[mainId]?.present) || 0;
                const rate = t > 0 ? (p / t) * 100 : 0;
                return t > 0 ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{rate.toFixed(1)}% có mặt ({p}/{t} trẻ)</span>
                  </span>
                ) : null;
              })()}
            </div>
          </div>

          {/* Công cụ gán nhanh độ tuổi chính của lớp */}
          {(!isLocked || isAdmin) && (
            <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-purple-50/70 p-2.5 rounded-xl border border-blue-200/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-blue-900 font-bold">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Gán nhanh độ tuổi chính của lớp:</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  ...nhaTreAgeGroupItems.filter(item => item.year !== String(startYear)).map(item => ({
                    year: item.year,
                    label: `Sinh ${item.year} (${item.ageLabel})`,
                    isNT: true,
                  })),
                  ...mauGiaoAgeGroupItems.map(item => ({
                    year: item.year,
                    label: `Sinh ${item.year} (${item.ageLabel})`,
                    isNT: false,
                  })),
                ].map((cohort) => (
                  <button
                    key={cohort.year}
                    type="button"
                    onClick={() => handleQuickAssignCohort(cohort.year)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                      cohort.isNT
                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                        : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 border-indigo-300'
                    }`}
                  >
                    {cohort.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* BẢNG NHẬP SĨ SỐ VÀ ĐI HỌC THEO TỪNG ĐỘ TUỔI (NHÀ TRẺ & MẪU GIÁO) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {/* CỘT A: KHỐI NHÀ TRẺ (Dưới 3 tuổi) */}
            <div className="bg-amber-50/40 rounded-xl border border-amber-200 p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center">
                    A
                  </span>
                  <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                    🧸 KHỐI NHÀ TRẺ (DƯỚI 3 TUỔI)
                  </span>
                </div>
                <div className="text-[11px] font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300">
                  Sĩ số: <b>{preschoolData.total_nha_tre || 0}</b> | Đi học: <b className="text-emerald-700">{preschoolData.present_nha_tre || 0}</b> | Vắng: <b className="text-rose-600">{preschoolData.absent_nha_tre || 0}</b>
                </div>
              </div>

              {/* Các năm sinh Nhà trẻ */}
              <div className="space-y-2">
                {nhaTreAgeGroupItems.map((item) => {
                  const stat = preschoolData.age_stats?.[item.year] || { total: 0, present: 0, absent: 0, boarding: 0 };
                  return (
                    <div key={item.year} className="bg-white p-2.5 rounded-lg border border-amber-200/80 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-amber-900">Sinh năm {item.year}</span>
                          <span className="text-[11px] font-medium text-slate-500">({item.ageLabel})</span>
                        </div>
                        {stat.total > 0 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0}% có mặt
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-3 gap-3">
                          <span className="text-[11px] font-bold text-slate-600 uppercase text-center">Sĩ số (Trẻ)</span>
                          <span className="text-[11px] font-bold text-emerald-700 uppercase text-center">Đi học (Có mặt)</span>
                          <span className="text-[11px] font-bold text-rose-700 uppercase text-center">Vắng (Nghỉ)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={isLocked && !isAdmin}
                            value={stat.total || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                              handleUpdateAgeStat(item.year, 'total', val);
                            }}
                            className="w-full text-center text-base font-black text-slate-900 bg-amber-50/30 border border-amber-200 rounded-lg h-10 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                            placeholder="0"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={isLocked && !isAdmin}
                            value={stat.present || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                              handleUpdateAgeStat(item.year, 'present', val);
                            }}
                            className="w-full text-center text-base font-black text-emerald-800 bg-emerald-50/40 border border-emerald-200 rounded-lg h-10 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                            placeholder="0"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={isLocked && !isAdmin}
                            value={stat.absent || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                              handleUpdateAgeStat(item.year, 'absent', val);
                            }}
                            className="w-full text-center text-base font-black text-rose-800 bg-rose-50/40 border border-rose-200 rounded-lg h-10 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CỘT B: KHỐI MẪU GIÁO (3 - 6 tuổi) */}
            <div className="bg-indigo-50/40 rounded-xl border border-indigo-200 p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                    B
                  </span>
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                    🎒 KHỐI MẪU GIÁO (3 - 6 TUỔI)
                  </span>
                </div>
                <div className="text-[11px] font-bold text-indigo-900 bg-indigo-100/90 px-2 py-0.5 rounded-md border border-indigo-300">
                  Sĩ số: <b>{preschoolData.total_mau_giao || 0}</b> | Đi học: <b className="text-emerald-700">{preschoolData.present_mau_giao || 0}</b> | Vắng: <b className="text-rose-600">{preschoolData.absent_mau_giao || 0}</b>
                </div>
              </div>

              {/* Các năm sinh Mẫu giáo */}
              <div className="space-y-2">
                {mauGiaoAgeGroupItems.map((item) => {
                  const stat = preschoolData.age_stats?.[item.year] || { total: 0, present: 0, absent: 0, boarding: 0 };
                  return (
                    <div key={item.year} className="bg-white p-2.5 rounded-lg border border-indigo-200/80 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-indigo-950">Sinh năm {item.year}</span>
                          <span className="text-[11px] font-medium text-slate-500">({item.ageLabel})</span>
                        </div>
                        {stat.total > 0 && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {stat.total > 0 ? Math.round((stat.present / stat.total) * 100) : 0}% có mặt
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-3 gap-3">
                          <span className="text-[11px] font-bold text-slate-600 uppercase text-center">Sĩ số (Trẻ)</span>
                          <span className="text-[11px] font-bold text-emerald-700 uppercase text-center">Đi học (Có mặt)</span>
                          <span className="text-[11px] font-bold text-rose-700 uppercase text-center">Vắng (Nghỉ)</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={isLocked && !isAdmin}
                            value={stat.total || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                              handleUpdateAgeStat(item.year, 'total', val);
                            }}
                            className="w-full text-center text-base font-black text-slate-900 bg-indigo-50/30 border border-indigo-200 rounded-lg h-10 focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                            placeholder="0"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={isLocked && !isAdmin}
                            value={stat.present || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                              handleUpdateAgeStat(item.year, 'present', val);
                            }}
                            className="w-full text-center text-base font-black text-emerald-800 bg-emerald-50/40 border border-emerald-200 rounded-lg h-10 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                            placeholder="0"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            disabled={isLocked && !isAdmin}
                            value={stat.absent || ''}
                            onChange={(e) => {
                              const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                              handleUpdateAgeStat(item.year, 'absent', val);
                            }}
                            className="w-full text-center text-base font-black text-rose-800 bg-rose-50/40 border border-rose-200 rounded-lg h-10 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* HÀNG TỔNG HỢP NHÂN KHẨU HỌC & ĐỐI TƯỢNG CHÍNH SÁCH */}
          <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                Tổng hợp nhân khẩu học & Đối tượng chính sách của lớp
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                (Tự động tính từ các nhóm tuổi hoặc điều chỉnh tay)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-stretch">
              <div className="bg-white p-2 rounded-xl border border-slate-200 text-center flex flex-col justify-between h-full">
                <span className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Tổng số trẻ cả lớp *
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={formValues[enabledIndicators[0]?.id || 'ig_all']?.total ?? ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    const mainId = enabledIndicators[0]?.id || 'ig_all';
                    handleFieldChange(mainId, 'total', val);
                  }}
                  className="w-full text-center text-lg font-black text-slate-900 bg-slate-50 border border-slate-300 rounded-lg h-9 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div className="bg-pink-50/60 p-2 rounded-xl border border-pink-200 text-center flex flex-col justify-between h-full">
                <span className="block text-[10px] font-bold text-pink-700 uppercase mb-1">
                  Nữ (Bé gái)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.female_count}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({
                      ...prev,
                      female_count: val,
                      present_female_count: Math.min(val, prev.present_female_count),
                    }));
                  }}
                  className="w-full text-center text-lg font-black text-pink-800 bg-white border border-pink-300 rounded-lg h-9 focus:ring-2 focus:ring-pink-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div className="bg-amber-50/60 p-2 rounded-xl border border-amber-200 text-center flex flex-col justify-between h-full">
                <span className="block text-[10px] font-bold text-amber-800 uppercase mb-1">
                  Dân tộc thiểu số
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.ethnic_count}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({
                      ...prev,
                      ethnic_count: val,
                      present_ethnic_count: Math.min(val, prev.present_ethnic_count),
                    }));
                  }}
                  className="w-full text-center text-lg font-black text-amber-900 bg-white border border-amber-300 rounded-lg h-9 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div className="bg-white p-2 rounded-xl border border-slate-200 text-center flex flex-col justify-between h-full">
                <span className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Hộ nghèo / cận nghèo
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.poor_count || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({ ...prev, poor_count: val }));
                  }}
                  className="w-full text-center text-lg font-black text-slate-800 bg-slate-50 border border-slate-300 rounded-lg h-9 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div className="bg-white p-2 rounded-xl border border-slate-200 text-center col-span-2 sm:col-span-1 flex flex-col justify-between h-full">
                <span className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Trẻ khuyết tật
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.disabled_count || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({ ...prev, disabled_count: val }));
                  }}
                  className="w-full text-center text-lg font-black text-slate-800 bg-slate-50 border border-slate-300 rounded-lg h-9 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Quick Presets: Chọn nhanh số trẻ nghỉ */}
          {(!isLocked || isAdmin) && (
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider">
                  Chọn nhanh số trẻ nghỉ hôm nay:
                </span>
                <span className="text-[10px] font-bold text-blue-600">
                  (Tự động đồng bộ số có mặt và danh sách vắng)
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { count: 0, label: '0 trẻ', sub: 'Đủ 100%' },
                  { count: 1, label: '1 bé', sub: 'Nghỉ 1' },
                  { count: 2, label: '2 bé', sub: 'Nghỉ 2' },
                  { count: 3, label: '3 bé', sub: 'Nghỉ 3' },
                ].map((preset) => {
                  const mainId = enabledIndicators[0]?.id || 'ig_all';
                  const absentNum = Number(formValues[mainId]?.absent) || 0;
                  const isSelected = absentNum === preset.count;
                  return (
                    <button
                      key={preset.count}
                      type="button"
                      onClick={() => setAbsentPreset(mainId, preset.count)}
                      className={`py-2 px-1 rounded-xl text-center transition-all active:scale-95 flex flex-col items-center justify-center cursor-pointer ${
                        isSelected
                          ? preset.count === 0
                            ? 'bg-emerald-600 text-white shadow-xs font-black'
                            : 'bg-red-600 text-white shadow-xs font-black'
                          : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black leading-tight whitespace-nowrap">
                        {preset.label}
                      </span>
                      <span className={`text-[9px] leading-tight whitespace-nowrap ${
                        isSelected ? 'text-white/80 font-medium' : 'text-slate-400'
                      }`}>
                        {preset.sub}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* HÀNG: ĐI HỌC HÔM NAY (CÓ MẶT) & TRẺ NGHỈ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Nhóm Có mặt */}
            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-200 space-y-2">
              <span className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider block">
                Tổng trẻ đi học hôm nay (Có mặt)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">
                    Tổng có mặt *
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={formValues[enabledIndicators[0]?.id || 'ig_all']?.present ?? ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      const mainId = enabledIndicators[0]?.id || 'ig_all';
                      handleFieldChange(mainId, 'present', val);
                    }}
                    className="w-full text-center text-xl font-black text-emerald-900 bg-white border border-emerald-300 rounded-lg h-10 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">
                    Nữ có mặt
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.present_female_count}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({ ...prev, present_female_count: val }));
                    }}
                    className="w-full text-center text-xl font-black text-emerald-900 bg-white border border-emerald-300 rounded-lg h-10 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-emerald-800 uppercase mb-1">
                    DTTS có mặt
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.present_ethnic_count}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({ ...prev, present_ethnic_count: val }));
                    }}
                    className="w-full text-center text-xl font-black text-emerald-900 bg-white border border-emerald-300 rounded-lg h-10 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* Nhóm Nghỉ */}
            <div className="bg-red-50/50 p-3 rounded-xl border border-red-200 space-y-2">
              <span className="text-xs font-extrabold text-red-900 uppercase tracking-wider block">
                Tổng trẻ nghỉ học hôm nay (Vắng)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="block text-[10px] font-bold text-red-800 uppercase mb-1">
                    Tổng trẻ nghỉ *
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={formValues[enabledIndicators[0]?.id || 'ig_all']?.absent ?? ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      const mainId = enabledIndicators[0]?.id || 'ig_all';
                      handleFieldChange(mainId, 'absent', val);
                    }}
                    className="w-full text-center text-xl font-black text-red-700 bg-white border border-red-300 rounded-lg h-10 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-red-800 uppercase mb-1">
                    Có phép (P)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.absent_excused}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({ ...prev, absent_excused: val }));
                    }}
                    className="w-full text-center text-xl font-black text-red-700 bg-white border border-red-300 rounded-lg h-10 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-red-800 uppercase mb-1">
                    Không phép (KP)
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.absent_unexcused}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({ ...prev, absent_unexcused: val }));
                    }}
                    className="w-full text-center text-xl font-black text-red-700 bg-white border border-red-300 rounded-lg h-10 focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KHỐI 2: BÁO ĂN BÁN TRÚ THEO ĐỘ TUỔI (ĂN NHÀ TRẺ & ĂN MẪU GIÁO) */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-800 font-black text-xs flex items-center justify-center">
                2
              </div>
              <h3 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-orange-600" />
                BÁO ĂN BÁN TRÚ THEO ĐỘ TUỔI (BẾP ĂN MẦM NON)
              </h3>
            </div>

            {/* Thao tác nhanh & Huy hiệu tổng */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-orange-900 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                Tổng ăn: <b>{preschoolData.boarding_count}</b> suất (NT: <b>{preschoolData.boarding_nha_tre || 0}</b> | MG: <b>{preschoolData.boarding_mau_giao || 0}</b>)
              </span>

              {(!isLocked || isAdmin) && (
                <button
                  type="button"
                  onClick={handleSyncBoardingToAttendance}
                  className="h-8 px-2.5 rounded-lg text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-2xs"
                  title="Tự động đồng bộ số suất ăn theo từng độ tuổi bằng số trẻ đi học"
                >
                  <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                  <span>Báo ăn = Trẻ đi học ({formValues[enabledIndicators[0]?.id || 'ig_all']?.present || 0})</span>
                </button>
              )}
            </div>
          </div>

          {/* 2 CỘT BÁO ĂN THEO ĐỘ TUỔI: BÁO ĂN NHÀ TRẺ & BÁO ĂN MẪU GIÁO */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {/* CỘT A: BÁO ĂN NHÀ TRẺ (Dưới 3 tuổi - các năm sinh Nhà trẻ) */}
            <div className="bg-amber-50/50 rounded-xl border border-amber-200 p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-amber-200/80 pb-2 flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  <Utensils className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-black text-amber-950 uppercase">
                    🧸 ĂN NHÀ TRẺ (KHẨU PHẦN DƯỚI 3T)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-amber-800">Tổng ăn Nhà trẻ:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.boarding_nha_tre || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => {
                        const newTotal = val + (prev.boarding_mau_giao || 0);
                        return {
                          ...prev,
                          boarding_nha_tre: val,
                          lunch_nha_tre: val,
                          snack_nha_tre: val,
                          boarding_count: newTotal,
                          lunch_count: val + (prev.lunch_mau_giao || 0),
                          snack_count: val + (prev.snack_mau_giao || 0),
                        };
                      });
                    }}
                    className="w-14 text-center text-sm font-black text-amber-950 bg-white border border-amber-300 rounded-md h-7 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                    placeholder="0"
                  />
                  <span className="text-[10px] font-bold text-amber-900">suất</span>
                </div>
              </div>

              {/* Chi tiết ăn theo từng năm sinh Nhà trẻ */}
              <div className="space-y-2">
                {nhaTreAgeGroupItems.map((item) => {
                  const stat = preschoolData.age_stats?.[item.year] || { total: 0, present: 0, absent: 0, boarding: 0 };
                  return (
                    <div key={item.year} className="bg-white p-2 rounded-lg border border-amber-200/80 shadow-2xs flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 block">
                          Ăn trẻ sinh {item.year} ({item.ageLabel})
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Đi học: <b className="text-emerald-700">{stat.present || 0}</b> / Sĩ số: {stat.total || 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] font-bold text-amber-800 uppercase">Suất ăn:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={isLocked && !isAdmin}
                          value={stat.boarding || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                            handleUpdateAgeStat(item.year, 'boarding', val);
                          }}
                          className="w-14 text-center text-sm font-black text-amber-950 bg-amber-50/40 border border-amber-300 rounded-md h-8 focus:ring-1 focus:ring-amber-500 focus:outline-hidden"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bữa ăn phụ Nhà trẻ */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/60">
                <div className="bg-white/80 p-2 rounded-lg border border-amber-200/70 text-center">
                  <span className="block text-[10px] font-bold text-amber-900 uppercase mb-0.5">Trưa Nhà trẻ</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.lunch_nha_tre || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({
                        ...prev,
                        lunch_nha_tre: val,
                        lunch_count: val + (prev.lunch_mau_giao || 0),
                      }));
                    }}
                    className="w-full text-center text-sm font-black text-amber-950 bg-white border border-amber-300 rounded-md h-7 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-amber-200/70 text-center">
                  <span className="block text-[10px] font-bold text-amber-900 uppercase mb-0.5">Xế Nhà trẻ</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.snack_nha_tre || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({
                        ...prev,
                        snack_nha_tre: val,
                        snack_count: val + (prev.snack_mau_giao || 0),
                      }));
                    }}
                    className="w-full text-center text-sm font-black text-amber-950 bg-white border border-amber-300 rounded-md h-7 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* CỘT B: BÁO ĂN MẪU GIÁO (3 - 6 tuổi - sinh 2023, 2022, 2021) */}
            <div className="bg-indigo-50/50 rounded-xl border border-indigo-200 p-3 space-y-3">
              <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2 flex-wrap gap-1">
                <div className="flex items-center gap-1.5">
                  <Utensils className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-black text-indigo-950 uppercase">
                    🎒 ĂN MẪU GIÁO (KHẨU PHẦN 3 - 6T)
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-indigo-800">Tổng ăn Mẫu giáo:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.boarding_mau_giao || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => {
                        const newTotal = (prev.boarding_nha_tre || 0) + val;
                        return {
                          ...prev,
                          boarding_mau_giao: val,
                          lunch_mau_giao: val,
                          snack_mau_giao: val,
                          boarding_count: newTotal,
                          lunch_count: (prev.lunch_nha_tre || 0) + val,
                          snack_count: (prev.snack_nha_tre || 0) + val,
                        };
                      });
                    }}
                    className="w-14 text-center text-sm font-black text-indigo-950 bg-white border border-indigo-300 rounded-md h-7 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    placeholder="0"
                  />
                  <span className="text-[10px] font-bold text-indigo-900">suất</span>
                </div>
              </div>

              {/* Chi tiết ăn theo từng năm sinh Mẫu giáo */}
              <div className="space-y-2">
                {mauGiaoAgeGroupItems.map((item) => {
                  const stat = preschoolData.age_stats?.[item.year] || { total: 0, present: 0, absent: 0, boarding: 0 };
                  return (
                    <div key={item.year} className="bg-white p-2 rounded-lg border border-indigo-200/80 shadow-2xs flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-800 block">
                          Ăn trẻ sinh {item.year} ({item.ageLabel})
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Đi học: <b className="text-emerald-700">{stat.present || 0}</b> / Sĩ số: {stat.total || 0}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] font-bold text-indigo-800 uppercase">Suất ăn:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          disabled={isLocked && !isAdmin}
                          value={stat.boarding || ''}
                          onChange={(e) => {
                            const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                            handleUpdateAgeStat(item.year, 'boarding', val);
                          }}
                          className="w-14 text-center text-sm font-black text-indigo-950 bg-indigo-50/40 border border-indigo-300 rounded-md h-8 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bữa ăn phụ Mẫu giáo */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-indigo-200/60">
                <div className="bg-white/80 p-2 rounded-lg border border-indigo-200/70 text-center">
                  <span className="block text-[10px] font-bold text-indigo-900 uppercase mb-0.5">Trưa Mẫu giáo</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.lunch_mau_giao || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({
                        ...prev,
                        lunch_mau_giao: val,
                        lunch_count: (prev.lunch_nha_tre || 0) + val,
                      }));
                    }}
                    className="w-full text-center text-sm font-black text-indigo-950 bg-white border border-indigo-300 rounded-md h-7 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-indigo-200/70 text-center">
                  <span className="block text-[10px] font-bold text-indigo-900 uppercase mb-0.5">Xế Mẫu giáo</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isLocked && !isAdmin}
                    value={preschoolData.snack_mau_giao || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                      setPreschoolData((prev) => ({
                        ...prev,
                        snack_mau_giao: val,
                        snack_count: (prev.snack_nha_tre || 0) + val,
                      }));
                    }}
                    className="w-full text-center text-sm font-black text-indigo-950 bg-white border border-indigo-300 rounded-md h-7 focus:outline-hidden"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TỔNG HỢP SUẤT ĂN CẢ LỚP VÀ KHẨU PHẦN */}
          <div className="bg-orange-50/30 p-3 rounded-xl border border-orange-200/80 space-y-2.5">
            <span className="text-[11px] font-black text-orange-950 uppercase tracking-wider block">
              Tổng hợp suất ăn bán trú toàn lớp hôm nay
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white p-2.5 rounded-xl border border-orange-300 text-center shadow-2xs">
                <span className="block text-[10px] font-bold text-orange-900 uppercase mb-1">
                  Tổng ăn bán trú *
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.boarding_count}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({ ...prev, boarding_count: val }));
                    const boardingIg = enabledIndicators.find((ig) => ig.name.toLowerCase().includes('bán trú'));
                    if (boardingIg) {
                      handleFieldChange(boardingIg.id, 'present', String(val));
                    }
                  }}
                  className="w-full text-center text-xl font-black text-orange-950 bg-orange-50/50 border border-orange-300 rounded-lg h-10 focus:ring-2 focus:ring-orange-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-amber-300 text-center shadow-2xs">
                <span className="block text-[10px] font-bold text-amber-900 uppercase mb-1">
                  Suất ăn trưa (Chính)
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.lunch_count}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({ ...prev, lunch_count: val }));
                  }}
                  className="w-full text-center text-xl font-black text-amber-950 bg-amber-50/50 border border-amber-300 rounded-lg h-10 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-amber-300 text-center shadow-2xs">
                <span className="block text-[10px] font-bold text-amber-900 uppercase mb-1">
                  Suất ăn xế / phụ
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.snack_count}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({ ...prev, snack_count: val }));
                  }}
                  className="w-full text-center text-xl font-black text-amber-950 bg-amber-50/50 border border-amber-300 rounded-lg h-10 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-300 text-center shadow-2xs">
                <span className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Số trẻ cắt cơm
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isLocked && !isAdmin}
                  value={preschoolData.canceled_count || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                    setPreschoolData((prev) => ({ ...prev, canceled_count: val }));
                  }}
                  className="w-full text-center text-xl font-black text-slate-800 bg-slate-50 border border-slate-300 rounded-lg h-10 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <span className="text-[11px] font-bold text-slate-600 uppercase">Chế độ khẩu phần:</span>
              <div className="flex flex-wrap gap-2">
                {[
                  { code: 'COM', label: 'Cơm thường' },
                  { code: 'CHAO', label: 'Cháo dinh dưỡng' },
                  { code: 'BOT', label: 'Bột' },
                  { code: 'HON_HOP', label: 'Hỗn hợp' },
                ].map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setPreschoolData((prev) => ({ ...prev, diet_type: item.code as any }))}
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      preschoolData.diet_type === item.code
                        ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* KHỐI 3: DANH SÁCH TRẺ NGHỈ & THEO DÕI SỨC KHỎE */}
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-rose-100 text-rose-800 font-black text-xs flex items-center justify-center">
                3
              </div>
              <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-rose-600" />
                DANH SÁCH TRẺ NGHỈ & THEO DÕI SỨC KHỎE
              </h4>
              {absentStudents.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-black">
                  {absentStudents.length} bé
                </span>
              )}
            </div>

            {(!isLocked || isAdmin) && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowQuickPaste(true)}
                  className="h-8 px-2.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all flex items-center gap-1 active:scale-95 flex-shrink-0 cursor-pointer"
                  title="Dán nhanh danh sách từ Zalo nhóm phụ huynh"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Dán từ Zalo</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddAbsentStudent}
                  className="h-8 px-2.5 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all flex items-center gap-1 active:scale-95 flex-shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm bé nghỉ</span>
                </button>
              </div>
            )}
          </div>

          {/* Chọn nhanh từ danh mục trẻ của lớp */}
          {classStudents.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                Bấm nhanh tên bé nghỉ từ danh sách lớp ({classStudents.length} trẻ)
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1 max-h-[140px] overflow-y-auto pr-1">
                {classStudents.map((student) => {
                  const isAbsent = absentStudents.some(
                    (s) => s.id === student.id || s.full_name.trim().toLowerCase() === student.full_name.trim().toLowerCase()
                  );
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => handleToggleStudentAbsence(student)}
                      className={`h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer select-none active:scale-95 ${
                        isAbsent
                          ? 'bg-rose-100 text-rose-800 border-rose-300 shadow-2xs'
                          : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      {isAbsent && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>}
                      <span>{student.full_name}</span>
                      {student.gender === 'FEMALE' && (
                        <span className="text-[10px] text-pink-500 font-bold">(Nữ)</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Danh sách các bé nghỉ */}
          {absentStudents.length === 0 ? (
            <div className="text-center py-5 bg-slate-50 rounded-xl border border-slate-200 border-dashed space-y-1.5">
              <UserX className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-600 font-bold">Hôm nay không có bé nào nghỉ (Lớp đi đủ 100%)</p>
              <p className="text-[11px] text-slate-400">
                Nếu có bé nghỉ, cô bấm chọn ở danh sách phía trên hoặc bấm nút "Thêm bé nghỉ".
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {absentStudents.map((student, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 relative"
                >
                  <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-red-100 text-red-700 text-[10px] flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      Trẻ nghỉ #{idx + 1}
                    </span>
                    {(!isLocked || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAbsentStudent(idx)}
                        className="h-6 px-2 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded flex items-center gap-1 transition-colors cursor-pointer"
                        title="Xóa bé này"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Xóa</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Họ và tên trẻ *
                      </label>
                      <input
                        type="text"
                        disabled={isLocked && !isAdmin}
                        value={student.full_name}
                        onChange={(e) => handleUpdateAbsentStudent(idx, 'full_name', e.target.value)}
                        placeholder="VD: Nguyễn Bảo An..."
                        className="w-full px-2.5 h-9 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100 font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Bản / Thôn / Tổ dân phố (Địa chỉ)
                      </label>
                      <input
                        type="text"
                        disabled={isLocked && !isAdmin}
                        value={student.address || ''}
                        onChange={(e) => handleUpdateAbsentStudent(idx, 'address', e.target.value)}
                        placeholder="Địa chỉ của bé..."
                        className="w-full px-2.5 h-9 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  {/* Lý do vắng */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Lý do bé nghỉ học (Sốt, ho, ốm, việc gia đình...)
                    </label>
                    <input
                      type="text"
                      disabled={isLocked && !isAdmin}
                      value={student.reason || ''}
                      onChange={(e) => handleUpdateAbsentStudent(idx, 'reason', e.target.value)}
                      placeholder="Gõ lý do hoặc bấm chọn bên dưới..."
                      className="w-full px-2.5 h-9 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
                    />

                    {(!isLocked || isAdmin) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {QUICK_REASONS.map((reason) => (
                          <button
                            key={reason}
                            type="button"
                            onClick={() => handleUpdateAbsentStudent(idx, 'reason', reason)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all active:scale-95 whitespace-nowrap cursor-pointer ${
                              student.reason === reason
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-200/80 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            + {reason}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Theo dõi sức khỏe tại lớp */}
          <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="bg-rose-50/30 p-2.5 rounded-xl border border-rose-200">
              <label className="block text-[10px] font-bold text-rose-900 uppercase mb-1">
                Số trẻ cần theo dõi sức khỏe
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={isLocked && !isAdmin}
                value={preschoolData.health_issue_count || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10) || 0;
                  setPreschoolData((prev) => ({ ...prev, health_issue_count: val }));
                }}
                className="w-full text-center text-lg font-black text-rose-900 bg-white border border-rose-300 rounded-lg h-9 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                placeholder="0"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Ghi chú dặn dò y tế / uống thuốc / theo dõi sức khỏe trẻ
              </label>
              <input
                type="text"
                disabled={isLocked && !isAdmin}
                value={preschoolData.health_note || ''}
                onChange={(e) => setPreschoolData((prev) => ({ ...prev, health_note: e.target.value }))}
                placeholder="VD: Bé Lan ho nhẹ dặn cô cho uống siro sau ăn trưa..."
                className="w-full px-3 h-9 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* General Notes */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Ghi chú thêm của Giáo viên dạy (nếu có)
            </label>
            <input
              type="text"
              disabled={isLocked && !isAdmin}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tình hình chung của lớp hôm nay..."
              className="w-full px-3 h-9 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:bg-slate-100"
            />
          </div>
        </div>

        {/* Validation Errors Box */}
        {validationErrors.length > 0 && (
          <div id="validation-error-box" className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 space-y-1.5 animate-in shake duration-150">
            <div className="flex items-center gap-2 text-red-800 font-bold text-xs sm:text-sm">
              <ShieldAlert className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>Chưa thể gửi báo cáo - Vui lòng kiểm tra lại:</span>
            </div>
            <ul className="list-disc list-inside text-xs text-red-700 font-medium space-y-1">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-bold text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Desktop inline action buttons */}
        <div className="hidden sm:block pt-2">
          {!isLocked ? (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={!isValid}
                className={`flex-1 h-12 rounded-2xl text-base font-black transition-all flex items-center justify-center gap-2 ${
                  isValid
                    ? 'text-white bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl focus:ring-4 focus:ring-blue-300 active:scale-99 cursor-pointer'
                    : 'text-slate-500 bg-slate-200 border border-slate-300 cursor-not-allowed opacity-80'
                }`}
              >
                <Send className="w-5 h-5" />
                <span>
                  {isValid
                    ? (existingReport ? 'CẬP NHẬT BÁO CÁO SĨ SỐ' : 'GỬI BÁO CÁO SĨ SỐ')
                    : 'VUI LÒNG NHẬP ĐỦ SỐ LIỆU ĐỂ GỬI BÁO CÁO'}
                </span>
              </button>

              {existingReport && canReset && (
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(true)}
                  className="h-12 px-4 rounded-2xl text-xs sm:text-sm font-bold border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-400 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
                  title="Hủy báo cáo này và đưa về trạng thái Chưa báo cáo nếu đã báo cáo nhầm"
                >
                  <RotateCcw className="w-4 h-4 text-rose-600" />
                  <span>RESET BÁO CÁO NHẦM</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="flex-1 h-11 rounded-xl text-sm font-bold text-slate-500 bg-slate-100 flex items-center justify-center gap-2">
                <Lock className="w-4 h-4" /> Báo cáo đã khóa bởi BGH
              </div>
              <button
                type="button"
                onClick={() => onNavigate && onNavigate('/dashboard')}
                className="flex-1 h-11 rounded-xl text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Về bảng điều khiển
              </button>
            </div>
          )}
        </div>
      </form>

      {/* 5. STICKY BOTTOM ACTION BAR FOR MOBILE (Chuyên dụng cho điện thoại) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2.5 shadow-xl">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2.5">
          {mobileSummary && (
            <div className="leading-tight">
              <div className="text-[11px] font-extrabold text-slate-800">
                {selectedClass?.class_name || 'Lớp'}: {mobileSummary.present}/{mobileSummary.total}
              </div>
              <div className="text-[10px] font-semibold text-red-600">
                Vắng: {mobileSummary.absent} em
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-1 justify-end">
            {!isLocked ? (
              <>
                {existingReport && canReset && (
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmModal(true)}
                    className="h-11 px-2.5 rounded-xl font-bold text-xs border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center justify-center gap-1 transition-colors flex-shrink-0"
                    title="Reset về Chưa báo cáo nếu báo cáo nhầm"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                    <span>Reset nhầm</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={!isValid}
                  className={`h-11 px-4 rounded-xl font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 flex-1 max-w-[240px] whitespace-nowrap transition-all ${
                    isValid
                      ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white'
                      : 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed opacity-80'
                  }`}
                >
                  <Send className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {isValid
                      ? (existingReport ? 'CẬP NHẬT BÁO CÁO' : 'GỬI BÁO CÁO')
                      : 'CHƯA NHẬP ĐỦ SỐ LIỆU'}
                  </span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2 w-full justify-end">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Đã khóa
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('/dashboard')}
                  className="h-10 px-3 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 active:scale-95"
                >
                  Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6. Quick Paste Modal from Zalo */}
      {showQuickPaste && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-emerald-800">
                <ClipboardList className="w-5 h-5 text-emerald-600" />
                <h3 className="font-black text-sm sm:text-base">Dán nhanh từ Zalo / Tin nhắn phụ huynh</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickPaste(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p>Thầy/Cô có thể copy và dán nguyên danh sách phụ huynh nhắn từ Zalo vào đây:</p>
              <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 font-mono">
                Ví dụ:<br />
                1. Lò Văn Nam - Ốm (Bản Huổi Hốc)<br />
                2. Cầm Thị Mai - Có phép<br />
                3. Quàng Văn Minh (Gia đình có việc)
              </div>
            </div>

            <textarea
              rows={5}
              value={quickPasteText}
              onChange={(e) => setQuickPasteText(e.target.value)}
              placeholder="Dán nội dung tin nhắn Zalo vào đây..."
              className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-sans"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowQuickPaste(false);
                  setQuickPasteText('');
                }}
                className="h-10 px-4 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleApplyQuickPaste}
                disabled={!quickPasteText.trim()}
                className="h-10 px-4 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-md active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Áp dụng danh sách</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal xác nhận Reset Báo cáo nhầm về Chưa báo cáo */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="p-5 sm:p-6 bg-gradient-to-br from-rose-50 to-orange-50 border-b border-rose-100 flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <RotateCcw className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  Xác nhận Reset Báo Cáo Nhầm
                </h3>
                <p className="text-xs text-rose-700 font-semibold mt-0.5">
                  Đưa lớp về trạng thái CHƯA BÁO CÁO
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Lớp học:</span>
                  <span className="font-extrabold text-slate-900 text-sm">Lớp {selectedClass?.class_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Ngày báo cáo:</span>
                  <span className="font-bold text-slate-800">{reportDate.split('-').reverse().join('/')}</span>
                </div>
                {existingReport?.reported_time && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Giờ đã báo cáo:</span>
                    <span className="font-mono font-bold text-slate-700">{existingReport.reported_time}</span>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  Lưu ý khi reset báo cáo:
                </div>
                Dữ liệu sĩ số đã lưu của lớp vào ngày này sẽ được xóa hoàn toàn. Bảng tổng hợp toàn trường sẽ chuyển lớp về trạng thái <strong className="text-amber-950">Chưa báo cáo</strong> cho đến khi Thầy/Cô nộp lại.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleResetReport}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isResetting ? 'Đang reset...' : 'XÁC NHẬN RESET VỀ CHƯA BÁO CÁO'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal quản lý danh sách học sinh của lớp */}
      {showRosterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-blue-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Danh Sách Học Sinh Lớp {selectedClass?.class_name}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-bold">
                    Tổng số học sinh hiện tại: {classStudents.length} em
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRosterModal(false)}
                className="w-8 h-8 rounded-full hover:bg-white flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
              
              {/* Tabs / Switcher for Bulk vs Single */}
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <button
                  type="button"
                  onClick={() => setShowBulkImport(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    !showBulkImport
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Thêm từng em
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkImport(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    showBulkImport
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Nhập danh sách hàng loạt (Bulk)
                </button>
              </div>

              {/* Add form */}
              {!showBulkImport ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Thêm Học Sinh Mới
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Họ và tên học sinh
                      </label>
                      <input
                        type="text"
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        placeholder="Ví dụ: Nguyễn Văn A"
                        className="w-full px-3 h-10 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Địa chỉ / Bản thôn (Tương ứng bảng mẫu)
                      </label>
                      <input
                        type="text"
                        value={newStudentAddress}
                        onChange={(e) => setNewStudentAddress(e.target.value)}
                        placeholder="Ví dụ: Bản Suối Lư"
                        className="w-full px-3 h-10 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleAddSingleStudent}
                      disabled={!newStudentName.trim()}
                      className="h-9 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm vào danh sách</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Nhập Hàng Loạt Từ Excel / Word / Zalo
                    </h4>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Mỗi dòng một học sinh. Hệ thống hỗ trợ tách Địa chỉ nếu phân tách bằng dấu gạch ngang (<code>-</code>) hoặc dấu phẩy (<code>,</code>).<br />
                    Ví dụ:<br />
                    Nguyễn Văn A - Bản Suối Lư<br />
                    Lê Thị B - Bản Pa Háng
                  </p>
                  <textarea
                    rows={6}
                    value={bulkStudentText}
                    onChange={(e) => setBulkStudentText(e.target.value)}
                    placeholder="Dán danh sách học sinh vào đây..."
                    className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleBulkImportStudents}
                      disabled={!bulkStudentText.trim()}
                      className="h-9 px-4 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 active:scale-95 shadow-md"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Nhập danh sách học sinh</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Roster list */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                  Danh Sách Học Sinh Của Lớp ({classStudents.length})
                </h4>
                {classStudents.length === 0 ? (
                  <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200 border-dashed text-slate-400">
                    <User className="w-8 h-8 mx-auto opacity-35 mb-2" />
                    <p className="text-xs font-bold text-slate-500">Chưa có học sinh nào được thêm</p>
                    <p className="text-[10px] text-slate-400 mt-1">Sử dụng form bên trên để đăng ký danh sách lớp.</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-extrabold uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-4 w-12 text-center">STT</th>
                          <th className="py-2.5 px-4">Họ và tên</th>
                          <th className="py-2.5 px-4">Địa chỉ / Bản thôn</th>
                          <th className="py-2.5 px-4 w-24 text-center">Hành động</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classStudents.map((student, sIdx) => {
                          const isEditing = editingStudentId === student.id;
                          return (
                            <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2 px-4 text-center font-bold text-slate-400">{sIdx + 1}</td>
                              <td className="py-2 px-4 font-bold text-slate-800">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingStudentName}
                                    onChange={(e) => setEditingStudentName(e.target.value)}
                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                  />
                                ) : (
                                  student.full_name
                                )}{' '}
                                <span className="text-[9px] font-mono text-slate-400 ml-1">({student.id.split('_').pop()})</span>
                              </td>
                              <td className="py-2 px-4 text-slate-600">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editingStudentAddress}
                                    onChange={(e) => setEditingStudentAddress(e.target.value)}
                                    className="w-full px-2 py-1 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                  />
                                ) : (
                                  student.address || <em className="text-slate-400">Không có</em>
                                )}
                              </td>
                              <td className="py-2 px-4 text-center">
                                {isEditing ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={handleSaveEditStudent}
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md"
                                      title="Lưu"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingStudentId(null)}
                                      className="p-1 text-slate-400 hover:bg-slate-100 rounded-md"
                                      title="Hủy"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditStudent(student)}
                                      className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                                      title="Sửa học sinh"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStudent(student.id, student.full_name)}
                                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                                      title="Xóa học sinh"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowRosterModal(false)}
                className="px-5 h-10 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              >
                Đóng lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
