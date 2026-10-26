import './fonts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/editor.css';
import './styles/library.css';
import './styles/props.css';
import './styles/scene3d.css';
import './styles/dialogs.css';

import { DomTranslator } from './i18n/dom';
import { browserKV } from './storage/kv';
import { App } from './ui/app';
import { queryEls } from './ui/els';
import { bindLanguage } from './ui/lang';
import { bindThemeToggle } from './ui/theme';

const els = queryEls();
const kv = browserKV();
// phần HTML viết sẵn được quét một lần rồi dịch theo ngôn ngữ đã lưu, trước khi app vẽ gì
const dom = new DomTranslator();
dom.collect();
bindLanguage([els.langBox, els.npLang], kv, dom, () => app.languageChanged());
const app = new App({ els, kv });
bindThemeToggle(els.btnTheme, kv, () => app.themeChanged());
app.start();
