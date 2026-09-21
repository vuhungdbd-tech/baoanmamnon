/**
 * Tiện ích xử lý chuỗi tiếng Việt:
 * - Chuẩn hóa Unicode NFC (tránh lỗi gõ Telex/VNI phân rã NFD)
 * - Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
 * - So khớp tìm kiếm thông minh
 */

export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  // Chuẩn hóa Unicode dựng sẵn (NFC)
  let result = str.normalize('NFC');

  result = result.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  result = result.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  result = result.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  result = result.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  result = result.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  result = result.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  result = result.replace(/đ/g, 'd');

  result = result.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, 'A');
  result = result.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, 'E');
  result = result.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, 'I');
  result = result.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, 'O');
  result = result.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, 'U');
  result = result.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, 'Y');
  result = result.replace(/Đ/g, 'D');

  // Lọc các ký tự kết hợp (combining accents)
  result = result.replace(/[\u0300\u0301\u0303\u0309\u0323]/g, '');
  result = result.replace(/[\u02C6\u0306\u031B]/g, '');

  return result;
}

/**
 * Kiểm tra target có chứa query không, hỗ trợ tiếng Việt có dấu và không dấu
 */
export function searchMatches(target: string | undefined | null, query: string): boolean {
  if (!target) return false;
  const q = query.trim().normalize('NFC');
  if (!q) return true;

  const tNorm = target.normalize('NFC').toLowerCase();
  const qNorm = q.toLowerCase();

  // 1. So khớp trực tiếp (có phân biệt dấu)
  if (tNorm.includes(qNorm)) return true;

  // 2. So khớp không dấu
  const tNoTone = removeVietnameseTones(tNorm);
  const qNoTone = removeVietnameseTones(qNorm);
  return tNoTone.includes(qNoTone);
}
