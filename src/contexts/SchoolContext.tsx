import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SchoolSettings, SchoolYear, Campus, ClassItem, IndicatorGroup, Student, PreschoolGradeConfig, DEFAULT_PRESCHOOL_GRADES, Profile, TeachingScope } from '../types';
import { StorageService, subscribeRealtime } from '../services/storage';
import { getClassCategory } from '../utils/preschoolPermissions';

interface SchoolContextType {
  settings: SchoolSettings | null;
  years: SchoolYear[];
  activeYear: SchoolYear | null;
  campuses: Campus[];
  classes: ClassItem[];
  indicators: IndicatorGroup[];
  students: Student[];
  preschoolGrades: PreschoolGradeConfig[];
  loading: boolean;
  refreshAll: () => Promise<void>;
  updateSettings: (newSettings: Partial<SchoolSettings>) => Promise<void>;
  updateSchoolSettings: (newSettings: Partial<SchoolSettings>) => Promise<void>;
  addClass: (cls: Omit<ClassItem, 'id' | 'created_at'>) => Promise<void>;
  updateClass: (clsOrId: ClassItem | string, partial?: Partial<ClassItem>) => Promise<void>;
  batchUpdateClasses: (updates: Array<{ id: string; class_name?: string; grade?: number; homeroom_teacher_id?: string; campus_id?: string; sort_order?: number }>) => Promise<void>;
  createTeacherAndAssign: (teacherData: { full_name: string; email: string; phone?: string }, classId?: string) => Promise<string>;
  deleteClass: (id: string) => Promise<void>;
  toggleLockClass: (id: string, lock: boolean) => Promise<void>;
  addIndicator: (ig: Omit<IndicatorGroup, 'id' | 'created_at'>) => Promise<void>;
  updateIndicator: (id: string, partial: Partial<IndicatorGroup>) => Promise<void>;
  deleteIndicator: (id: string) => Promise<void>;
  saveIndicator: (ig: IndicatorGroup) => Promise<void>;
  setActiveSchoolYear: (yearId: string) => Promise<void>;
  saveSchoolYear: (year: SchoolYear) => Promise<void>;
  deleteSchoolYear: (yearId: string) => Promise<void>;
  toggleLockSchoolYear: (yearId: string, locked: boolean) => Promise<void>;
  saveCampus: (campus: Campus) => Promise<void>;
  deleteCampus: (campusId: string) => Promise<void>;
  resetAllDataToEmpty: () => Promise<void>;
  addStudent: (student: Omit<Student, 'id' | 'created_at'>) => Promise<void>;
  updateStudent: (studentId: string, partial: Partial<Student>) => Promise<void>;
  deleteStudent: (studentId: string) => Promise<void>;
  importStudents: (students: Array<Omit<Student, 'id' | 'created_at'>>) => Promise<void>;
  updatePreschoolGrades: (grades: PreschoolGradeConfig[]) => Promise<void>;
  resetPreschoolGrades: () => Promise<void>;
  cleanDuplicateTeachers: () => Promise<{ removedCount: number; cleanedNames: string[] }>;
  getDuplicateTeachersSummary: () => Promise<{ duplicateGroupsCount: number; duplicateAccountsCount: number; details: Array<{ name: string; count: number; ids: string[] }> }>;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SchoolSettings | null>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_school_settings_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return null;
  });
  const [years, setYears] = useState<SchoolYear[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_school_years_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [activeYear, setActiveYear] = useState<SchoolYear | null>(() => {
    if (typeof window !== 'undefined') {
      try { 
        const raw = localStorage.getItem('sso_school_years_v1'); 
        if (raw) {
          const arr = JSON.parse(raw);
          return arr.find((y: any) => y.is_active) || arr[0] || null;
        }
      } catch {}
    }
    return null;
  });
  const [campuses, setCampuses] = useState<Campus[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_campuses_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [classes, setClasses] = useState<ClassItem[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_classes_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [indicators, setIndicators] = useState<IndicatorGroup[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_indicator_groups_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [students, setStudents] = useState<Student[]>(() => {
    if (typeof window !== 'undefined') {
      try { const raw = localStorage.getItem('sso_students_v1'); if (raw) return JSON.parse(raw); } catch {}
    }
    return [];
  });
  const [preschoolGrades, setPreschoolGrades] = useState<PreschoolGradeConfig[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('sso_preschool_grades_v1');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }
    return [...DEFAULT_PRESCHOOL_GRADES];
  });
  const [loading, setLoading] = useState(false);

  const refreshAll = useCallback(async () => {
    try {
      const cData = await StorageService.getCampuses(); // Call this first to ensure it seeds settings if necessary
      const [sData, yData, clData, iData, stData, pgData] = await Promise.all([
        StorageService.getSettings(),
        StorageService.getSchoolYears(),
        StorageService.getClasses(),
        StorageService.getIndicatorGroups(),
        StorageService.getStudents(),
        StorageService.getPreschoolGrades(),
      ]);
      setSettings(sData);
      setYears(yData);
      const curYear = yData.find((y) => y.is_active) || yData[0] || null;
      setActiveYear(curYear);
      setCampuses(cData);
      setClasses(clData);
      setIndicators(iData);
      setStudents(stData);
      setPreschoolGrades(pgData);
    } catch (err) {
      console.error('Failed to load school context data:', err);
    }
  }, []);

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));

    // Subscribe to realtime changes - only refresh structural school context when necessary
    const unsubscribe = subscribeRealtime((event) => {
      const structuralTables = [
        'school_settings',
        'school_years',
        'campuses',
        'classes',
        'indicator_groups',
        'students',
        'preschool_grades',
        'profiles',
        'all',
        'all_reset',
      ];
      // Do NOT refresh school context on daily_reports, daily_report_values, or system_logs
      // to avoid resetting active teacher input forms or freezing their screens
      if (structuralTables.includes(event.table)) {
        refreshAll();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [refreshAll]);

  const updateSettings = async (newSettings: Partial<SchoolSettings>) => {
    const updated = await StorageService.updateSettings(newSettings);
    setSettings(updated);
  };

  const syncTeacherAssignment = async (classId: string, teacherId?: string) => {
    try {
      const [profiles, currentClasses] = await Promise.all([
        StorageService.getProfiles(),
        StorageService.getClasses(),
      ]);
      const targetClass = currentClasses.find((c) => c.id === classId);
      const classScope = targetClass ? getClassCategory(targetClass, preschoolGrades) : 'ALL';

      for (const p of profiles) {
        if (teacherId && p.id === teacherId) {
          let updated = false;
          if (p.assigned_class_id !== classId) {
            p.assigned_class_id = classId;
            updated = true;
          }
          if (!p.teaching_scope || p.teaching_scope === 'ALL') {
            p.teaching_scope = classScope;
            updated = true;
          }
          if (updated) {
            await StorageService.saveProfile(p);
          }
        } else if (p.assigned_class_id === classId && (!teacherId || p.id !== teacherId)) {
          p.assigned_class_id = undefined;
          await StorageService.saveProfile(p);
        }
      }
    } catch (e) {
      console.error('Error syncing teacher assignment:', e);
    }
  };

  const addClass = async (cls: Omit<ClassItem, 'id' | 'created_at'>) => {
    const classId = `cls_${Date.now()}_${cls.class_name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const newClass: ClassItem = {
      ...cls,
      id: classId,
      created_at: new Date().toISOString(),
    };
    await StorageService.saveClass(newClass);
    if (newClass.homeroom_teacher_id) {
      await syncTeacherAssignment(newClass.id, newClass.homeroom_teacher_id);
    }
    await refreshAll();
  };

  const updateClass = async (clsOrId: ClassItem | string, partial?: Partial<ClassItem>) => {
    let targetClass: ClassItem | undefined;
    if (typeof clsOrId === 'string') {
      const currentList = await StorageService.getClasses();
      const existing = currentList.find((c) => c.id === clsOrId);
      if (existing) {
        targetClass = { ...existing, ...(partial || {}) };
      }
    } else {
      targetClass = clsOrId;
    }

    if (targetClass) {
      await StorageService.saveClass(targetClass);
      await syncTeacherAssignment(targetClass.id, targetClass.homeroom_teacher_id);
      await refreshAll();
    }
  };

  const batchUpdateClasses = async (
    updates: Array<{ id: string; class_name?: string; grade?: number; homeroom_teacher_id?: string; campus_id?: string; sort_order?: number }>
  ) => {
    const currentList = await StorageService.getClasses();
    for (const item of updates) {
      const existing = currentList.find((c) => c.id === item.id);
      if (existing) {
        const updated: ClassItem = {
          ...existing,
          class_name: item.class_name !== undefined ? item.class_name.trim().toUpperCase() : existing.class_name,
          grade: item.grade !== undefined ? item.grade : existing.grade,
          homeroom_teacher_id: item.homeroom_teacher_id !== undefined ? (item.homeroom_teacher_id || undefined) : existing.homeroom_teacher_id,
          campus_id: item.campus_id !== undefined ? (item.campus_id || undefined) : existing.campus_id,
          sort_order: item.sort_order !== undefined ? item.sort_order : existing.sort_order,
        };
        await StorageService.saveClass(updated);
        await syncTeacherAssignment(updated.id, updated.homeroom_teacher_id);
      }
    }
    await refreshAll();
  };

  const createTeacherAndAssign = async (
    teacherData: { full_name: string; email: string; phone?: string },
    classId?: string
  ): Promise<string> => {
    const teacherId = `u_teacher_${Date.now()}`;
    const currentList = await StorageService.getClasses();
    const assignedClass = classId ? currentList.find((c) => c.id === classId) : undefined;
    const scope: TeachingScope = assignedClass ? getClassCategory(assignedClass, preschoolGrades) : 'ALL';

    const newProfile: Profile = {
      id: teacherId,
      full_name: teacherData.full_name.trim(),
      email: teacherData.email.trim().toLowerCase(),
      role: 'GVCN' as const,
      active: true,
      phone: teacherData.phone?.trim() || '',
      assigned_class_id: classId,
      teaching_scope: scope,
      created_at: new Date().toISOString(),
    };
    await StorageService.saveProfile(newProfile);

    if (classId && assignedClass) {
      assignedClass.homeroom_teacher_id = teacherId;
      await StorageService.saveClass(assignedClass);
    }

    await refreshAll();
    return teacherId;
  };

  const deleteClass = async (id: string) => {
    await StorageService.deleteClass(id);
    await syncTeacherAssignment(id, undefined);
    await refreshAll();
  };

  const toggleLockClass = async (id: string, lock: boolean) => {
    await StorageService.toggleClassLock(id, lock);
    await refreshAll();
  };

  const addIndicator = async (ig: Omit<IndicatorGroup, 'id'>) => {
    const newIg: IndicatorGroup = {
      ...ig,
      id: `ig_${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    await StorageService.saveIndicatorGroup(newIg);
    await refreshAll();
  };

  const updateIndicator = async (id: string, partial: Partial<IndicatorGroup>) => {
    const list = await StorageService.getIndicatorGroups();
    const existing = list.find((i) => i.id === id);
    if (existing) {
      await StorageService.saveIndicatorGroup({ ...existing, ...partial });
      await refreshAll();
    }
  };

  const saveIndicator = async (ig: IndicatorGroup) => {
    await StorageService.saveIndicatorGroup(ig);
    await refreshAll();
  };

  const deleteIndicator = async (id: string) => {
    await StorageService.deleteIndicatorGroup(id);
    await refreshAll();
  };

  const setActiveSchoolYear = async (yearId: string) => {
    await StorageService.setActiveSchoolYear(yearId);
    await refreshAll();
  };

  const saveSchoolYear = async (year: SchoolYear) => {
    await StorageService.saveSchoolYear(year);
    await refreshAll();
  };

  const deleteSchoolYear = async (yearId: string) => {
    await StorageService.deleteSchoolYear(yearId);
    await refreshAll();
  };

  const toggleLockSchoolYear = async (yearId: string, locked: boolean) => {
    await StorageService.toggleLockSchoolYear(yearId, locked);
    await refreshAll();
  };

  const saveCampus = async (campus: Campus) => {
    await StorageService.saveCampus(campus);
    await refreshAll();
  };

  const deleteCampus = async (campusId: string) => {
    await StorageService.deleteCampus(campusId);
    await refreshAll();
  };

  const resetAllDataToEmpty = async () => {
    await StorageService.resetAllDataToEmpty();
    await refreshAll();
  };

  const addStudent = async (student: Omit<Student, 'id' | 'created_at'>) => {
    const newStudent: Student = {
      ...student,
      id: `std_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
    await StorageService.saveStudent(newStudent);
    await refreshAll();
  };

  const updateStudent = async (studentId: string, partial: Partial<Student>) => {
    const list = await StorageService.getStudents();
    const existing = list.find((s) => s.id === studentId);
    if (existing) {
      const updated = { ...existing, ...partial };
      await StorageService.saveStudent(updated);
      await refreshAll();
    }
  };

  const deleteStudent = async (studentId: string) => {
    await StorageService.deleteStudent(studentId);
    await refreshAll();
  };

  const importStudents = async (newStudents: Array<Omit<Student, 'id' | 'created_at'>>) => {
    const studentsToSave: Student[] = newStudents.map((s, idx) => ({
      ...s,
      id: `std_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
    }));
    await StorageService.saveStudents(studentsToSave);
    await refreshAll();
  };

  const updatePreschoolGrades = async (grades: PreschoolGradeConfig[]) => {
    await StorageService.savePreschoolGrades(grades);
    setPreschoolGrades(grades);
  };

  const resetPreschoolGrades = async () => {
    const defaults = await StorageService.resetPreschoolGradesToDefault();
    setPreschoolGrades(defaults);
  };

  const cleanDuplicateTeachers = async () => {
    const res = await StorageService.deduplicateProfiles();
    await refreshAll();
    return res;
  };

  const getDuplicateTeachersSummary = async () => {
    return await StorageService.getDuplicateProfilesSummary();
  };

  return (
    <SchoolContext.Provider
      value={{
        settings,
        years,
        activeYear,
        campuses,
        classes,
        indicators,
        students,
        preschoolGrades,
        loading,
        refreshAll,
        updateSettings,
        updateSchoolSettings: updateSettings,
        addClass,
        updateClass,
        batchUpdateClasses,
        createTeacherAndAssign,
        deleteClass,
        toggleLockClass,
        addIndicator,
        updateIndicator,
        saveIndicator,
        deleteIndicator,
        setActiveSchoolYear,
        saveSchoolYear,
        deleteSchoolYear,
        toggleLockSchoolYear,
        saveCampus,
        deleteCampus,
        resetAllDataToEmpty,
        addStudent,
        updateStudent,
        deleteStudent,
        importStudents,
        updatePreschoolGrades,
        resetPreschoolGrades,
        cleanDuplicateTeachers,
        getDuplicateTeachersSummary,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error('useSchool must be used within a SchoolProvider');
  }
  return context;
};
