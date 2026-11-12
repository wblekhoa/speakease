# Quyền riêng tư · Privacy

SpeakEase được làm để lời bạn nói ở lại trên máy bạn. Trang này nói rõ thứ gì được lưu, ở đâu, và khi nào có gì rời khỏi máy.

*SpeakEase is made so that what you say stays on your Mac. This page says what is stored, where, and when anything leaves your Mac. English follows the Vietnamese.*

## Tiếng Việt

### Trên máy bạn

- **Âm thanh** được thu khi bạn giữ phím hoặc bấm nút micro, và được nhận dạng bằng mô hình chạy ngay trên máy. Không có máy chủ SpeakEase nào cả.
- **Cuộc họp** (macOS 14.2 trở lên) chỉ được ghi khi bạn bắt đầu, hoặc khi bạn bấm **Ghi chú** lúc thanh họp hỏi. SpeakEase ghi tiếng của ứng dụng bạn đang họp và micro của bạn, hoặc chỉ micro. Người khác trong cuộc họp cũng được ghi, nên thanh họp luôn nhắc bạn báo cho mọi người. Âm thanh, lời chép và ghi chú là một mục trong Lịch sử, theo cùng cài đặt lưu trữ. Để biết lúc nào nên hỏi, SpeakEase xem ứng dụng nào đang dùng micro và tên cửa sổ trình duyệt (để nhận ra Google Meet); không có gì được ghi cho tới khi bạn trả lời.
- **Phụ đề trực tiếp** (thử nghiệm) nghe tiếng của ứng dụng bạn chọn, đọc tên thứ đang phát để viết đúng tên riêng, và dịch ngay trên máy. Chữ của phiên được lưu vào Lịch sử; không giữ âm thanh.
- **Lịch sử** (chữ đã nhận dạng, bản AI sửa nếu có, giờ ghi) và **bản ghi âm** nằm trong `~/Library/Application Support/com.wblekhoa.speakease/`. Bạn đặt được số lần giữ lại và thời gian tự xoá ở **Lịch sử › Lưu trữ**, hoặc xoá từng mục.
- **Cài đặt** (kể cả khoá API nếu bạn thêm) nằm trong `settings_store.json` ở cùng thư mục, chỉ máy bạn đọc được.

### Khi nào có gì rời khỏi máy

| Khi nào | Gửi gì | Tới đâu |
| --- | --- | --- |
| Bạn bấm tải một mô hình | Yêu cầu tải tệp mô hình | Hugging Face hoặc máy chủ tệp của Handy |
| Bạn bấm tải một mô hình AI chạy trên máy | Yêu cầu tải tệp mô hình | Hugging Face |
| AI sửa câu / dịch / viết lại bằng **Apple Intelligence** (mặc định trên máy hỗ trợ) hoặc **mô hình trên máy**; phụ đề trực tiếp | Không gì cả — chạy trên máy | — |
| AI sửa câu / dịch / viết lại bằng **dịch vụ bạn tự thêm khoá** (OpenAI, Anthropic, OpenRouter, Groq…) | **Chữ** đã nhận dạng và lời dặn của mẫu — không bao giờ gửi âm thanh. Khi liệt kê mô hình của một dịch vụ, khoá của bạn được gửi tới dịch vụ đó | Thẳng tới dịch vụ đó, bằng khoá của bạn |
| **Ghi chú cuộc họp, câu hỏi về cuộc họp và trợ giúp trực tiếp** (mức 4 và 5 tự gửi các dòng mới nhất vài phút một lần trong lúc ghi) | Máy có Apple Intelligence: không gì cả. Máy không có, và bạn đang chọn **Mô hình AI trên máy** ở AI & dịch: không gì cả, mô hình trên máy Qwen3.5-4B làm cả ba việc nếu đã tải, chưa tải thì cả ba đều tắt (từ bản 0.1.3; ở bản 0.1.2 chữ vẫn được gửi tới dịch vụ đã lưu khoá trong trường hợp này). Bạn đang chọn thứ khác: **chữ** của cuộc họp được gửi tới dịch vụ bạn đã lưu khoá (dịch vụ đang chọn ở AI & dịch trước, không thì dịch vụ khác có khoá và mô hình). Không lưu khoá nào: không gì cả, mô hình trên máy Qwen3.5-4B viết ghi chú nếu đã tải; chưa tải thì không có ghi chú, chỉ có lời chép. Không bao giờ gửi âm thanh | Dịch vụ đó, bằng khoá của bạn |
| Bạn dán một liên kết vào **Tệp/liên kết** | Yêu cầu tải trang hoặc tệp đó (liên kết YouTube và tương tự đi qua yt-dlp, do bạn tự cài) | Trang của liên kết |
| Ứng dụng mở lên, hoặc bạn bảo nó kiểm tra cập nhật (menu ứng dụng, thanh menu hoặc trang **Ứng dụng**) | Yêu cầu đọc số phiên bản mới nhất; tệp cập nhật chỉ được tải khi bạn đồng ý | Trang phát hành của SpeakEase trên GitHub |

