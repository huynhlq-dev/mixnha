# Tự Thiết Kế

Xếp đồ nội thất cho căn hộ trên bản vẽ đúng tỉ lệ. Chạy hoàn toàn trong trình duyệt, không có máy chủ, không cần tài khoản.

- **Mặt bằng** (nhìn từ trên): kéo thả đồ từ thư viện, xoay (nút −90° / +90°, kéo tay nắm xoay tự do, phím R), bám lưới 5 cm, hiện kích thước và khoảng cách tới tường, cảnh báo chồng lấn, chắn cửa, lối đi dưới 60 cm.
- **Mặt đứng** (nhìn thẳng vào từng tường): tủ bếp, tivi, tranh, điều hòa, có vạch mặt bếp 85 cm.
- **3D xoay 360°**: sửa đồ ngay trong 3D, toàn màn hình.
- Đổi kích thước phòng, màu sàn / tường / từng món, bút màu (lấy màu, chấm màu), khóa món đã chốt chỗ, Hoàn tác / Làm lại (mỗi phòng 100 bước).
- Tự lưu trong trình duyệt. **Xuất / nhập file `.json`** để sao lưu hoặc gửi người khác, có nhắc sao lưu sau 7 ngày chưa xuất.
- Dùng được trên điện thoại (thư viện dạng ngăn kéo, thanh nút dưới đáy, chạm và chụm hai ngón).
- Trang **gallery** (`/gallery.html`): xem mọi món, kể cả món đang làm, ở cùng một tỉ lệ, kèm ảnh 3D và báo lỗi dữ liệu.

## Chạy

Cần Node 20.19 trở lên.

```bash
npm install
npm run dev          # http://localhost:5173  (gallery: /gallery.html)
```

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Chạy thử, tự nạp lại khi sửa |
| `npm run build` | Kiểm tra kiểu rồi build ra `dist/` (chạy được từ mọi đường dẫn, nhờ `base: './'`) |
| `npm run preview` | Xem bản build |
| `npm test` | Chạy test (Vitest, môi trường happy-dom) |
| `npm run typecheck` | Chỉ kiểm tra kiểu TypeScript |
| `npm run validate:items` | Kiểm tra dữ liệu đồ. Thêm `-- --strict` để cảnh báo cũng tính là lỗi |

Đổi tên sản phẩm (tab trình duyệt, tiêu đề, hộp thoại): sửa `VITE_APP_NAME` trong `.env`. Mã nhận dạng trong file xuất vẫn là `xepnha2d`, không đổi theo tên.

## Cách tổ chức code

```
src/
  data/       Chỉ có dữ liệu và kiểu, không có logic. Không import gì ngoài thư mục này.
    items/      Khai báo đồ, mỗi nhóm một file; index.ts gom lại (ALL_ITEMS)
    categories.ts  Nhóm đồ        rooms.ts  4 phòng, cửa, cửa sổ, bố trí mẫu
    palettes.ts    Màu sàn, tường, món   shapes.ts  Danh sách kiểu vẽ 3D   schema.ts  Các kiểu dữ liệu
  core/       Hình học và luật, không biết gì về giao diện. Chỉ import data.
    geometry, measure, analyse (lối đi 60 cm, chồng lấn), layout (bản vẽ, khóa món, giới hạn),
    ops (các thao tác sửa: thêm, xoay, dịch, đổi số đo, khóa, bố trí mẫu), registry (tra món theo mã),
    validate (kiểm tra dữ liệu đồ), color, format, limits
  storage/    Tự lưu, Hoàn tác, xuất / nhập file, nhắc sao lưu, migrations/ (đổi định dạng file)
  views/      Vẽ: plan (mặt bằng), elevation (mặt đứng), scene3d, shapes/ (kiểu vẽ 3D), viewport (phóng to, kéo)
              stage2d nối chuột và cảm ứng với plan/elevation. views chỉ nói chuyện với ứng dụng qua giao diện Host (host.ts).
  ui/         Thanh công cụ, thư viện, bảng thuộc tính, hộp thoại, điện thoại. app.ts nối mọi thứ lại (App implements Host).
  gallery/    Trang gallery (model.ts lọc / gom nhóm, cards.ts dựng HTML, thumb3d.ts ảnh 3D)
  styles/     CSS theo từng khu vực; tokens.css giữ màu và font, có chế độ tối
tools/        validate-items.ts (lệnh kiểm tra dữ liệu), report.ts (định dạng kết quả)
tests/        Test của core, data, storage, viewport, views 2D, scene 3D
```

