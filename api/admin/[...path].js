// /api/admin/* alt yollarının tümünü api/admin.js'e bağlayan catch-all.
// (Vercel dosya-tabanlı routing'te api/admin.js yalnızca /api/admin tam
// yolunu karşılar; /api/admin/login vb. buradan geçer.)
export { GET, POST, PUT, PATCH } from '../admin.js'
