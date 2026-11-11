# Quyền riêng tư · Privacy

SpeakEase được làm để lời bạn nói ở lại trên máy bạn. Trang này nói rõ thứ gì được lưu, ở đâu, và khi nào có gì rời khỏi máy.

*SpeakEase is made so that what you say stays on your Mac. This page says what is stored, where, and when anything leaves your Mac. English follows the Vietnamese.*

## Tiếng Việt

### Trên máy bạn

- **Âm thanh** được thu khi bạn giữ phím hoặc bấm nút micro, và được nhận dạng bằng mô hình chạy ngay trên máy. Không có máy chủ SpeakEase nào cả.
- **Cuộc họp** (macOS 14.2 trở lên) chỉ được ghi khi bạn bắt đầu, hoặc khi bạn bấm **Ghi chú** lúc thanh họp hỏi. SpeakEase ghi tiếng của ứng dụng bạn đang họp và micro của bạn, hoặc chỉ micro. Người khác trong cuộc họp cũng được ghi, nên thanh họp luôn nhắc bạn báo cho mọi người. Âm thanh, lời chép và ghi chú là một mục trong Lịch sử, theo cùng cài đặt lưu trữ.
- **Phụ đề trực tiếp** (thử nghiệm) nghe tiếng của ứng dụng bạn chọn, đọc tên thứ đang phát để viết đúng tên riêng, và dịch ngay trên máy.
- **Lịch sử** (chữ đã nhận dạng, bản AI sửa nếu có, giờ ghi) và **bản ghi âm** nằm trong `~/Library/Application Support/com.wblekhoa.speakease/`. Bạn đặt được số lần giữ lại và thời gian tự xoá ở **Lịch sử › Lưu trữ**, hoặc xoá từng mục.
- **Cài đặt** (kể cả khoá API nếu bạn thêm) nằm trong `settings_store.json` ở cùng thư mục, chỉ máy bạn đọc được.

### Khi nào có gì rời khỏi máy

| Khi nào | Gửi gì | Tới đâu |
| --- | --- | --- |
| Bạn bấm tải một mô hình | Yêu cầu tải tệp mô hình | Hugging Face hoặc máy chủ tệp của Handy |
| Bạn bấm tải một mô hình AI chạy trên máy | Yêu cầu tải tệp mô hình | Hugging Face |
| AI (sửa câu, dịch, ghi chú cuộc họp) bằng **Apple Intelligence** (mặc định trên máy hỗ trợ) hoặc **mô hình trên máy** | Không gì cả — chạy trên máy | — |
| AI bằng **dịch vụ bạn tự thêm khoá** (OpenAI, Anthropic, OpenRouter, Groq…). Ghi chú cuộc họp chỉ dùng dịch vụ này khi máy không dùng được Apple Intelligence | **Chữ** đã nhận dạng (với cuộc họp là lời chép) và lời dặn của mẫu — không bao giờ gửi âm thanh | Thẳng tới dịch vụ đó, bằng khoá của bạn |
| Ứng dụng mở lên, hoặc bạn bấm **Kiểm tra cập nhật** | Yêu cầu đọc số phiên bản mới nhất; tệp cập nhật chỉ được tải khi bạn đồng ý | Trang phát hành của SpeakEase trên GitHub |

Ngoài ra SpeakEase **không** gửi gì: không tài khoản, không quảng cáo, không đo lường sử dụng, không báo lỗi tự động. Việc tự kiểm tra bản cập nhật tắt được ở trang **Ứng dụng**.

Tắt AI (**AI & dịch › Dùng AI**) thì không bước AI nào chạy, kể cả trên máy.

## English

### On your Mac

- **Audio** is captured while you hold the shortcut or click the microphone, and is recognised by a model running on your Mac. There is no SpeakEase server.
- **Meetings** (macOS 14.2 and later) are recorded only when you start one, or choose **Take notes** when the meeting bar asks. SpeakEase records the sound of the app you are meeting in and your microphone, or the microphone alone. The other people in the meeting are recorded too, so the bar always reminds you to tell everyone. The audio, transcript and notes are one History entry and follow the same storage setting.
- **Live subtitles** (experimental) listen to the sound of the app you pick, read the title of what is playing to spell names right, and translate on your Mac.
- **History** (the recognised text, the AI version if any, the time) and **recordings** live in `~/Library/Application Support/com.wblekhoa.speakease/`. Set how many are kept and when recordings are deleted under **History › Storage**, or delete entries one by one.
- **Settings** (including any API key you add) live in `settings_store.json` in the same folder, readable only on your Mac.

### When anything leaves your Mac

| When | What is sent | Where to |
| --- | --- | --- |
| You download a model | A request for the model file | Hugging Face, or Handy's file server |
| You download an on-device AI model | A request for the model file | Hugging Face |
| AI (cleanup, translation, meeting notes) with **Apple Intelligence** (the default on supported Macs) or **an on-device model** | Nothing — it runs on your Mac | — |
| AI with **a service you added a key for** (OpenAI, Anthropic, OpenRouter, Groq…). Meeting notes use it only when Apple Intelligence is not available on the Mac | The recognised **text** (for a meeting, its transcript) and the prompt's instructions — never audio | Straight to that service, with your key |
| The app starts, or you choose **Check for Updates** | A request for the newest version number; the update itself is downloaded only when you accept it | SpeakEase's releases on GitHub |

Beyond that SpeakEase sends **nothing**: no account, no ads, no usage tracking, no automatic crash reports. The automatic update check can be switched off on the **App** page.

Switch AI off (**AI & Translate › Use AI**) and no AI step runs at all, on your Mac or elsewhere.
