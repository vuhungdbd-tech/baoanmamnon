import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSchool } from '../contexts/SchoolContext';
import { useAuth } from '../contexts/AuthContext';
import { StorageService, subscribeRealtime } from '../services/storage';
import { ClassReportRow, PreschoolDailyData, PreschoolSchoolTotals, getPreschoolGradeLabel, PRESCHOOL_BIRTH_YEARS, parseSchoolStartYear, getPreschoolBirthYearsForSchoolYear } from '../types';
import { DateNavigator } from '../components/DateNavigator';
import { CampusSelector } from '../components/CampusSelector';
import ExcelJS from 'exceljs';
import {
  Printer,
  Download,
  ArrowLeft,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  RotateCcw,
  AlertCircle,
  X,
  CheckCircle,
  RefreshCw,
  Baby,
  Utensils,
  HeartPulse,
  Users,
  Building2,
  Sparkles,
  LayoutGrid,
  ShieldCheck,
} from 'lucide-react';

interface DailyReportPageProps {
  onNavigate?: (path: string) => void;
}

export const DailyReportPage: React.FC<DailyReportPageProps> = ({ onNavigate }) => {
  const { settings, indicators, campuses, classes, students, preschoolGrades, activeYear } = useSchool();
  const { isGVCN, currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';
  const isBGH = currentUser?.role === 'BGH';

  // Helper to detect Nhà Trẻ class (NT...) - declared before use in useMemo hooks
  const isNhaTreClass = useCallback((clsName?: string, grade?: any): boolean => {
    if (grade !== undefined && grade !== null) {
      if (grade === 1 || grade === '1' || grade === 'NHA_TRE') return true;
      const matchedPg = preschoolGrades?.find((p) => p.grade_num === Number(grade));
      if (matchedPg && matchedPg.category === 'NHA_TRE') return true;
      const gStr = typeof grade === 'string' ? grade.toUpperCase() : String(grade).toUpperCase();
      if (gStr.includes('NHA_TRE') || gStr.includes('NHÀ TRẺ') || gStr.includes('NHA TRE')) return true;
    }
    const upper = (clsName ? String(clsName) : '').toUpperCase().trim();
    return upper.startsWith('NT') || upper.includes('NHÀ TRẺ') || upper.includes('NHA TRE') || upper.includes('NHÓM TRẺ') || upper.includes('NHOM TRE');
  }, [preschoolGrades]);

  const startYear = useMemo(() => {
    return parseSchoolStartYear(activeYear?.name);
  }, [activeYear?.name]);

  // Năm sinh tịnh tiến theo Năm học:
  // Nhà trẻ: startYear (< 1T), startYear - 1 (1-2T), startYear - 2 (2-3T)
  // Mẫu giáo: startYear - 3 (3-4T Bé), startYear - 4 (4-5T Nhỡ), startYear - 5 (5-6T Lớn)
  const yNt0 = String(startYear);
  const yNt1 = String(startYear - 1);
  const yNt2 = String(startYear - 2);
  const yMgBe = String(startYear - 3);
  const yMgNho = String(startYear - 4);
  const yMgLon = String(startYear - 5);

  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [selectedCampusId, setSelectedCampusId] = useState<string>(() => {
    if (isGVCN && currentUser?.assigned_class_id) {
      const cls = classes.find((c) => c.id === currentUser.assigned_class_id);
      return cls?.campus_id || 'all';
    }
    return 'all';
  });

  const [viewMode, setViewMode] = useState<'PRESCHOOL_ORIGINAL_EXCEL' | 'PRESCHOOL_AGE_BOARDING' | 'PRESCHOOL_DETAILED' | 'PRESCHOOL_COMPACT'>('PRESCHOOL_ORIGINAL_EXCEL');

  const [reportData, setReportData] = useState<{
    date: string;
    totalClasses: number;
    reportedClasses: number;
    unreportedClasses?: number;
    rows: ClassReportRow[];
    totals: Record<string, { total: number; present: number; absent: number; rate: number }>;
    overallSchool: { total: number; present: number; absent: number; rate: number; presentRate: number };
    preschoolTotals?: PreschoolSchoolTotals;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Reset Manager State
  const [showResetManager, setShowResetManager] = useState(false);
  const [managerDate, setManagerDate] = useState(selectedDate);
  const [managerData, setManagerData] = useState<{
    rows: ClassReportRow[];
    reportedClasses: number;
    totalClasses: number;
  } | null>(null);
  const [managerLoading, setManagerLoading] = useState(false);

  const [confirmResetModal, setConfirmResetModal] = useState<{
    classId: string;
    className: string;
    date: string;
  } | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const loadReportData = useCallback(async (showIndicator = true) => {
    if (showIndicator) setLoading(true);
    try {
      const data = await StorageService.getDailyAggregate(selectedDate, selectedCampusId);
      setReportData(data);
    } catch (err) {
      console.error('Failed to load report data:', err);
    } finally {
      if (showIndicator) setLoading(false);
    }
  }, [selectedDate, selectedCampusId]);

  useEffect(() => {
    loadReportData(true);

    // Lắng nghe realtime từ GVCN nộp báo cáo hoặc reset báo cáo
    const unsub = subscribeRealtime((event) => {
      if (event.table === 'daily_reports' || event.table === 'daily_report_values') {
        loadReportData(false);
      }
    });

    return () => {
      unsub();
    };
  }, [loadReportData]);

  const loadManagerData = async (dateStr: string) => {
    setManagerLoading(true);
    try {
      const data = await StorageService.getDailyAggregate(dateStr, selectedCampusId);
      setManagerData(data);
    } catch (err) {
      console.error('Failed to load manager data:', err);
    } finally {
      setManagerLoading(false);
    }
  };

  useEffect(() => {
    if (showResetManager) {
      loadManagerData(managerDate);
    }
  }, [showResetManager, managerDate, selectedCampusId]);

  const handlePromptReset = (classId: string, className: string, dateStr: string = selectedDate) => {
    setConfirmResetModal({ classId, className, date: dateStr });
  };

  const handleConfirmReset = async () => {
    if (!confirmResetModal || !currentUser) return;
    setIsResetting(true);
    try {
      const ok = await StorageService.deleteDailyReport(confirmResetModal.classId, confirmResetModal.date, currentUser);
      if (ok) {
        setToastMessage(`Đã reset báo cáo lớp ${confirmResetModal.className} ngày ${confirmResetModal.date.split('-').reverse().join('/')} về trạng thái Chưa báo cáo thành công!`);
        setTimeout(() => setToastMessage(''), 5000);
        setConfirmResetModal(null);
        if (confirmResetModal.date === selectedDate) {
          await loadReportData();
        }
        if (showResetManager) {
          await loadManagerData(managerDate);
        }
      }
    } catch (err) {
      console.error('Reset report error:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Parse date into day, month, year for official Vietnamese report header
  const dateParts = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split('-');
      return { day: d, month: m, year: y };
    } catch {
      const d = new Date();
      return { day: String(d.getDate()).padStart(2, '0'), month: String(d.getMonth() + 1).padStart(2, '0'), year: String(d.getFullYear()) };
    }
  }, [selectedDate]);

  const formattedSchoolName = useMemo(() => {
    let name = settings?.school_name || 'TRƯỜNG PTDTBT THCS XA DUNG';
    if (!name.toUpperCase().startsWith('TRƯỜNG')) {
      name = 'TRƯỜNG ' + name;
    }
    return name.toUpperCase();
  }, [settings?.school_name]);

  // Tiêu đề mẫu: mặc định hiển thị "BÁO CÁO SĨ SỐ HỌC SINH NGÀY .......THÁNG ...... NĂM 2026"
  const [blankDateInTitle, setBlankDateInTitle] = useState(true);

  const baseTitle = useMemo(() => {
    let raw = settings?.report_title || 'BIỂU THỐNG KÊ TỔNG HỢP THEO DÕI TRẺ HÀNG NGÀY';
    raw = raw.replace('BÁO CÁO HỌC SINH SĨ SỐ HỌC SINH', 'BÁO CÁO SĨ SỐ HỌC SINH');
    return raw;
  }, [settings?.report_title]);

  const displayTitle = useMemo(() => {
    if (blankDateInTitle) {
      return `${baseTitle} NGÀY .......THÁNG ...... NĂM ${dateParts.year}`;
    }
    return `${baseTitle} NGÀY ${dateParts.day} THÁNG ${dateParts.month} NĂM ${dateParts.year}`;
  }, [baseTitle, blankDateInTitle, dateParts]);

  const signatureSettings = useMemo(() => {
    if (selectedCampusId !== 'all') {
      const c = campuses.find(c => c.id === selectedCampusId);
      if (c) {
        return {
          reporter_title: c.reporter_title || settings?.reporter_title || 'NGƯỜI LẬP BIỂU',
          reporter_name: c.reporter_name || settings?.reporter_name || 'Trần Thanh Tú',
          principal_title: c.principal_title || settings?.principal_title || 'PHÓ HIỆU TRƯỞNG',
          principal_name: c.principal_name || settings?.principal_name || 'Kiều Việt Hưng',
        };
      }
    }
    return {
      reporter_title: settings?.reporter_title || 'NGƯỜI LẬP BIỂU',
      reporter_name: settings?.reporter_name || 'Trần Thanh Tú',
      principal_title: settings?.principal_title || 'PHÓ HIỆU TRƯỞNG',
      principal_name: settings?.principal_name || 'Kiều Việt Hưng',
    };
  }, [selectedCampusId, campuses, settings]);

  const enabledIndicators = useMemo(() => {
    return (indicators || [])
      .filter((i) => i && (i.enabled || (i as any).is_active))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [indicators]);

  // 1. Group 1: Học sinh toàn trường (id: ig_all hoặc code: ALL hoặc chỉ tiêu đầu tiên)
  const allIndicator = useMemo(() => {
    return enabledIndicators.find((i) => i.code === 'ALL' || i.id === 'ig_all') || enabledIndicators[0];
  }, [enabledIndicators]);

  // 2. Group 2: Học sinh bán trú (id: ig_boarding_half hoặc code: BOARDING_HALF hoặc có chứa chữ bán trú)
  const boardingIndicator = useMemo(() => {
    return enabledIndicators.find(
      (i) => i.code === 'BOARDING_HALF' || i.id === 'ig_boarding_half' || (i.name || '').toLowerCase().includes('bán trú')
    ) || enabledIndicators[1];
  }, [enabledIndicators]);

  // Tổng hợp thống kê Mầm Non toàn trường từ báo cáo các lớp
  const preschoolTotals = useMemo<PreschoolSchoolTotals>(() => {
    const totals: PreschoolSchoolTotals = {
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
      boardingNhaTre: 0,
      boardingMauGiao: 0,
      lunchCount: 0,
      lunchNhaTre: 0,
      lunchMauGiao: 0,
      snackCount: 0,
      snackNhaTre: 0,
      snackMauGiao: 0,
      canceledCount: 0,
      healthIssueCount: 0,
      attendanceRate: 0,
      boardingRate: 0,
      totalNhaTre: 0,
      totalMauGiao: 0,
      presentNhaTre: 0,
      presentMauGiao: 0,
      absentNhaTre: 0,
      absentMauGiao: 0,
      byYear: {
        [String(startYear)]: { total: 0, present: 0, absent: 0, boarding: 0 },
        [yNt1]: { total: 0, present: 0, absent: 0, boarding: 0 },
        [yNt2]: { total: 0, present: 0, absent: 0, boarding: 0 },
        [yMgBe]: { total: 0, present: 0, absent: 0, boarding: 0 },
        [yMgNho]: { total: 0, present: 0, absent: 0, boarding: 0 },
        [yMgLon]: { total: 0, present: 0, absent: 0, boarding: 0 },
      },
    };

    if (!reportData || !reportData.rows) return totals;

    reportData.rows.forEach((row) => {
      if (!row) return;
      const isReported = row.status !== 'NOT_REPORTED';
      const ps = row.preschool || row.report?.preschool_data;
      const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;
      const cls = row.classItem;
      const total = allVal?.total ?? (cls?.student_count || 0);
      const absent = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
      const present = allVal?.present ?? Math.max(0, total - absent);

      if (isReported) {
        totals.totalStudents += total;
        totals.presentStudents += present;
        totals.absentStudents += absent;

        totals.femaleStudents += Number(ps?.female_count) || 0;
        totals.ethnicStudents += Number(ps?.ethnic_count) || 0;
        totals.femaleEthnicStudents += Number(ps?.female_ethnic_count) || 0;
        totals.poorStudents += Number(ps?.poor_count) || 0;
        totals.disabledStudents += Number(ps?.disabled_count) || 0;

        totals.presentFemale += Number(ps?.present_female_count) || Math.min(Number(ps?.female_count) || 0, present);
        totals.presentEthnic += Number(ps?.present_ethnic_count) || Math.min(Number(ps?.ethnic_count) || 0, present);

        const absEx = ps?.absent_excused ?? (row.report?.absent_students?.filter((s) => s.is_excused).length || 0);
        totals.absentExcused += absEx;
        totals.absentUnexcused += ps?.absent_unexcused ?? Math.max(0, absent - absEx);

        const isNT = isNhaTreClass(row.classItem?.class_name, row.classItem?.grade);
        let board = Number(ps?.boarding_count);
        if (isNaN(board) || board <= 0) {
          if (boardingIndicator && row.values?.[boardingIndicator.id]?.total) {
            board = row.values[boardingIndicator.id].total;
          } else if (present > 0) {
            board = present;
          } else {
            board = 0;
          }
        }

        let bNT = Number(ps?.boarding_nha_tre) || 0;
        let bMG = Number(ps?.boarding_mau_giao) || 0;
        if (isNT) {
          if (bNT === 0 && (board > 0 || present > 0)) bNT = board > 0 ? board : present;
          board = bNT;
        } else {
          if (bMG === 0 && (board > 0 || present > 0)) bMG = board > 0 ? board : present;
          board = bMG;
        }

        totals.boardingCount += board;
        totals.lunchCount += Number(ps?.lunch_count) || board;
        totals.snackCount += Number(ps?.snack_count) || board;
        totals.canceledCount += Number(ps?.canceled_count) || 0;

        totals.healthIssueCount += Number(ps?.health_issue_count) || 0;

        // Báo ăn Nhà trẻ vs Mẫu giáo
        totals.boardingNhaTre = (totals.boardingNhaTre || 0) + bNT;
        totals.boardingMauGiao = (totals.boardingMauGiao || 0) + bMG;
        totals.lunchNhaTre = (totals.lunchNhaTre || 0) + (Number(ps?.lunch_nha_tre) || bNT);
        totals.lunchMauGiao = (totals.lunchMauGiao || 0) + (Number(ps?.lunch_mau_giao) || bMG);
        totals.snackNhaTre = (totals.snackNhaTre || 0) + (Number(ps?.snack_nha_tre) || bNT);
        totals.snackMauGiao = (totals.snackMauGiao || 0) + (Number(ps?.snack_mau_giao) || bMG);

        // Sĩ số & Có mặt Nhà trẻ vs Mẫu giáo
        totals.totalNhaTre = (totals.totalNhaTre || 0) + (Number(ps?.total_nha_tre) || (isNT ? total : 0));
        totals.totalMauGiao = (totals.totalMauGiao || 0) + (Number(ps?.total_mau_giao) || (!isNT ? total : 0));
        totals.presentNhaTre = (totals.presentNhaTre || 0) + (Number(ps?.present_nha_tre) || (isNT ? present : 0));
        totals.presentMauGiao = (totals.presentMauGiao || 0) + (Number(ps?.present_mau_giao) || (!isNT ? present : 0));
        totals.absentNhaTre = (totals.absentNhaTre || 0) + (Number(ps?.absent_nha_tre) || (isNT ? absent : 0));
        totals.absentMauGiao = (totals.absentMauGiao || 0) + (Number(ps?.absent_mau_giao) || (!isNT ? absent : 0));

        // Thống kê theo từng năm sinh (2025, 2024, 2023, 2022, 2021...)
        if (ps?.age_stats && totals.byYear) {
          Object.entries(ps.age_stats).forEach(([yr, stats]: [string, any]) => {
            if (!totals.byYear![yr]) {
              totals.byYear![yr] = { total: 0, present: 0, absent: 0, boarding: 0 };
            }
            const p = Number(stats?.present) || 0;
            const b = Number(stats?.boarding);
            totals.byYear![yr].total += Number(stats?.total) || 0;
            totals.byYear![yr].present += p;
            totals.byYear![yr].absent += Number(stats?.absent) || Math.max(0, (Number(stats?.total) || 0) - p);
            totals.byYear![yr].boarding += (b !== undefined && b !== null && b > 0) ? b : p; // Đồng bộ suất ăn với số trẻ có mặt
          });
        }
      }
    });

    totals.attendanceRate = totals.totalStudents > 0 ? (totals.presentStudents / totals.totalStudents) * 100 : 0;
    totals.boardingRate = totals.presentStudents > 0 ? (totals.boardingCount / totals.presentStudents) * 100 : 0;
    return totals;
  }, [reportData, allIndicator, boardingIndicator, startYear, isNhaTreClass]);

  // Sorted classes matching the original document (All Nhà Trẻ first STT 1..13, then All Mẫu Giáo STT 14..)
  const sortedClassesForTemplate = useMemo(() => {
    if (!reportData?.rows) return [];
    const list = reportData.rows.filter((r) => r && (r.classItem || (r as any).className));
    return list.sort((a, b) => {
      const clsA = a.classItem;
      const clsB = b.classItem;
      const aIsNT = isNhaTreClass(clsA?.class_name || (a as any).className, clsA?.grade ?? (a as any).grade);
      const bIsNT = isNhaTreClass(clsB?.class_name || (b as any).className, clsB?.grade ?? (b as any).grade);
      if (aIsNT && !bIsNT) return -1;
      if (!aIsNT && bIsNT) return 1;
      return (clsA?.sort_order || 0) - (clsB?.sort_order || 0);
    });
  }, [reportData?.rows, isNhaTreClass]);

  // Subtotal for Khối Nhà Trẻ (Row 6 in the original image)
  const nhaTreSubtotal = useMemo(() => {
    let boardingNT = 0;
    let yNt0Val = 0;
    let yNt1Val = 0;
    let yNt2Val = 0;
    let present = 0;
    let total = 0;
    let sickCount = 0;

    sortedClassesForTemplate.forEach((row) => {
      if (!row) return;
      const cls = row.classItem;
      const clsName = cls?.class_name || (row as any).className;
      const clsGrade = cls?.grade ?? (row as any).grade;
      if (!isNhaTreClass(clsName, clsGrade)) return;
      const isReported = row.status !== 'NOT_REPORTED';
      const ps = row.preschool || row.report?.preschool_data;
      const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;
      const rowTotal = allVal?.total ?? (cls?.student_count || 0);
      const rowAbsent = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
      const rowPresent = allVal?.present ?? Math.max(0, rowTotal - rowAbsent);

      total += rowTotal;
      if (isReported) {
        present += rowPresent;
        const b = ps?.boarding_nha_tre ?? ps?.boarding_count ?? (boardingIndicator && row.values ? (row.values[boardingIndicator.id]?.total || 0) : 0);
        boardingNT += b;

        const stNt0 = ps?.age_stats?.[yNt0];
        const stNt1 = ps?.age_stats?.[yNt1];
        const stNt2 = ps?.age_stats?.[yNt2];
        yNt0Val += Number(stNt0?.present ?? stNt0?.total ?? 0);
        yNt1Val += Number(stNt1?.present ?? stNt1?.total ?? 0);
        yNt2Val += Number(stNt2?.present ?? stNt2?.total ?? 0);

        const sick = (ps?.health_issue_count || 0) + (row.report?.absent_students?.filter((s: any) => {
          const r = (s?.reason || '').toLowerCase();
          return r.includes('ốm') || r.includes('viện') || r.includes('sốt') || r.includes('bệnh');
        }).length || 0);
        sickCount += sick;
      }
    });

    return { boardingNT, yNt0Val, yNt1Val, yNt2Val, present, total, sickCount };
  }, [sortedClassesForTemplate, allIndicator, boardingIndicator, yNt0, yNt1, yNt2, isNhaTreClass]);

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  // Helper to resolve student address based on ID, Name fallback, and database lookup
  const getResolvedAddress = (s: any, classId: string): string => {
    // 1. Try matching with ID
    if (s.id) {
      const match = students.find((std) => std.id === s.id);
      if (match && match.address) return match.address;
    }
    // 2. Try matching with name (case-insensitive) within same class
    if (s.full_name) {
      const match = students.find(
        (std) => std.class_id === classId && std.full_name.trim().toLowerCase() === s.full_name.trim().toLowerCase()
      );
      if (match && match.address) return match.address;
    }
    // 3. Fallback to existing student address recorded on report
    return s.address || '';
  };

  // Helper to extract absent names/notes for a class
  const getAbsentStudentText = (row: ClassReportRow): string => {
    if (row.report?.absent_students && row.report.absent_students.length > 0) {
      const listStr = row.report.absent_students
        .map((s) => `${s.full_name}${s.isBoarding ? ' (Bán Trú)' : ' (Ngoại Trú)'}${s.reason ? ` (${s.reason})` : ''}`)
        .join('\n');
      if (row.report.notes && !listStr.includes(row.report.notes)) {
        return `${listStr}\n- Ghi chú: ${row.report.notes}`;
      }
      return listStr;
    }
    return row.report?.notes || '';
  };

  // Helper to extract absent student addresses matched to names
  const getAbsentStudentAddresses = (row: ClassReportRow): string => {
    if (row.report?.absent_students && row.report.absent_students.length > 0) {
      const classId = row.classItem?.id || (row as any).classId || '';
      return row.report.absent_students
        .map((s) => {
          const addr = getResolvedAddress(s, classId);
          return addr && addr.trim() !== '' ? addr : '-';
        })
        .join('\n'); // Using newline for better visual alignment in multi-line cells
    }
    return '-';
  };

  // Export Excel for Preschool Statistics (Biểu thống kê tổng hợp Mầm Non chuẩn)
  const handleExportExcel = async (exportBlankTemplate: boolean = false) => {
    if (!reportData && !exportBlankTemplate) return;
    setExporting(true);

    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Phần mềm Quản lý Sĩ số Mầm Non';
      wb.created = new Date();

      // Standard thin black border for every cell
      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      };

      // NẾU ĐANG Ở CHẾ ĐỘ MẪU BÁO CÁO GỐC: XUẤT CHUẨN XÁC THEO HÌNH ẢNH GỐC (13 CỘT, DÒNG 6 CỘNG NT, CỘT VÀNG ĐI HỌC)
      if (viewMode === 'PRESCHOOL_ORIGINAL_EXCEL') {
        const ws = wb.addWorksheet('BaoCaoSiSo', {
          pageSetup: {
            orientation: 'landscape',
            paperSize: 9, // A4
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: {
              left: 0.3,
              right: 0.3,
              top: 0.4,
              bottom: 0.4,
              header: 0.2,
              footer: 0.2,
            },
          },
        });

        // 14 cột chuẩn theo hình ảnh gốc (đã bổ sung cột trẻ sinh năm yNt0)
        ws.columns = [
          { key: 'stt', width: 6 },
          { key: 'class', width: 26 },
          { key: 'anNhaTre', width: 13 },
          { key: 'anMauGiao', width: 13 },
          { key: 'yNt0', width: 8 },
          { key: 'yNt1', width: 8 },
          { key: 'yNt2', width: 8 },
          { key: 'yMgBe', width: 8 },
          { key: 'yMgNho', width: 8 },
          { key: 'yMgLon', width: 8 },
          { key: 'present', width: 18 },
          { key: 'total', width: 18 },
          { key: 'rate', width: 15 },
          { key: 'notes', width: 28 },
        ];

        // Dòng 1: Tiêu đề in hoa chuẩn theo hình ảnh gốc
        ws.mergeCells('A1:N1');
        const t1 = ws.getCell('A1');
        t1.value = `BÁO CÁO SỐ TRẺ THÁNG ${dateParts.month}/${dateParts.year}`;
        t1.font = { name: 'Times New Roman', size: 14, bold: true };
        t1.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(1).height = 26;

        // Dòng 2: Phụ đề in nghiêng chuẩn theo hình ảnh gốc
        ws.mergeCells('A2:N2');
        const t2 = ws.getCell('A2');
        t2.value = '(Báo cáo sĩ số trước 8h sáng hằng ngày)';
        t2.font = { name: 'Times New Roman', size: 10, italic: true };
        t2.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(2).height = 18;

        // Dòng 3: Ngày báo cáo căn giữa chuẩn theo hình ảnh gốc
        ws.mergeCells('A3:N3');
        const t3 = ws.getCell('A3');
        t3.value = `Ngày ${dateParts.day}/${dateParts.month}/${dateParts.year}`;
        t3.font = { name: 'Times New Roman', size: 10, bold: true };
        t3.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(3).height = 18;

        // Dòng 4: Tiêu đề các cột chuẩn theo hình ảnh gốc
        const headerCols = [
          { col: 'A', title: 'STT' },
          { col: 'B', title: 'Lớp' },
          { col: 'C', title: 'Ăn nhà trẻ' },
          { col: 'D', title: 'Ăn mẫu giáo' },
          { col: 'E', title: `Sinh ${yNt0}` },
          { col: 'F', title: `Sinh ${yNt1}` },
          { col: 'G', title: `Sinh ${yNt2}` },
          { col: 'H', title: `Sinh ${yMgBe}` },
          { col: 'I', title: `Sinh ${yMgNho}` },
          { col: 'J', title: `Sinh ${yMgLon}` },
          { col: 'K', title: 'Tổng số trẻ đi học', yellow: true },
          { col: 'L', title: 'Tổng số trẻ của lớp', yellow: true },
          { col: 'M', title: 'Tỷ lệ trẻ đi học', yellow: true },
          { col: 'N', title: 'Tên trẻ nghỉ ốm đi viện' },
        ];

        const hRow = ws.getRow(4);
        hRow.height = 28;
        headerCols.forEach((hc) => {
          const cell = hRow.getCell(hc.col);
          cell.value = hc.title;
          cell.font = { name: 'Times New Roman', size: 10, bold: true };
          cell.border = thinBorder;
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          if (hc.yellow) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // VÀNG RỰC RỠ NHƯ HÌNH GỐC
          } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          }
        });

        // CÁC DÒNG DỮ LIỆU: Bắt đầu trực tiếp từ hàng 5 (STT 1 đến hết như trong hình ảnh gốc)
        let curR = 5;
        sortedClassesForTemplate.forEach((row, idx) => {
          if (!row) return;
          const cls = row.classItem;
          const clsName = cls?.class_name || (row as any).className || '';
          const clsGrade = cls?.grade ?? (row as any).grade;
          const isReported = row.status !== 'NOT_REPORTED';
          const ps = row.preschool || row.report?.preschool_data;
          const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;
          const totalAll = allVal?.total ?? (cls?.student_count || 0);
          const absentAll = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
          const presentAll = allVal?.present ?? Math.max(0, totalAll - absentAll);
          const isNT = isNhaTreClass(clsName, clsGrade);

          const r = ws.getRow(curR);
          r.getCell('A').value = idx + 1;
          r.getCell('B').value = clsName;

          // Ăn bán trú Nhà trẻ vs Mẫu giáo (đồng bộ xuất ăn bán trú với số trẻ có mặt)
          if (isNT) {
            let b: any = isReported && !exportBlankTemplate ? (ps?.boarding_nha_tre ?? ps?.boarding_count ?? 0) : '';
            if (isReported && !exportBlankTemplate && (b === 0 || b === '' || b === undefined) && presentAll > 0) {
              b = presentAll;
            }
            r.getCell('C').value = b;
            r.getCell('D').value = '';
          } else {
            r.getCell('C').value = '';
            let b: any = isReported && !exportBlankTemplate ? (ps?.boarding_mau_giao ?? ps?.boarding_count ?? 0) : '';
            if (isReported && !exportBlankTemplate && (b === 0 || b === '' || b === undefined) && presentAll > 0) {
              b = presentAll;
            }
            r.getCell('D').value = b;
          }

          // Năm sinh
          if (isNT) {
            r.getCell('E').value = isReported && !exportBlankTemplate ? (ps?.age_stats?.[yNt0]?.present ?? ps?.age_stats?.[yNt0]?.total ?? '') : '';
            r.getCell('F').value = isReported && !exportBlankTemplate ? (ps?.age_stats?.[yNt1]?.present ?? ps?.age_stats?.[yNt1]?.total ?? '') : '';
            r.getCell('G').value = isReported && !exportBlankTemplate ? (ps?.age_stats?.[yNt2]?.present ?? ps?.age_stats?.[yNt2]?.total ?? '') : '';
            r.getCell('H').value = '';
            r.getCell('I').value = '';
            r.getCell('J').value = '';
          } else {
            r.getCell('E').value = '';
            r.getCell('F').value = '';
            r.getCell('G').value = '';
            r.getCell('H').value = isReported && !exportBlankTemplate ? (ps?.age_stats?.[yMgBe]?.present ?? ps?.age_stats?.[yMgBe]?.total ?? '') : '';
            r.getCell('I').value = isReported && !exportBlankTemplate ? (ps?.age_stats?.[yMgNho]?.present ?? ps?.age_stats?.[yMgNho]?.total ?? '') : '';
            r.getCell('J').value = isReported && !exportBlankTemplate ? (ps?.age_stats?.[yMgLon]?.present ?? ps?.age_stats?.[yMgLon]?.total ?? '') : '';
          }

          // Cột Vàng: Tổng số trẻ đi học (Tô màu VÀNG rực rỡ FFFFFF00 như trong ảnh)
          r.getCell('K').value = isReported && !exportBlankTemplate ? presentAll : '';
          r.getCell('L').value = exportBlankTemplate ? '' : totalAll;

          // Tỷ lệ trẻ đi học (%)
          const rate = totalAll > 0 && isReported && !exportBlankTemplate ? ((presentAll / totalAll) * 100).toFixed(2).replace('.', ',') : '';
          r.getCell('M').value = rate;

          // Tên trẻ nghỉ ốm đi viện
          let sickText: any = '';
          if (isReported && !exportBlankTemplate) {
            const absentStudents = row.report?.absent_students || [];
            const sick = absentStudents.filter((s: any) => {
              const re = (s.reason || '').toLowerCase();
              return re.includes('ốm') || re.includes('viện') || re.includes('sốt') || re.includes('bệnh') || re.includes('đau');
            });
            if (sick.length > 0) {
              sickText = sick.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ');
            } else if (absentStudents.length > 0) {
              sickText = absentStudents.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ');
            } else {
              sickText = '';
            }
          } else {
            sickText = '';
          }
          r.getCell('N').value = sickText;

          r.height = 20;

          r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Times New Roman', size: 10 };
            cell.border = thinBorder;
            if (colNumber === 2) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else if (colNumber === 14 && typeof sickText === 'string' && sickText !== '') {
              cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            } else {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
            if (colNumber === 11) {
              cell.font = { name: 'Times New Roman', size: 10, bold: true };
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // VÀNG RỰC RỠ CẢ CỘT ĐI HỌC NHƯ TRONG ẢNH
            }
          });

          curR++;
        });

        // DÒNG TỔNG CỘNG TOÀN TRƯỜNG Ở CUỐI (chỉ khi có dữ liệu)
        if (!exportBlankTemplate) {
          const grandRow = ws.getRow(curR);
          ws.mergeCells(`A${curR}:B${curR}`);
          grandRow.getCell('A').value = 'TỔNG CỘNG TOÀN TRƯỜNG';
          grandRow.getCell('C').value = preschoolTotals.boardingNhaTre || 0;
          grandRow.getCell('D').value = preschoolTotals.boardingMauGiao || 0;
          grandRow.getCell('E').value = preschoolTotals.byYear?.[yNt0]?.present || preschoolTotals.byYear?.[yNt0]?.total || 0;
          grandRow.getCell('F').value = preschoolTotals.byYear?.[yNt1]?.present || preschoolTotals.byYear?.[yNt1]?.total || 0;
          grandRow.getCell('G').value = preschoolTotals.byYear?.[yNt2]?.present || preschoolTotals.byYear?.[yNt2]?.total || 0;
          grandRow.getCell('H').value = preschoolTotals.byYear?.[yMgBe]?.present || preschoolTotals.byYear?.[yMgBe]?.total || 0;
          grandRow.getCell('I').value = preschoolTotals.byYear?.[yMgNho]?.present || preschoolTotals.byYear?.[yMgNho]?.total || 0;
          grandRow.getCell('J').value = preschoolTotals.byYear?.[yMgLon]?.present || preschoolTotals.byYear?.[yMgLon]?.total || 0;
          grandRow.getCell('K').value = preschoolTotals.presentStudents;
          grandRow.getCell('L').value = preschoolTotals.totalStudents;
          grandRow.getCell('M').value = preschoolTotals.attendanceRate.toFixed(2).replace('.', ',');
          grandRow.getCell('N').value = preschoolTotals.healthIssueCount > 0 ? preschoolTotals.healthIssueCount : '';
          grandRow.height = 24;

          grandRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Times New Roman', size: 10, bold: true };
            cell.border = thinBorder;
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            if (colNumber === 11) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
            } else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            }
          });
        }

        // Tạo file và kích hoạt tải về ngay
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportBlankTemplate
          ? 'Mau_bao_cao_si_so_goc.xlsx'
          : `Bao_cao_si_so_thang_${dateParts.month}-${dateParts.year}_ngay_${dateParts.day}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      // -------------------------------------------------------------
      // 2. NẾU ĐANG Ở CHẾ ĐỘ "BIỂU THEO ĐỘ TUỔI & SUẤT ĂN (25 CỘT MỞ RỘNG)"
      // -------------------------------------------------------------
      if (viewMode === 'PRESCHOOL_AGE_BOARDING') {
        const ws = wb.addWorksheet('DoTuoi_SuatAn_25Cot', {
          pageSetup: {
            orientation: 'landscape',
            paperSize: 9, // A4
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: {
              left: 0.3,
              right: 0.3,
              top: 0.4,
              bottom: 0.4,
              header: 0.2,
              footer: 0.2,
            },
          },
        });

        // 24 cột dữ liệu (A đến X) tương ứng toàn bộ các cột in ấn của bảng 25 cột
        ws.columns = [
          { key: 'stt', width: 6 },            // A: STT
          { key: 'class', width: 22 },          // B: Nhóm / Lớp
          { key: 'teacher', width: 22 },        // C: Giáo viên phụ trách
          // Khối Nhà trẻ (D..J)
          { key: 'ntTotal', width: 8 },         // D: Sĩ số
          { key: 'ntPresent', width: 8 },       // E: Có mặt
          { key: 'ntAbsent', width: 8 },        // F: Vắng
          { key: 'ntBoarding', width: 9 },      // G: Ăn NT
          { key: 'ntYear0', width: 14 },        // H: Sinh yNt0 (< 1T)
          { key: 'ntYear1', width: 14 },        // I: Sinh yNt1 (1-2T)
          { key: 'ntYear2', width: 14 },        // J: Sinh yNt2 (2-3T)
          // Khối Mẫu giáo (K..Q)
          { key: 'mgTotal', width: 8 },         // K: Sĩ số
          { key: 'mgPresent', width: 8 },       // L: Có mặt
          { key: 'mgAbsent', width: 8 },        // M: Vắng
          { key: 'mgBoarding', width: 9 },      // N: Ăn MG
          { key: 'mgYearBe', width: 14 },       // O: Sinh yMgBe (3-4T)
          { key: 'mgYearNho', width: 14 },      // P: Sinh yMgNho (4-5T)
          { key: 'mgYearLon', width: 14 },      // Q: Sinh yMgLon (5-6T)
          // Tổng hợp & Bán trú toàn lớp (R..V)
          { key: 'allTotal', width: 9 },        // R: Tổng TS
          { key: 'allPresent', width: 9 },      // S: Đi học
          { key: 'allAbsent', width: 8 },       // T: Vắng
          { key: 'allBoarding', width: 10 },    // U: Tổng ăn
          { key: 'allCanceled', width: 8 },     // V: Cắt ăn
          // Khác
          { key: 'rate', width: 14 },           // W: TỈ LỆ CHUYÊN CẦN (%)
          { key: 'notes', width: 34 },          // X: Tên trẻ nghỉ & Ghi chú
        ];

        let rIdx = 1;

        // Row 1: Left: UBND XÃ. Right: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
        ws.mergeCells(`A${rIdx}:G${rIdx}`);
        const subDeptCell = ws.getCell(`A${rIdx}`);
        subDeptCell.value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
        subDeptCell.font = { name: 'Times New Roman', size: 10, bold: true };
        subDeptCell.alignment = { horizontal: 'left', vertical: 'middle' };

        ws.mergeCells(`R${rIdx}:X${rIdx}`);
        const nationCell1 = ws.getCell(`R${rIdx}`);
        nationCell1.value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
        nationCell1.font = { name: 'Times New Roman', size: 10, bold: true };
        nationCell1.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getRow(rIdx).height = 18;
        rIdx++;

        // Row 2: Left: Tên Trường. Right: Độc lập - Tự do - Hạnh phúc
        ws.mergeCells(`A${rIdx}:G${rIdx}`);
        const schoolNameCell = ws.getCell(`A${rIdx}`);
        schoolNameCell.value = formattedSchoolName;
        schoolNameCell.font = { name: 'Times New Roman', size: 10, bold: true };
        schoolNameCell.alignment = { horizontal: 'left', vertical: 'middle' };

        ws.mergeCells(`R${rIdx}:X${rIdx}`);
        const nationCell2 = ws.getCell(`R${rIdx}`);
        nationCell2.value = 'Độc lập - Tự do - Hạnh phúc';
        nationCell2.font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
        nationCell2.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getRow(rIdx).height = 18;
        rIdx++;

        // Row 3: Phân hiệu (nếu có)
        if (selectedCampusId !== 'all') {
          ws.mergeCells(`A${rIdx}:G${rIdx}`);
          const campusCell = ws.getCell(`A${rIdx}`);
          const selectedCampus = campuses.find((c) => c.id === selectedCampusId);
          campusCell.value = `PHÂN HIỆU: ${(selectedCampus ? selectedCampus.name : '...........').toUpperCase()}`;
          campusCell.font = { name: 'Times New Roman', size: 10, bold: true };
          campusCell.alignment = { horizontal: 'left', vertical: 'middle' };
          ws.getRow(rIdx).height = 18;
          rIdx++;
        }

        // Spacer
        ws.getRow(rIdx).height = 8;
        rIdx++;

        // Row Title
        const titleText = exportBlankTemplate || blankDateInTitle
          ? `${baseTitle} NGÀY .......THÁNG ...... NĂM ${dateParts.year}`
          : `${baseTitle} NGÀY ${dateParts.day} THÁNG ${dateParts.month} NĂM ${dateParts.year}`;

        ws.mergeCells(`A${rIdx}:X${rIdx}`);
        const titleCell = ws.getCell(`A${rIdx}`);
        titleCell.value = titleText;
        titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(rIdx).height = 28;
        rIdx++;

        // Subtitle
        ws.mergeCells(`A${rIdx}:X${rIdx}`);
        const subTitleCell = ws.getCell(`A${rIdx}`);
        subTitleCell.value = `(Biểu thống kê chi tiết theo độ tuổi & khẩu phần ăn: Khối Nhà trẻ, Khối Mẫu giáo, Trẻ sinh ${yNt0} - ${yMgLon})`;
        subTitleCell.font = { name: 'Times New Roman', size: 10, italic: true };
        subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(rIdx).height = 16;
        rIdx++;

        ws.getRow(rIdx).height = 8;
        rIdx++;

        // Header Rows (2 rows)
        const headerStartRow = rIdx;

        // Row 1 Merges
        ws.mergeCells(`A${headerStartRow}:A${headerStartRow + 1}`);
        ws.getCell(`A${headerStartRow}`).value = 'STT';

        ws.mergeCells(`B${headerStartRow}:B${headerStartRow + 1}`);
        ws.getCell(`B${headerStartRow}`).value = 'Nhóm / Lớp';

        ws.mergeCells(`C${headerStartRow}:C${headerStartRow + 1}`);
        ws.getCell(`C${headerStartRow}`).value = 'Giáo viên phụ trách';

        ws.mergeCells(`D${headerStartRow}:J${headerStartRow}`);
        const hNt = ws.getCell(`D${headerStartRow}`);
        hNt.value = 'KHỐI NHÀ TRẺ (DƯỚI 3 TUỔI)';

        ws.mergeCells(`K${headerStartRow}:Q${headerStartRow}`);
        const hMg = ws.getCell(`K${headerStartRow}`);
        hMg.value = 'KHỐI MẪU GIÁO (3 - 6 TUỔI)';

        ws.mergeCells(`R${headerStartRow}:V${headerStartRow}`);
        const hAll = ws.getCell(`R${headerStartRow}`);
        hAll.value = 'TỔNG HỢP & BÁN TRÚ TOÀN LỚP';

        ws.mergeCells(`W${headerStartRow}:W${headerStartRow + 1}`);
        ws.getCell(`W${headerStartRow}`).value = 'TỈ LỆ\nCHUYÊN CẦN (%)';

        ws.mergeCells(`X${headerStartRow}:X${headerStartRow + 1}`);
        ws.getCell(`X${headerStartRow}`).value = 'Tên trẻ nghỉ & Ghi chú';

        // Row 2 Sub-headers
        ws.getCell(`D${headerStartRow + 1}`).value = 'Sĩ số';
        ws.getCell(`E${headerStartRow + 1}`).value = 'Có mặt';
        ws.getCell(`F${headerStartRow + 1}`).value = 'Vắng';
        ws.getCell(`G${headerStartRow + 1}`).value = 'Ăn NT';
        ws.getCell(`H${headerStartRow + 1}`).value = `Sinh ${yNt0} (< 1T)`;
        ws.getCell(`I${headerStartRow + 1}`).value = `Sinh ${yNt1} (1-2T)`;
        ws.getCell(`J${headerStartRow + 1}`).value = `Sinh ${yNt2} (2-3T)`;

        ws.getCell(`K${headerStartRow + 1}`).value = 'Sĩ số';
        ws.getCell(`L${headerStartRow + 1}`).value = 'Có mặt';
        ws.getCell(`M${headerStartRow + 1}`).value = 'Vắng';
        ws.getCell(`N${headerStartRow + 1}`).value = 'Ăn MG';
        ws.getCell(`O${headerStartRow + 1}`).value = `Sinh ${yMgBe} (3-4T)`;
        ws.getCell(`P${headerStartRow + 1}`).value = `Sinh ${yMgNho} (4-5T)`;
        ws.getCell(`Q${headerStartRow + 1}`).value = `Sinh ${yMgLon} (5-6T)`;

        ws.getCell(`R${headerStartRow + 1}`).value = 'Tổng TS';
        ws.getCell(`S${headerStartRow + 1}`).value = 'Đi học';
        ws.getCell(`T${headerStartRow + 1}`).value = 'Vắng';
        ws.getCell(`U${headerStartRow + 1}`).value = 'Tổng ăn';
        ws.getCell(`V${headerStartRow + 1}`).value = 'Cắt ăn';

        ws.getRow(headerStartRow).height = 24;
        ws.getRow(headerStartRow + 1).height = 26;

        // Apply styles to header rows
        for (let r = headerStartRow; r <= headerStartRow + 1; r++) {
          const row = ws.getRow(r);
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Times New Roman', size: 10, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;

            // Header colors
            if (colNumber >= 4 && colNumber <= 10) {
              // Khối Nhà trẻ
              if (colNumber === 7) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } }; // Vàng tươi cho Ăn NT
              } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Hổ phách nhạt
              }
            } else if (colNumber >= 11 && colNumber <= 17) {
              // Khối Mẫu giáo
              if (colNumber === 14) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA7F3D0' } }; // Xanh ngọc nổi bật Ăn MG
              } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } }; // Teal nhạt
              }
            } else if (colNumber >= 18 && colNumber <= 22) {
              // Bán trú toàn lớp
              if (colNumber === 21) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
              } else {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
              }
            } else {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }
          });
        }

        // Data Rows
        let currentRow = headerStartRow + 2;

        const rowsToExport = exportBlankTemplate
          ? classes.map((c, idx) => ({
              classItem: c,
              teacher: null,
              report: null,
              status: 'NOT_REPORTED' as const,
              values: {},
              stt: idx + 1,
            }))
          : (reportData?.rows || []).map((r, idx) => ({
              ...r,
              stt: idx + 1,
            }));

        rowsToExport.forEach((row: any) => {
          const isReported = !exportBlankTemplate && row.status !== 'NOT_REPORTED';
          const ps = row.preschool || row.report?.preschool_data;
          const allVal = allIndicator ? row.values?.[allIndicator.id] : null;

          const totalAll = ps?.female_count !== undefined && (allVal?.total ?? 0) === 0
            ? ((ps.female_count || 0) + (ps.ethnic_count || 0))
            : (allVal?.total ?? (row.classItem?.student_count || 0));

          const absentAll = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
          const presentAll = allVal?.present ?? Math.max(0, totalAll - absentAll);
          const isNT = isNhaTreClass(row.classItem?.class_name, row.classItem?.grade);

          const totalNT = ps?.total_nha_tre ?? (isNT ? totalAll : 0);
          const presentNT = ps?.present_nha_tre ?? (isNT ? presentAll : 0);
          const absentNT = ps?.absent_nha_tre ?? Math.max(0, totalNT - presentNT);
          let boardingNT = ps?.boarding_nha_tre;
          if (isReported && isNT && (boardingNT === undefined || boardingNT === null || (Number(boardingNT) === 0 && presentAll > 0))) {
            boardingNT = presentAll;
          } else if (!boardingNT) {
            boardingNT = 0;
          }

          const totalMG = ps?.total_mau_giao ?? (!isNT ? totalAll : 0);
          const presentMG = ps?.present_mau_giao ?? (!isNT ? presentAll : 0);
          const absentMG = ps?.absent_mau_giao ?? Math.max(0, totalMG - presentMG);
          let boardingMG = ps?.boarding_mau_giao;
          if (isReported && !isNT && (boardingMG === undefined || boardingMG === null || (Number(boardingMG) === 0 && presentAll > 0))) {
            boardingMG = presentAll;
          } else if (!boardingMG) {
            boardingMG = 0;
          }

          let boardingTotal = ps?.boarding_count;
          if (isReported && (boardingTotal === undefined || boardingTotal === null || (Number(boardingTotal) === 0 && presentAll > 0))) {
            boardingTotal = presentAll;
          } else if (!boardingTotal) {
            boardingTotal = (Number(boardingNT) || 0) + (Number(boardingMG) || 0) || (boardingIndicator ? (row.values[boardingIndicator.id]?.total || 0) : 0);
          }
          const canceledTotal = ps?.canceled_count ?? absentAll;

          const formatYearStat = (yr: string) => {
            if (!isReported || exportBlankTemplate) return '';
            const stat = ps?.age_stats?.[yr];
            if (!stat || ((stat.total || 0) === 0 && (stat.present || 0) === 0 && (stat.boarding || 0) === 0)) {
              return '-';
            }
            const p = stat.present ?? 0;
            const b = (stat.boarding !== undefined && stat.boarding !== null && (stat.boarding > 0 || p === 0)) ? stat.boarding : p;
            return `${p}/${stat.total ?? 0} (${b} ăn)`;
          };

          let notesText = '';
          if (isReported) {
            const absNames = row.report?.absent_students?.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ') || '';
            const healthNote = ps?.health_note ? `[SK: ${ps.health_note}]` : '';
            const extraNote = row.report?.notes ? `[GC: ${row.report.notes}]` : '';
            notesText = [absNames, healthNote, extraNote].filter(Boolean).join(' | ') || '-';
          } else if (!exportBlankTemplate) {
            notesText = 'Chưa báo cáo';
          }

          const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

          const dataRow = ws.getRow(currentRow);
          dataRow.getCell('A').value = row.stt;
          dataRow.getCell('B').value = row.classItem?.class_name || '';
          dataRow.getCell('C').value = row.teacher?.full_name || '-';

          // Khối Nhà trẻ
          dataRow.getCell('D').value = isReported ? totalNT : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('E').value = isReported ? presentNT : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('F').value = isReported ? absentNT : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('G').value = isReported ? boardingNT : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('H').value = formatYearStat(yNt0);
          dataRow.getCell('I').value = formatYearStat(yNt1);
          dataRow.getCell('J').value = formatYearStat(yNt2);

          // Khối Mẫu giáo
          dataRow.getCell('K').value = isReported ? totalMG : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('L').value = isReported ? presentMG : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('M').value = isReported ? absentMG : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('N').value = isReported ? boardingMG : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('O').value = formatYearStat(yMgBe);
          dataRow.getCell('P').value = formatYearStat(yMgNho);
          dataRow.getCell('Q').value = formatYearStat(yMgLon);

          // Tổng hợp & Bán trú toàn lớp
          dataRow.getCell('R').value = isReported ? totalAll : (exportBlankTemplate ? '' : totalAll || '-');
          dataRow.getCell('S').value = isReported ? presentAll : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('T').value = isReported ? absentAll : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('U').value = isReported ? boardingTotal : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('V').value = isReported ? canceledTotal : (exportBlankTemplate ? '' : '-');

          // Chuyên cần & Ghi chú
          dataRow.getCell('W').value = isReported ? `${presentRate.toFixed(1).replace('.', ',')}%` : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('X').value = notesText;

          dataRow.height = 22;

          dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Times New Roman', size: 10 };
            cell.border = thinBorder;

            if (colNumber === 1 || colNumber === 23) {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            } else if (colNumber === 2 || colNumber === 3) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else if (colNumber === 24) {
              cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            } else {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }

            // Highlighting specific columns
            if (colNumber === 7) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }; // Vàng nhạt ăn NT
              cell.font = { name: 'Times New Roman', size: 10, bold: true };
            } else if (colNumber === 14) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } }; // Xanh ngọc ăn MG
              cell.font = { name: 'Times New Roman', size: 10, bold: true };
            } else if (colNumber === 21) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Hổ phách tổng ăn
              cell.font = { name: 'Times New Roman', size: 10, bold: true };
            }

            if (isReported) {
              if ((colNumber === 5 || colNumber === 12 || colNumber === 19) && typeof cell.value === 'number' && cell.value > 0) {
                cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FF047857' } }; // Xanh lục có mặt
              }
              if ((colNumber === 6 || colNumber === 13 || colNumber === 20) && typeof cell.value === 'number' && cell.value > 0) {
                cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFDC2626' } }; // Đỏ vắng
              }
            }
          });

          currentRow++;
        });

        // Summary Row (TỔNG CỘNG TOÀN TRƯỜNG)
        if (!exportBlankTemplate && reportData) {
          ws.mergeCells(`A${currentRow}:C${currentRow}`);
          const sumLabelCell = ws.getCell(`A${currentRow}`);
          sumLabelCell.value = 'TỔNG CỘNG TOÀN TRƯỜNG';
          sumLabelCell.font = { name: 'Times New Roman', size: 10, bold: true };
          sumLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };

          const sumRow = ws.getRow(currentRow);
          // Khối Nhà trẻ
          sumRow.getCell('D').value = preschoolTotals.totalNhaTre || 0;
          sumRow.getCell('E').value = preschoolTotals.presentNhaTre || 0;
          sumRow.getCell('F').value = preschoolTotals.absentNhaTre || 0;
          sumRow.getCell('G').value = preschoolTotals.boardingNhaTre || 0;
          sumRow.getCell('H').value = `${preschoolTotals.byYear?.[yNt0]?.present || 0}/${preschoolTotals.byYear?.[yNt0]?.total || 0} (${preschoolTotals.byYear?.[yNt0]?.boarding || 0} ăn)`;
          sumRow.getCell('I').value = `${preschoolTotals.byYear?.[yNt1]?.present || 0}/${preschoolTotals.byYear?.[yNt1]?.total || 0} (${preschoolTotals.byYear?.[yNt1]?.boarding || 0} ăn)`;
          sumRow.getCell('J').value = `${preschoolTotals.byYear?.[yNt2]?.present || 0}/${preschoolTotals.byYear?.[yNt2]?.total || 0} (${preschoolTotals.byYear?.[yNt2]?.boarding || 0} ăn)`;

          // Khối Mẫu giáo
          sumRow.getCell('K').value = preschoolTotals.totalMauGiao || 0;
          sumRow.getCell('L').value = preschoolTotals.presentMauGiao || 0;
          sumRow.getCell('M').value = preschoolTotals.absentMauGiao || 0;
          sumRow.getCell('N').value = preschoolTotals.boardingMauGiao || 0;
          sumRow.getCell('O').value = `${preschoolTotals.byYear?.[yMgBe]?.present || 0}/${preschoolTotals.byYear?.[yMgBe]?.total || 0} (${preschoolTotals.byYear?.[yMgBe]?.boarding || 0} ăn)`;
          sumRow.getCell('P').value = `${preschoolTotals.byYear?.[yMgNho]?.present || 0}/${preschoolTotals.byYear?.[yMgNho]?.total || 0} (${preschoolTotals.byYear?.[yMgNho]?.boarding || 0} ăn)`;
          sumRow.getCell('Q').value = `${preschoolTotals.byYear?.[yMgLon]?.present || 0}/${preschoolTotals.byYear?.[yMgLon]?.total || 0} (${preschoolTotals.byYear?.[yMgLon]?.boarding || 0} ăn)`;

          // Toàn lớp
          sumRow.getCell('R').value = preschoolTotals.totalStudents;
          sumRow.getCell('S').value = preschoolTotals.presentStudents;
          sumRow.getCell('T').value = preschoolTotals.absentStudents;
          sumRow.getCell('U').value = preschoolTotals.boardingCount;
          sumRow.getCell('V').value = preschoolTotals.canceledCount;

          // Chuyên cần & Ghi chú
          sumRow.getCell('W').value = `${preschoolTotals.attendanceRate.toFixed(1).replace('.', ',')}%`;
          sumRow.getCell('X').value = `Đã báo cáo: ${reportData.reportedClasses}/${reportData.totalClasses} nhóm/lớp`;

          sumRow.height = 24;

          sumRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Times New Roman', size: 10, bold: true };
            cell.border = thinBorder;
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF1F5F9' },
            };
            if (colNumber === 24) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
            if (colNumber === 7) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF08A' } };
            } else if (colNumber === 14) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA7F3D0' } };
            } else if (colNumber === 21) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
            }
          });

          currentRow++;
        }

        // Add signatures section
        currentRow += 2;

        ws.mergeCells(`A${currentRow}:F${currentRow}`);
        const reporterTitleCell = ws.getCell(`A${currentRow}`);
        reporterTitleCell.value = signatureSettings.reporter_title;
        reporterTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
        reporterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`S${currentRow}:X${currentRow}`);
        const principalDateCell = ws.getCell(`S${currentRow}`);
        principalDateCell.value = `Ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}`;
        principalDateCell.font = { name: 'Times New Roman', size: 11, italic: true };
        principalDateCell.alignment = { horizontal: 'center', vertical: 'middle' };
        currentRow++;

        ws.mergeCells(`A${currentRow}:F${currentRow}`);
        const reporterSubCell = ws.getCell(`A${currentRow}`);
        reporterSubCell.value = '(Ký và ghi rõ họ tên)';
        reporterSubCell.font = { name: 'Times New Roman', size: 10, italic: true };
        reporterSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`S${currentRow}:X${currentRow}`);
        const principalTitleCell = ws.getCell(`S${currentRow}`);
        principalTitleCell.value = signatureSettings.principal_title;
        principalTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
        principalTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        currentRow++;

        ws.mergeCells(`S${currentRow}:X${currentRow}`);
        const principalSubCell = ws.getCell(`S${currentRow}`);
        principalSubCell.value = '(Ký, đóng dấu và ghi rõ họ tên)';
        principalSubCell.font = { name: 'Times New Roman', size: 10, italic: true };
        principalSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Space for signatures
        currentRow += 4;

        ws.mergeCells(`A${currentRow}:F${currentRow}`);
        const reporterNameCell = ws.getCell(`A${currentRow}`);
        reporterNameCell.value = signatureSettings.reporter_name;
        reporterNameCell.font = { name: 'Times New Roman', size: 11, bold: true };
        reporterNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`S${currentRow}:X${currentRow}`);
        const principalNameCell = ws.getCell(`S${currentRow}`);
        principalNameCell.value = signatureSettings.principal_name;
        principalNameCell.font = { name: 'Times New Roman', size: 11, bold: true };
        principalNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Generate binary and trigger download
        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportBlankTemplate
          ? 'Mau_trang_do_tuoi_va_suat_an_25cot.xlsx'
          : `Bao_cao_do_tuoi_va_suat_an_25cot_ngay_${dateParts.day}-${dateParts.month}-${dateParts.year}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      // -------------------------------------------------------------
      // 3. NẾU ĐANG Ở CHẾ ĐỘ "BIỂU RÚT GỌN (CƠ BẢN)"
      // -------------------------------------------------------------
      if (viewMode === 'PRESCHOOL_COMPACT') {
        const ws = wb.addWorksheet('SiSo_RutGon', {
          pageSetup: {
            orientation: 'landscape',
            paperSize: 9,
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
          },
        });

        ws.columns = [
          { key: 'class', width: 14 },
          { key: 'teacher', width: 22 },
          { key: 'allTotal', width: 12 },
          { key: 'allAbsent', width: 12 },
          { key: 'boardTotal', width: 12 },
          { key: 'boardAbsent', width: 12 },
          { key: 'outTotal', width: 12 },
          { key: 'outAbsent', width: 12 },
          { key: 'absentNames', width: 28 },
          { key: 'address', width: 20 },
          { key: 'absentRate', width: 14 },
          { key: 'rate', width: 14 },
        ];

        let rIdx = 1;

        ws.mergeCells(`A${rIdx}:D${rIdx}`);
        const subDeptCell = ws.getCell(`A${rIdx}`);
        subDeptCell.value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
        subDeptCell.font = { name: 'Times New Roman', size: 10, bold: true };

        ws.mergeCells(`I${rIdx}:L${rIdx}`);
        const nationCell1 = ws.getCell(`I${rIdx}`);
        nationCell1.value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
        nationCell1.font = { name: 'Times New Roman', size: 10, bold: true };
        nationCell1.alignment = { horizontal: 'center', vertical: 'middle' };
        rIdx++;

        ws.mergeCells(`A${rIdx}:D${rIdx}`);
        const schoolNameCell = ws.getCell(`A${rIdx}`);
        schoolNameCell.value = formattedSchoolName;
        schoolNameCell.font = { name: 'Times New Roman', size: 10, bold: true };

        ws.mergeCells(`I${rIdx}:L${rIdx}`);
        const nationCell2 = ws.getCell(`I${rIdx}`);
        nationCell2.value = 'Độc lập - Tự do - Hạnh phúc';
        nationCell2.font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
        nationCell2.alignment = { horizontal: 'center', vertical: 'middle' };
        rIdx++;

        if (selectedCampusId !== 'all') {
          ws.mergeCells(`A${rIdx}:D${rIdx}`);
          const campusCell = ws.getCell(`A${rIdx}`);
          const selectedCampus = campuses.find((c) => c.id === selectedCampusId);
          campusCell.value = `PHÂN HIỆU: ${(selectedCampus ? selectedCampus.name : '...........').toUpperCase()}`;
          campusCell.font = { name: 'Times New Roman', size: 10, bold: true };
          rIdx++;
        }

        ws.getRow(rIdx).height = 8;
        rIdx++;

        const titleText = exportBlankTemplate || blankDateInTitle
          ? `${baseTitle} NGÀY .......THÁNG ...... NĂM ${dateParts.year}`
          : `${baseTitle} NGÀY ${dateParts.day} THÁNG ${dateParts.month} NĂM ${dateParts.year}`;

        ws.mergeCells(`A${rIdx}:L${rIdx}`);
        const titleCell = ws.getCell(`A${rIdx}`);
        titleCell.value = titleText;
        titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        rIdx++;

        ws.mergeCells(`A${rIdx}:L${rIdx}`);
        const subTitleCell = ws.getCell(`A${rIdx}`);
        subTitleCell.value = '(Biểu thống kê sĩ số & bán trú mầm non rút gọn)';
        subTitleCell.font = { name: 'Times New Roman', size: 10, italic: true };
        subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        rIdx++;

        ws.getRow(rIdx).height = 8;
        rIdx++;

        const headerStartRow = rIdx;

        ws.mergeCells(`A${headerStartRow}:A${headerStartRow + 1}`);
        ws.getCell(`A${headerStartRow}`).value = 'Lớp';

        ws.mergeCells(`B${headerStartRow}:B${headerStartRow + 1}`);
        ws.getCell(`B${headerStartRow}`).value = 'Giáo viên chủ nhiệm';

        ws.mergeCells(`C${headerStartRow}:D${headerStartRow}`);
        ws.getCell(`C${headerStartRow}`).value = 'Học sinh toàn trường';

        ws.mergeCells(`E${headerStartRow}:F${headerStartRow}`);
        ws.getCell(`E${headerStartRow}`).value = 'Học sinh bán trú';

        ws.mergeCells(`G${headerStartRow}:H${headerStartRow}`);
        ws.getCell(`G${headerStartRow}`).value = 'Học sinh ngoại trú';

        ws.mergeCells(`I${headerStartRow}:I${headerStartRow + 1}`);
        ws.getCell(`I${headerStartRow}`).value = 'Tên học sinh nghỉ';

        ws.mergeCells(`J${headerStartRow}:J${headerStartRow + 1}`);
        ws.getCell(`J${headerStartRow}`).value = 'Địa chỉ';

        ws.mergeCells(`K${headerStartRow}:K${headerStartRow + 1}`);
        ws.getCell(`K${headerStartRow}`).value = 'Tỉ lệ\nvắng (%)';

        ws.mergeCells(`L${headerStartRow}:L${headerStartRow + 1}`);
        ws.getCell(`L${headerStartRow}`).value = 'Tỉ lệ\nchuyên cần (%)';

        ws.getCell(`C${headerStartRow + 1}`).value = 'Tổng số';
        ws.getCell(`D${headerStartRow + 1}`).value = 'Số vắng';
        ws.getCell(`E${headerStartRow + 1}`).value = 'Tổng số';
        ws.getCell(`F${headerStartRow + 1}`).value = 'Số vắng';
        ws.getCell(`G${headerStartRow + 1}`).value = 'Tổng số';
        ws.getCell(`H${headerStartRow + 1}`).value = 'Số vắng';

        for (let r = headerStartRow; r <= headerStartRow + 1; r++) {
          const row = ws.getRow(r);
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.font = { name: 'Times New Roman', size: 10, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = thinBorder;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          });
        }

        let currentRow = headerStartRow + 2;

        const rowsToExport = exportBlankTemplate
          ? classes.map((c) => ({
              classItem: c,
              teacher: null,
              report: null,
              status: 'NOT_REPORTED' as const,
              values: {},
            }))
          : (reportData?.rows || []);

        rowsToExport.forEach((row: any) => {
          const isReported = !exportBlankTemplate && row.status !== 'NOT_REPORTED';
          const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;
          const boardingVal = boardingIndicator && row.values ? row.values[boardingIndicator.id] : null;

          const totalAll = allVal?.total ?? 0;
          const absentAll = allVal?.absent ?? 0;
          const presentAll = allVal?.present ?? (totalAll - absentAll);

          const totalBoarding = boardingVal?.total ?? 0;
          const absentBoarding = boardingVal?.absent ?? 0;
          
          const totalNgoaiTru = Math.max(0, totalAll - totalBoarding);
          const absentNgoaiTru = Math.max(0, absentAll - absentBoarding);

          const absentRate = totalAll > 0 ? (absentAll / totalAll) * 100 : 0;
          const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

          const studentNames = getAbsentStudentText(row);
          const studentAddresses = getAbsentStudentAddresses(row);

          const dataRow = ws.getRow(currentRow);
          dataRow.getCell('A').value = row.classItem?.class_name || '';
          dataRow.getCell('B').value = row.teacher?.full_name || '-';
          dataRow.getCell('C').value = isReported ? totalAll : (exportBlankTemplate ? '' : totalAll || '-');
          dataRow.getCell('D').value = isReported ? absentAll : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('E').value = isReported ? totalBoarding : (exportBlankTemplate ? '' : totalBoarding || '-');
          dataRow.getCell('F').value = isReported ? absentBoarding : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('G').value = isReported ? totalNgoaiTru : (exportBlankTemplate ? '' : totalNgoaiTru || '-');
          dataRow.getCell('H').value = isReported ? absentNgoaiTru : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('I').value = isReported ? (studentNames || '') : (exportBlankTemplate ? '' : 'Chưa báo cáo');
          dataRow.getCell('J').value = isReported ? (studentAddresses || '-') : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('K').value = isReported ? `${absentRate.toFixed(1).replace('.', ',')}%` : (exportBlankTemplate ? '' : '-');
          dataRow.getCell('L').value = isReported ? `${presentRate.toFixed(1).replace('.', ',')}%` : (exportBlankTemplate ? '' : '-');

          dataRow.height = 22;

          dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Times New Roman', size: 10 };
            cell.border = thinBorder;
            if (colNumber === 1 || colNumber === 2) {
              cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else if (colNumber === 9 || colNumber === 10) {
              cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
            } else {
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
          });

          currentRow++;
        });

        // Add signatures section
        currentRow += 2;
        ws.mergeCells(`A${currentRow}:D${currentRow}`);
        const reporterTitleCell = ws.getCell(`A${currentRow}`);
        reporterTitleCell.value = signatureSettings.reporter_title;
        reporterTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
        reporterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`I${currentRow}:L${currentRow}`);
        const principalDateCell = ws.getCell(`I${currentRow}`);
        principalDateCell.value = `Ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}`;
        principalDateCell.font = { name: 'Times New Roman', size: 11, italic: true };
        principalDateCell.alignment = { horizontal: 'center', vertical: 'middle' };
        currentRow++;

        ws.mergeCells(`A${currentRow}:D${currentRow}`);
        const reporterSubCell = ws.getCell(`A${currentRow}`);
        reporterSubCell.value = '(Ký và ghi rõ họ tên)';
        reporterSubCell.font = { name: 'Times New Roman', size: 10, italic: true };
        reporterSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`I${currentRow}:L${currentRow}`);
        const principalTitleCell = ws.getCell(`I${currentRow}`);
        principalTitleCell.value = signatureSettings.principal_title;
        principalTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
        principalTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        currentRow += 4;

        ws.mergeCells(`A${currentRow}:D${currentRow}`);
        const reporterNameCell = ws.getCell(`A${currentRow}`);
        reporterNameCell.value = signatureSettings.reporter_name;
        reporterNameCell.font = { name: 'Times New Roman', size: 11, bold: true };
        reporterNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`I${currentRow}:L${currentRow}`);
        const principalNameCell = ws.getCell(`I${currentRow}`);
        principalNameCell.value = signatureSettings.principal_name;
        principalNameCell.font = { name: 'Times New Roman', size: 11, bold: true };
        principalNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const buffer = await wb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportBlankTemplate
          ? 'Mau_trang_si_so_rut_gon.xlsx'
          : `Bao_cao_si_so_rut_gon_ngay_${dateParts.day}-${dateParts.month}-${dateParts.year}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      // -------------------------------------------------------------
      // 4. MẪU "BIỂU CHI TIẾT MẦM NON (24 CỘT GDMN)" (viewMode === 'PRESCHOOL_DETAILED')
      // -------------------------------------------------------------
      const ws = wb.addWorksheet('ChiTiet_24Cot_GDMN', {
        pageSetup: {
          orientation: 'landscape',
          paperSize: 9, // A4
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          margins: {
            left: 0.3,
            right: 0.3,
            top: 0.4,
            bottom: 0.4,
            header: 0.2,
            footer: 0.2,
          },
        },
      });

      // 24 cột chuẩn giáo dục mầm non
      ws.columns = [
        { key: 'stt', width: 6 },            // A: STT
        { key: 'class', width: 18 },          // B: Nhóm / Lớp
        { key: 'teacher', width: 22 },        // C: Giáo viên phụ trách
        // Sĩ số trẻ
        { key: 'totalAll', width: 9 },        // D: Sĩ số - Tổng
        { key: 'female', width: 8 },          // E: Sĩ số - Nữ
        { key: 'ethnic', width: 8 },          // F: Sĩ số - DTTS
        { key: 'femaleEthnic', width: 9 },    // G: Sĩ số - Nữ DTTS
        { key: 'poor', width: 8 },            // H: Sĩ số - Hộ nghèo
        { key: 'disabled', width: 8 },        // I: Sĩ số - Khuyết tật
        // Đi học / có mặt
        { key: 'presentAll', width: 9 },      // J: Đi học - Tổng
        { key: 'presentFemale', width: 8 },   // K: Đi học - Nữ
        { key: 'presentEthnic', width: 8 },   // L: Đi học - DTTS
        // Nghỉ học / vắng
        { key: 'absentAll', width: 9 },       // M: Nghỉ học - Tổng
        { key: 'absentExcused', width: 8 },   // N: Nghỉ học - Có phép
        { key: 'absentUnexcused', width: 8 }, // O: Nghỉ học - K.phép
        // Bán trú & khẩu phần (6 cột)
        { key: 'boardingCount', width: 9 },   // P: Bán trú - Tổng ăn
        { key: 'boardingNT', width: 9 },      // Q: Bán trú - Ăn NT
        { key: 'boardingMG', width: 9 },      // R: Bán trú - Ăn MG
        { key: 'lunchCount', width: 8 },      // S: Bán trú - Trưa
        { key: 'snackCount', width: 8 },      // T: Bán trú - Xế
        { key: 'canceledCount', width: 8 },   // U: Bán trú - Cắt ăn
        // Sức khỏe & ghi chú
        { key: 'healthCount', width: 8 },     // V: Sức khỏe - Sốt/mệt
        { key: 'notes', width: 34 },          // W: Tên trẻ nghỉ & Ghi chú
        { key: 'attendanceRate', width: 13 }, // X: % Chuyên cần
      ];

      let rIdx = 1;

      // Row 1: Left: UBND XÃ XA DUNG. Right: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
      ws.mergeCells(`A${rIdx}:G${rIdx}`);
      const subDeptCell = ws.getCell(`A${rIdx}`);
      subDeptCell.value = (settings?.sub_department_name || 'UBND XÃ XA DUNG').toUpperCase();
      subDeptCell.font = { name: 'Times New Roman', size: 10, bold: true };
      subDeptCell.alignment = { horizontal: 'left', vertical: 'middle' };

      ws.mergeCells(`R${rIdx}:X${rIdx}`);
      const nationCell1 = ws.getCell(`R${rIdx}`);
      nationCell1.value = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM';
      nationCell1.font = { name: 'Times New Roman', size: 10, bold: true };
      nationCell1.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(rIdx).height = 18;
      rIdx++;

      // Row 2: Left: TRƯỜNG MẦM NON. Right: Độc lập - Tự do - Hạnh phúc
      ws.mergeCells(`A${rIdx}:G${rIdx}`);
      const schoolNameCell = ws.getCell(`A${rIdx}`);
      schoolNameCell.value = formattedSchoolName;
      schoolNameCell.font = { name: 'Times New Roman', size: 10, bold: true };
      schoolNameCell.alignment = { horizontal: 'left', vertical: 'middle' };

      ws.mergeCells(`R${rIdx}:X${rIdx}`);
      const nationCell2 = ws.getCell(`R${rIdx}`);
      nationCell2.value = 'Độc lập - Tự do - Hạnh phúc';
      nationCell2.font = { name: 'Times New Roman', size: 10, bold: true, underline: 'single' };
      nationCell2.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(rIdx).height = 18;
      rIdx++;

      // Row 3: PHÂN HIỆU (if selected)
      if (selectedCampusId !== 'all') {
        ws.mergeCells(`A${rIdx}:G${rIdx}`);
        const campusCell = ws.getCell(`A${rIdx}`);
        const selectedCampus = campuses.find((c) => c.id === selectedCampusId);
        campusCell.value = `PHÂN HIỆU: ${(selectedCampus ? selectedCampus.name : '...........').toUpperCase()}`;
        campusCell.font = { name: 'Times New Roman', size: 10, bold: true };
        campusCell.alignment = { horizontal: 'left', vertical: 'middle' };
        ws.getRow(rIdx).height = 18;
        rIdx++;
      }

      // Small spacer before title
      ws.getRow(rIdx).height = 8;
      rIdx++;

      // Row 4: Title
      const titleText = exportBlankTemplate || blankDateInTitle
        ? `${baseTitle} NGÀY .......THÁNG ...... NĂM ${dateParts.year}`
        : `${baseTitle} NGÀY ${dateParts.day} THÁNG ${dateParts.month} NĂM ${dateParts.year}`;

      ws.mergeCells(`A${rIdx}:X${rIdx}`);
      const titleCell = ws.getCell(`A${rIdx}`);
      titleCell.value = titleText;
      titleCell.font = { name: 'Times New Roman', size: 13, bold: true };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(rIdx).height = 28;
      rIdx++;

      // Subtitle
      ws.mergeCells(`A${rIdx}:X${rIdx}`);
      const subTitleCell = ws.getCell(`A${rIdx}`);
      subTitleCell.value = '(Biểu thống kê tổng hợp số liệu trẻ theo dõi hàng ngày - 24 cột chuẩn giáo dục Mầm Non)';
      subTitleCell.font = { name: 'Times New Roman', size: 10, italic: true };
      subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(rIdx).height = 16;
      rIdx++;

      ws.getRow(rIdx).height = 8;
      rIdx++;

      // Header rows starting index
      const headerStartRow = rIdx;

      // Table Header Row 1
      ws.mergeCells(`A${headerStartRow}:A${headerStartRow + 1}`);
      ws.getCell(`A${headerStartRow}`).value = 'STT';

      ws.mergeCells(`B${headerStartRow}:B${headerStartRow + 1}`);
      ws.getCell(`B${headerStartRow}`).value = 'Nhóm / Lớp';

      ws.mergeCells(`C${headerStartRow}:C${headerStartRow + 1}`);
      ws.getCell(`C${headerStartRow}`).value = 'Giáo viên phụ trách';

      ws.mergeCells(`D${headerStartRow}:I${headerStartRow}`);
      ws.getCell(`D${headerStartRow}`).value = 'SĨ SỐ TRẺ';

      ws.mergeCells(`J${headerStartRow}:L${headerStartRow}`);
      ws.getCell(`J${headerStartRow}`).value = 'ĐI HỌC / CÓ MẶT';

      ws.mergeCells(`M${headerStartRow}:O${headerStartRow}`);
      ws.getCell(`M${headerStartRow}`).value = 'NGHỈ HỌC / VẮNG';

      ws.mergeCells(`P${headerStartRow}:U${headerStartRow}`);
      ws.getCell(`P${headerStartRow}`).value = 'BÁN TRÚ & KHẨU PHẦN';

      ws.mergeCells(`V${headerStartRow}:V${headerStartRow + 1}`);
      ws.getCell(`V${headerStartRow}`).value = 'SỐT/MỆT';

      ws.mergeCells(`W${headerStartRow}:W${headerStartRow + 1}`);
      ws.getCell(`W${headerStartRow}`).value = 'Tên trẻ nghỉ & Ghi chú';

      ws.mergeCells(`X${headerStartRow}:X${headerStartRow + 1}`);
      ws.getCell(`X${headerStartRow}`).value = 'TỈ LỆ\nCHUYÊN CẦN';

      // Row 2 sub-columns
      ws.getCell(`D${headerStartRow + 1}`).value = 'Tổng';
      ws.getCell(`E${headerStartRow + 1}`).value = 'Nữ';
      ws.getCell(`F${headerStartRow + 1}`).value = 'DTTS';
      ws.getCell(`G${headerStartRow + 1}`).value = 'Nữ DTTS';
      ws.getCell(`H${headerStartRow + 1}`).value = 'Nghèo';
      ws.getCell(`I${headerStartRow + 1}`).value = 'KT';

      ws.getCell(`J${headerStartRow + 1}`).value = 'Tổng';
      ws.getCell(`K${headerStartRow + 1}`).value = 'Nữ';
      ws.getCell(`L${headerStartRow + 1}`).value = 'DTTS';

      ws.getCell(`M${headerStartRow + 1}`).value = 'Tổng';
      ws.getCell(`N${headerStartRow + 1}`).value = 'Có phép';
      ws.getCell(`O${headerStartRow + 1}`).value = 'K.phép';

      ws.getCell(`P${headerStartRow + 1}`).value = 'Tổng ăn';
      ws.getCell(`Q${headerStartRow + 1}`).value = 'Ăn NT';
      ws.getCell(`R${headerStartRow + 1}`).value = 'Ăn MG';
      ws.getCell(`S${headerStartRow + 1}`).value = 'Trưa';
      ws.getCell(`T${headerStartRow + 1}`).value = 'Xế';
      ws.getCell(`U${headerStartRow + 1}`).value = 'Cắt ăn';

      ws.getRow(headerStartRow).height = 24;
      ws.getRow(headerStartRow + 1).height = 24;

      // Apply borders, fonts and alignments to both header rows
      for (let r = headerStartRow; r <= headerStartRow + 1; r++) {
        const row = ws.getRow(r);
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: 'Times New Roman', size: 10, bold: true };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF8FAFC' },
          };
          cell.border = thinBorder;
        });
      }

      let currentRow = headerStartRow + 2;

      // Exporting Rows: if blank template, generate rows for each class with empty values
      const rowsToExport = exportBlankTemplate
        ? classes.map((c, idx) => ({
            classItem: c,
            teacher: null,
            report: null,
            status: 'NOT_REPORTED' as const,
            values: {},
            stt: idx + 1,
          }))
        : (reportData?.rows || []).map((r, idx) => ({
            ...r,
            stt: idx + 1,
          }));

      rowsToExport.forEach((row: any) => {
        const isReported = !exportBlankTemplate && row.status !== 'NOT_REPORTED';
        const ps = row.preschool || row.report?.preschool_data;
        const allVal = allIndicator ? row.values?.[allIndicator.id] : null;

        const totalAll = ps?.female_count !== undefined && (allVal?.total ?? 0) === 0
          ? ((ps.female_count || 0) + (ps.ethnic_count || 0))
          : (allVal?.total ?? (row.classItem?.student_count || 0));

        const absentAll = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
        const presentAll = allVal?.present ?? Math.max(0, totalAll - absentAll);

        const femaleCount = ps?.female_count ?? 0;
        const ethnicCount = ps?.ethnic_count ?? 0;
        const femaleEthnicCount = ps?.female_ethnic_count ?? 0;
        const poorCount = ps?.poor_count ?? 0;
        const disabledCount = ps?.disabled_count ?? 0;

        const presentFemale = ps?.present_female_count ?? Math.min(femaleCount, presentAll);
        const presentEthnic = ps?.present_ethnic_count ?? Math.min(ethnicCount, presentAll);

        const absentExcused = ps?.absent_excused ?? (row.report?.absent_students?.filter((s: any) => s.is_excused).length || 0);
        const absentUnexcused = ps?.absent_unexcused ?? Math.max(0, absentAll - absentExcused);

        const isNT = isNhaTreClass(row.classItem?.class_name, row.classItem?.grade);
        let bNT = ps?.boarding_nha_tre;
        if (isReported && isNT && (bNT === undefined || bNT === null || (Number(bNT) === 0 && presentAll > 0))) {
          bNT = presentAll;
        } else if (!bNT) {
          bNT = 0;
        }

        let bMG = ps?.boarding_mau_giao;
        if (isReported && !isNT && (bMG === undefined || bMG === null || (Number(bMG) === 0 && presentAll > 0))) {
          bMG = presentAll;
        } else if (!bMG) {
          bMG = 0;
        }

        let boardingCount = ps?.boarding_count;
        if (isReported && (boardingCount === undefined || boardingCount === null || (Number(boardingCount) === 0 && presentAll > 0))) {
          boardingCount = presentAll;
        } else if (!boardingCount) {
          boardingCount = (Number(bNT) || 0) + (Number(bMG) || 0) || (boardingIndicator ? (row.values?.[boardingIndicator.id]?.total || 0) : 0);
        }

        const lunchCount = ps?.lunch_count ?? boardingCount;
        const snackCount = ps?.snack_count ?? boardingCount;
        const canceledCount = ps?.canceled_count ?? 0;

        const healthIssueCount = ps?.health_issue_count ?? 0;

        let notesText = '';
        if (isReported) {
          const absNames = row.report?.absent_students?.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ') || '';
          const healthNote = ps?.health_note ? `[SK: ${ps.health_note}]` : '';
          const extraNote = row.report?.notes ? `[GC: ${row.report.notes}]` : '';
          notesText = [absNames, healthNote, extraNote].filter(Boolean).join(' | ') || '-';
        } else if (!exportBlankTemplate) {
          notesText = 'Chưa báo cáo';
        }

        const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

        const dataRow = ws.getRow(currentRow);
        dataRow.getCell('A').value = row.stt;
        dataRow.getCell('B').value = row.classItem?.class_name || '';
        dataRow.getCell('C').value = row.teacher?.full_name || '-';

        dataRow.getCell('D').value = isReported ? totalAll : (exportBlankTemplate ? '' : totalAll || '-');
        dataRow.getCell('E').value = isReported ? femaleCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('F').value = isReported ? ethnicCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('G').value = isReported ? femaleEthnicCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('H').value = isReported ? poorCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('I').value = isReported ? disabledCount : (exportBlankTemplate ? '' : '-');

        dataRow.getCell('J').value = isReported ? presentAll : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('K').value = isReported ? presentFemale : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('L').value = isReported ? presentEthnic : (exportBlankTemplate ? '' : '-');

        dataRow.getCell('M').value = isReported ? absentAll : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('N').value = isReported ? absentExcused : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('O').value = isReported ? absentUnexcused : (exportBlankTemplate ? '' : '-');

        dataRow.getCell('P').value = isReported ? boardingCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('Q').value = isReported ? bNT : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('R').value = isReported ? bMG : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('S').value = isReported ? lunchCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('T').value = isReported ? snackCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('U').value = isReported ? canceledCount : (exportBlankTemplate ? '' : '-');

        dataRow.getCell('V').value = isReported ? healthIssueCount : (exportBlankTemplate ? '' : '-');
        dataRow.getCell('W').value = notesText;
        dataRow.getCell('X').value = isReported ? `${presentRate.toFixed(1).replace('.', ',')}%` : (exportBlankTemplate ? '' : '-');

        dataRow.height = 22;

        dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { name: 'Times New Roman', size: 10 };
          cell.border = thinBorder;

          if (colNumber === 1 || colNumber === 24) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colNumber === 2 || colNumber === 3) {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else if (colNumber === 23) {
            cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }

          if (isReported) {
            if (colNumber === 13 && absentAll > 0) {
              cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFDC2626' } };
            }
            if (colNumber === 22 && healthIssueCount > 0) {
              cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFDC2626' } };
            }
          }
        });

        currentRow++;
      });

      // Summary Row (TỔNG CỘNG TOÀN TRƯỜNG)
      if (!exportBlankTemplate && reportData) {
        ws.mergeCells(`A${currentRow}:C${currentRow}`);
        const sumLabelCell = ws.getCell(`A${currentRow}`);
        sumLabelCell.value = 'TỔNG CỘNG TOÀN TRƯỜNG';
        sumLabelCell.font = { name: 'Times New Roman', size: 10, bold: true };
        sumLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const sumRow = ws.getRow(currentRow);
        sumRow.getCell('D').value = preschoolTotals.totalStudents;
        sumRow.getCell('E').value = preschoolTotals.femaleStudents;
        sumRow.getCell('F').value = preschoolTotals.ethnicStudents;
        sumRow.getCell('G').value = preschoolTotals.femaleEthnicStudents;
        sumRow.getCell('H').value = preschoolTotals.poorStudents;
        sumRow.getCell('I').value = preschoolTotals.disabledStudents;

        sumRow.getCell('J').value = preschoolTotals.presentStudents;
        sumRow.getCell('K').value = preschoolTotals.presentFemale;
        sumRow.getCell('L').value = preschoolTotals.presentEthnic;

        sumRow.getCell('M').value = preschoolTotals.absentStudents;
        sumRow.getCell('N').value = preschoolTotals.absentExcused;
        sumRow.getCell('O').value = preschoolTotals.absentUnexcused;

        sumRow.getCell('P').value = preschoolTotals.boardingCount;
        sumRow.getCell('Q').value = preschoolTotals.boardingNhaTre || 0;
        sumRow.getCell('R').value = preschoolTotals.boardingMauGiao || 0;
        sumRow.getCell('S').value = preschoolTotals.lunchCount;
        sumRow.getCell('T').value = preschoolTotals.snackCount;
        sumRow.getCell('U').value = preschoolTotals.canceledCount;

        sumRow.getCell('V').value = preschoolTotals.healthIssueCount;
        sumRow.getCell('W').value = `Đã báo cáo: ${reportData.reportedClasses}/${reportData.totalClasses} nhóm/lớp`;
        sumRow.getCell('X').value = `${preschoolTotals.attendanceRate.toFixed(1).replace('.', ',')}%`;

        sumRow.height = 24;

        sumRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.font = { name: 'Times New Roman', size: 10, bold: true };
          cell.border = thinBorder;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };
          if (colNumber >= 4 && colNumber <= 22) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colNumber === 23) {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
          if (colNumber === 13 && preschoolTotals.absentStudents > 0) {
            cell.font = { name: 'Times New Roman', size: 10, bold: true, color: { argb: 'FFDC2626' } };
          }
        });

        currentRow++;
      }

      // Add signatures section
      currentRow += 2;

      ws.mergeCells(`A${currentRow}:F${currentRow}`);
      const reporterTitleCell = ws.getCell(`A${currentRow}`);
      reporterTitleCell.value = signatureSettings.reporter_title;
      reporterTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
      reporterTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`S${currentRow}:X${currentRow}`);
      const principalDateCell = ws.getCell(`S${currentRow}`);
      principalDateCell.value = `Ngày ${dateParts.day} tháng ${dateParts.month} năm ${dateParts.year}`;
      principalDateCell.font = { name: 'Times New Roman', size: 11, italic: true };
      principalDateCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;

      ws.mergeCells(`A${currentRow}:F${currentRow}`);
      const reporterSubCell = ws.getCell(`A${currentRow}`);
      reporterSubCell.value = '(Ký và ghi rõ họ tên)';
      reporterSubCell.font = { name: 'Times New Roman', size: 10, italic: true };
      reporterSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`S${currentRow}:X${currentRow}`);
      const principalTitleCell = ws.getCell(`S${currentRow}`);
      principalTitleCell.value = signatureSettings.principal_title;
      principalTitleCell.font = { name: 'Times New Roman', size: 11, bold: true };
      principalTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      currentRow++;

      ws.mergeCells(`S${currentRow}:X${currentRow}`);
      const principalSubCell = ws.getCell(`S${currentRow}`);
      principalSubCell.value = '(Ký, đóng dấu và ghi rõ họ tên)';
      principalSubCell.font = { name: 'Times New Roman', size: 10, italic: true };
      principalSubCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Space for signatures
      currentRow += 4;

      ws.mergeCells(`A${currentRow}:F${currentRow}`);
      const reporterNameCell = ws.getCell(`A${currentRow}`);
      reporterNameCell.value = signatureSettings.reporter_name;
      reporterNameCell.font = { name: 'Times New Roman', size: 11, bold: true };
      reporterNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`S${currentRow}:X${currentRow}`);
      const principalNameCell = ws.getCell(`S${currentRow}`);
      principalNameCell.value = signatureSettings.principal_name;
      principalNameCell.font = { name: 'Times New Roman', size: 11, bold: true };
      principalNameCell.alignment = { horizontal: 'center', vertical: 'middle' };

      // Generate binary and trigger download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportBlankTemplate
        ? 'Mau_trang_chi_tiet_24_cot_GDMN.xlsx'
        : `Bao_cao_chi_tiet_24_cot_GDMN_ngay_${dateParts.day}-${dateParts.month}-${dateParts.year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Lỗi khi xuất file Excel:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Bar (Hidden on print) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          {onNavigate && (
            <button
              onClick={() => onNavigate('/dashboard')}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Quay lại Tổng quan"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
                BIỂU THỐNG KÊ TỔNG HỢP MẦM NON
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-300">
                Mầm Non
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Nhà trường tổng hợp báo cáo sĩ số, chuyên cần, bán trú và sức khỏe từ các nhóm/lớp mầm non
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <CampusSelector
            selectedCampusId={selectedCampusId}
            onChange={setSelectedCampusId}
          />
          <DateNavigator selectedDate={selectedDate} onChangeDate={setSelectedDate} />

          <button
            type="button"
            onClick={() => loadReportData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            title="Đồng bộ lại số liệu mới nhất từ Supabase Cloud và giáo viên chủ nhiệm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">ĐỒNG BỘ CLOUD</span>
          </button>

          <button
            type="button"
            onClick={() => setBlankDateInTitle(!blankDateInTitle)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border shadow-2xs transition-colors ${
              blankDateInTitle
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
            }`}
            title="Nhấp để chuyển đổi giữa định dạng Ngày... Tháng... Năm (điền tay) hoặc Ngày cụ thể tự động"
          >
            <span className="font-mono text-[11px]">{blankDateInTitle ? 'MẪU ĐIỀN TAY: NGÀY .......THÁNG ......' : `NGÀY ${dateParts.day} THÁNG ${dateParts.month}`}</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportExcel(false)}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            title={`Xuất file Excel theo đúng mẫu đang chọn: ${
              viewMode === 'PRESCHOOL_AGE_BOARDING'
                ? 'Biểu theo Độ Tuổi & Suất Ăn (25 cột mở rộng)'
                : viewMode === 'PRESCHOOL_ORIGINAL_EXCEL'
                ? 'Mẫu báo cáo gốc (Hình ảnh Excel cột vàng)'
                : viewMode === 'PRESCHOOL_DETAILED'
                ? 'Biểu chi tiết Mầm Non (24 cột GDMN)'
                : 'Biểu rút gọn (Cơ bản)'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>{exporting ? 'ĐANG XUẤT...' : 'XUẤT EXCEL'}</span>
            <span className="hidden sm:inline-block text-[10px] bg-emerald-200/80 text-emerald-950 px-1.5 py-0.5 rounded font-black ml-0.5">
              {viewMode === 'PRESCHOOL_AGE_BOARDING'
                ? '25 CỘT'
                : viewMode === 'PRESCHOOL_ORIGINAL_EXCEL'
                ? 'MẪU GỐC'
                : viewMode === 'PRESCHOOL_DETAILED'
                ? '24 CỘT'
                : 'RÚT GỌN'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleExportExcel(true)}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            title="Xuất file Excel mẫu trắng theo đúng mẫu biểu đang chọn"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>MẪU TRẮNG</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-xs transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>IN BÁO CÁO</span>
          </button>

          {(isAdmin || isBGH) && (
            <button
              type="button"
              onClick={() => {
                setManagerDate(selectedDate);
                setShowResetManager(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition-colors cursor-pointer"
              title="Quản trị viên / BGH: Quản lý và reset báo cáo nhầm của các lớp về Chưa báo cáo"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>RESET BÁO CÁO NHẦM</span>
            </button>
          )}
        </div>
      </div>

      {/* Preschool Overview Metric Cards (Screen only) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Tổng số trẻ</span>
            <Baby className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black text-slate-900">{preschoolTotals.totalStudents}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-2">
            <span>Nữ: <b className="text-slate-800">{preschoolTotals.femaleStudents}</b></span>
            <span>DTTS: <b className="text-slate-800">{preschoolTotals.ethnicStudents}</b></span>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Có mặt / Đi học</span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700">{preschoolTotals.presentStudents}</div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-1">
            Chuyên cần: {preschoolTotals.attendanceRate.toFixed(1)}%
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Nghỉ học / Vắng</span>
            <AlertCircle className={`w-4 h-4 ${preschoolTotals.absentStudents > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className={`text-xl font-black ${preschoolTotals.absentStudents > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {preschoolTotals.absentStudents}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex gap-x-2">
            <span>Phép: <b className="text-slate-800">{preschoolTotals.absentExcused}</b></span>
            <span>K.phép: <b className="text-rose-600">{preschoolTotals.absentUnexcused}</b></span>
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Ăn bán trú</span>
            <Utensils className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-700">{preschoolTotals.boardingCount}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-x-2">
            <span>Trưa: <b className="text-slate-800">{preschoolTotals.lunchCount}</b></span>
            <span>Xế: <b className="text-slate-800">{preschoolTotals.snackCount}</b></span>
            {preschoolTotals.canceledCount > 0 && (
              <span className="text-rose-600">Cắt: <b>{preschoolTotals.canceledCount}</b></span>
            )}
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Theo dõi sức khỏe</span>
            <HeartPulse className={`w-4 h-4 ${preschoolTotals.healthIssueCount > 0 ? 'text-rose-600 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div className={`text-xl font-black ${preschoolTotals.healthIssueCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {preschoolTotals.healthIssueCount}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {preschoolTotals.healthIssueCount > 0 ? 'Trẻ có biểu hiện mệt/sốt' : 'Sức khỏe ổn định'}
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">Tiến độ nộp</span>
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-indigo-700">
            {reportData?.reportedClasses ?? 0} / {reportData?.totalClasses ?? 0}
          </div>
          <div className="text-[10px] text-indigo-600 font-semibold mt-1">
            {reportData?.totalClasses ? `${Math.round(((reportData.reportedClasses || 0) / reportData.totalClasses) * 100)}% đã báo cáo` : '0%'}
          </div>
        </div>
      </div>

      {/* Preschool Age Breakdown & Meal Stats Quick Banner (Screen only) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 print:hidden">
        {/* Khối Nhà trẻ */}
        <div className="bg-linear-to-r from-amber-50 to-orange-50/50 rounded-xl p-3 border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="font-extrabold text-xs text-amber-950 uppercase tracking-wide">Khối Nhà Trẻ (Dưới 3 tuổi)</span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
              Ăn NT: <b className="text-amber-950 font-black">{preschoolTotals.boardingNhaTre || 0}</b> suất
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white/80 p-1.5 rounded-lg border border-amber-100">
              <span className="text-[10px] text-slate-500 block">Sĩ số</span>
              <span className="font-black text-slate-900">{preschoolTotals.totalNhaTre || 0}</span>
            </div>
            <div className="bg-white/80 p-1.5 rounded-lg border border-amber-100">
              <span className="text-[10px] text-slate-500 block">Đi học</span>
              <span className="font-black text-emerald-700">{preschoolTotals.presentNhaTre || 0}</span>
            </div>
            <div className="bg-white/80 p-1.5 rounded-lg border border-amber-100">
              <span className="text-[10px] text-slate-500 block">Vắng</span>
              <span className={`font-black ${(preschoolTotals.absentNhaTre || 0) > 0 ? 'text-red-700' : 'text-slate-900'}`}>{preschoolTotals.absentNhaTre || 0}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-amber-100 text-amber-900 gap-1 flex-wrap">
            <span>Sinh {yNt0}: <b>{preschoolTotals.byYear?.[yNt0]?.present || 0}</b>/{preschoolTotals.byYear?.[yNt0]?.total || 0} (ăn: {preschoolTotals.byYear?.[yNt0]?.boarding || 0})</span>
            <span>Sinh {yNt1}: <b>{preschoolTotals.byYear?.[yNt1]?.present || 0}</b>/{preschoolTotals.byYear?.[yNt1]?.total || 0} (ăn: {preschoolTotals.byYear?.[yNt1]?.boarding || 0})</span>
            <span>Sinh {yNt2}: <b>{preschoolTotals.byYear?.[yNt2]?.present || 0}</b>/{preschoolTotals.byYear?.[yNt2]?.total || 0} (ăn: {preschoolTotals.byYear?.[yNt2]?.boarding || 0})</span>
          </div>
        </div>

        {/* Khối Mẫu giáo */}
        <div className="bg-linear-to-r from-teal-50 to-emerald-50/50 rounded-xl p-3 border border-teal-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
              <span className="font-extrabold text-xs text-teal-950 uppercase tracking-wide">Khối Mẫu Giáo (3 - 6 tuổi)</span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-200">
              Ăn MG: <b className="text-teal-950 font-black">{preschoolTotals.boardingMauGiao || 0}</b> suất
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-white/80 p-1.5 rounded-lg border border-teal-100">
              <span className="text-[10px] text-slate-500 block">Sĩ số</span>
              <span className="font-black text-slate-900">{preschoolTotals.totalMauGiao || 0}</span>
            </div>
            <div className="bg-white/80 p-1.5 rounded-lg border border-teal-100">
              <span className="text-[10px] text-slate-500 block">Đi học</span>
              <span className="font-black text-emerald-700">{preschoolTotals.presentMauGiao || 0}</span>
            </div>
            <div className="bg-white/80 p-1.5 rounded-lg border border-teal-100">
              <span className="text-[10px] text-slate-500 block">Vắng</span>
              <span className={`font-black ${(preschoolTotals.absentMauGiao || 0) > 0 ? 'text-red-700' : 'text-slate-900'}`}>{preschoolTotals.absentMauGiao || 0}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t border-teal-100 text-teal-900">
            <span>{yMgBe}: <b>{preschoolTotals.byYear?.[yMgBe]?.present || 0}</b> (ăn: {preschoolTotals.byYear?.[yMgBe]?.boarding || 0})</span>
            <span>{yMgNho}: <b>{preschoolTotals.byYear?.[yMgNho]?.present || 0}</b> (ăn: {preschoolTotals.byYear?.[yMgNho]?.boarding || 0})</span>
            <span>{yMgLon}: <b>{preschoolTotals.byYear?.[yMgLon]?.present || 0}</b> (ăn: {preschoolTotals.byYear?.[yMgLon]?.boarding || 0})</span>
          </div>
        </div>
      </div>

      {/* View Mode Switcher (Screen only) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:hidden bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <LayoutGrid className="w-4 h-4 text-blue-600" />
          <span>Chế độ hiển thị biểu tổng:</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setViewMode('PRESCHOOL_ORIGINAL_EXCEL')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'PRESCHOOL_ORIGINAL_EXCEL'
                ? 'bg-yellow-400 text-slate-950 shadow-2xs ring-1 ring-yellow-500 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ★ Mẫu báo cáo gốc (Hình ảnh Excel: Sĩ số, Ăn NT/MG, {yNt0}-{yMgLon}, Cột Vàng)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('PRESCHOOL_AGE_BOARDING')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'PRESCHOOL_AGE_BOARDING'
                ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-blue-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Biểu theo Độ Tuổi & Suất Ăn (25 cột mở rộng)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('PRESCHOOL_DETAILED')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'PRESCHOOL_DETAILED'
                ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-blue-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Biểu chi tiết Mầm Non (24 cột GDMN)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('PRESCHOOL_COMPACT')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'PRESCHOOL_COMPACT'
                ? 'bg-white text-blue-700 shadow-2xs ring-1 ring-blue-600/20'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Biểu rút gọn (Cơ bản)
          </button>
        </div>
      </div>

      {/* Main Document Layout - Matched precisely to the template image with solid borderlines */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8 print-container text-black">
        {viewMode === 'PRESCHOOL_ORIGINAL_EXCEL' ? (
          /* Header chuẩn 100% theo đúng biểu mẫu hình ảnh gốc */
          <div className="mb-4 text-center font-serif">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wide text-black font-serif">
              BÁO CÁO SỐ TRẺ THÁNG {dateParts.month}/{dateParts.year}
            </h1>
            <p className="text-xs sm:text-sm italic text-slate-800 font-serif mt-0.5">
              (Báo cáo sĩ số trước 8h sáng hằng ngày)
            </p>
            <p className="text-xs sm:text-sm font-bold text-black font-serif mt-1">
              Ngày {dateParts.day}/{dateParts.month}/{dateParts.year}
            </p>
          </div>
        ) : (
          /* Official Document Header Block */
          <>
            <div className="flex flex-col md:flex-row justify-between items-start font-serif text-black mb-6">
              <div className="flex flex-col items-start text-left">
                <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide">
                  {settings?.sub_department_name || 'UBND XÃ XA DUNG'}
                </div>
                <div className="text-[11px] sm:text-xs font-extrabold uppercase mt-0.5 tracking-tight border-b border-black pb-0.5">
                  {formattedSchoolName}
                </div>
                {selectedCampusId !== 'all' ? (
                  <div className="text-[11px] sm:text-xs font-bold mt-1 uppercase">
                    PHÂN HIỆU: {campuses.find((c) => c.id === selectedCampusId)?.name || '...........'}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col items-center text-center mt-3 md:mt-0">
                <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wide">
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </div>
                <div className="text-[10px] sm:text-xs font-bold border-b border-black pb-0.5 mt-0.5 px-4">
                  Độc lập - Tự do - Hạnh phúc
                </div>
              </div>
            </div>

            {/* Dynamic Big Report Title */}
            <div className="text-center my-6 pb-2">
              <h2 className="text-base sm:text-lg md:text-xl font-black uppercase tracking-wider text-black font-serif">
                {displayTitle}
              </h2>
              <p className="text-xs italic text-slate-700 font-serif mt-1">
                {viewMode === 'PRESCHOOL_AGE_BOARDING'
                  ? `(Biểu thống kê chi tiết theo độ tuổi & khẩu phần ăn: Khối Nhà trẻ, Khối Mẫu giáo, Trẻ sinh ${yNt0} - ${yMgLon})`
                  : viewMode === 'PRESCHOOL_DETAILED'
                  ? '(Biểu thống kê tổng hợp số liệu trẻ theo dõi hàng ngày - 24 cột chuẩn giáo dục Mầm Non)'
                  : '(Biểu thống kê sĩ số & bán trú mầm non rút gọn)'}
              </p>
            </div>
          </>
        )}

        {/* Data Table with Full Borders (Đường kẻ chuẩn theo hình gốc và quy định mầm non) */}
        <div className="overflow-x-auto">
          {viewMode === 'PRESCHOOL_ORIGINAL_EXCEL' ? (
            /* BẢNG TỔNG HỢP THEO MẪU BÁO CÁO GIỐNG HÌNH GỐC 100% (13 CỘT, KHÔNG HÀNG PHỤ, CỘT VÀNG ĐI HỌC) */
            <table className="w-full border-collapse border border-black text-xs font-serif min-w-[980px]">
              <thead>
                <tr className="bg-white text-black font-bold text-center">
                  <th className="border border-black px-1.5 py-2 w-10 text-center">STT</th>
                  <th className="border border-black px-2 py-2 min-w-[140px] text-center">Lớp</th>
                  <th className="border border-black px-1.5 py-2 min-w-[75px] text-center">Ăn nhà trẻ</th>
                  <th className="border border-black px-1.5 py-2 min-w-[75px] text-center">Ăn mẫu giáo</th>
                  <th className="border border-black px-1.5 py-2 min-w-[45px] text-center">{yNt0}</th>
                  <th className="border border-black px-1.5 py-2 min-w-[45px] text-center">{yNt1}</th>
                  <th className="border border-black px-1.5 py-2 min-w-[45px] text-center">{yNt2}</th>
                  <th className="border border-black px-1.5 py-2 min-w-[45px] text-center">{yMgBe}</th>
                  <th className="border border-black px-1.5 py-2 min-w-[45px] text-center">{yMgNho}</th>
                  <th className="border border-black px-1.5 py-2 min-w-[45px] text-center">{yMgLon}</th>
                  <th className="border border-black px-2 py-2 min-w-[85px] text-center bg-[#FFFF00] font-black text-black">
                    Tổng số trẻ đi học
                  </th>
                  <th className="border border-black px-2 py-2 min-w-[85px] text-center bg-[#FFFF00] font-black text-black">
                    Tổng số trẻ của lớp
                  </th>
                  <th className="border border-black px-1.5 py-2 min-w-[75px] text-center bg-[#FFFF00] font-black text-black">
                    Tỷ lệ trẻ đi học
                  </th>
                  <th className="border border-black px-2 py-2 min-w-[130px] text-center font-bold">
                    Tên trẻ nghỉ ốm đi viện
                  </th>
                  <th className="border border-black px-1.5 py-2 w-14 text-center print:hidden">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* DANH SÁCH TẤT CẢ CÁC LỚP: Bắt đầu từ STT 1 đến hết như trong hình ảnh gốc */}
                {sortedClassesForTemplate.map((row, idx) => {
                  const isReported = row.status !== 'NOT_REPORTED';
                  const ps = row.preschool || row.report?.preschool_data;
                  const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;
                  const totalAll = allVal?.total ?? (row.classItem?.student_count || 0);
                  const absentAll = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
                  const presentAll = allVal?.present ?? Math.max(0, totalAll - absentAll);
                  const isNT = isNhaTreClass(row.classItem?.class_name, row.classItem?.grade);

                  let rawBoard = isNT ? (ps?.boarding_nha_tre ?? ps?.boarding_count) : (ps?.boarding_mau_giao ?? ps?.boarding_count);
                  if (isReported && (rawBoard === undefined || rawBoard === null || (Number(rawBoard) === 0 && presentAll > 0))) {
                    rawBoard = presentAll;
                  }
                  const boardingVal = isReported ? (rawBoard ?? (boardingIndicator && row.values ? (row.values[boardingIndicator.id]?.total || 0) : 0)) : '';

                  const rateStr = totalAll > 0 && isReported
                    ? ((presentAll / totalAll) * 100).toFixed(2).replace('.', ',')
                    : (isReported ? '0,00' : '');

                  // Tên trẻ nghỉ ốm đi viện
                  let sickColDisplay: React.ReactNode = '';
                  if (isReported) {
                    const absList = row.report?.absent_students || [];
                    const sickList = absList.filter((s: any) => {
                      const re = (s.reason || '').toLowerCase();
                      return re.includes('ốm') || re.includes('viện') || re.includes('sốt') || re.includes('bệnh') || re.includes('đau');
                    });

                    if (sickList.length > 0) {
                      sickColDisplay = (
                        <span className="font-semibold text-red-700">
                          {sickList.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ')}
                        </span>
                      );
                    } else if (absList.length > 0) {
                      sickColDisplay = (
                        <span className="text-slate-700">
                          {absList.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ')}
                        </span>
                      );
                    } else {
                      sickColDisplay = '';
                    }
                  }

                  const clsId = row.classItem?.id || (row as any).classId || String(idx);
                  const clsName = row.classItem?.class_name || (row as any).className || '';
                  const clsCount = row.classItem?.student_count || 0;

                  return (
                    <tr
                      key={clsId}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      {/* STT */}
                      <td className="border border-black py-1.5 px-1 text-center font-semibold">
                        {idx + 1}
                      </td>

                      {/* Lớp */}
                      <td className="border border-black py-1.5 px-2 text-left font-bold text-slate-950 whitespace-nowrap">
                        {clsName}
                      </td>

                      {/* Ăn nhà trẻ */}
                      <td className="border border-black py-1.5 px-1 text-center font-bold">
                        {isNT ? (isReported ? boardingVal : '') : ''}
                      </td>

                      {/* Ăn mẫu giáo */}
                      <td className="border border-black py-1.5 px-1 text-center font-bold">
                        {!isNT ? (isReported ? boardingVal : '') : ''}
                      </td>

                      {/* yNt0 */}
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isNT && isReported ? (ps?.age_stats?.[yNt0]?.present ?? ps?.age_stats?.[yNt0]?.total ?? '') : ''}
                      </td>

                      {/* yNt1 */}
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isNT && isReported ? (ps?.age_stats?.[yNt1]?.present ?? ps?.age_stats?.[yNt1]?.total ?? '') : ''}
                      </td>

                      {/* yNt2 */}
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isNT && isReported ? (ps?.age_stats?.[yNt2]?.present ?? ps?.age_stats?.[yNt2]?.total ?? '') : ''}
                      </td>

                      {/* yMgBe */}
                      <td className="border border-black py-1.5 px-1 text-center">
                        {!isNT && isReported ? (ps?.age_stats?.[yMgBe]?.present ?? ps?.age_stats?.[yMgBe]?.total ?? '') : ''}
                      </td>

                      {/* yMgNho */}
                      <td className="border border-black py-1.5 px-1 text-center">
                        {!isNT && isReported ? (ps?.age_stats?.[yMgNho]?.present ?? ps?.age_stats?.[yMgNho]?.total ?? '') : ''}
                      </td>

                      {/* yMgLon */}
                      <td className="border border-black py-1.5 px-1 text-center">
                        {!isNT && isReported ? (ps?.age_stats?.[yMgLon]?.present ?? ps?.age_stats?.[yMgLon]?.total ?? '') : ''}
                      </td>

                      {/* TỔNG SỐ TRẺ ĐI HỌC (CỘT VÀNG CHUẨN 100% THEO ẢNH GỐC) */}
                      <td className="border border-black py-1.5 px-1 font-black text-center bg-[#FFFF00] text-black">
                        {isReported ? presentAll : ''}
                      </td>

                      {/* Tổng số trẻ của lớp */}
                      <td className="border border-black py-1.5 px-1 font-bold text-center">
                        {isReported ? totalAll : (clsCount || '')}
                      </td>

                      {/* Tỷ lệ trẻ đi học */}
                      <td className="border border-black py-1.5 px-1 text-center font-medium">
                        {rateStr}
                      </td>

                      {/* Tên trẻ nghỉ ốm đi viện */}
                      <td className="border border-black py-1.5 px-2 text-center">
                        {sickColDisplay}
                      </td>

                      {/* Thao tác (print:hidden) */}
                      <td className="border border-black py-1.5 px-1 text-center print:hidden">
                        {isReported && (isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === clsId)) && (
                          <button
                            type="button"
                            onClick={() => handlePromptReset(clsId, clsName, selectedDate)}
                            disabled={row.status === 'LOCKED' && !isAdmin}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors disabled:opacity-40"
                            title="Xóa/Reset báo cáo"
                          >
                            <RotateCcw className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* DÒNG TỔNG CỘNG TOÀN TRƯỜNG Ở CUỐI */}
                <tr className="bg-slate-100 font-black text-black border-t-2 border-black">
                  <td colSpan={2} className="border border-black py-2 px-2 text-center uppercase tracking-wider">
                    TỔNG CỘNG TOÀN TRƯỜNG
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.boardingNhaTre || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.boardingMauGiao || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.byYear?.[yNt0]?.present || preschoolTotals.byYear?.[yNt0]?.total || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.byYear?.[yNt1]?.present || preschoolTotals.byYear?.[yNt1]?.total || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.byYear?.[yNt2]?.present || preschoolTotals.byYear?.[yNt2]?.total || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.byYear?.[yMgBe]?.present || preschoolTotals.byYear?.[yMgBe]?.total || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.byYear?.[yMgNho]?.present || preschoolTotals.byYear?.[yMgNho]?.total || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {preschoolTotals.byYear?.[yMgLon]?.present || preschoolTotals.byYear?.[yMgLon]?.total || 0}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black bg-[#FFFF00] text-black text-sm">
                    {preschoolTotals.presentStudents}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black text-sm">
                    {preschoolTotals.totalStudents}
                  </td>
                  <td className="border border-black py-2 px-1 text-center font-black">
                    {(Number(preschoolTotals.attendanceRate) || 0).toFixed(2).replace('.', ',')}
                  </td>
                  <td className="border border-black py-2 px-2 text-center font-bold">
                    {preschoolTotals.healthIssueCount > 0 ? preschoolTotals.healthIssueCount : ''}
                  </td>
                  <td className="border border-black py-2 px-1 text-center print:hidden"></td>
                </tr>
              </tbody>
            </table>
          ) : viewMode === 'PRESCHOOL_AGE_BOARDING' ? (
            /* BIỂU THỐNG KÊ THEO ĐỘ TUỔI & KHẨU PHẦN ĂN (ĂN NHÀ TRẺ, ĂN MẪU GIÁO, SINH 2025 - 2021) */
            <table className="w-full border-collapse border-2 border-black text-xs font-serif min-w-[1100px]">
              <thead>
                {/* Header Row 1 */}
                <tr className="bg-slate-100 text-black font-bold text-center">
                  <th rowSpan={2} className="border border-black px-1.5 py-2 w-10">
                    STT
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2 min-w-[110px] text-center">
                    Nhóm / Lớp
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2 min-w-[130px] text-center">
                    Giáo viên phụ trách
                  </th>
                  <th colSpan={7} className="border border-black px-1 py-1.5 text-center bg-amber-50/80 text-amber-950 font-black">
                    KHỐI NHÀ TRẺ (DƯỚI 3 TUỔI)
                  </th>
                  <th colSpan={7} className="border border-black px-1 py-1.5 text-center bg-teal-50/80 text-teal-950 font-black">
                    KHỐI MẪU GIÁO (3 - 6 TUỔI)
                  </th>
                  <th colSpan={5} className="border border-black px-1 py-1.5 text-center bg-blue-50/80 text-blue-950 font-black">
                    TỔNG HỢP & BÁN TRÚ TOÀN LỚP
                  </th>
                  <th rowSpan={2} className="border border-black px-1.5 py-2 w-20 text-center">
                    TỈ LỆ CHUYÊN CẦN (%)
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2 min-w-[160px] text-center">
                    Tên trẻ nghỉ & Ghi chú
                  </th>
                  <th rowSpan={2} className="border border-black px-1.5 py-2 w-16 text-center print:hidden">
                    Xử lý
                  </th>
                </tr>

                {/* Header Row 2: Sub-columns */}
                <tr className="bg-slate-50 text-black font-bold text-center text-[11px]">
                  {/* Khối Nhà trẻ */}
                  <th className="border border-black px-1 py-1.5 w-11 bg-amber-50/40">Sĩ số</th>
                  <th className="border border-black px-1 py-1.5 w-11 bg-amber-50/40 text-emerald-800">Có mặt</th>
                  <th className="border border-black px-1 py-1.5 w-10 bg-amber-50/40 text-red-700">Vắng</th>
                  <th className="border border-black px-1 py-1.5 w-12 bg-amber-100/80 text-amber-950 font-black">Ăn NT</th>
                  <th className="border border-black px-1 py-1.5 min-w-[70px] bg-amber-50/20 font-bold">Sinh {yNt0} (&lt; 1T)</th>
                  <th className="border border-black px-1 py-1.5 min-w-[70px] bg-amber-50/20 font-bold">Sinh {yNt1} (1-2T)</th>
                  <th className="border border-black px-1 py-1.5 min-w-[70px] bg-amber-50/20 font-bold">Sinh {yNt2} (2-3T)</th>

                  {/* Khối Mẫu giáo */}
                  <th className="border border-black px-1 py-1.5 w-11 bg-teal-50/40">Sĩ số</th>
                  <th className="border border-black px-1 py-1.5 w-11 bg-teal-50/40 text-emerald-800">Có mặt</th>
                  <th className="border border-black px-1 py-1.5 w-10 bg-teal-50/40 text-red-700">Vắng</th>
                  <th className="border border-black px-1 py-1.5 w-12 bg-teal-100/80 text-teal-950 font-black">Ăn MG</th>
                  <th className="border border-black px-1 py-1.5 min-w-[70px] bg-teal-50/20 font-bold">Sinh {yMgBe} (3-4T)</th>
                  <th className="border border-black px-1 py-1.5 min-w-[70px] bg-teal-50/20 font-bold">Sinh {yMgNho} (4-5T)</th>
                  <th className="border border-black px-1 py-1.5 min-w-[70px] bg-teal-50/20 font-bold">Sinh {yMgLon} (5-6T)</th>

                  {/* Tổng hợp & Bán trú */}
                  <th className="border border-black px-1 py-1.5 w-11">Tổng TS</th>
                  <th className="border border-black px-1 py-1.5 w-11 text-emerald-800">Đi học</th>
                  <th className="border border-black px-1 py-1.5 w-10 text-red-700">Vắng</th>
                  <th className="border border-black px-1 py-1.5 w-12 font-black text-amber-900 bg-amber-50/50">Tổng ăn</th>
                  <th className="border border-black px-1 py-1.5 w-10 text-rose-700">Cắt ăn</th>
                </tr>
              </thead>

              <tbody>
                {reportData?.rows.map((row, idx) => {
                  const isReported = row.status !== 'NOT_REPORTED';
                  const ps = row.preschool || row.report?.preschool_data;
                  const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;

                  const totalAll = ps?.female_count !== undefined && (allVal?.total ?? 0) === 0
                    ? ((ps.female_count || 0) + (ps.ethnic_count || 0))
                    : (allVal?.total ?? (row.classItem?.student_count || 0));

                  const absentAll = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
                  const presentAll = allVal?.present ?? Math.max(0, totalAll - absentAll);
                  const isNT = isNhaTreClass(row.classItem?.class_name, row.classItem?.grade);

                  const totalNT = ps?.total_nha_tre ?? (isNT ? totalAll : 0);
                  const presentNT = ps?.present_nha_tre ?? (isNT ? presentAll : 0);
                  const absentNT = ps?.absent_nha_tre ?? Math.max(0, totalNT - presentNT);
                  let boardingNT = ps?.boarding_nha_tre;
                  if (isReported && isNT && (boardingNT === undefined || boardingNT === null || (Number(boardingNT) === 0 && presentAll > 0))) {
                    boardingNT = presentAll;
                  } else if (!boardingNT) {
                    boardingNT = 0;
                  }

                  const totalMG = ps?.total_mau_giao ?? (!isNT ? totalAll : 0);
                  const presentMG = ps?.present_mau_giao ?? (!isNT ? presentAll : 0);
                  const absentMG = ps?.absent_mau_giao ?? Math.max(0, totalMG - presentMG);
                  let boardingMG = ps?.boarding_mau_giao;
                  if (isReported && !isNT && (boardingMG === undefined || boardingMG === null || (Number(boardingMG) === 0 && presentAll > 0))) {
                    boardingMG = presentAll;
                  } else if (!boardingMG) {
                    boardingMG = 0;
                  }

                  let boardingTotal = ps?.boarding_count;
                  if (isReported && (boardingTotal === undefined || boardingTotal === null || (Number(boardingTotal) === 0 && presentAll > 0))) {
                    boardingTotal = presentAll;
                  } else if (!boardingTotal) {
                    boardingTotal = (Number(boardingNT) || 0) + (Number(boardingMG) || 0) || (boardingIndicator ? (row.values[boardingIndicator.id]?.total || 0) : 0);
                  }
                  const canceledTotal = ps?.canceled_count ?? absentAll;

                  const renderYearStat = (yr: string) => {
                    if (!isReported) return '-';
                    const stat = ps?.age_stats?.[yr];
                    if (!stat || ((stat.total || 0) === 0 && (stat.present || 0) === 0 && (stat.boarding || 0) === 0)) {
                      return <span className="text-slate-300">-</span>;
                    }
                    const p = stat.present ?? 0;
                    const b = (stat.boarding !== undefined && stat.boarding !== null && (stat.boarding > 0 || p === 0)) ? stat.boarding : p;
                    return (
                      <div className="text-[10px] leading-tight">
                        <span className="font-bold text-emerald-800">{p}</span>
                        <span className="text-slate-400">/{stat.total ?? 0}</span>
                        <span className="text-amber-800 font-bold ml-1 block sm:inline">({b} ăn)</span>
                      </div>
                    );
                  };

                  let notesText = '';
                  if (isReported) {
                    const absNames = row.report?.absent_students?.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ') || '';
                    const healthNote = ps?.health_note ? `[SK: ${ps.health_note}]` : '';
                    const extraNote = row.report?.notes ? `[GC: ${row.report.notes}]` : '';
                    notesText = [absNames, healthNote, extraNote].filter(Boolean).join(' | ') || '-';
                  } else {
                    notesText = 'Chưa báo cáo';
                  }

                  const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

                  const clsId = row.classItem?.id || (row as any).classId || String(idx);
                  const clsName = row.classItem?.class_name || (row as any).className || '';

                  return (
                    <tr key={clsId} className="text-center hover:bg-slate-50/70">
                      <td className="border border-black py-1.5 px-1 font-medium">{idx + 1}</td>
                      <td className="border border-black py-1.5 px-2 font-bold text-left">{clsName}</td>
                      <td className="border border-black py-1.5 px-2 text-left font-medium">{row.teacher?.full_name || '-'}</td>

                      {/* Khối Nhà trẻ */}
                      <td className="border border-black py-1.5 px-1 bg-amber-50/20">{isReported ? totalNT : '-'}</td>
                      <td className="border border-black py-1.5 px-1 font-bold text-emerald-800 bg-amber-50/20">{isReported ? presentNT : '-'}</td>
                      <td className={`border border-black py-1.5 px-1 bg-amber-50/20 ${absentNT > 0 ? 'text-red-700 font-bold' : ''}`}>{isReported ? absentNT : '-'}</td>
                      <td className="border border-black py-1.5 px-1 font-black text-amber-900 bg-amber-100/50">{isReported ? boardingNT : '-'}</td>
                      <td className="border border-black py-1.5 px-1 bg-amber-50/10">{renderYearStat(yNt0)}</td>
                      <td className="border border-black py-1.5 px-1 bg-amber-50/10">{renderYearStat(yNt1)}</td>
                      <td className="border border-black py-1.5 px-1 bg-amber-50/10">{renderYearStat(yNt2)}</td>

                      {/* Khối Mẫu giáo */}
                      <td className="border border-black py-1.5 px-1 bg-teal-50/20">{isReported ? totalMG : '-'}</td>
                      <td className="border border-black py-1.5 px-1 font-bold text-emerald-800 bg-teal-50/20">{isReported ? presentMG : '-'}</td>
                      <td className={`border border-black py-1.5 px-1 bg-teal-50/20 ${absentMG > 0 ? 'text-red-700 font-bold' : ''}`}>{isReported ? absentMG : '-'}</td>
                      <td className="border border-black py-1.5 px-1 font-black text-teal-900 bg-teal-100/50">{isReported ? boardingMG : '-'}</td>
                      <td className="border border-black py-1.5 px-1 bg-teal-50/10">{renderYearStat(yMgBe)}</td>
                      <td className="border border-black py-1.5 px-1 bg-teal-50/10">{renderYearStat(yMgNho)}</td>
                      <td className="border border-black py-1.5 px-1 bg-teal-50/10">{renderYearStat(yMgLon)}</td>

                      {/* Tổng hợp & Bán trú */}
                      <td className="border border-black py-1.5 px-1 font-bold">{isReported ? totalAll : '-'}</td>
                      <td className="border border-black py-1.5 px-1 font-bold text-emerald-800">{isReported ? presentAll : '-'}</td>
                      <td className={`border border-black py-1.5 px-1 font-bold ${absentAll > 0 ? 'text-red-700' : ''}`}>{isReported ? absentAll : '-'}</td>
                      <td className="border border-black py-1.5 px-1 font-black text-amber-800 bg-amber-50/40">{isReported ? boardingTotal : '-'}</td>
                      <td className={`border border-black py-1.5 px-1 ${canceledTotal > 0 ? 'text-red-600 font-bold' : ''}`}>{isReported ? canceledTotal : '-'}</td>

                      {/* Chuyên cần */}
                      <td className="border border-black py-1.5 px-1 font-bold text-black">{isReported ? `${presentRate.toFixed(1).replace('.', ',')}%` : '-'}</td>

                      {/* Ghi chú */}
                      <td className="border border-black py-1.5 px-2 text-left text-[11px]">{isReported ? notesText : <span className="text-slate-400 italic">Chưa báo cáo</span>}</td>

                      {/* Xử lý */}
                      <td className="border border-black py-1 px-1 text-center print:hidden">
                        {isReported && (isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === clsId)) ? (
                          <button
                            type="button"
                            onClick={() => handlePromptReset(clsId, clsName, selectedDate)}
                            disabled={row.status === 'LOCKED' && !isAdmin}
                            className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                            title="Reset báo cáo nhầm về Chưa báo cáo"
                          >
                            <RotateCcw className="w-3 h-3 text-rose-600" />
                            <span>Reset</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* TỔNG CỘNG TOÀN TRƯỜNG */}
                {reportData && (
                  <tr className="bg-slate-100 font-bold text-center border-t-2 border-black text-black">
                    <td colSpan={3} className="border border-black py-2 px-2 text-center uppercase tracking-wide text-[11px]">
                      TỔNG CỘNG TOÀN TRƯỜNG
                    </td>

                    {/* Khối Nhà trẻ */}
                    <td className="border border-black py-2 px-1 text-center font-bold bg-amber-50/50">{preschoolTotals.totalNhaTre || 0}</td>
                    <td className="border border-black py-2 px-1 text-center font-extrabold text-emerald-800 bg-amber-50/50">{preschoolTotals.presentNhaTre || 0}</td>
                    <td className={`border border-black py-2 px-1 text-center font-bold bg-amber-50/50 ${(preschoolTotals.absentNhaTre || 0) > 0 ? 'text-red-700' : ''}`}>{preschoolTotals.absentNhaTre || 0}</td>
                    <td className="border border-black py-2 px-1 text-center font-black text-amber-900 bg-amber-200/70">{preschoolTotals.boardingNhaTre || 0}</td>
                    <td className="border border-black py-2 px-1 text-center text-[10px] bg-amber-50/30">
                      <b>{preschoolTotals.byYear?.[yNt0]?.present || 0}</b>/{preschoolTotals.byYear?.[yNt0]?.total || 0}
                      <span className="text-amber-900 font-bold ml-1">({preschoolTotals.byYear?.[yNt0]?.boarding || 0} ăn)</span>
                    </td>
                    <td className="border border-black py-2 px-1 text-center text-[10px] bg-amber-50/30">
                      <b>{preschoolTotals.byYear?.[yNt1]?.present || 0}</b>/{preschoolTotals.byYear?.[yNt1]?.total || 0}
                      <span className="text-amber-900 font-bold ml-1">({preschoolTotals.byYear?.[yNt1]?.boarding || 0} ăn)</span>
                    </td>
                    <td className="border border-black py-2 px-1 text-center text-[10px] bg-amber-50/30">
                      <b>{preschoolTotals.byYear?.[yNt2]?.present || 0}</b>/{preschoolTotals.byYear?.[yNt2]?.total || 0}
                      <span className="text-amber-900 font-bold ml-1">({preschoolTotals.byYear?.[yNt2]?.boarding || 0} ăn)</span>
                    </td>

                    {/* Khối Mẫu giáo */}
                    <td className="border border-black py-2 px-1 text-center font-bold bg-teal-50/50">{preschoolTotals.totalMauGiao || 0}</td>
                    <td className="border border-black py-2 px-1 text-center font-extrabold text-emerald-800 bg-teal-50/50">{preschoolTotals.presentMauGiao || 0}</td>
                    <td className={`border border-black py-2 px-1 text-center font-bold bg-teal-50/50 ${(preschoolTotals.absentMauGiao || 0) > 0 ? 'text-red-700' : ''}`}>{preschoolTotals.absentMauGiao || 0}</td>
                    <td className="border border-black py-2 px-1 text-center font-black text-teal-900 bg-teal-200/70">{preschoolTotals.boardingMauGiao || 0}</td>
                    <td className="border border-black py-2 px-1 text-center text-[10px] bg-teal-50/30">
                      <b>{preschoolTotals.byYear?.[yMgBe]?.present || 0}</b>/{preschoolTotals.byYear?.[yMgBe]?.total || 0}
                      <span className="text-teal-900 font-bold ml-1">({preschoolTotals.byYear?.[yMgBe]?.boarding || 0} ăn)</span>
                    </td>
                    <td className="border border-black py-2 px-1 text-center text-[10px] bg-teal-50/30">
                      <b>{preschoolTotals.byYear?.[yMgNho]?.present || 0}</b>/{preschoolTotals.byYear?.[yMgNho]?.total || 0}
                      <span className="text-teal-900 font-bold ml-1">({preschoolTotals.byYear?.[yMgNho]?.boarding || 0} ăn)</span>
                    </td>
                    <td className="border border-black py-2 px-1 text-center text-[10px] bg-teal-50/30">
                      <b>{preschoolTotals.byYear?.[yMgLon]?.present || 0}</b>/{preschoolTotals.byYear?.[yMgLon]?.total || 0}
                      <span className="text-teal-900 font-bold ml-1">({preschoolTotals.byYear?.[yMgLon]?.boarding || 0} ăn)</span>
                    </td>

                    {/* Tổng hợp toàn lớp */}
                    <td className="border border-black py-2 px-1 text-center font-bold">{preschoolTotals.totalStudents}</td>
                    <td className="border border-black py-2 px-1 text-center font-extrabold text-emerald-800">{preschoolTotals.presentStudents}</td>
                    <td className={`border border-black py-2 px-1 text-center font-bold ${preschoolTotals.absentStudents > 0 ? 'text-red-700' : ''}`}>{preschoolTotals.absentStudents}</td>
                    <td className="border border-black py-2 px-1 text-center font-extrabold text-amber-800 bg-amber-50/50">{preschoolTotals.boardingCount}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.canceledCount}</td>

                    {/* Chuyên cần */}
                    <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                      {(Number(preschoolTotals.attendanceRate) || 0).toFixed(1).replace('.', ',')}%
                    </td>
                    <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                      Đã báo cáo: {reportData?.reportedClasses ?? 0}/{reportData?.totalClasses ?? 0} nhóm/lớp
                    </td>
                    <td className="border border-black py-2 px-1 text-center font-bold text-slate-400 print:hidden">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : viewMode === 'PRESCHOOL_DETAILED' ? (
            <table className="w-full border-collapse border-2 border-black text-xs font-serif min-w-[1050px]">
              <thead>
                {/* Header Row 1 */}
                <tr className="bg-slate-100 text-black font-bold text-center">
                  <th rowSpan={2} className="border border-black px-1.5 py-2 w-10">
                    STT
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2 min-w-[110px] text-center">
                    Nhóm / Lớp
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2 min-w-[140px] text-center">
                    Giáo viên phụ trách
                  </th>
                  <th colSpan={6} className="border border-black px-1 py-1.5 text-center">
                    SĨ SỐ TRẺ
                  </th>
                  <th colSpan={3} className="border border-black px-1 py-1.5 text-center">
                    ĐI HỌC / CÓ MẶT
                  </th>
                  <th colSpan={3} className="border border-black px-1 py-1.5 text-center">
                    NGHỈ HỌC / VẮNG
                  </th>
                  <th colSpan={6} className="border border-black px-1 py-1.5 text-center bg-amber-50/60 text-amber-950 font-bold">
                    ĂN BÁN TRÚ & KHẨU PHẦN
                  </th>
                  <th colSpan={2} className="border border-black px-1 py-1.5 text-center">
                    SỨC KHỎE & THEO DÕI
                  </th>
                  <th rowSpan={2} className="border border-black px-1.5 py-2 w-20 text-center">
                    TỈ LỆ CHUYÊN CẦN (%)
                  </th>
                  <th rowSpan={2} className="border border-black px-1.5 py-2 w-16 text-center print:hidden">
                    Xử lý
                  </th>
                </tr>

                {/* Header Row 2: Sub-columns */}
                <tr className="bg-slate-50 text-black font-bold text-center text-[11px]">
                  {/* Sĩ số trẻ */}
                  <th className="border border-black px-1 py-1.5 w-11">Tổng</th>
                  <th className="border border-black px-1 py-1.5 w-10">Nữ</th>
                  <th className="border border-black px-1 py-1.5 w-11">DTTS</th>
                  <th className="border border-black px-1 py-1.5 w-12">Nữ DTTS</th>
                  <th className="border border-black px-1 py-1.5 w-11">Nghèo</th>
                  <th className="border border-black px-1 py-1.5 w-10">KT</th>

                  {/* Đi học */}
                  <th className="border border-black px-1 py-1.5 w-11">Tổng</th>
                  <th className="border border-black px-1 py-1.5 w-10">Nữ</th>
                  <th className="border border-black px-1 py-1.5 w-11">DTTS</th>

                  {/* Nghỉ học */}
                  <th className="border border-black px-1 py-1.5 w-11">Tổng</th>
                  <th className="border border-black px-1 py-1.5 w-11">Có phép</th>
                  <th className="border border-black px-1 py-1.5 w-11">K.phép</th>

                  {/* Ăn bán trú & khẩu phần */}
                  <th className="border border-black px-1 py-1.5 w-11">Số ăn</th>
                  <th className="border border-black px-1 py-1.5 w-11 bg-amber-50/70 text-amber-950 font-bold">Ăn NT</th>
                  <th className="border border-black px-1 py-1.5 w-11 bg-teal-50/70 text-teal-950 font-bold">Ăn MG</th>
                  <th className="border border-black px-1 py-1.5 w-10">Trưa</th>
                  <th className="border border-black px-1 py-1.5 w-10">Xế</th>
                  <th className="border border-black px-1 py-1.5 w-10">Cắt ăn</th>

                  {/* Sức khỏe & theo dõi */}
                  <th className="border border-black px-1 py-1.5 w-12">Sốt/mệt</th>
                  <th className="border border-black px-2 py-1.5 min-w-[160px]">Tên trẻ nghỉ & Ghi chú</th>
                </tr>
              </thead>

              <tbody>
                {reportData?.rows.map((row, idx) => {
                  const isReported = row.status !== 'NOT_REPORTED';
                  const ps = row.preschool || row.report?.preschool_data;
                  const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;

                  const totalAll = ps?.female_count !== undefined && (allVal?.total ?? 0) === 0
                    ? ((ps.female_count || 0) + (ps.ethnic_count || 0))
                    : (allVal?.total ?? (row.classItem?.student_count || 0));

                  const absentAll = allVal?.absent ?? ((ps?.absent_excused || 0) + (ps?.absent_unexcused || 0));
                  const presentAll = allVal?.present ?? Math.max(0, totalAll - absentAll);

                  const femaleCount = ps?.female_count ?? 0;
                  const ethnicCount = ps?.ethnic_count ?? 0;
                  const femaleEthnicCount = ps?.female_ethnic_count ?? 0;
                  const poorCount = ps?.poor_count ?? 0;
                  const disabledCount = ps?.disabled_count ?? 0;

                  const presentFemale = ps?.present_female_count ?? Math.min(femaleCount, presentAll);
                  const presentEthnic = ps?.present_ethnic_count ?? Math.min(ethnicCount, presentAll);

                  const absentExcused = ps?.absent_excused ?? (row.report?.absent_students?.filter((s: any) => s.is_excused).length || 0);
                  const absentUnexcused = ps?.absent_unexcused ?? Math.max(0, absentAll - absentExcused);

                  const boardingCount = ps?.boarding_count ?? (boardingIndicator && row.values ? (row.values[boardingIndicator.id]?.total || 0) : 0);
                  const lunchCount = ps?.lunch_count ?? boardingCount;
                  const snackCount = ps?.snack_count ?? boardingCount;
                  const canceledCount = ps?.canceled_count ?? 0;

                  const healthIssueCount = ps?.health_issue_count ?? 0;

                  let notesText = '';
                  if (isReported) {
                    const absNames = row.report?.absent_students?.map((s: any) => `${s.full_name}${s.reason ? ` (${s.reason})` : ''}`).join(', ') || '';
                    const healthNote = ps?.health_note ? `[SK: ${ps.health_note}]` : '';
                    const extraNote = row.report?.notes ? `[GC: ${row.report.notes}]` : '';
                    notesText = [absNames, healthNote, extraNote].filter(Boolean).join(' | ') || '-';
                  } else {
                    notesText = 'Chưa báo cáo';
                  }

                  const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

                  const clsId = row.classItem?.id || (row as any).classId || String(idx);
                  const clsName = row.classItem?.class_name || (row as any).className || '';

                  return (
                    <tr key={clsId} className="text-center hover:bg-slate-50/70">
                      <td className="border border-black py-1.5 px-1 text-center font-medium">
                        {idx + 1}
                      </td>
                      <td className="border border-black py-1.5 px-2 font-bold text-black text-left">
                        {clsName}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-left text-black font-medium">
                        {row.teacher?.full_name || '-'}
                      </td>

                      {/* Sĩ số */}
                      <td className="border border-black py-1.5 px-1 font-semibold text-center">
                        {isReported ? totalAll : (totalAll > 0 ? totalAll : '-')}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? femaleCount : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? ethnicCount : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? femaleEthnicCount : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? poorCount : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? disabledCount : '-'}
                      </td>

                      {/* Đi học */}
                      <td className="border border-black py-1.5 px-1 font-bold text-emerald-800 text-center">
                        {isReported ? presentAll : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? presentFemale : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? presentEthnic : '-'}
                      </td>

                      {/* Nghỉ học */}
                      <td className={`border border-black py-1.5 px-1 font-bold text-center ${absentAll > 0 ? 'text-red-700' : 'text-black'}`}>
                        {isReported ? absentAll : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? absentExcused : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? absentUnexcused : '-'}
                      </td>

                      {/* Bán trú & khẩu phần */}
                      <td className="border border-black py-1.5 px-1 font-semibold text-amber-800 text-center">
                        {isReported ? boardingCount : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 font-bold text-amber-900 bg-amber-50/40 text-center">
                        {isReported ? (ps?.boarding_nha_tre ?? 0) : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 font-bold text-teal-900 bg-teal-50/40 text-center">
                        {isReported ? (ps?.boarding_mau_giao ?? 0) : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? lunchCount : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-1 text-center">
                        {isReported ? snackCount : '-'}
                      </td>
                      <td className={`border border-black py-1.5 px-1 text-center ${canceledCount > 0 ? 'text-red-600 font-bold' : ''}`}>
                        {isReported ? canceledCount : '-'}
                      </td>

                      {/* Sức khỏe & ghi chú */}
                      <td className={`border border-black py-1.5 px-1 text-center ${healthIssueCount > 0 ? 'text-red-600 font-bold bg-rose-50' : ''}`}>
                        {isReported ? healthIssueCount : '-'}
                      </td>
                      <td className="border border-black py-1.5 px-2 text-left text-[11px] text-black">
                        {isReported ? (
                          notesText
                        ) : (
                          <span className="text-slate-400 italic">Chưa báo cáo</span>
                        )}
                      </td>

                      {/* Tỉ lệ chuyên cần */}
                      <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                        {isReported ? `${presentRate.toFixed(1).replace('.', ',')}%` : '-'}
                      </td>

                      {/* Xử lý */}
                      <td className="border border-black py-1 px-1 text-center print:hidden">
                        {isReported && (isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === clsId)) ? (
                          <button
                            type="button"
                            onClick={() => handlePromptReset(clsId, clsName, selectedDate)}
                            disabled={row.status === 'LOCKED' && !isAdmin}
                            className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                            title="Reset báo cáo nhầm về Chưa báo cáo"
                          >
                            <RotateCcw className="w-3 h-3 text-rose-600" />
                            <span>Reset</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* TỔNG CỘNG TOÀN TRƯỜNG */}
                {reportData && (
                  <tr className="bg-slate-100 font-bold text-center border-t-2 border-black text-black">
                    <td colSpan={3} className="border border-black py-2 px-2 text-center uppercase tracking-wide text-[11px]">
                      TỔNG CỘNG TOÀN TRƯỜNG
                    </td>

                    {/* Sĩ số */}
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.totalStudents}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.femaleStudents}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.ethnicStudents}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.femaleEthnicStudents}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.poorStudents}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.disabledStudents}</td>

                    {/* Đi học */}
                    <td className="border border-black py-2 px-1 text-center text-emerald-800 font-extrabold">{preschoolTotals.presentStudents}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.presentFemale}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.presentEthnic}</td>

                    {/* Nghỉ học */}
                    <td className={`border border-black py-2 px-1 text-center font-extrabold ${preschoolTotals.absentStudents > 0 ? 'text-red-700' : 'text-black'}`}>
                      {preschoolTotals.absentStudents}
                    </td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.absentExcused}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.absentUnexcused}</td>

                    {/* Bán trú & khẩu phần */}
                    <td className="border border-black py-2 px-1 text-center text-amber-800 font-extrabold">{preschoolTotals.boardingCount}</td>
                    <td className="border border-black py-2 px-1 text-center text-amber-900 font-black bg-amber-100/60">{preschoolTotals.boardingNhaTre || 0}</td>
                    <td className="border border-black py-2 px-1 text-center text-teal-900 font-black bg-teal-100/60">{preschoolTotals.boardingMauGiao || 0}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.lunchCount}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.snackCount}</td>
                    <td className="border border-black py-2 px-1 text-center">{preschoolTotals.canceledCount}</td>

                    {/* Sức khỏe & Ghi chú */}
                    <td className={`border border-black py-2 px-1 text-center font-extrabold ${preschoolTotals.healthIssueCount > 0 ? 'text-red-700' : 'text-black'}`}>
                      {preschoolTotals.healthIssueCount}
                    </td>
                    <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                      Đã báo cáo: {reportData?.reportedClasses ?? 0}/{reportData?.totalClasses ?? 0} nhóm/lớp
                    </td>

                    {/* Chuyên cần */}
                    <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                      {(Number(preschoolTotals.attendanceRate) || 0).toFixed(1).replace('.', ',')}%
                    </td>
                    <td className="border border-black py-2 px-1 text-center font-bold text-slate-400 print:hidden">
                      -
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* COMPACT VIEW (10 COLUMNS) */
            <table className="w-full border-collapse border-2 border-black text-xs font-serif">
              <thead>
                {/* Header Row 1 */}
                <tr className="bg-slate-50 text-black font-bold text-center">
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-14">
                    Lớp
                  </th>
                  <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[160px] text-center">
                    Giáo viên chủ nhiệm
                  </th>
                  <th colSpan={2} className="border border-black px-2 py-1.5 text-center">
                    Học sinh toàn trường
                  </th>
                  <th colSpan={2} className="border border-black px-2 py-1.5 text-center">
                    Học sinh bán trú
                  </th>
                  <th colSpan={2} className="border border-black px-2 py-1.5 text-center">
                    Học sinh ngoại trú
                  </th>
                  <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[200px] text-center">
                    Tên học sinh nghỉ
                  </th>
                  <th rowSpan={2} className="border border-black px-3 py-2.5 min-w-[150px] text-center">
                    Địa chỉ
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-24 text-center">
                    Tỉ lệ phần trăm vắng (%)
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-28 text-center">
                    Tỉ lệ phần trăm chuyên cần (%)
                  </th>
                  <th rowSpan={2} className="border border-black px-2 py-2.5 w-16 text-center print:hidden">
                    Xử lý
                  </th>
                </tr>

                {/* Header Row 2: Sub-columns */}
                <tr className="bg-slate-50 text-black font-bold text-center text-[11px]">
                  <th className="border border-black px-1.5 py-1.5 w-20">Tổng số học sinh</th>
                  <th className="border border-black px-1.5 py-1.5 w-20">Số học sinh vắng</th>
                  <th className="border border-black px-1.5 py-1.5 w-20">Tổng số học sinh</th>
                  <th className="border border-black px-1.5 py-1.5 w-20">Số học sinh vắng</th>
                  <th className="border border-black px-1.5 py-1.5 w-20">Tổng số học sinh</th>
                  <th className="border border-black px-1.5 py-1.5 w-20">Số học sinh vắng</th>
                </tr>
              </thead>

              <tbody>
                {reportData?.rows.map((row, idx) => {
                  const isReported = row.status !== 'NOT_REPORTED';

                  const allVal = allIndicator && row.values ? row.values[allIndicator.id] : null;
                  const boardingVal = boardingIndicator && row.values ? row.values[boardingIndicator.id] : null;

                  const totalAll = allVal?.total ?? 0;
                  const absentAll = allVal?.absent ?? 0;
                  const presentAll = allVal?.present ?? (totalAll - absentAll);

                  const totalBoarding = boardingVal?.total ?? 0;
                  const absentBoarding = boardingVal?.absent ?? 0;
                  
                  const totalNgoaiTru = Math.max(0, totalAll - totalBoarding);
                  const absentNgoaiTru = Math.max(0, absentAll - absentBoarding);

                  const absentRate = totalAll > 0 ? (absentAll / totalAll) * 100 : 0;
                  const presentRate = totalAll > 0 ? (presentAll / totalAll) * 100 : 0;

                  const studentNames = getAbsentStudentText(row);
                  const studentAddresses = getAbsentStudentAddresses(row);

                  const clsId = row.classItem?.id || (row as any).classId || String(idx);
                  const clsName = row.classItem?.class_name || (row as any).className || '';

                  return (
                    <tr key={clsId} className="text-center hover:bg-slate-50/70">
                      <td className="border border-black py-1.5 px-2 font-bold text-black text-center">
                        {clsName}
                      </td>

                      <td className="border border-black py-1.5 px-2.5 text-left text-black font-medium">
                        {row.teacher?.full_name || '-'}
                      </td>

                      <td className="border border-black py-1.5 px-1 font-medium text-center">
                        {isReported ? totalAll : totalAll > 0 ? totalAll : '-'}
                      </td>

                      <td
                        className={`border border-black py-1.5 px-1 font-bold text-center ${
                          absentAll > 0 ? 'text-red-700' : 'text-black'
                        }`}
                      >
                        {isReported ? absentAll : '-'}
                      </td>

                      <td className="border border-black py-1.5 px-1 font-medium text-center">
                        {isReported ? totalBoarding : totalBoarding > 0 ? totalBoarding : '-'}
                      </td>

                      <td
                        className={`border border-black py-1.5 px-1 font-bold text-center ${
                          absentBoarding > 0 ? 'text-red-700' : 'text-black'
                        }`}
                      >
                        {isReported ? absentBoarding : '-'}
                      </td>

                      <td className="border border-black py-1.5 px-1 font-medium text-center">
                        {isReported ? totalNgoaiTru : totalNgoaiTru > 0 ? totalNgoaiTru : '-'}
                      </td>

                      <td
                        className={`border border-black py-1.5 px-1 font-bold text-center ${
                          absentNgoaiTru > 0 ? 'text-red-700' : 'text-black'
                        }`}
                      >
                        {isReported ? absentNgoaiTru : '-'}
                      </td>

                      <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                        {isReported ? (
                          studentNames || ''
                        ) : (
                          <span className="text-slate-400 italic">Chưa báo cáo</span>
                        )}
                      </td>

                      <td className="border border-black py-1.5 px-2.5 text-left text-[11px] text-black whitespace-pre">
                        {isReported ? studentAddresses || '-' : '-'}
                      </td>

                      <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                        {isReported ? `${absentRate.toFixed(2).replace('.', ',')}%` : '-'}
                      </td>

                      <td className="border border-black py-1.5 px-1 font-bold text-center text-black">
                        {isReported ? `${presentRate.toFixed(2).replace('.', ',')}%` : '-'}
                      </td>

                      <td className="border border-black py-1 px-1.5 text-center print:hidden">
                        {isReported && (isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === clsId)) ? (
                          <button
                            type="button"
                            onClick={() => handlePromptReset(clsId, clsName, selectedDate)}
                            disabled={row.status === 'LOCKED' && !isAdmin}
                            className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors shadow-2xs disabled:opacity-40 cursor-pointer"
                            title="Reset báo cáo nhầm về Chưa báo cáo"
                          >
                            <RotateCcw className="w-3 h-3 text-rose-600" />
                            <span>Reset</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* TỔNG CỘNG HÀNG CUỐI (Summary Row) */}
                {reportData && (
                  (() => {
                    const totalsObj = reportData.totals || {};
                    const totalSchoolAll = totalsObj[allIndicator?.id || '']?.total || 0;
                    const absentSchoolAll = totalsObj[allIndicator?.id || '']?.absent || 0;
                    const presentSchoolAll = totalsObj[allIndicator?.id || '']?.present || (totalSchoolAll - absentSchoolAll);

                    const totalSchoolBoarding = boardingIndicator && totalsObj[boardingIndicator.id] ? (totalsObj[boardingIndicator.id]?.total || 0) : 0;
                    const absentSchoolBoarding = boardingIndicator && totalsObj[boardingIndicator.id] ? (totalsObj[boardingIndicator.id]?.absent || 0) : 0;

                    const overallAbsentRate = totalSchoolAll > 0 ? (absentSchoolAll / totalSchoolAll) * 100 : 0;
                    const overallPresentRate = totalSchoolAll > 0 ? (presentSchoolAll / totalSchoolAll) * 100 : 0;

                    return (
                      <tr className="bg-slate-100 font-bold text-center border-t-2 border-black text-black">
                        <td colSpan={2} className="border border-black py-2 px-3 text-center uppercase tracking-wide">
                          TỔNG CỘNG
                        </td>

                        <td className="border border-black py-2 px-1 text-sm font-bold text-center">
                          {totalSchoolAll}
                        </td>
                        <td className="border border-black py-2 px-1 text-sm font-bold text-red-700 text-center">
                          {absentSchoolAll}
                        </td>

                        <td className="border border-black py-2 px-1 text-sm font-bold text-center">
                          {totalSchoolBoarding}
                        </td>
                        <td className="border border-black py-2 px-1 text-sm font-bold text-red-700 text-center">
                          {absentSchoolBoarding}
                        </td>

                        <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                          Đã báo cáo: {reportData?.reportedClasses ?? 0}/{reportData?.totalClasses ?? 0} lớp
                        </td>
                        <td className="border border-black py-2 px-2 text-left text-[11px] font-semibold text-slate-700">
                          -
                        </td>

                        <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                          {overallAbsentRate.toFixed(2).replace('.', ',')}%
                        </td>
                        <td className="border border-black py-2 px-1 text-xs font-bold text-black text-center">
                          {overallPresentRate.toFixed(2).replace('.', ',')}%
                        </td>
                        <td className="border border-black py-2 px-1 text-center font-bold text-slate-400 print:hidden">
                          -
                        </td>
                      </tr>
                    );
                  })()
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info & Signatures */}
        <div className="mt-8 grid grid-cols-2 gap-8 text-center font-serif text-black print-break-inside-avoid">
          <div>
            <div className="text-xs uppercase font-bold">
              {signatureSettings.reporter_title}
            </div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">{signatureSettings.reporter_name}</div>
          </div>

          <div>
            <div className="text-xs italic text-slate-700 mb-1">
              Ngày {dateParts.day} tháng {dateParts.month} năm {dateParts.year}
            </div>
            <div className="text-xs uppercase font-bold">
              {signatureSettings.principal_title}
            </div>
            <div className="text-[11px] italic text-slate-600 mt-0.5">(Ký, đóng dấu và ghi rõ họ tên)</div>
            <div className="h-16"></div>
            <div className="font-bold text-sm">{signatureSettings.principal_name}</div>
          </div>
        </div>

        {/* Developer attribution footnote */}
        {settings?.developer_name && (
          <div className="mt-8 pt-2 border-t border-dotted border-slate-300 flex flex-col sm:flex-row items-center justify-between gap-1 text-[10px] text-slate-400 font-sans print:text-black">
            <span>Hệ thống Quản lý Báo cáo Sĩ số Học sinh Trực tuyến</span>
            <span>Phần mềm phát triển bởi: <strong>{settings.developer_name}</strong>{settings.developer_contact ? ` - ${settings.developer_contact}` : ''}</span>
          </div>
        )}
      </div>

      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200 print:hidden">
          <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Modal Bảng Điều Khiển Quản Lý & Reset Báo Cáo Nhầm */}
      {showResetManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 border-b border-rose-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                    Quản Lý & Reset Báo Cáo Nhầm
                  </h3>
                  <p className="text-xs text-rose-700 font-semibold mt-0.5">
                    Khôi phục trạng thái Chưa báo cáo cho từng lớp theo ngày
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResetManager(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/70 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date Selection Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Chọn ngày cần reset:</span>
                <input
                  type="date"
                  value={managerDate}
                  onChange={(e) => setManagerDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800 bg-white shadow-2xs focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                />
              </div>

              <div className="text-xs text-slate-600 font-medium">
                Đã báo cáo:{' '}
                <strong className="text-rose-700 font-black">
                  {managerData?.rows.filter((r) => r.status !== 'NOT_REPORTED').length || 0}
                </strong>
                /{managerData?.rows.length || 0} lớp
              </div>
            </div>

            {/* Classes List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {managerLoading ? (
                <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Đang tải danh sách lớp...</span>
                </div>
              ) : (
                (() => {
                  const reportedRows = (managerData?.rows || []).filter((r) => {
                    const cid = r.classItem?.id || (r as any).classId;
                    if (isGVCN && !isAdmin && !isBGH) {
                      return cid === currentUser?.assigned_class_id;
                    }
                    return true;
                  });

                  if (reportedRows.length === 0) {
                    return (
                      <div className="py-10 text-center text-slate-400 text-xs italic">
                        Không có lớp nào trong danh sách.
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {reportedRows.map((row, rIdx) => {
                        const isRep = row.status !== 'NOT_REPORTED';
                        const cid = row.classItem?.id || (row as any).classId || String(rIdx);
                        const cname = row.classItem?.class_name || (row as any).className || `Lớp ${rIdx + 1}`;
                        const canOperate = isAdmin || isBGH || (isGVCN && currentUser?.assigned_class_id === cid);

                        return (
                          <div
                            key={cid}
                            className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                              isRep
                                ? 'bg-white border-slate-200 hover:border-rose-300 shadow-2xs'
                                : 'bg-slate-50/60 border-slate-200/60 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                                  isRep ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {cname}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                  <span>Lớp {cname}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                      isRep
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {isRep ? 'ĐÃ BÁO CÁO' : 'CHƯA BÁO CÁO'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                  GVCN: {row.teacher?.full_name || 'Chưa phân công'}
                                  {row.report?.reported_time && (
                                    <span className="ml-2 font-mono text-slate-400">
                                      ({row.report.reported_time})
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {isRep && canOperate ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handlePromptReset(cid, cname, managerDate)
                                  }
                                  disabled={row.status === 'LOCKED' && !isAdmin}
                                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span>Reset về Chưa báo cáo</span>
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 italic">
                                  {isRep ? 'Đã khóa' : 'Chưa có báo cáo'}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
              <div className="text-[11px] text-slate-500 italic">
                Lưu ý: Reset sẽ xóa dữ liệu sĩ số ngày được chọn của lớp để giáo viên nộp lại.
              </div>
              <button
                type="button"
                onClick={() => setShowResetManager(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal Xác Nhận Reset Từng Lớp */}
      {confirmResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 print:hidden">
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
                  <span className="font-extrabold text-slate-900 text-sm">Lớp {confirmResetModal.className}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Ngày báo cáo:</span>
                  <span className="font-bold text-slate-800">
                    {confirmResetModal.date.split('-').reverse().join('/')}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 text-amber-800 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  Lưu ý khi reset:
                </div>
                Dữ liệu sĩ số đã nhập của lớp sẽ bị xóa bỏ hoàn toàn. Bảng tổng hợp toàn trường và biểu mẫu báo cáo sẽ chuyển lớp về trạng thái <strong className="text-amber-950">Chưa báo cáo</strong> cho đến khi GVCN nhập lại.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmResetModal(null)}
                disabled={isResetting}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{isResetting ? 'Đang reset...' : 'XÁC NHẬN RESET VỀ CHƯA BÁO CÁO'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
