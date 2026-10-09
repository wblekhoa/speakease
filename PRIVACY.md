# Quyền riêng tư · Privacy

SpeakEase được làm để lời bạn nói ở lại trên máy bạn. Trang này nói rõ thứ gì được lưu, ở đâu, và khi nào có gì rời khỏi máy.

*SpeakEase is made so that what you say stays on your Mac. This page says what is stored, where, and when anything leaves your Mac. English follows the Vietnamese.*

## Tiếng Việt

### Trên máy bạn

- **Âm thanh** được thu khi bạn giữ phím hoặc bấm nút micro, và được nhận dạng bằng mô hình chạy ngay trên máy. Không có máy chủ SpeakEase nào cả.
- **Lịch sử** (chữ đã nhận dạng, bản AI sửa nếu có, giờ ghi) và **bản ghi âm** nằm trong `~/Library/Application Support/com.wblekhoa.speakease/`. Bạn đặt được số lần giữ lại và thời gian tự xoá ở **Lịch sử › Lưu trữ**, hoặc xoá từng mục.
- **Cài đặt** (kể cả khoá API nếu bạn thêm) nằm trong `settings_store.json` ở cùng thư mục, chỉ máy bạn đọc được.

### Khi nào có gì rời khỏi máy

| Khi nào | Gửi gì | Tới đâu |
| --- | --- | --- |
| Bạn bấm tải một mô hình | Yêu cầu tải tệp mô hình | Hugging Face hoặc máy chủ tệp của Handy |
| AI sửa câu / dịch bằng **Apple Intelligence** (mặc định trên máy hỗ trợ) | Không gì cả — chạy trên máy | — |
| AI sửa câu / dịch bằng **dịch vụ bạn tự thêm khoá** (OpenAI, Anthropic, OpenRouter, Groq…) | **Chữ** đã nhận dạng và lời dặn của mẫu — không bao giờ gửi âm thanh | Thẳng tới dịch vụ đó, bằng khoá của bạn |

Ngoài ra SpeakEase **không** gửi gì: không tài khoản, không quảng cáo, không đo lường sử dụng, không báo lỗi tự động, không tự cập nhật.

Tắt AI (**AI & dịch › Dùng AI**) thì không bước AI nào chạy, kể cả trên máy.

## English

### On your Mac

- **Audio** is captured while you hold the shortcut or click the microphone, and is recognised by a model running on your Mac. There is no SpeakEase server.
- **History** (the recognised text, the AI version if any, the time) and **recordings** live in `~/Library/Application Support/com.wblekhoa.speakease/`. Set how many are kept and when recordings are deleted under **History › Storage**, or delete entries one by one.
- **Settings** (including any API key you add) live in `settings_store.json` in the same folder, readable only on your Mac.

### When anything leaves your Mac

| When | What is sent | Where to |
| --- | --- | --- |
| You download a model | A request for the model file | Hugging Face, or Handy's file server |
| AI cleanup / translation with **Apple Intelligence** (the default on supported Macs) | Nothing — it runs on your Mac | — |
| AI cleanup / translation with **a service you added a key for** (OpenAI, Anthropic, OpenRouter, Groq…) | The recognised **text** and the prompt's instructions — never audio | Straight to that service, with your key |

Beyond that SpeakEase sends **nothing**: no account, no ads, no usage tracking, no automatic crash reports, no self-updating.

Switch AI off (**AI & Translate › Use AI**) and no AI step runs at all, on your Mac or elsewhere.