Ngoài ra SpeakEase **không** gửi gì: không tài khoản, không quảng cáo, không đo lường sử dụng, không báo lỗi tự động. Việc tự kiểm tra bản cập nhật tắt được ở trang **Ứng dụng**.

Tắt AI (**AI & dịch › Dùng AI**) thì không bước AI nào chạy, kể cả trên máy: ghi chú của một cuộc họp khi đó chính là lời chép. Ngoại lệ duy nhất là phụ đề trực tiếp, vốn dịch ngay trên máy và có công tắc Dịch riêng trên bảng phụ đề.

## English

### On your Mac

- **Audio** is captured while you hold the shortcut or click the microphone, and is recognised by a model running on your Mac. There is no SpeakEase server.
- **Meetings** (macOS 14.2 and later) are recorded only when you start one, or choose **Take notes** when the meeting bar asks. SpeakEase records the sound of the app you are meeting in and your microphone, or the microphone alone. The other people in the meeting are recorded too, so the bar always reminds you to tell everyone. The audio, transcript and notes are one History entry and follow the same storage setting. To know when to ask, SpeakEase looks at which app is using the microphone and at a browser window's title (to recognise Google Meet); nothing is recorded until you answer.
- **Live subtitles** (experimental) listen to the sound of the app you pick, read the title of what is playing to spell names right, and translate on your Mac. The session's text is saved to History; no audio is kept.
- **History** (the recognised text, the AI version if any, the time) and **recordings** live in `~/Library/Application Support/com.wblekhoa.speakease/`. Set how many are kept and when recordings are deleted under **History › Storage**, or delete entries one by one.
- **Settings** (including any API key you add) live in `settings_store.json` in the same folder, readable only on your Mac.

### When anything leaves your Mac

| When | What is sent | Where to |
| --- | --- | --- |
| You download a model | A request for the model file | Hugging Face, or Handy's file server |
| You download an on-device AI model | A request for the model file | Hugging Face |
| AI cleanup, translation and rewrites with **Apple Intelligence** (the default on supported Macs) or **an on-device model**; live subtitles | Nothing — it runs on your Mac | — |
| AI cleanup, translation and rewrites with **a service you added a key for** (OpenAI, Anthropic, OpenRouter, Groq…) | The recognised **text** and the prompt's instructions — never audio. Listing a service's models sends it your key | Straight to that service, with your key |
| **Meeting notes, questions about a meeting and live help** (levels 4 and 5 send the latest lines by themselves every few minutes while you record) | With Apple Intelligence on the Mac: nothing. Without it, when **On-device model** is what you picked in AI & Translate: nothing, the on-device model Qwen3.5-4B does all three if it is downloaded, and otherwise all three are off (from 0.1.3; in 0.1.2 the text still went to a saved key's service in this case). With anything else picked: the meeting's **text** goes to a service you saved a key for (the one picked in AI & Translate first, else any other with a key and a model). With no key saved: nothing, the on-device model Qwen3.5-4B writes them if it is downloaded; otherwise there are no notes, only the transcript. Never audio | That service, with your key |
| You paste a link in **Files & links** | A request for that page or file (YouTube and similar links go through yt-dlp, which you install yourself) | The link's site |
| The app starts, or you ask it to check for updates (app menu, menu bar or the **App** page) | A request for the newest version number; the update itself is downloaded only when you accept it | SpeakEase's releases on GitHub |

Beyond that SpeakEase sends **nothing**: no account, no ads, no usage tracking, no automatic crash reports. The automatic update check can be switched off on the **App** page.

Switch AI off (**AI & Translate › Use AI**) and no AI step runs at all, on your Mac or elsewhere: a meeting's notes are then its transcript. The one exception is live subtitles, which translate on your Mac and have their own Translate switch on the panel.