Quy tắc phụ thuộc: `data` → `core` → `storage` và `views` (không gọi nhau, trừ các module storage gọi nhau) → `ui` (được gọi tất cả). Các module `ui` khai báo giao diện hẹp mà chúng cần (`PropsApp`, `PenApp`, `SwatchApp`, `MobileApp`) và `App` đáp ứng, nên mỗi module kiểm thử riêng được.

Hai hàm vẽ lại: `render()` chỉ vẽ khung bản vẽ (dùng khi đang kéo), `refresh(continuous)` vẽ lại cả bảng thuộc tính rồi ghi Hoàn tác và lưu.

## Thêm đồ mới (làm dần từng đợt)

1. Mở file đúng nhóm trong `src/data/items/` (hoặc tạo file mới rồi nối vào `index.ts`) và thêm món với `status: 'draft'`:

   ```ts
   { id: 'sofa-l', name: 'Sofa chữ L', short: 'Sofa L', cat: 'living', place: 'floor',
     w: 260, d: 160, h: 85, color: '#6F8CA8', shape: 'sofa', note: 'Lời khuyên hiện trong bảng thuộc tính', status: 'draft' }
   ```

   Đồ gắn tường dùng `place: 'wall'`, kèm `y` (độ cao mép dưới tính từ sàn); `w` rộng, `h` cao, `d` là độ nhô ra khỏi tường. Kích thước tính bằng cm và là kích thước ngoài cùng.
2. `npm run validate:items`: báo rõ món nào, trường nào sai (mã trùng, nhóm không có, kích thước ngoài 10–600 cm, màu không phải hex, kiểu vẽ chưa có, tên ngắn quá 10 ký tự, món `retired` thiếu `replacedBy`, bố trí mẫu dùng món chưa `live`...).
3. Mở `/gallery.html`, xem món mới đứng cạnh món có sẵn ở cùng tỉ lệ. Món `draft` chỉ hiện ở trang này.
4. Đổi thành `status: 'live'`. Món hiện trong thư viện, không cần sửa code.

**Mã món (`id`) không bao giờ đổi**: file đã lưu và file gửi cho người khác ghi mã này. Món bỏ đi thì đánh dấu `status: 'retired', replacedBy: '<mã món thay>'`, bản vẽ cũ vẫn mở được. Bản vẽ không lưu bản sao khai báo của món, nên sửa kích thước hay ghi chú trong dữ liệu sẽ áp dụng cho mọi bản vẽ.

Thêm các thứ khác:

- **Kiểu vẽ 3D mới**: thêm tên vào `SHAPE_IDS` (`src/data/shapes.ts`), viết hàm dựng trong `src/views/shapes/<tên>.ts`, đăng ký ở `src/views/shapes/index.ts` (chưa đăng ký thì TypeScript báo lỗi). Món lạ hoặc không ghi `shape` thì vẽ hình hộp.
- **Nhóm mới**: `src/data/categories.ts` (đồ gắn tường thêm `label3d` để hiện tên nhóm trong 3D).
- **Phòng mới**: thêm id vào `ROOM_IDS` và một mục trong `ROOMS` (`src/data/rooms.ts`). Tab phòng tự có; bố trí mẫu chỉ được dùng món `live`.
- **Màu gợi ý**: `src/data/palettes.ts`.
- **Đổi định dạng file lưu**: thêm `src/storage/migrations/vN-to-vM.ts`, đăng ký trong `migrations/index.ts` và tăng `CURRENT_VER`. Không sửa migration cũ.

## Dữ liệu và file

