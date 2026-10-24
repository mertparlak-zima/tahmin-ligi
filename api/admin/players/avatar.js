// /api/admin/players/avatar — kesin yol dosyası.
// (Vercel dosya-tabanlı routing'te çok segmentli alt yollar api/admin/[...path].js
// catch-all'ına düşmüyor; kesin dosya gerekli. Bkv. #17 canlı doğrulama.)
export { GET, POST, PUT, PATCH, DELETE } from '../../admin.js'
