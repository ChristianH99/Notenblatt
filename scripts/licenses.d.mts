export interface ThirdPartyNotice {
  name: string;
  version: string;
  /** SPDX identifier or "Public Domain". */
  license: string;
  url: string;
  /** Full license text (and NOTICE file, if any). */
  text: string;
  /** Short German remark shown in the app, e.g. what the component is used for. */
  note?: string;
  /** The same remark in English, for THIRD_PARTY_NOTICES.md. */
  noteEn?: string;
}

export function collectNotices(root?: string): ThirdPartyNotice[];
export function renderMarkdown(notices: ThirdPartyNotice[]): string;