- Tự lưu trong `localStorage` của trình duyệt: khóa `xepnha2d:state` (bản vẽ cả 4 phòng, màu bút, tên và ghi chú) và `xepnha2d:backup` (ngày xuất gần nhất, nhắc sao lưu). Dữ liệu không rời khỏi máy.
- File xuất: `{ app: 'xepnha2d', ver: 3, name, note, exportedAt, units: 'cm', scope: 'all' | 'room', rooms: { ... } }`. Chọn xuất cả 4 phòng hoặc riêng phòng đang mở. Không lưu `uid` (gán lại khi mở).
- Nhập file: kéo thả vào trang, chọn file hoặc dán nội dung. Hộp thoại cho xem trước và chọn phòng nào được thay; việc nhập là một bước Hoàn tác cho mỗi phòng.
- Mọi bản vẽ đi vào ứng dụng, từ file lẫn từ `localStorage`, đều qua `sanitizeRoom` / `sanitizeSaved`: màu về dạng `#rrggbb`, số đo kẹp vào khoảng cho phép, món lạ được giữ lại dưới dạng "món tự tạo" thay vì mất.
- Giới hạn (`src/core/limits.ts`): file 2 MB, 500 món mỗi phòng, phòng rộng / dọc 150–1500 cm, trần 220–450 cm, món 10–600 cm, độ cao mép dưới 0–400 cm, Hoàn tác 100 bước mỗi phòng.

## Phím tắt và thao tác

| Thao tác | Phím / chuột |
| --- | --- |
| Hoàn tác, làm lại | `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` hoặc `Ctrl/Cmd+Y` |
| Xóa món đang chọn | `Delete`, `Backspace` |
| Xoay món sàn | `R` (+90°), `Shift+R` (−90°) |
| Dịch món | Phím mũi tên 5 cm, `Shift+mũi tên` 25 cm (mặt đứng: mũi tên lên là nâng món lên) |
| Bỏ chọn món | Bấm vào chỗ trống |
| Thoát toàn màn hình 3D, đóng thư viện (điện thoại), tắt bút màu | `Esc` |
| Phóng to bản vẽ | `Ctrl/Cmd` + cuộn chuột, nút `+` `−` `Vừa khung`, chụm hai ngón; kéo chỗ trống để dịch bản vẽ |
| 3D | Kéo nền để xoay, cuộn hoặc chụm để phóng to, mũi tên xoay camera, `R` và `Delete` vẫn dùng cho món đang chọn |

Món đã khóa vẫn chọn và đổi màu được, nhưng không kéo, xoay, đổi số đo hay xóa được; các nút "Xóa đồ sàn / tường / cả phòng" bỏ qua món đã khóa.

## Khác với bản design

Các điểm này nên cập nhật lại trong trang design:

- Phóng to bằng **Ctrl/Cmd + cuộn chuột** (cuộn thường vẫn cuộn trang, để không kẹt trên trang dài); bản design ghi "cuộn chuột".
- `gallery.html` nằm ở **gốc project**, không phải trong `tools/` (Vite build nhiều trang từ gốc). Trang gallery có thêm ảnh 3D của món đặt sàn.
- Món gắn tường có thêm trường `d` (độ nhô ra khỏi tường); mã món cho phép chữ hoa ở giữa (ví dụ `cabL60`); độ dày, độ nhô nhỏ nhất của món là 1 cm (tranh, gương mỏng).

## Test

`npm test` chạy 142 test cho `core`, `data` (cả kiểm tra dữ liệu đồ và bố trí mẫu), `storage` (lưu, file, migrations, Hoàn tác, nhắc sao lưu), `viewport`, `views` 2D và `scene3d`. Trình duyệt thật đã được thử thủ công bằng Playwright (kéo thả, phím tắt, khóa, xuất / nhập, 3D, giao diện điện thoại).

**Chưa có test** cho: `core/ops.ts`, các module `ui/` (keys, library, nav, remind, pen, hộp thoại xuất / nhập, `App`), `gallery/` và `tools/report.ts`. Nên bổ sung khi sửa các phần đó; chúng đều viết dạng hàm thuần hoặc có giao diện hẹp nên dễ kiểm thử.

## Chưa làm (giai đoạn sau)

- Giai đoạn 2: cửa đi / cửa sổ kéo thả được, phòng hình chữ L, đo khoảng cách giữa 2 điểm, xuất ảnh PNG, tự tạo món mới, cột và hộp kỹ thuật cố định.
- Giai đoạn 3: ảnh mặt bằng chủ đầu tư làm nền, món nhiều phần mỗi phần một màu, danh sách đồ cần mua kèm giá, xuất PDF, chọn nhiều món cùng lúc.
# mixnha
