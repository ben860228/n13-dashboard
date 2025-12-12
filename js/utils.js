// 小工具 1：把文字 "50%" 變成數字 50
export function parsePercent(str) {
    if (!str && str !== 0) return 0;
    if (typeof str === 'number') return str;
    return parseFloat(str.toString().replace('%', '')) || 0;
}

// 小工具 2：把日期文字變成日期物件
export function parseDate(dateString) {
    if (!dateString) return null;
    const parts = dateString.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (parts) {
        return new Date(Date.UTC(parts[1], parts[2] - 1, parts[3]));
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
        console.warn(`無效的日期格式，無法解析: \"${dateString}\"`);
        return null;
    }
    return d;
}