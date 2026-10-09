# Đóng góp cho SpeakEase · Contributing

Cảm ơn bạn đã muốn góp tay. SpeakEase là một dự án nhỏ, một người làm chính, nên vài điều dưới đây giúp mọi việc nhanh hơn.

*Thanks for wanting to help. SpeakEase is a small project with one main maintainer; the notes below keep things quick. English follows each point.*

## Báo lỗi trước khi sửa · Open an issue first

Với thay đổi lớn hơn sửa lỗi chính tả, hãy mở [một issue](https://github.com/wblekhoa/speakease/issues/new/choose) để thống nhất hướng làm trước khi viết code.

*For anything bigger than a typo, open an issue so we agree on the approach before code is written.*

## Lỗi thuộc về Handy · Bugs that belong to Handy

SpeakEase được xây trên [Handy](https://github.com/cjpais/Handy). Nếu lỗi nằm ở phần chung (bộ máy chép lời, phím tắt, âm thanh) và cũng xảy ra trên Handy, hãy gửi bản sửa cho Handy — mọi người dùng cả hai app đều được lợi, và SpeakEase sẽ nhận lại khi gộp bản cập nhật.

*If a bug lives in the shared parts (transcription engine, shortcuts, audio) and Handy has it too, please fix it upstream in Handy. Everyone benefits, and SpeakEase picks the fix up when it merges upstream.*

## Dựng và kiểm tra · Build and check

Môi trường phát triển: [BUILD.md](BUILD.md). Trước khi gửi pull request, những lệnh sau phải qua (CI chạy đúng các lệnh này):

*Setup is in [BUILD.md](BUILD.md). Before a pull request, these must pass (CI runs the same):*

```bash
bun install
bun run lint
bunx tsc --noEmit
bun run check:translations
bunx prettier --check src
bun run test:unit
cd src-tauri && cargo fmt -- --check && cargo test --lib
```

Thay đổi giao diện: xem trước bằng `bun run dev` trong trình duyệt — `src/dev/mockTauri.ts` dựng một backend giả với dữ liệu mẫu, nên không cần chạy app thật.

*UI changes: preview with `bun run dev` in a browser; `src/dev/mockTauri.ts` stands in a fake backend with example data.*

## Chữ trong giao diện · Interface text

SpeakEase có hai ngôn ngữ giao diện: tiếng Việt và tiếng Anh. Mọi chữ hiển thị nằm trong `src/i18n/locales/{vi,en}/translation.json`, và cả hai file phải đủ khoá (`bun run check:translations`). Viết từ phía người dùng: gọi tên thứ họ nhận ra, câu ngắn, chủ động.

*The interface ships in Vietnamese and English. All visible text lives in `src/i18n/locales/{vi,en}/translation.json`, and both must have every key. Write from the user's side: names they recognise, short active sentences.*

## Giấy phép của phần bạn góp · Licence of your contribution

Khi gửi đóng góp, bạn đồng ý để nó được phát hành theo cùng giấy phép với phần SpeakEase ([PolyForm Noncommercial 1.0.0](LICENSE)), như [NOTICE.md](NOTICE.md) mô tả. Đừng gửi code hay tài nguyên mà bạn không có quyền chia sẻ.

*By contributing, you agree that your contribution is released under the same licence as SpeakEase's own code ([PolyForm Noncommercial 1.0.0](LICENSE)), as [NOTICE.md](NOTICE.md) describes. Do not submit code or assets you have no right to share.*
