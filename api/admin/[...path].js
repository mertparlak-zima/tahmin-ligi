// /api/admin/* alt yollarının tümünü api/admin.js'e bağlayan catch-all.
// (Vercel dosya-tabanlı routing'te api/admin.js yalnızca /api/admin tam
// yolunu karşılar; /api/admin/login vb. buradan geçer. ÇOK segmentli alt
// yollar buraya düşmez — onlar için kesin yol dosyaları gerekir, örn.
// api/admin/players/avatar.js.)
export { GET, POST, PUT, PATCH, DELETE } from '../admin.js'
