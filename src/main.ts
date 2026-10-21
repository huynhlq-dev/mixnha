import './fonts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/editor.css';
import './styles/library.css';
import './styles/props.css';
import './styles/scene3d.css';
import './styles/dialogs.css';

import { browserKV } from './storage/kv';
import { App } from './ui/app';
import { queryEls } from './ui/els';

new App({ els: queryEls(), kv: browserKV() }).start();
