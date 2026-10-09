/**
 * A language's name in the interface language ("ja" → "tiếng Nhật" /
 * "Japanese"), or undefined when the browser has no name for it.
 *
 * Inside a sentence Vietnamese writes it in lower case ("dịch sang tiếng
 * Anh", "Chỉ tiếng Anh"), while Intl gives the capitalised form a list or a
 * picker wants ("Tiếng Anh"); English keeps its capital either way.
 */
export const languageName = (
  code: string,
  uiLanguage: string,
  inSentence = false,
): string | undefined => {
  let name: string | undefined;
  try {
    name = new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code);
  } catch {
    return undefined;
  }
  if (!name || name.toLowerCase() === code.toLowerCase()) return undefined;
  return inSentence && uiLanguage.startsWith("vi")
    ? name.charAt(0).toLocaleLowerCase("vi") + name.slice(1)
    : name;
};
