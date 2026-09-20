import { Profile, ClassItem, PreschoolGradeConfig, TeachingScope } from '../types';

/**
 * Xác định phân loại của một lớp mầm non:
 * - 'NHA_TRE': Lớp Nhà trẻ (nhóm 24 - 36 tháng, dưới 3 tuổi)
 * - 'MAU_GIAO': Lớp Mẫu giáo (3 - 6 tuổi: Bé, Nhỡ, Lớn, Ghép)
 */
export function getClassCategory(
  cls: { class_name?: string; grade?: number | string },
  preschoolGrades?: PreschoolGradeConfig[]
): 'NHA_TRE' | 'MAU_GIAO' {
  if (cls.grade !== undefined && cls.grade !== null) {
    if (cls.grade === 1 || cls.grade === '1') return 'NHA_TRE';
    const num = Number(cls.grade);
    if (!isNaN(num) && preschoolGrades && preschoolGrades.length > 0) {
      const matched = preschoolGrades.find((p) => p.grade_num === num);
      if (matched) return matched.category;
    }
  }

  const name = (cls.class_name || '').toUpperCase().trim();
  if (
    name.startsWith('NT') ||
    name.includes('NHÀ TRẺ') ||
    name.includes('NHA TRE') ||
    name.includes('NHÓM TRẺ') ||
    name.includes('NHOM TRE') ||
    name.includes('24-36')
  ) {
    return 'NHA_TRE';
  }

  return 'MAU_GIAO';
}

/**
 * Xác định phạm vi quyền nhập báo cáo của Giáo viên (GVCN):
 * - ADMIN / BGH: Có quyền toàn trường ('ALL')
 * - GVCN:
 *   1. Nếu đã được cấu hình explicit `teaching_scope` trong hồ sơ người dùng ('NHA_TRE' | 'MAU_GIAO' | 'ALL')
 *   2. Nếu chưa, tự động suy diễn từ lớp được phân công giảng dạy (assigned_class_id hoặc homeroom_teacher_id)
 *      - Lớp phân công thuộc Nhà trẻ => Quyền chỉ nhập Khối Nhà trẻ ('NHA_TRE')
 *      - Lớp phân công thuộc Mẫu giáo => Quyền chỉ nhập Khối Mẫu giáo ('MAU_GIAO')
 *   3. Nếu chưa phân công lớp, kiểm tra tên/email tài khoản có chứa 'nt'/'nha tre' hoặc 'mg'/'mau giao'
 */
export function getTeacherAllowedScope(
  user: Profile | null | undefined,
  classes: ClassItem[],
  preschoolGrades?: PreschoolGradeConfig[]
): TeachingScope {
  if (!user) return 'ALL';
  if (user.role === 'ADMIN' || user.role === 'BGH') return 'ALL';

  // 1. Explicit teaching scope setting on user profile
  if (user.teaching_scope) {
    return user.teaching_scope;
  }

  // 2. Inferred automatically from assigned class
  const assignedClass = classes.find(
    (c) => c.id === user.assigned_class_id || c.homeroom_teacher_id === user.id
  );
  if (assignedClass) {
    return getClassCategory(assignedClass, preschoolGrades);
  }

  // 3. Fallback heuristic from email / name
  const textHint = `${user.email} ${user.full_name}`.toLowerCase();
  if (
    textHint.includes('nha tre') ||
    textHint.includes('nhà trẻ') ||
    textHint.includes('nt_') ||
    textHint.includes('gv_nt')
  ) {
    return 'NHA_TRE';
  }
  if (
    textHint.includes('mau giao') ||
    textHint.includes('mẫu giáo') ||
    textHint.includes('mg_') ||
    textHint.includes('gv_mg')
  ) {
    return 'MAU_GIAO';
  }

  // Default if completely unknown
  return 'ALL';
}

/**
 * Kiểm tra xem người dùng có quyền nhập dữ liệu / điểm danh cho lớp mục tiêu hay không
 */
export function canTeacherInputClass(
  user: Profile | null | undefined,
  targetClass: ClassItem | undefined | null,
  classes: ClassItem[],
  preschoolGrades?: PreschoolGradeConfig[]
): boolean {
  if (!user || !targetClass) return false;
  if (user.role === 'ADMIN' || user.role === 'BGH') return true;

  const allowedScope = getTeacherAllowedScope(user, classes, preschoolGrades);
  if (allowedScope === 'ALL') return true;

  const targetCategory = getClassCategory(targetClass, preschoolGrades);
  return allowedScope === targetCategory;
}

/**
 * Lọc danh sách các lớp mà người dùng có quyền nhập báo cáo
 */
export function getPermittedClasses(
  user: Profile | null | undefined,
  classes: ClassItem[],
  preschoolGrades?: PreschoolGradeConfig[]
): ClassItem[] {
  if (!user) return [];
  if (user.role === 'ADMIN' || user.role === 'BGH') return classes;

  const allowedScope = getTeacherAllowedScope(user, classes, preschoolGrades);
  if (allowedScope === 'ALL') return classes;

  return classes.filter((c) => getClassCategory(c, preschoolGrades) === allowedScope);
}

/**
 * Nhãn hiển thị mô tả quyền nhập theo khối
 */
export function getScopeLabel(scope: TeachingScope): string {
  switch (scope) {
    case 'NHA_TRE':
      return 'Khối Nhà trẻ (Dưới 3 tuổi)';
    case 'MAU_GIAO':
      return 'Khối Mẫu giáo (3 - 6 tuổi)';
    case 'ALL':
    default:
      return 'Tất cả các khối (Nhà trẻ & Mẫu giáo)';
  }
}
