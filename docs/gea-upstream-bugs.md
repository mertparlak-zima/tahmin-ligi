# Gea 1.5.1 upstream bug notları

Aşağıdaki sorunlar @geajs/core 1.5.1 + @geajs/vite-plugin 1.5.0 ile
tahmin-ligi geliştirilirken kanıtlandı. Minimal repro iskeleti:
`D:\development\drive-trace\tmp\opencode\gea-repro` (aynı sürümlerle
scaffold edilmiş boş uygulama; `src/app.tsx` içinde istenen desen yazılıp
`npm run build` + headless tarayıcıyla gözlemlenir).

## 1. KRİTİK — Keyed listede map parametresinin adı `d` olamaz (kod üretimi gölgelenmesi)

Derleyici, keyed listenin `createEntry` callback'inin item parametresine
**kullanıcının map callback parametre adını aynen verir**; aynı scope'taki
derleyicinin kendi disposer değişkeni de her zaman `d` adındadır. Callback
parametresi `d` ise:

```tsx
{store.resultsByDay.map(d => <ResultDay key={d.day} day={d.day} ... />)}
```

üretilen kod (vite build --minify false ile doğrulandı):

```js
createEntry: (d, idx) => {   // ← kullanıcının param adıyla
  const __rd = d.child();    // ← kastedilen DIŞARIDAKİ disposer 'd',
  ...                        //    ama ham item nesnesi tarafından gölgelenmiş
```

Sonuç, kod üretim varyantına göre üç şekilde tezahür eder:
`TypeError: e.add is not a function`, `W(...).child is not a function`
veya **sessizce boş liste** (hiçbir hata yok). Param adı `g`/`group` vb.
yapınca aynı dosya kusursuz çalışır (repro'da `d`↔`g` çevirerek teyit).

Çözüm (projede uygulanan): map parametrelerine `d` dışında açıklayıcı adlar.

## 2. Named export, dosyanın default component derlemesini de bozar

Bir `.tsx` dosyasında default component yanında **herhangi bir named export**
varsa (`export function helper...`) derleyici o modülün şablon derlemesini
tamamen atlıyor (jsx() runtime fallback'i devreye giriyor); component keyed
factory içinde DOM düğümü döndürmüyor → sessizce boş render. EditorRow'da
`export function editorStatusText` yüzünden tüm editör satırları boştu.

Kural: component dosyaları yalnız `export default` içerir; yardımcılar
local function olarak kalır ya da ayrı dosyaya alınır.

## 3. Function component rota hedefleri RouterView ile render olmuyor

```tsx
export const router = createRouter({ '/': FnPage } as const)  // FnPage = export default function
// → url değişir, RouterView boş bir div render eder; class component çalışır.
```

Dokümantasyon function component rota kullanımını destekliyor görünüyor
(`Function components receive matched params as props`).

## 4. Erken `return null` veren function component bir daha render olmuyor

```tsx
export default function Sheet() {
  const m = store.picked ? store.item : null
  if (!m) return null          // ilk render null → store.picked değişince de render gelmiyor
  return <div>SHEET</div>
}
```

İlk render null olunca reaktif bağımlılık kaydı oluşmuyor gibi görünüyor.
Class component + hep-render kök + CSS toggle ile aşıldı.

## 5. Keyed listede ham element + dinamik bağlantı: `e.add is not a function`

```tsx
{items.map(i => <li class={`x ${sel ? 'on' : ''}`} key={i.id}>...</li>)}
// → TypeError: e.add is not a function (derlenmiş M()/w() yolunda disposal Set beklerken Map geliyor)
```

Bileşene sarmak (keyed item = component) sorunu gideriyor; dokümantasyondaki
`<li key={option.value}>{option.label}</li>` örneği dinamik bağlantı
içermediği için tetiklenmiyor.

## 6. Gövdede türetilmiş local dizilerle keyed liste: sessiz boş render

```tsx
template() {
  const finished = [...store.finishedMatches].sort(byDateDesc)   // türetme
  const days = groupByDay(finished)                              // ikinci türetme
  return <div>{days.map(d => <Day key={d.day} ... />)}</div>     // hiç render olmaz, hata da yok
}
```

`store.getter.map(...)` doğrudan JSX'te kullanılınca çalışıyor; türetme
store getter'ının içine taşınınca çalışıyor. Derleyicinin keyed `path`
bağlantısı local türetmelerde kopuyor gibi görünüyor. (Madde 1 ile
ilişkili olabilir — örneklerde param adı da `d` idi; izole testte param adı
düzeltince türetme sorunu gözlenmedi, teyit edilmemiş ayrı vaka olarak kalsın.)

## 7. `.map(([a, b]) => ...)` dizi destructuring: `ReferenceError: a is not defined`

Derlenmiş item fabrikası callback parametresini destructuring'siz
bekliyor. `entry[0]`/`entry[1]` veya nesne dizisi ile aşıldı.

## 8. Class template()'de `let` yeniden ataması build hatası

Anlaşılır hata mesajı veriyor (bu iyi); iç içe ternary `const` yeterli.

## 9. Component prop'una bağlı JSX koşulları yanlış dal render ediyor (ertelenmiş değerlendirme)

`template()` gövdesinde `this.props.crest` truthy olsa bile (aynı çalışmada
log'la doğrulandı), prop'a bağlı element-koşullu (`? <img/> : <span/>` hem de
`cond ? <el/> : null` split hali) ertelenmiş değerlendirmede FALSE dalını
render ediyor — koşul thunk'ı `this.props.crest`'i kurulum anı dışında
okuyunca undefined alıyor gibi. Aynı props zincirinden `name/short/size`
(render anında text/attr olarak tüketilenler) doğru çalışıyor.

Workaround (Crest bileşeni, final): `<img>` elementi tamamen kaldırıldı.
Logo URL'i render anında prop'tan okunup sınıf alanına yazılır;
onAfterRender'da imperatif `background-image` olarak atanır. Reaktif binding,
event yarışı, ertelenmiş patch yok — ezilecek hiçbir şey yok. (Ara
denemelerde src binding'i — statik dahi — imperatif atamadan SONRA gelip
şeffaf GIF ile ezdiği gözlemlendi.)

## Bildirim planı

Bu dosya hazırlanma nedeni: dashersw/gea reposuna issue açılmadan önce
kayıt tutmak. Issue açma kararı ve zamanlaması kullanıcıya aittir; her madde
tek başına minimal repro ile 10 satırda gösterilebilir. Madde 1, 2 ve 9 en
yüksek öncelik (sessiz failure üretiyorlar).
